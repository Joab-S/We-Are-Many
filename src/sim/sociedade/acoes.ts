/**
 * O corpo das pessoas do laboratório: o que cada ação (Behavior Type) faz no mundo. O cérebro escolheu; aqui a
 * pessoa anda, trabalha, troca, constrói e vota. Cada ação devolve `continua` enquanto não termina.
 */
import type { AiEntity } from '../../IAUS/aiEntity';
import type { ContextInfo } from '../../IAUS/context';
import { distance } from '../../IAUS/math';
import { bemDoAlvo, meuOficio, oficioDoAlvo } from '../../IAUS/npc/entradas';
import { ajustarPacotes } from '../../IAUS/npc/pacotes/index';
import { compatibilidade, ehPessoa, type Resultado } from '../../IAUS/npc/pessoa';
import { BENS, IMPOSTOS, OFICIOS, OFICIO_IDS, S, TAG, WOT, hab, type Bem, type Imposto, type ObraPublica, type Oficio } from '../../IAUS/npc/vocab';
import { CHAO, ehAgua } from './terreno';
import { ANO, DIA, OBRA, PRECO, Coisa, type Gente, type LugarVivo, type Sociedade } from './mundo';

const PASSO = 2.4;

const por = (g: Gente, b: Bem, n: number) => g.bolso.set(b, Math.max(0, (g.bolso.get(b) ?? 0) + n));
const tenho = (g: Gente, b: Bem) => (g.bolso.get(b) ?? 0) + (g.casa?.estoque.get(b) ?? 0);
/** Tira do bolso e, faltando, da casa. Devolve quanto tirou. */
function tirar(g: Gente, b: Bem, n: number): number {
  const bolso = Math.min(n, g.bolso.get(b) ?? 0);
  g.bolso.set(b, (g.bolso.get(b) ?? 0) - bolso);
  let resto = n - bolso;
  if (resto > 0 && g.casa) {
    const c = Math.min(resto, g.casa.estoque.get(b) ?? 0);
    g.casa.estoque.set(b, (g.casa.estoque.get(b) ?? 0) - c);
    resto -= c;
  }
  return n - resto;
}
const aliviar = (g: Gente, k: string, v: number) => g.p.setStat(k, Math.max(0, Math.min(1, g.p.stat(k) - v)));
const praticar = (g: Gente, o: Oficio, v: number) => g.p.setStat(hab(o), Math.min(1, g.p.stat(hab(o)) + v));
const riqueza = (g: Gente, v: number) => g.p.setStat(S.riqueza, Math.max(0, g.p.stat(S.riqueza) + v));

/** Anda até (x, y). Devolve true ao chegar a `perto` tiles. */
function andar(soc: Sociedade, g: Gente, x: number, y: number, dt: number, perto = 1.2): boolean {
  const p = g.p.position;
  const d = Math.hypot(x - p.x, y - p.y);
  if (d <= perto) return true;
  if (dt <= 0) return false;
  const naRua = g.lugar?.estradas.has(soc.tile(p.x, p.y)) ? 1.35 : 1;
  const passo = Math.min(d, PASSO * naRua * dt * (g.p.tags.has(TAG.crianca) ? 0.8 : g.p.tags.has(TAG.idoso) ? 0.6 : 1));
  // Vai reto; se a água bloqueia, tenta desviar em ângulos cada vez mais abertos (cada um tem seu lado preferido).
  const lado = g.p.id % 2 ? 1 : -1;
  const ang = Math.atan2(y - p.y, x - p.x);
  let nx = NaN;
  let ny = NaN;
  // Água estreita (rio, braço de lago) se atravessa a vau, devagar: há terra firme a até 4 tiles adiante.
  const naAgua = ehAgua(soc.t, p.x, p.y);
  if (ehAgua(soc.t, p.x + Math.cos(ang) * passo, p.y + Math.sin(ang) * passo)) {
    for (let k = 1; k <= 4; k++) {
      if (!ehAgua(soc.t, p.x + Math.cos(ang) * k, p.y + Math.sin(ang) * k) || k >= d) {
        nx = p.x + Math.cos(ang) * passo * 0.5;
        ny = p.y + Math.sin(ang) * passo * 0.5;
        break;
      }
    }
  }
  for (const giro of Number.isNaN(nx) ? [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8, 2.5, -2.5] : []) {
    const a = ang + giro * lado;
    const tx = p.x + Math.cos(a) * passo;
    const ty = p.y + Math.sin(a) * passo;
    if (!ehAgua(soc.t, tx, ty)) {
      nx = tx;
      ny = ty;
      break;
    }
  }
  if (Number.isNaN(nx)) {
    // Preso (ou já dentro d'água): segue reto, nadando devagar.
    if (!naAgua) return d <= perto + 1.5;
    nx = p.x + Math.cos(ang) * passo * 0.4;
    ny = p.y + Math.sin(ang) * passo * 0.4;
  }
  g.p.position = { x: Math.max(0.5, Math.min(soc.t.w - 0.5, nx)), y: Math.max(0.5, Math.min(soc.t.h - 0.5, ny)) };
  g.p.setStat(S.cansaco, Math.min(1, g.p.stat(S.cansaco) + dt / 400));
  return false;
}

/** Trabalha no lugar por `segs` segundos (cansa e entedia um pouco). */
function labuta(g: Gente, segs: number, dt: number): boolean {
  g.tempo += dt;
  g.p.setStat(S.cansaco, Math.min(1, g.p.stat(S.cansaco) + dt / 70));
  return g.tempo >= segs;
}

/** Há água a um passo daqui? */
const naBeira = (soc: Sociedade, x: number, y: number): boolean => {
  for (const [dx, dy] of [[0, 0], [1.2, 0], [-1.2, 0], [0, 1.2], [0, -1.2]]) if (ehAgua(soc.t, x + dx, y + dy) && x + dx >= 0 && y + dy >= 0 && x + dx < soc.t.w && y + dy < soc.t.h) return true;
  return false;
};

const vivo = (soc: Sociedade, e: AiEntity | null): e is AiEntity => !!e && soc.world.getEntity(e.id) === e;

/** Ida até o alvo e trabalho nele: `continua` andando/trabalhando, `feito` quando termina. */
function noAlvo(soc: Sociedade, g: Gente, alvo: AiEntity | null, segs: number, dt: number, fim: () => void, perto = 1.2): Resultado {
  if (!vivo(soc, alvo)) return 'falhou';
  if (!andar(soc, g, alvo.position.x, alvo.position.y, dt, perto)) return 'continua';
  if (!labuta(g, segs, dt)) return 'continua';
  fim();
  return 'feito';
}

