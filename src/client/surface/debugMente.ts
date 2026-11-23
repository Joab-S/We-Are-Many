/**
 * Painel de depuração: as abas Mente e Coletivo (o modelo generativo, src/sim/generativa). Só HTML a partir do dado
 * puro que o motor entrega pela fachada (`engine.debug.mente`, `coletivo`, `difusao`); nenhuma palavra daqui chega à
 * simulação. O objetivo é responder, para qualquer decisão, "por que essa pessoa fez isso e de onde veio essa ideia",
 * e para o coletivo, "como esse povo chegou aqui", sem dar nome ao que o agrupamento é.
 */
import type { ColetivoDebug, Difusao, MenteDebug, OpcaoDebug } from '../../sim/api/debug';
import { emptyState, esc, meter, num, yearText } from './debugPanel';

const sec = (t: string, extra = '') => `<div class="wb-sub">${t}${extra ? ` <span class="wb-dim">${extra}</span>` : ''}</div>`;
const kv = (label: string, value: string, extra = '') => `<div class="wb-kv"><span>${label}</span>${value}${extra ? `<span class="wb-dim">${extra}</span>` : ''}</div>`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const sinal = (x: number) => `${x >= 0 ? '+' : '−'}${num(Math.abs(x))}`;

/** Uma opção gerada: o nome (verbo + coisa), a nota, e uma barra por consideração e por necessidade. */
export function opcaoHtml(o: OpcaoDebug, melhor: number): string {
  const falta = o.escolhida || o.cortada || melhor <= 0 ? '' : ` · faltou ${num(Math.max(0, melhor - o.nota))}`;
  const cabeca = `<div class="wb-kv"><span><b>${o.escolhida ? '▶ ' : ''}${esc(cap(o.nome))}</b>${o.habito ? ' <span class="wb-dim">(hábito)</span>' : ''}</span>${meter(melhor > 0 ? o.nota / melhor : 0, num(o.nota), o.escolhida ? 'good' : 'info')}<span class="wb-dim">${esc(o.alvo)} a ${num(o.dist)}${falta}</span></div>`;
  if (o.cortada) return `<div class="wb-dopt" style="opacity:.45" title="Ficou fora do corte: não foi ao IAUS">${cabeca}<div class="wb-dim">benefício ${num(o.beneficio)}: abaixo das melhores, não chegou a ser pontuada</div></div>`;
  const nec = o.porNec.map((n) => kv(esc(n.nome), meter(Math.abs(n.valor) / 0.6, sinal(n.valor), n.valor < 0 ? 'bad' : 'info'))).join('');
  const extras = [
    Math.abs(o.lente) >= 0.005 ? kv('lentes', meter(Math.abs(o.lente) / 0.6, sinal(o.lente), o.lente < 0 ? 'bad' : 'info')) : '',
    o.adiante >= 0.005 ? kv('o que vem depois', meter(o.adiante / 0.6, sinal(o.adiante), 'info'), esc(o.cadeia)) : '',
  ].join('');
  const fatores = o.fatores.map((f) => kv(esc(f.nome), meter(f.valor, num(f.valor)))).join('');
  return `<details class="wb-dopt"${o.escolhida ? ' open' : ''}><summary>${cabeca}</summary><div class="wb-dopts">${sec('Considerações do IAUS', '(a nota é o produto delas)')}${fatores}${sec('Benefício esperado', `(${num(o.beneficio)}: urgência × alívio que ela acredita)`)}${nec}${extras}</div></details>`;
}

function necessidadesHtml(m: MenteDebug): string {
  return m.necessidades.map((n) => kv(esc(cap(n.nome.replace(/^a |^o /, ''))), meter(n.valor, num(n.valor), n.valor > 0.75 ? 'bad' : n.valor > 0.45 ? 'warn' : 'good'), n.urgencia >= 0.02 ? `urgência ${num(n.urgencia)}` : '')).join('');
}

