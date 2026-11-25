import type { ColetivoDebug, NumerosDoMundo } from '../../sim/api/debug';

/**
 * A janela Humanidade e o bloco do painel lateral no mundo generativo: o que o jogador vê da gente toda, sem rótulo.
 * Os agrupamentos são refeitos pela proximidade a cada leitura (o mundo não os guarda), e nada aqui dá nome ao que
 * eles são: só o que se mede (quantos, quanto andam, quem seguem, o que dão, o que construíram em volta).
 */

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1).replace('.', ',') : '?');
const pct = (x: number) => `${Math.round(Math.max(0, Math.min(1, x)) * 100)}%`;
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

const OPOSTA: Record<NumerosDoMundo['estacao'], string> = { verão: 'inverno', outono: 'primavera', inverno: 'verão', primavera: 'outono' };

/** O relógio do topo no mundo generativo: a estação do norte no lugar da era das vilas. */
export function relogioGen(n: NumerosDoMundo): string {
  return `${cap(n.estacao)} no norte`;
}

/** O bloco "Humanidade" do painel lateral (no lugar de Povos). */
export function painelGen(n: NumerosDoMundo): string {
  const feitos = [n.abrigos ? plural(n.abrigos, 'abrigo', 'abrigos') : '', n.fogos ? plural(n.fogos, 'fogo', 'fogos') : '', n.plantas ? plural(n.plantas, 'planta', 'plantas') : ''].filter(Boolean).join(' · ');
  return `
    <div class="wb-section">Humanidade</div>
    <div class="wb-pop">Pessoas<b>${n.gente}</b></div>
    <div class="wb-pop">Crianças<b>${n.criancas}</b></div>
    <div class="wb-pop">Nascidos · mortos<b>${n.nascidos} · ${n.mortos}</b></div>
    ${n.abates ? `<div class="wb-pop">Caças<b>${n.abates}</b></div>` : ''}
    ${feitos ? `<div class="wb-pop wb-dim">${feitos}</div>` : ''}
    <button class="wb-goto" data-open="settlements" title="Os agrupamentos de agora, as primeiras vezes e o que se sabe">Ver a humanidade…</button>`;
}

/** A janela Humanidade: números do mundo, agrupamentos de agora, primeiras vezes e o que mais se sabe. */
export function humanidadeHtml(c: ColetivoDebug, n: NumerosDoMundo): string {
  const caca = n.abates ? `${plural(n.abates, 'bicho abatido', 'bichos abatidos')} (${n.abatesGrandes} grandes, ${n.abatesJuntos} com mais de um batendo junto)` : 'ninguém caçou ainda';
  const topo = `
    <div class="wb-card">
      <div><b>${n.gente} pessoas</b> · ${n.criancas} crianças · ${n.gravidas} grávidas · ${cap(n.estacao)} no norte, ${OPOSTA[n.estacao]} no sul</div>
      <div>Nasceram ${n.nascidos}, morreram ${n.mortos} · ${caca}</div>
      <div>Montes ${n.montes} · abrigos ${n.abrigos} · fogos ${n.fogos} · comida guardada ${f1(n.guardado)} · plantas ${n.plantas}</div>
      <div class="wb-dim">Por pessoa: ${f1(n.saber)} coisas aprendidas, ${f1(n.lentes)} lentes, ${f1(n.habitos)} costumes</div>
    </div>`;
  const grupos = c.grupos
    .slice(0, 12)
    .map((g) => {
      const anda = Number.isNaN(g.movimento) ? 'medindo quanto anda' : `anda ${f1(g.movimento)} tiles por ano`;
      const lider = g.seguido && g.seguem >= 0.3 ? ` · ${pct(g.seguem)} seguem <button class="wb-link" data-uid="${g.seguido}">a mesma pessoa</button>` : '';
      const volta = [g.abrigos ? plural(g.abrigos, 'abrigo', 'abrigos') : '', g.fogos ? plural(g.fogos, 'fogo', 'fogos') : '', g.guardado >= 0.5 ? `${f1(g.guardado)} de comida guardada` : '', g.plantas ? plural(g.plantas, 'planta', 'plantas') : ''].filter(Boolean).join(' · ');
      const trato = [g.deu ? `deram ${g.deu}×` : '', g.daoParaFora >= 0.2 ? `${pct(g.daoParaFora)} do que dão vai para fora` : '', g.tomaram ? `tomaram ${g.tomaram}×` : '', g.bateu ? `bateram ${g.bateu}×` : '', g.desafetosFora ? `${plural(g.desafetosFora, 'desafeto', 'desafetos')} com gente de fora` : ''].filter(Boolean).join(' · ');
      const modos = [...g.lentes.slice(0, 2).map((l) => `◐ ${l.texto} (${l.quantos})`), ...g.habitos.slice(0, 2).map((h) => `↻ ${h.texto} (${h.quantos})`)];
      return `
        <div class="wb-card">
          <button class="wb-card-head" data-go="${g.x.toFixed(1)},${g.y.toFixed(1)}" title="Ir até lá"><b>${g.quantos === 1 ? 'Uma pessoa só' : `${g.quantos} juntos`}</b>${g.criancas ? `<span class="wb-dim">&nbsp;· ${plural(g.criancas, 'criança', 'crianças')}</span>` : ''}<em>📍</em></button>
          <div>${anda} · dorme ${f1(g.noites)} noites no mesmo lugar${lider}</div>
          ${volta ? `<div>Em volta: ${volta}</div>` : ''}
          ${trato ? `<div class="wb-dim">${trato}</div>` : ''}
          ${modos.length ? `<div class="wb-dim">${esc(modos.join(' · '))}</div>` : ''}
        </div>`;
    })
    .join('');
  const sozinhos = c.grupos.filter((g) => g.quantos === 1).length;
  const primeiras = c.primeiras
    .slice(-12)
    .reverse()
    .map((p) => `<button class="wb-row" data-go="${p.x.toFixed(1)},${p.y.toFixed(1)}"><span class="wb-yr">${Math.floor(p.ano)}</span>${esc(cap(p.oque))}<em>📍</em></button>`)
    .join('');
  const sabem = c.sabem
    .slice(0, 12)
    .map((s) => `<span class="wb-rel">${esc(cap(s.nome))}: ${s.quantos}</span>`)
    .join('');
  return `
    ${topo}
    <div class="wb-section">Agrupamentos de agora</div>
    <div class="wb-dim">Quem está a poucos passos de alguém conta junto. ${sozinhos ? `${plural(sozinhos, 'pessoa anda', 'pessoas andam')} sozinha${sozinhos === 1 ? '' : 's'}.` : ''}</div>
    <div class="wb-grid">${grupos || '<div class="wb-empty">Ninguém vivo.</div>'}</div>
    <div class="wb-section">Primeiras vezes</div>
    <div class="wb-list">${primeiras || '<div class="wb-empty">Nada de novo ainda: o primeiro abrigo, o primeiro fogo, a primeira semente plantada aparecem aqui.</div>'}</div>
    <div class="wb-section">O que mais gente sabe</div>
    <div class="wb-rels">${sabem || '<span class="wb-empty">Só o instinto, por enquanto.</span>'}</div>`;
}