function gesto(g: Gente, segs: number, dt: number, efeito: (dt: number) => void): Resultado {
  g.tempo += dt;
  efeito(dt);
  return g.tempo >= segs ? 'feito' : 'continua';
}

function lote(soc: Sociedade, g: Gente): { x: number; y: number } {
  // Perto da casa mais próxima do lugar (casas bem próximas umas das outras), senão onde está.
  const l = g.lugar;
  const base = l && l.casas.length ? l.casas.reduce((a, b) => (distance(a.position, g.p.position) < distance(b.position, g.p.position) ? a : b)).position : g.p.position;
  for (let r = 2; r <= 9; r++) {
    for (let k = 0; k < 12; k++) {
      const a = soc.sorte() * Math.PI * 2;
      const x = Math.floor(base.x + Math.cos(a) * r) + 0.5;
      const y = Math.floor(base.y + Math.sin(a) * r) + 0.5;
      if (x < 2 || y < 2 || x > soc.t.w - 2 || y > soc.t.h - 2) continue;
      if (soc.livre(x, y) && soc.t.chao[soc.tile(x, y)] !== CHAO.pedra) return { x, y };
    }
  }
  return { x: Math.floor(g.p.position.x) + 0.5, y: Math.floor(g.p.position.y) + 0.5 };
}

function abrirObra(soc: Sociedade, g: Gente | null, l: LugarVivo | null, vira: string, x: number, y: number): Coisa {
  const tipo = vira.split(':')[0];
  const spec = OBRA[tipo] ?? OBRA.casa;
  const o = new Coisa({ id: soc.id(), name: vira, type: WOT.obra, position: { x, y } });
  o.vira = vira;
  o.pede = { madeira: spec.madeira, pedra: spec.pedra };
  o.trabalho = spec.trabalho;
  o.setStat('dono', g ? g.p.id : -1);
  o.setStat('lugar', l ? l.id : -1);
  o.setStat('temMaterial', 0);
  if (!g) o.tags.add('Pública');
  soc.coisas.set(o.id, o);
  soc.world.add(o);
  return o;
}

/** Leva material para a obra (do bolso/casa do dono, ou do celeiro e do tesouro, se for pública). */
function abastecer(soc: Sociedade, g: Gente, o: Coisa): void {
  const l = soc.lugares[o.stat('lugar')] ?? null;
  for (const b of ['madeira', 'pedra'] as const) {
    const falta = o.pede[b] - (o.estoque.get(b) ?? 0);
    if (falta <= 0) continue;
    let veio = 0;
    if (o.stat('dono') === g.p.id) veio = tirar(g, b, falta);
    else if (o.tags.has('Pública') && l) {
      // Material público: o celeiro, ou comprado de quem leva (o tesouro paga).
      const cel = Math.min(falta, l.celeiro.get(b) ?? 0);
      l.celeiro.set(b, (l.celeiro.get(b) ?? 0) - cel);
      const mao = tirar(g, b, falta - cel);
      const pago = Math.min(l.tesouro, mao * PRECO[b]);
      l.tesouro -= pago;
      riqueza(g, pago);
      veio = cel + mao;
    } else {
      veio = Math.min(falta, g.bolso.get(b) ?? 0);
      por(g, b, -veio);
    }
    o.estoque.set(b, (o.estoque.get(b) ?? 0) + veio);
  }
  const ok = (o.estoque.get('madeira') ?? 0) >= o.pede.madeira && (o.estoque.get('pedra') ?? 0) >= o.pede.pedra;
  o.setStat('temMaterial', ok ? 1 : 0);
}

function concluirObra(soc: Sociedade, o: Coisa): void {
  const l = soc.lugares[o.stat('lugar')] ?? null;
  const dono = soc.gente.get(o.stat('dono'));
  soc.removerCoisa(o);
  const [tipo, extra] = o.vira.split(':');
  if (tipo === 'casa' && dono) {
    const c = new Coisa({ id: soc.id(), name: `casa de ${dono.p.name}`, type: WOT.casa, position: { ...o.position } });
    c.setStat('dono', dono.p.id);
    c.setStat('lugar', l ? l.id : -1);
    c.setStat('vagas', 4);
    c.setStat('oficina', -1);
    soc.coisas.set(c.id, c);
    soc.world.add(c);
    dono.casa = c;
    if (dono.conjuge >= 0) {
      const cj = soc.gente.get(dono.conjuge);
      if (cj && !cj.casa) cj.casa = c;
    }
    for (const q of soc.gente.values()) if (q.pais.includes(dono.p.id) && !q.casa && q.p.tags.has(TAG.crianca)) q.casa = c;
    l?.casas.push(c);
    soc.lembrar(dono, 'Terminou a casa');
    soc.anotar(`${dono.p.name} terminou a casa${l ? ` em ${l.nome}` : ''}`, l?.id ?? -1);
  } else if (tipo === 'ampliacao' && dono?.casa) {
    dono.casa.setStat('vagas', dono.casa.stat('vagas') + 2);
    soc.lembrar(dono, 'Ampliou a casa');
  } else if (tipo === 'oficina' && dono) {
    const of = extra as Oficio;
    const info = OFICIOS[of];
    const c = new Coisa({ id: soc.id(), name: info.oficina ?? 'oficina', type: WOT.oficina, position: { ...o.position } });
    c.setStat('dono', dono.p.id);
    c.setStat('lugar', l ? l.id : -1);
    c.setStat('oficio', OFICIO_IDS.indexOf(of));
    if (of === 'taberneiro') c.tags.add(TAG.taberna);
    if (of === 'sacerdote') c.tags.add(TAG.templo);
    soc.coisas.set(c.id, c);
    soc.world.add(c);
    if (dono.casa) dono.casa.setStat('oficina', c.id);
    l?.oficinas.push(c);
    soc.anotar(`${dono.p.name} transformou a casa numa ${info.oficina}${l ? ` em ${l.nome}` : ''}`, l?.id ?? -1);
  } else if (l) {
    const obra = tipo as ObraPublica;
    l.publicas.add(obra);
    if (obra === 'estrada') {
      // Ruas ligando cada casa à praça (ou ao centro): um L por casa.
      for (const c of [...l.casas, ...l.oficinas]) {
        let x = Math.floor(c.position.x);
        let y = Math.floor(c.position.y);
        const tx = Math.floor(l.x);
        const ty = Math.floor(l.y);
        while (x !== tx) {
          l.estradas.add(y * soc.t.w + x);
          x += Math.sign(tx - x);
        }
        while (y !== ty) {
          l.estradas.add(y * soc.t.w + x);
          y += Math.sign(ty - y);
        }
      }
      l.publicas.delete('estrada');
    }
    if (obra === 'praca') {
      l.x = o.position.x;
      l.y = o.position.y;
    }
    soc.anotar(`${l.nome} terminou a obra pública: ${obra}`, l.id);
  }
}