function crencasHtml(m: MenteDebug): string {
  if (!m.crencas.length) return '<div class="wb-empty">nenhuma</div>';
  return `<table class="wb-table"><tr><th>Fazer</th><th>Espera</th><th>Confiança</th><th>Origem</th></tr>${m.crencas
    .map((c) => `<tr${c.tipo === 'instinto' ? ' class="wb-dim"' : ''}><td>${esc(c.nome.split(':')[0])}${c.depois.length ? `<br><span class="wb-dim">${esc(c.depois.join('; '))}</span>` : ''}</td><td>${esc(c.efeito)}</td><td>${meter(c.confianca, num(c.confianca))}</td><td>${esc(c.origem)}${c.tipo === 'instinto' ? '' : `<br><span class="wb-dim">${yearText(c.em)} · ${c.vezes}×</span>`}</td></tr>`)
    .join('')}</table>`;
}

function linhaHtml(m: MenteDebug): string {
  if (!m.linha.length) return '<div class="wb-empty">ainda não decidiu nada</div>';
  return m.linha
    .map((r) => {
      const fim = r.fim === 'feito' ? '✓' : r.fim === 'falhou' ? '✗ não deu' : r.fim === 'trocou' ? '↷ trocou no meio' : '… fazendo';
      return `<div class="wb-kv"${r.surpresa ? ' style="outline:1px solid var(--amb)"' : ''}><span>${yearText(r.ano)} · <b>${esc(r.nome)}</b></span><span class="wb-dim">esperava ${sinal(r.esperado)}, veio ${r.fim ? sinal(r.real) : '?'} · ${fim}${r.surpresa ? ' · <b>surpresa</b>' : ''}</span></div>`;
    })
    .join('');
}