function pessoaDe(soc: Sociedade, e: AiEntity | null): Gente | null {
  return e && ehPessoa(e) ? soc.gente.get(e.id) ?? null : null;
}

/** O bem que o alvo dá ou pede, já validado. */
function bemDe(soc: Sociedade, g: Gente, ctx: ContextInfo): Bem | null {
  const b = bemDoAlvo(g.p, ctx.target, soc.agora);
  return b && (BENS as readonly string[]).includes(b) ? (b as Bem) : null;
}

function trabalharNoOficio(soc: Sociedade, g: Gente, o: Oficio, dt: number, iniciar: boolean): Resultado {
  const info = OFICIOS[o];
  if (iniciar) {
    g.tempo = 0;
    g.aux = null;
  }
  // Ofício do mato: vai ao recurso mais perto e tira dele.
  if (info.primario || o === 'construtor') {
    const tipo = info.onde;
    let alvo: AiEntity | null = null;
    let bd = Infinity;
    for (const e of soc.perto(g.p.position.x, g.p.position.y, 30)) {
      if (e.type !== tipo) continue;
      if (tipo === WOT.obra && e.stat('lugar') !== (g.lugar?.id ?? -2)) continue;
      if (tipo === WOT.roca && !e.stat(S.maduro)) continue;
      if (tipo !== WOT.obra && tipo !== WOT.roca && e.stat(S.quantidade) < 1) continue;
      const d = distance(g.p.position, e.position);
      if (d < bd) {
        bd = d;
        alvo = e;
      }
    }
    if (!alvo) {
      if (o === 'agricultor') return plantar(soc, g, dt, iniciar);
      return 'falhou';
    }
    if (tipo === WOT.obra) return construir(soc, g, alvo as Coisa, dt, true);
    const segs = 5 / (0.6 + g.p.stat(hab(o)));
    return noAlvo(soc, g, alvo, segs, dt, () => {
      const n = tipo === WOT.roca ? 6 : Math.min(alvo!.stat(S.quantidade), 2 + Math.round(g.p.stat(hab(o)) * 2));
      if (tipo === WOT.roca) alvo!.setStat('cresce', 0);
      else if (tipo === WOT.animal) soc.removerCoisa(alvo!);
      else alvo!.setStat(S.quantidade, alvo!.stat(S.quantidade) - n);
      por(g, info.rende, tipo === WOT.animal ? 5 : n);
      praticar(g, o, 0.03);
      g.p.setStat('vende', 1);
    });
  }
  // Ofício de oficina: transforma o insumo em produto (na oficina, ou em casa com menos rendimento).
  const of = g.casa ? soc.coisas.get(g.casa.stat('oficina', -1)) ?? null : null;
  const onde = of ?? g.casa;
  if (!onde) return 'falhou';
  return noAlvo(soc, g, onde, 6 / (0.6 + g.p.stat(hab(o))), dt, () => {
    if (info.consome && tirar(g, info.consome, 1) < 1) {
      // Sem insumo: o dono precisa comprar ou encomendar (a necessidade sobe e outro comportamento resolve).
      return;
    }
    if (o === 'sacerdote' && g.lugar) {
      for (const q of soc.moradores(g.lugar)) aliviar(q, S.fe, 0.15);
      const pago = Math.min(g.lugar.tesouro, 1);
      g.lugar.tesouro -= pago;
      riqueza(g, pago);
    } else if (o === 'comerciante') {
      riqueza(g, 0.6);
    } else {
      por(g, info.rende, of ? 2 : 1);
    }
    praticar(g, o, 0.03);
    g.p.setStat('vende', 1);
  });
}

function plantar(soc: Sociedade, g: Gente, dt: number, iniciar: boolean): Resultado {
  if (iniciar || !g.aux) {
    g.tempo = 0;
    const base = g.casa?.position ?? g.p.position;
    g.aux = null;
    for (let k = 0; k < 40 && !g.aux; k++) {
      const x = Math.floor(base.x + (soc.sorte() - 0.5) * 10) + 0.5;
      const y = Math.floor(base.y + (soc.sorte() - 0.5) * 10) + 0.5;
      if (soc.t.chao[soc.tile(x, y)] === CHAO.fertil && soc.livre(x, y)) g.aux = { x, y };
    }
    if (!g.aux) return 'falhou';
  }
  if (!andar(soc, g, g.aux.x, g.aux.y, dt, 0.8)) return 'continua';
  if (!labuta(g, 6, dt)) return 'continua';
  const r = new Coisa({ id: soc.id(), name: 'roça', type: WOT.roca, position: { ...g.aux } });
  r.setStat('lugar', g.lugar?.id ?? -1);
  r.setStat('dono', g.p.id);
  r.setStat('cresce', 0);
  soc.coisas.set(r.id, r);
  soc.world.add(r);
  praticar(g, 'agricultor', 0.04);
  soc.lembrar(g, 'Plantou uma roça');
  return 'feito';
}

function construir(soc: Sociedade, g: Gente, o: Coisa, dt: number, pago: boolean): Resultado {
  if (!vivo(soc, o)) return 'falhou';
  if (!andar(soc, g, o.position.x, o.position.y, dt, 1.4)) return 'continua';
  abastecer(soc, g, o);
  if (!o.stat('temMaterial')) return 'feito';
  const ritmo = 0.6 + g.p.stat(hab('construtor')) + (g.bolso.get('ferramentas') ? 0.4 : 0);
  o.trabalho -= dt * ritmo;
  g.p.setStat(S.cansaco, Math.min(1, g.p.stat(S.cansaco) + dt / 80));
  praticar(g, 'construtor', dt * 0.002);
  const l = soc.lugares[o.stat('lugar')];
  if (pago && o.tags.has('Pública') && l && l.tesouro > 0) {
    const w = Math.min(l.tesouro, dt * 0.15);
    l.tesouro -= w;
    riqueza(g, w);
  }
  if (o.trabalho <= 0) {
    concluirObra(soc, o);
    return 'feito';
  }
  g.tempo += dt;
  return g.tempo > 12 ? 'feito' : 'continua';
}