/** O resumo de uma pessoa para comparar duas lado a lado. */
function resumoHtml(m: MenteDebug, titulo: string): string {
  const aprendidas = m.crencas.filter((c) => c.tipo !== 'instinto');
  return `<div style="flex:1;min-width:0">${sec(titulo, `#${m.uid} · ${Math.floor(m.idade)} anos`)}
    ${kv('Agora', `<b>${esc(m.agora || 'parada')}</b>`)}
    ${necessidadesHtml(m)}
    ${kv('Sabe', `<b>${aprendidas.length}</b>`, 'crenças além do instinto')}
    ${aprendidas.slice(0, 8).map((c) => `<div class="wb-dim">· ${esc(c.nome)} <i>(${esc(c.origem)})</i></div>`).join('')}
    ${m.lentes.map((l) => `<div class="wb-dim">◐ ${esc(l.texto)}</div>`).join('')}
    ${m.habitos.map((h) => `<div class="wb-dim">↻ ${esc(h.texto)}</div>`).join('')}</div>`;
}

/** A aba Mente: a pessoa fixada na ficha, por dentro. `outra` é a pessoa guardada para comparar. */
export function mindTabHtml(m: MenteDebug | null, outra: MenteDebug | null, generativo: boolean): string {
  if (!generativo) return emptyState('Este mundo não usa a mente generativa', 'Abra o jogo com ?mente=generativa&debug num planeta novo: as pessoas começam espalhadas, só com o instinto.');
  if (!m) return emptyState('Nenhuma pessoa fixada', 'Clique numa pessoa do mundo generativo para fixar a ficha dela: aqui aparecem as opções que ela gerou agora, o que ela sente, o que acredita e de onde veio cada ideia.');
  const melhor = Math.max(0, ...m.opcoes.map((o) => o.nota));
  const corpo = [m.corpo.mao ? `na mão: ${m.corpo.mao}` : '', m.corpo.gravida ? 'grávida' : '', m.corpo.colo ? `com #${m.corpo.colo} no colo` : '', m.corpo.filhos ? `${m.corpo.filhos} filhos pequenos` : '', m.corpo.segue ? `seguindo #${m.corpo.segue}` : '', m.corpo.seguidores ? `${m.corpo.seguidores} a seguem` : '', m.corpo.ferida > 0.05 ? `ferida ${num(m.corpo.ferida)}` : ''].filter(Boolean).join(' · ');
  const botoes = `<div class="wb-drow"><button class="wb-btn" data-dstep="4" title="Avança 1 s de simulação: o tempo de um pensamento perto da tela">Avançar 1 pensamento</button><button class="wb-btn" data-dmcomp="${m.uid}">${outra && outra.uid === m.uid ? 'Guardada para comparar' : 'Guardar para comparar'}</button><button class="wb-btn" data-dmexport="${m.uid}">Exportar esta pessoa (JSON)</button><button class="wb-btn" data-dmexport="">Exportar todos (JSON)</button></div>`;
  const comparar = outra && outra.uid !== m.uid ? `${sec('Lado a lado')}<div style="display:flex;gap:10px">${resumoHtml(m, 'Esta')}${resumoHtml(outra, 'A guardada')}</div>` : '';
  return `${kv('Pessoa', `<b>#${m.uid}</b>`, `${Math.floor(m.idade)} anos${corpo ? ` · ${esc(corpo)}` : ''}`)}
    ${kv('Agora', `<b>${esc(m.agora || 'parada (pensando)')}</b>`, m.alvo?.nec ? `atende: ${esc(m.alvo.nec)}` : '')}
    ${botoes}
    ${sec('Por quê: as opções geradas agora', '(verbo + coisa percebida; as esmaecidas ficaram fora do corte)')}
    ${m.opcoes.length ? m.opcoes.map((o) => opcaoHtml(o, melhor)).join('') : '<div class="wb-empty">ainda não pensou (ou está longe da tela e pensa mais devagar)</div>'}
    ${sec('Necessidades')}${necessidadesHtml(m)}
    ${sec('Lentes: as formas de pensar', '(o texto sai da condição e do efeito)')}
    ${m.lentes.length ? m.lentes.map((l) => `<div class="wb-kv"><span>${esc(cap(l.texto))}</span>${meter(l.forca, num(l.forca), 'info')}<span class="wb-dim">${esc(l.origem)} · ${yearText(l.em)} · <button class="wb-link" data-ddif="${esc(l.chave)}">quem mais?</button></span></div>`).join('') : '<div class="wb-empty">nenhuma ainda</div>'}
    ${sec('Hábitos: sequências que viraram uma ação só')}
    ${m.habitos.length ? m.habitos.map((h) => kv(esc(cap(h.texto)), `<b>${h.vezes}×</b>`, `${esc(h.efeito)} · ${esc(h.origem)} · ${yearText(h.em)}`)).join('') : '<div class="wb-empty">nenhum ainda</div>'}
    ${sec('Linha do tempo', '(o esperado contra o real)')}${linhaHtml(m)}
    ${sec('Crenças: o que espera de cada verbo em cada tipo de coisa')}${crencasHtml(m)}
    ${sec('Percebe agora', `(até ${num(m.vista)} tiles)`)}
    ${m.percebe.map((a) => `<div class="wb-dim">${esc(a.tipo)} a ${num(a.dist)}: ${esc(a.tags.join(', '))}</div>`).join('')}
    ${m.lugares.length ? sec('Lugares de que lembra') + m.lugares.map((l) => `<div class="wb-kv"><span><button class="wb-link" data-dgo="${Math.round(l.x)},${Math.round(l.y)}">${Math.round(l.x)},${Math.round(l.y)}</button> ${esc(l.tags.slice(0, 5).join(', '))}</span><span class="wb-dim">viveu ${sinal(l.bem)}${l.de ? ` · mostrado por #${l.de}` : ''}</span></div>`).join('') : ''}
    ${comparar}`;
}

/** A aba Coletivo: o retrato sem rótulo, as primeiras vezes e a difusão de uma crença ou lente. */
export function collectiveTabHtml(c: ColetivoDebug | null, dif: Difusao | null): string {
  if (!c) return emptyState('Este mundo não usa a mente generativa', 'Abra o jogo com ?mente=generativa&debug num planeta novo.');
  const f = (x: number, d = 1) => (Number.isNaN(x) ? '?' : x.toFixed(d).replace('.', ','));
  const grupos = c.grupos.slice(0, 12).map((g) => `<details class="wb-dopt"><summary><div class="wb-kv"><span><button class="wb-link" data-dgo="${Math.round(g.x)},${Math.round(g.y)}">${Math.round(g.x)},${Math.round(g.y)}</button> <b>${g.quantos}</b> juntos (${g.criancas} pequenos)</span><span class="wb-dim">andam ${f(g.movimento)}/ano · ${f(g.noites)} noites no lugar · ${Math.round(g.seguem * 100)}% seguem o mesmo</span></div></summary>
      ${kv('Quanto se movem', meter(Math.min(1, (Number.isNaN(g.movimento) ? 0 : g.movimento) / 8), `${f(g.movimento)} tiles por ano`, 'info'))}
      ${kv('Dormem no mesmo lugar há', meter(Math.min(1, g.noites / 10), `${f(g.noites)} noites`, 'info'))}
      ${kv('Seguem a mesma pessoa', meter(g.seguem, `${Math.round(g.seguem * 100)}%`, 'info'), g.seguido ? `#${g.seguido}` : '')}
      ${kv('Deram algo a alguém', `<b>${g.deu}×</b>`)}
      ${kv('Do que deram por último, foi à mesma pessoa', meter(g.daoAoMesmo, `${Math.round(g.daoAoMesmo * 100)}%`, 'info'), g.recebe ? `#${g.recebe}` : '')}
      ${kv('Do que deram por último, foi para fora', meter(g.daoParaFora, `${Math.round(g.daoParaFora * 100)}%`, 'info'))}
      ${kv('Tomaram da mão de alguém', `<b>${g.tomaram}×</b>`)}${kv('Bateram em alguém', `<b>${g.bateu}×</b>`)}
      ${kv('Desafetos', `<b>${g.desafetosFora}</b> com gente de fora, <b>${g.desafetosDentro}</b> entre si`)}
      ${kv('Travessias de água com tronco', `<b>${g.travessias}×</b>`)}${kv('Com lasca na mão', `<b>${g.armados}</b>`)}
      ${kv('Em volta', `<b>${g.abrigos}</b> abrigos, <b>${g.fogos}</b> fogos, <b>${f(g.guardado)}</b> de comida guardada, <b>${g.plantas}</b> plantas`)}
      ${kv('Sabem', `<b>${f(g.saber)}</b>`, 'crenças aprendidas por pessoa')}
      ${g.lentes.map((l) => `<div class="wb-dim">◐ ${esc(l.texto)} (${l.quantos})</div>`).join('')}
      ${g.habitos.map((h) => `<div class="wb-dim">↻ ${esc(h.texto)} (${h.quantos})</div>`).join('')}</details>`).join('');
  const primeiras = c.primeiras.length ? c.primeiras.map((p) => `<div class="wb-kv"><span>${yearText(p.ano)} · ${esc(p.oque)}</span><span class="wb-dim">${p.quem ? `#${p.quem} · ` : ''}<button class="wb-link" data-dgo="${Math.round(p.x)},${Math.round(p.y)}">ver onde</button></span></div>`).join('') : '<div class="wb-empty">nada ainda (o painel anota quando vê; deixe-o aberto)</div>';
  const sabem = c.sabem.slice(0, 40).map((s) => `<button class="wb-chip${dif?.chave === s.chave ? ' on' : ''}" data-ddif="${esc(s.chave)}">${esc(s.nome)} · ${s.quantos}</button>`).join('');
  const difusao = dif
    ? `${sec(`Difusão: ${esc(dif.nome)}`, `(${dif.quem.length} têm)`)}${dif.quem.map((q) => `<div class="wb-kv"><span>${q.primeiro ? '★ ' : ''}<button class="wb-link" data-dgo="${Math.round(q.x)},${Math.round(q.y)}">#${q.uid}</button></span><span class="wb-dim">${yearText(q.em)} · ${esc(q.origem)}${q.de ? ` de #${q.de}` : ''}${q.primeiro ? ' · a primeira pessoa' : ''}</span></div>`).join('')}`
    : '';
  return `<div class="wb-dim">${esc(c.resumo)}</div>
    <div class="wb-dim">No mapa, com esta aba aberta: o contorno de cada agrupamento, setas de quem segue para quem é seguido, a trilha de cada pessoa e, escolhida uma crença ou lente abaixo, um ponto em quem a tem (anel na primeira pessoa; amarelo vivido, azul visto, roxo ouvido, verde herdado).</div>
    ${sec('Agrupamentos de agora', '(refeitos pela proximidade a cada leitura; o mundo não os guarda)')}
    ${grupos || '<div class="wb-empty">ninguém</div>'}
    ${sec('Primeiras vezes vistas')}${primeiras}
    ${sec('O que se sabe', '(clique para ver quem tem e quando aprendeu)')}<div class="wb-chips">${sabem || '<span class="wb-empty">só o instinto, por enquanto</span>'}</div>
    ${difusao}`;
}

/** O bloco da ficha da pessoa (aba da decisão) no mundo generativo: o que faz, por quê, e o que mais pensou. */
export function fichaGenerativaHtml(m: MenteDebug): string {
  const melhor = Math.max(1e-6, ...m.opcoes.map((o) => o.nota));
  const escolhida = m.opcoes.find((o) => o.escolhida);
  const barra = (x: number) => `<span class="cs-tb1"><i style="width:${Math.round(Math.max(0, Math.min(1, x)) * 100)}%"></i></span>`;
  const motivo = escolhida?.porNec.filter((n) => n.valor > 0).slice(0, 2).map((n) => n.nome) ?? [];
  const veio = escolhida ? m.crencas.find((c) => c.nome.split(':')[0] === escolhida.nome) : undefined;
  const porque = escolhida
    ? `<p class="cs-say">Acredita que isso alivia ${motivo.length ? esc(motivo.join(' e ')) : 'o que sente'}${escolhida.cadeia ? `, e que depois dá para ${esc(escolhida.cadeia)}` : ''}.${veio ? ` Sabe disso por: ${esc(veio.origem)}.` : ' Nunca fez: quer ver o que acontece.'}</p>`
    : '<p class="cs-say">Está pensando no que fazer.</p>';
  const outras = m.opcoes.filter((o) => !o.escolhida && !o.cortada).slice(0, 4);
  const piores = m.necessidades.filter((n) => n.valor >= 0.3).sort((a, b) => b.valor - a.valor).slice(0, 5);
  return `<div class="cs-pick"><div class="cs-pick-head"><b>${esc(cap(m.agora || 'Parada'))}</b>${escolhida ? barra(escolhida.nota / melhor) : ''}</div>${porque}</div>
    ${piores.length ? `<p class="cs-fine">Sente: ${piores.map((n) => `${esc(n.nome.replace(/^a |^o /, ''))} ${Math.round(n.valor * 100)}%`).join(' · ')}</p>` : ''}
    ${outras.map((o) => `<div class="cs-alt"><div class="cs-alt-head"><b>${esc(cap(o.nome))}</b>${barra(o.nota / melhor)}</div></div>`).join('')}
    <p class="cs-fine">Sabe ${m.crencas.filter((c) => c.tipo !== 'instinto').length} coisas além do instinto${m.lentes.length ? `, e vê o mundo por ${m.lentes.length} lente${m.lentes.length > 1 ? 's' : ''}: ${esc(m.lentes.slice(0, 2).map((l) => l.texto).join('; '))}` : ''}${m.habitos.length ? `. Costumes: ${esc(m.habitos.map((h) => h.texto).join('; '))}` : ''}. Com ?debug, a aba Mente do painel (F3) mostra a conta inteira.</p>`;
}