/** Ação de uma pessoa do laboratório. */
export function agir(soc: Sociedade, g: Gente, acao: string, ctx: ContextInfo, dt: number): Resultado {
  const inicio = dt === 0;
  if (inicio) {
    g.tempo = 0;
    g.aux = null;
  }
  const alvo = ctx.target;
  const prm = ctx.behavior.params;
  const p = g.p;

  if (acao.startsWith('habilidade:oficio:')) return trabalharNoOficio(soc, g, acao.slice(18) as Oficio, dt, inicio);

  switch (acao) {
    // ---- Corpo e movimento ----
    case 'FicarParado':
      return gesto(g, Number(prm.segundos ?? 3), dt, (d) => {
        aliviar(g, S.cansaco, d / 60);
        if (prm.distrai) aliviar(g, S.tedio, d / 25);
      });
    case 'Vagar':
    case 'Explorar': {
      if (!g.aux) {
        const r = acao === 'Explorar' ? Number(prm.raio ?? 30) : Number(prm.raio ?? 6);
        const a = soc.sorte() * Math.PI * 2;
        g.aux = { x: Math.max(2, Math.min(soc.t.w - 2, p.position.x + Math.cos(a) * r)), y: Math.max(2, Math.min(soc.t.h - 2, p.position.y + Math.sin(a) * r)) };
      }
      aliviar(g, S.tedio, dt / (acao === 'Explorar' ? 40 : 60));
      g.tempo += dt;
      return andar(soc, g, g.aux.x, g.aux.y, dt) || g.tempo > 25 ? 'feito' : 'continua';
    }
    case 'IrPara':
      if (!vivo(soc, alvo)) return 'falhou';
      return andar(soc, g, alvo.position.x, alvo.position.y, dt, 1.5) ? 'feito' : 'continua';
    case 'IrParaCasa':
      if (!g.casa) return 'falhou';
      if (!andar(soc, g, g.casa.position.x, g.casa.position.y, dt, 1)) return 'continua';
      aliviar(g, S.frio, 1);
      return 'feito';
    case 'Seguir':
      if (!vivo(soc, alvo)) return 'falhou';
      g.tempo += dt;
      if (andar(soc, g, alvo.position.x, alvo.position.y, dt, 2)) aliviar(g, S.solidao, dt / 20);
      return g.tempo > 8 ? 'feito' : 'continua';
    case 'Fugir':
      if (!vivo(soc, alvo)) return 'feito';
      g.tempo += dt;
      if (dt > 0) {
        const d = Math.max(0.1, distance(p.position, alvo.position));
        const nx = p.position.x + ((p.position.x - alvo.position.x) / d) * PASSO * 1.2 * dt;
        const ny = p.position.y + ((p.position.y - alvo.position.y) / d) * PASSO * 1.2 * dt;
        if (!ehAgua(soc.t, nx, ny)) p.position = { x: Math.max(1, Math.min(soc.t.w - 1, nx)), y: Math.max(1, Math.min(soc.t.h - 1, ny)) };
      }
      return g.tempo > 3 || distance(p.position, alvo.position) > Number(prm.ate ?? 12) ? 'feito' : 'continua';

    // ---- Sobrevivência ----
    case 'Comer': {
      const fonte = String(prm.fonte ?? 'estoque');
      let comeu = 0;
      if (fonte === 'celeiro' && g.lugar) {
        const c = Math.min(1, g.lugar.celeiro.get('comida') ?? 0);
        g.lugar.celeiro.set('comida', (g.lugar.celeiro.get('comida') ?? 0) - c);
        comeu = c;
        if (!comeu) {
          // Sem celeiro: a casa dos vizinhos divide (os primeiros moradores dividem tudo).
          for (const q of soc.moradores(g.lugar)) {
            if (q === g || p.laco(q.p.id) < 10) continue;
            const t = tirar(q, 'comida', 1);
            if (t) {
              comeu = t;
              q.p.ajustarLaco(p.id, 2);
              break;
            }
          }
        }
      } else comeu = tirar(g, 'pao', 1) * 1.6 || tirar(g, 'comida', 1);
      if (!comeu) return 'falhou';
      aliviar(g, S.fome, 0.6 * comeu);
      return 'feito';
    }
    case 'Beber':
      // Quem já está na beira de qualquer água bebe ali mesmo.
      if (naBeira(soc, p.position.x, p.position.y)) {
        p.setStat(S.sede, 0);
        return 'feito';
      }
      if (!vivo(soc, alvo)) return 'falhou';
      if (!andar(soc, g, alvo.position.x, alvo.position.y, dt, 1.6)) return 'continua';
      p.setStat(S.sede, 0);
      return 'feito';
    case 'Aquecer':
      if (tirar(g, 'madeira', 1)) {
        p.setStat(S.frio, 0);
        return 'feito';
      }
      if (g.casa) return agir(soc, g, 'IrParaCasa', ctx, dt);
      return 'falhou';
    case 'Dormir': {
      if (prm.onde === 'casa') {
        if (!g.casa) return 'falhou';
        if (!andar(soc, g, g.casa.position.x, g.casa.position.y, dt, 1)) return 'continua';
      }
      aliviar(g, S.cansaco, dt / (prm.onde === 'casa' ? 14 : 22));
      aliviar(g, S.frio, prm.onde === 'casa' ? 1 : 0);
      return p.stat(S.cansaco) < 0.08 ? 'feito' : 'continua';
    }

    // ---- Mato ----
    case 'Coletar':
      return noAlvo(soc, g, alvo, 3, dt, () => {
        const n = Math.min(alvo!.stat(S.quantidade), 2);
        alvo!.setStat(S.quantidade, alvo!.stat(S.quantidade) - n);
        if (prm.para === 'comer') aliviar(g, S.fome, 0.5 * n);
        else por(g, 'comida', n);
        praticar(g, 'coletor', 0.02);
      });
    case 'CortarLenha':
    case 'ExtrairPedra': {
      const b: Bem = acao === 'CortarLenha' ? 'madeira' : 'pedra';
      const o: Oficio = acao === 'CortarLenha' ? 'lenhador' : 'pedreiro';
      const forca = 0.6 + Math.max(0, p.traco('strength')) * 0.5 + p.stat(hab(o));
      return noAlvo(soc, g, alvo, 5 / forca, dt, () => {
        const n = Math.min(alvo!.stat(S.quantidade), 2);
        alvo!.setStat(S.quantidade, alvo!.stat(S.quantidade) - n);
        alvo!.tags.remove(`${TAG.reservado}:${p.id}`);
        p.untagSelf(TAG.reservando);
        por(g, b, n);
        praticar(g, o, 0.03);
      });
    }
    case 'Cacar': {
      if (!vivo(soc, alvo)) return 'falhou';
      g.tempo += dt;
      if (g.tempo > 20) {
        alvo.tags.remove(`${TAG.alvoDeCaca}:${p.id}`);
        p.untagSelf(TAG.cacando);
        return 'falhou';
      }
      if (!andar(soc, g, alvo.position.x, alvo.position.y, dt * 1.15, 1.2)) return 'continua';
      const sorte = 0.5 + p.stat(hab('cacador')) * 0.5 + Math.max(0, p.traco('courage')) * 0.2;
      if (soc.sorte() > sorte * dt * 4 && dt > 0) return 'continua';
      soc.removerCoisa(alvo);
      p.untagSelf(TAG.cacando);
      if (prm.para === 'comer') {
        aliviar(g, S.fome, 1);
        por(g, 'comida', 2);
      } else por(g, 'comida', 4);
      por(g, 'couro', 1);
      praticar(g, 'cacador', 0.04);
      return 'feito';
    }
    case 'Pescar':
      return noAlvo(soc, g, alvo, 5 / (0.6 + p.stat(hab('pescador'))), dt, () => {
        const n = Math.min(alvo!.stat(S.quantidade), 2);
        alvo!.setStat(S.quantidade, alvo!.stat(S.quantidade) - n);
        if (prm.para === 'comer') aliviar(g, S.fome, 0.5 * n);
        else por(g, 'comida', n);
        praticar(g, 'pescador', 0.03);
      }, 2);
    case 'Plantar':
      return plantar(soc, g, dt, inicio);
    case 'Colher':
      return noAlvo(soc, g, alvo, 4, dt, () => {
        if (!alvo!.stat(S.maduro)) return;
        alvo!.setStat('cresce', 0);
        alvo!.setStat(S.maduro, 0);
        por(g, 'comida', 6 + Math.round(p.stat(hab('agricultor')) * 4));
        praticar(g, 'agricultor', 0.03);
      });
    case 'Pastorear':
      return gesto(g, 4, dt, () => {});

    // ---- Ofício e obras ----
    case 'Trabalhar': {
      const o = meuOficio(p);
      if (!o) return 'falhou';
      const r = trabalharNoOficio(soc, g, o, dt, inicio);
      if (prm.por === 'gosto') aliviar(g, S.tedio, dt / 20);
      return r;
    }
    case 'EscolherOficio': {
      const o = oficioDoAlvo(alvo);
      if (!o) return 'falhou';
      const antes = meuOficio(p);
      if (antes === o) return 'feito';
      p.setStat('oficio', OFICIO_IDS.indexOf(o));
      g.oficioDesde = soc.agora;
      ajustarPacotes(g.brain);
      soc.lembrar(g, antes ? `Trocou de ofício: de ${OFICIOS[antes].nome.toLowerCase()} para ${OFICIOS[o].nome.toLowerCase()}` : `Escolheu ser ${OFICIOS[o].nome.toLowerCase()}`);
      if (g.lugar) soc.anotar(`${p.name} ${antes ? 'trocou de ofício e virou' : 'escolheu ser'} ${OFICIOS[o].nome.toLowerCase()} em ${g.lugar.nome}`, g.lugar.id);
      return 'feito';
    }
    case 'Construir':
      return construir(soc, g, alvo as Coisa, dt, !!prm.paga);
    case 'ConstruirCasa': {
      const l = lote(soc, g);
      abrirObra(soc, g, g.lugar, 'casa', l.x, l.y);
      soc.lembrar(g, 'Marcou o terreno da casa');
      return 'feito';
    }
    case 'AmpliarCasa':
      if (!g.casa) return 'falhou';
      abrirObra(soc, g, g.lugar, 'ampliacao', g.casa.position.x, g.casa.position.y);
      return 'feito';
    case 'AbrirOficina': {
      const o = oficioDoAlvo(alvo);
      if (!o || !g.casa) return 'falhou';
      const l = lote(soc, g);
      abrirObra(soc, g, g.lugar, `oficina:${o}`, l.x, l.y);
      soc.lembrar(g, `Começou a obra da ${OFICIOS[o].oficina}`);
      return 'feito';
    }
    case 'Entregar': {
      if (prm.destino === 'cliente') {
        const of = alvo;
        if (!vivo(soc, of)) return 'falhou';
        const cli = soc.gente.get(of.stat('cliente'));
        const bem = BENS[of.stat('bem')];
        if (!cli) {
          soc.fecharOferta(of);
          return 'falhou';
        }
        if (!andar(soc, g, cli.p.position.x, cli.p.position.y, dt, 1.8)) return 'continua';
        const qtd = of.stat(S.quantidade);
        const dei = tirar(g, bem, qtd);
        if (dei < qtd) {
          por(g, bem, dei);
          return 'falhou';
        }
        por(cli, bem, qtd);
        const preco = of.stat('preco');
        const pago = Math.min(cli.p.stat(S.riqueza), preco);
        riqueza(cli, -pago);
        riqueza(g, pago);
        if (pago < preco) cli.p.mark(p, `${TAG.credor}:${cli.p.id}`);
        cli.p.ajustarLaco(p.id, 6);
        p.ajustarLaco(cli.p.id, 4);
        soc.fecharOferta(of);
        p.untagSelf(TAG.encomenda);
        soc.lembrar(g, `Entregou ${qtd} de ${bem} a ${cli.p.name}`);
        soc.lembrar(cli, `Recebeu ${qtd} de ${bem} de ${p.name}`);
        return 'feito';
      }
      if (prm.destino === 'obra') {
        // Material para a obra pública: chega lá, entrega o que ela pede e o tesouro paga (em abastecer).
        const o = alvo as Coisa | null;
        if (!vivo(soc, o)) return 'falhou';
        if (!andar(soc, g, o.position.x, o.position.y, dt, 1.4)) return 'continua';
        const antes = (o.estoque.get('madeira') ?? 0) + (o.estoque.get('pedra') ?? 0);
        abastecer(soc, g, o);
        const levou = (o.estoque.get('madeira') ?? 0) + (o.estoque.get('pedra') ?? 0) - antes;
        if (levou > 0) soc.lembrar(g, `Levou ${levou} de material à obra de ${o.vira}`);
        return levou > 0 ? 'feito' : 'falhou';
      }
      if (prm.destino === 'celeiro' && g.lugar) {
        if (!andar(soc, g, g.lugar.x, g.lugar.y, dt, 2)) return 'continua';
        for (const [b, n] of g.bolso) {
          if (b === 'comida' || b === 'madeira' || b === 'pedra') {
            g.lugar.celeiro.set(b, (g.lugar.celeiro.get(b) ?? 0) + n);
            g.bolso.set(b, 0);
          }
        }
        p.setStat(S.popularidade, Math.min(1, p.stat(S.popularidade) + 0.02));
        return 'feito';
      }
      if (!g.casa) return 'falhou';
      if (!andar(soc, g, g.casa.position.x, g.casa.position.y, dt, 1)) return 'continua';
      for (const [b, n] of g.bolso) {
        g.casa.estoque.set(b, (g.casa.estoque.get(b) ?? 0) + n);
        g.bolso.set(b, 0);
      }
      return 'feito';
    }
    case 'FazerTarefa':
      return 'falhou';

    // ---- Comércio ----
    case 'Contratar': {
      const forn = pessoaDe(soc, alvo);
      const bem = bemDe(soc, g, ctx);
      if (!forn || !bem) return 'falhou';
      const qtd = bem === 'comida' ? 4 : bem === 'madeira' ? 4 : 2;
      const preco = Math.round(PRECO[bem] * qtd * (1 + Math.max(0, forn.p.traco('greed')) * 0.3) * 10) / 10;
      soc.abrirOferta(g, forn.p, bem, qtd, preco);
      soc.lembrar(g, `Encomendou ${qtd} de ${bem} a ${forn.p.name} (${OFICIOS[OFICIO_IDS.find((o) => OFICIOS[o].rende === bem) ?? 'coletor'].nome.toLowerCase()}) por ${preco}`);
      return 'feito';
    }
    case 'Negociar': {
      const modo = String(prm.modo);
      if (modo === 'vender') {
        p.setStat('vende', 1);
        return 'feito';
      }
      const v = pessoaDe(soc, alvo);
      const bem = bemDe(soc, g, ctx);
      if (!v || !bem) return 'falhou';
      if (!andar(soc, g, v.p.position.x, v.p.position.y, dt, 1.8)) return 'continua';
      const qtd = Math.min(tenho(v, bem), bem === 'comida' ? 3 : 2);
      if (qtd <= 0) return 'falhou';
      if (modo === 'troca') {
        // Dá o que mais sobra em troca.
        let dar: Bem | null = null;
        let mais = 0;
        for (const b of BENS) if (b !== bem && tenho(g, b) > mais) {
          mais = tenho(g, b);
          dar = b;
        }
        if (!dar) return 'falhou';
        const n = Math.max(1, Math.round((qtd * PRECO[bem]) / PRECO[dar]));
        if (tirar(g, dar, n) < n) return 'falhou';
        tirar(v, bem, qtd);
        por(g, bem, qtd);
        por(v, dar, n);
      } else {
        const preco = PRECO[bem] * qtd;
        if (p.stat(S.riqueza) < preco) return 'falhou';
        tirar(v, bem, qtd);
        por(g, bem, qtd);
        riqueza(g, -preco);
        riqueza(v, preco);
      }
      p.ajustarLaco(v.p.id, 2);
      v.p.ajustarLaco(p.id, 2);
      return 'feito';
    }
    case 'AceitarOferta': {
      if (!vivo(soc, alvo)) return 'falhou';
      alvo.setStat('proposta', 0);
      alvo.setStat('aceita', 1);
      alvo.setStat('desde', soc.agora);
      p.tagSelf(TAG.encomenda);
      const cli = soc.gente.get(alvo.stat('cliente'));
      soc.lembrar(g, `Aceitou a encomenda de ${cli?.p.name ?? 'alguém'}: ${alvo.name}`);
      return 'feito';
    }
    case 'RecusarOferta': {
      if (!vivo(soc, alvo)) return 'falhou';
      const cli = soc.gente.get(alvo.stat('cliente'));
      if (cli) {
        cli.p.ajustarLaco(p.id, -5);
        soc.lembrar(cli, `${p.name} recusou a encomenda`);
      }
      if (g.lugar) g.lugar.conflitos += 0.3;
      soc.fecharOferta(alvo);
      return 'feito';
    }
    case 'CancelarOferta':
      if (!vivo(soc, alvo)) return 'falhou';
      soc.fecharOferta(alvo);
      return 'feito';
    case 'Doar': {
      const q = pessoaDe(soc, alvo);
      if (!q) return 'falhou';
      if (prm.bem === 'dívida') {
        const v = Math.min(p.stat(S.riqueza), 3);
        riqueza(g, -v);
        riqueza(q, v);
        q.p.unmark(p, `${TAG.credor}:${p.id}`);
        q.p.untagSelf(`${TAG.credor}:${p.id}`);
        return 'feito';
      }
      const n = tirar(g, 'comida', 2);
      if (!n) return 'falhou';
      por(q, 'comida', n);
      q.p.ajustarLaco(p.id, 12);
      p.ajustarLaco(q.p.id, 5);
      soc.lembrar(q, `${p.name} dividiu comida`);
      return 'feito';
    }

    // ---- Vida social ----
    case 'Conversar':
    case 'Cortejar': {
      const q = pessoaDe(soc, alvo);
      if (!q) return 'falhou';
      if (!andar(soc, g, q.p.position.x, q.p.position.y, dt, 1.8)) return g.tempo++ > 400 ? 'falhou' : 'continua';
      g.tempo += dt;
      if (g.tempo < 3) return 'continua';
      const c = compatibilidade(p, q.p);
      const humor = (x: Gente) => x.p.traco('kindness') * 3 - Math.max(0, x.p.traco('aggression')) * 5;
      const delta = 14 * (c + 0.25) + humor(g) + humor(q) + (soc.sorte() - 0.5) * 10 + (acao === 'Cortejar' ? 4 : 0);
      const a = p.ajustarLaco(q.p.id, delta);
      const b = q.p.ajustarLaco(p.id, delta);
      for (const x of [g, q]) {
        aliviar(x, S.solidao, 0.4);
        aliviar(x, S.tedio, 0.3);
      }
      // Quem conversa vê o ofício do outro.
      p.perceive(q.p, 'Conhecido');
      if (a >= 40) p.perceive(q.p, TAG.amigo);
      if (a <= -35) p.perceive(q.p, TAG.rival);
      if (acao === 'Cortejar' && a >= 70 && b >= 70) {
        p.perceive(q.p, TAG.namorando);
        q.p.perceive(p, TAG.namorando);
        soc.lembrar(g, `Começou a namorar ${q.p.name}`);
      }
      if (b <= -35 && g.lugar) g.lugar.conflitos += 0.5;
      return 'feito';
    }
    case 'Discutir': {
      const q = pessoaDe(soc, alvo);
      if (!q) return 'falhou';
      p.ajustarLaco(q.p.id, -15);
      q.p.ajustarLaco(p.id, -15);
      p.setStat(S.cansaco, Math.min(1, p.stat(S.cansaco) + 0.1));
      if (g.lugar) g.lugar.conflitos += 1;
      soc.lembrar(g, `Brigou com ${q.p.name}`);
      return 'feito';
    }
    case 'Casar': {
      const q = pessoaDe(soc, alvo);
      if (!q || q.conjuge >= 0 || g.conjuge >= 0) return 'falhou';
      g.conjuge = q.p.id;
      q.conjuge = p.id;
      for (const x of [g, q]) {
        x.p.tagSelf(TAG.casado);
        x.p.beliefs.forget(x === g ? q.p.id : p.id, TAG.namorando);
      }
      // Moram juntos: na casa de quem tem; a família vai junto para o lugar.
      const casa = g.casa ?? q.casa;
      if (casa) g.casa = q.casa = casa;
      const l = g.lugar ?? q.lugar;
      if (l) for (const x of [g, q]) if (x.lugar !== l) soc.morarEm(x, l);
      soc.lembrar(g, `Casou com ${q.p.name}`);
      soc.lembrar(q, `Casou com ${p.name}`);
      soc.anotar(`${p.name} e ${q.p.name} se casaram${l ? ` em ${l.nome}` : ''}`, l?.id ?? -1);
      return 'feito';
    }
    case 'TerFilho': {
      const cj = soc.gente.get(g.conjuge);
      if (!cj || !g.casa || soc.idade(g) > 45) return 'falhou';
      const f = soc.nascer(g.casa.position.x + 0.3, g.casa.position.y + 0.3, 0, g.lugar, [g, cj]);
      f.casa = g.casa;
      soc.lembrar(g, `Teve um filho: ${f.p.name}`);
      soc.anotar(`Nasceu ${f.p.name}, filho de ${p.name} e ${cj.p.name}`, g.lugar?.id ?? -1);
      return 'feito';
    }
    case 'Cuidar': {
      const q = pessoaDe(soc, alvo);
      if (!q) return 'falhou';
      if (!andar(soc, g, q.p.position.x, q.p.position.y, dt, 1.5)) return 'continua';
      const n = tirar(g, 'comida', 1);
      if (n) aliviar(q, S.fome, 0.6);
      aliviar(q, S.solidao, 0.3);
      q.p.ajustarLaco(p.id, 4);
      return 'feito';
    }
    case 'Ensinar':
    case 'Aprender': {
      const q = pessoaDe(soc, alvo);
      if (!q) return 'falhou';
      if (!andar(soc, g, q.p.position.x, q.p.position.y, dt, 2)) return 'continua';
      g.tempo += dt;
      const mestre = acao === 'Ensinar' ? g : q;
      const aluno = acao === 'Ensinar' ? q : g;
      const o = meuOficio(mestre.p) ?? OFICIO_IDS.find((x) => mestre.p.tags.has(OFICIOS[x].tag));
      if (o) praticar(aluno, o, dt * (prm.modo === 'olhar' ? 0.003 : 0.008));
      aliviar(aluno, S.tedio, dt / 30);
      return g.tempo > 6 ? 'feito' : 'continua';
    }
    case 'Brincar':
      return gesto(g, 5, dt, (d) => {
        aliviar(g, S.tedio, d / 10);
        aliviar(g, S.solidao, d / 30);
      });
    case 'Passear': {
      const l = g.lugar;
      if (!g.aux) g.aux = l ? { x: l.x + (soc.sorte() - 0.5) * 4, y: l.y + (soc.sorte() - 0.5) * 4 } : { ...p.position };
      g.tempo += dt;
      aliviar(g, S.tedio, dt / 18);
      return andar(soc, g, g.aux.x, g.aux.y, dt) || g.tempo > 15 ? 'feito' : 'continua';
    }
    case 'Festejar': {
      if (!vivo(soc, alvo)) return 'falhou';
      if (!andar(soc, g, alvo.position.x, alvo.position.y, dt, 2)) return 'continua';
      if (inicio || g.tempo === 0) {
        if (alvo.tags.has(TAG.taberna)) {
          const dono = soc.gente.get(alvo.stat('dono'));
          if (p.stat(S.riqueza) >= 1 && dono) {
            riqueza(g, -1);
            riqueza(dono, 1);
          }
        }
      }
      g.tempo += dt;
      aliviar(g, S.tedio, dt / 8);
      aliviar(g, S.solidao, dt / 12);
      return g.tempo > 6 ? 'feito' : 'continua';
    }
    case 'Rezar':
      return gesto(g, 4, dt, (d) => aliviar(g, S.fe, d / 6));

    // ---- Lugar ----
    case 'Estabelecer': {
      const perto = soc.lugarPerto(p.position.x, p.position.y, 12);
      const l = perto ?? soc.fundarLugar(g);
      soc.morarEm(g, l);
      soc.lembrar(g, perto ? `Decidiu ficar em ${l.nome}` : `Decidiu que aqui é a casa dele: nasceu ${l.nome}`);
      return 'feito';
    }
    case 'JuntarSe': {
      const l = soc.lugares.find((x) => x.ent === alvo);
      if (!l || l.abandonado) return 'falhou';
      if (!andar(soc, g, l.x, l.y, dt, 4)) return 'continua';
      soc.morarEm(g, l);
      let amigo = '';
      let best = -1;
      for (const id of l.ent.moradores) if (id !== p.id && p.laco(id) > best) {
        best = p.laco(id);
        amigo = soc.gente.get(id)?.p.name ?? '';
      }
      soc.lembrar(g, `Decidiu morar em ${l.nome}${amigo && best >= 20 ? `, perto de ${amigo}` : ''}`);
      soc.anotar(`${p.name} decidiu morar em ${l.nome}${amigo && best >= 20 ? `, perto de ${amigo}` : ''}`, l.id);
      return 'feito';
    }
    case 'MudarSe':
    case 'Fundar': {
      if (!vivo(soc, alvo)) return 'falhou';
      if (!andar(soc, g, alvo.position.x, alvo.position.y, dt, 3)) return 'continua';
      const antes = g.lugar;
      const familia = [...soc.gente.values()].filter((q) => q === g || q.p.id === g.conjuge || (q.pais.includes(p.id) && q.p.tags.has(TAG.crianca)));
      let destino: LugarVivo | undefined;
      if (acao === 'MudarSe') destino = soc.lugares.find((x) => x.ent === alvo);
      else destino = soc.fundarLugar(g);
      if (!destino) return 'falhou';
      for (const q of familia) {
        q.casa = null;
        q.p.untagSelf(TAG.temCasa);
        soc.morarEm(q, destino);
        if (q !== g) q.p.position = { ...p.position };
      }
      soc.anotar(`${p.name} ${acao === 'Fundar' ? 'saiu para fundar' : 'mudou-se para'} ${destino.nome}${antes ? `, deixando ${antes.nome}` : ''}`, destino.id);
      return 'feito';
    }
    case 'Ficar':
      return 'feito';

    // ---- Política ----
    case 'ConvocarEleicao':
      if (!g.lugar) return 'falhou';
      soc.abrirEleicao(g.lugar, g);
      return 'feito';
    case 'Candidatar':
      p.tagSelf(TAG.candidato);
      if (g.lugar) soc.anotar(`${p.name} se candidatou a líder de ${g.lugar.nome}`, g.lugar.id);
      return 'feito';
    case 'Votar': {
      const l = g.lugar;
      if (!l?.eleicao || !alvo) return 'falhou';
      l.eleicao.votos.set(alvo.id, (l.eleicao.votos.get(alvo.id) ?? 0) + 1);
      p.tagSelf(TAG.votou);
      soc.lembrar(g, `Votou em ${alvo.name}`);
      return 'feito';
    }
    case 'Apoiar':
      g.lugar?.apoios.push(soc.agora);
      if (alvo && ehPessoa(alvo)) alvo.ajustarLaco(p.id, 3);
      return 'feito';
    case 'Protestar':
      g.lugar?.protestos.push(soc.agora);
      if (g.lugar) g.lugar.conflitos += 0.5;
      if (alvo && ehPessoa(alvo)) alvo.ajustarLaco(p.id, -6);
      soc.lembrar(g, `Protestou contra ${alvo?.name ?? 'o líder'}`);
      return 'feito';
    case 'PagarImposto': {
      const l = g.lugar;
      if (!l) return 'falhou';
      const v = Math.min(p.stat(S.riqueza), Math.max(0.5, p.stat(S.riqueza) * IMPOSTOS[l.imposto]) + IMPOSTOS[l.imposto] * 4);
      riqueza(g, -v);
      l.tesouro += v;
      p.setStat(S.impostoDevido, 0);
      return 'feito';
    }
    case 'Sonegar':
      p.setStat(S.impostoDevido, 0);
      if (g.lugar) g.lugar.conflitos += 0.4;
      return 'feito';
    case 'DefinirImposto': {
      const l = g.lugar;
      if (!l || !alvo) return 'falhou';
      const antes = l.imposto;
      l.imposto = alvo.name as Imposto;
      soc.anotar(`${p.name}, líder de ${l.nome}, mudou o imposto de ${antes} para ${l.imposto}`, l.id);
      return 'feito';
    }
    case 'OrdenarObra': {
      const l = g.lugar;
      if (!l || !alvo) return 'falhou';
      const obra = alvo.name as ObraPublica;
      const custo = OBRA[obra].custo;
      if (l.tesouro < custo * 0.6) return 'falhou';
      for (const o of soc.coisas.doTipo(WOT.obra)) if (o.stat('lugar') === l.id && o.vira === obra) return 'falhou';
      const pos = obra === 'praca' ? { x: l.x, y: l.y } : lote(soc, g);
      abrirObra(soc, null, l, obra, pos.x, pos.y);
      soc.anotar(`${p.name}, líder de ${l.nome}, mandou fazer: ${obra}`, l.id);
      soc.lembrar(g, `Mandou fazer ${obra}`);
      return 'feito';
    }
    case 'Recrutar':
      if (!g.lugar) return 'falhou';
      g.lugar.chamadoAte = soc.agora + ANO;
      soc.anotar(`${p.name} chamou o povo de ${g.lugar.nome} às armas`, g.lugar.id);
      return 'feito';
    case 'Distribuir': {
      const l = g.lugar;
      if (!l) return 'falhou';
      const mor = soc.moradores(l);
      const total = l.celeiro.get('comida') ?? 0;
      const cada = Math.floor(total / Math.max(1, mor.length));
      for (const q of mor) por(q, 'comida', cada);
      l.celeiro.set('comida', total - cada * mor.length);
      soc.anotar(`${p.name} abriu o celeiro de ${l.nome}`, l.id);
      return 'feito';
    }
    case 'PromoverFesta': {
      const l = g.lugar;
      if (!l || l.festa || l.tesouro < 5) return 'falhou';
      l.tesouro -= 5;
      const f = new Coisa({ id: soc.id(), name: 'festa', type: WOT.evento, position: { x: l.x, y: l.y }, tags: ['Festa'] });
      f.setStat('lugar', l.id);
      f.setStat('ate', soc.agora + DIA * 2);
      l.festa = f;
      soc.world.add(f);
      soc.anotar(`${p.name} fez uma festa na praça de ${l.nome}`, l.id);
      return 'feito';
    }
    case 'Renunciar':
      if (g.lugar && g.lugar.lider === p.id) soc.deporLider(g.lugar, 'renunciou');
      return 'feito';

    // ---- Defesa ----
    case 'Alistar':
      p.tagSelf(TAG.soldado);
      return 'feito';
    case 'Atacar': {
      if (!vivo(soc, alvo)) return 'feito';
      if (!andar(soc, g, alvo.position.x, alvo.position.y, dt, 1.2)) return 'continua';
      if (alvo.type === WOT.animal) {
        soc.removerCoisa(alvo);
        por(g, 'couro', 1);
        if (g.lugar) soc.anotar(`${p.name} afastou um ${alvo.name} de ${g.lugar.nome}`, g.lugar.id);
      }
      return 'feito';
    }
    case 'Patrulhar':
      return agir(soc, g, 'Vagar', ctx, dt);
    case 'Treinar':
      return gesto(g, 5, dt, (d) => praticar(g, 'cacador', d * 0.001));
    case 'Abrigar':
      // Corre para o centro do lugar e fica lá um tempo, quieto, enquanto o perigo passa.
      if (!g.lugar) return 'falhou';
      if (!andar(soc, g, g.lugar.x, g.lugar.y, dt, 2)) return 'continua';
      g.tempo += dt;
      return g.tempo > 8 ? 'feito' : 'continua';

    // ---- Tags: o IAUS já mudou; aqui só fica o diário ----
    case 'DarTagASi': {
      const o = meuOficio(p);
      if (o && p.tags.has(OFICIOS[o].tag)) soc.lembrar(g, `Passou a se ver como ${OFICIOS[o].nome.toLowerCase()}`);
      return 'feito';
    }
    case 'TirarTagDeSi':
    case 'MarcarAlvo':
    case 'DesmarcarAlvo':
    case 'PerceberTag':
    case 'EsquecerTag':
      return 'feito';
  }
  return 'falhou';
}

export { tenho, ANO };
