import { describe, expect, it } from 'vitest';
import { runWorld } from '../../sim/calibrate';
import { Ecosystem } from '../../sim/ecosystem';
import { aboutVillage, compareHtml, economicState, PERIOD_SPANS, SETTLEMENT_TABS, settlementTabHtml, sumLedger, sumVital } from './settlementWindow';

describe('janela do assentamento (RF-VIDA-341 a 349b)', () => {
  const { eco } = runWorld(5, 80);
  const v = eco.villages.filter((o) => !o.abandoned).sort((a, b) => b.population - a.population)[0];

  it('monta as seis abas com números e unidades', () => {
    for (const [tab] of SETTLEMENT_TABS) {
      const html = settlementTabHtml(eco, v, tab, (e) => Ecosystem.describe(e));
      expect(html.length).toBeGreaterThan(80);
      expect(html).not.toContain('undefined');
      expect(html).not.toContain('NaN');
    }
    expect(settlementTabHtml(eco, v, 'people', (e) => e.text)).toContain('data-role=');
    expect(settlementTabHtml(eco, v, 'summary', (e) => e.text)).toContain(`${v.population} moradores`);
  });

  it('agrupa registros econômicos e demográficos por período (10, 50, 100 e total)', () => {
    for (const [span, label] of PERIOD_SPANS) {
      const econ = settlementTabHtml(eco, v, 'economy', (e) => e.text, span);
      const peop = settlementTabHtml(eco, v, 'people', (e) => e.text, span);
      expect(econ).toContain(`data-span="${span}" class="on">${label}`);
      expect(peop).toContain(`data-span="${span}" class="on">${label}`);
    }
    const l10 = sumLedger(v, 10);
    const lTot = sumLedger(v, 0);
    expect(lTot.years).toBeGreaterThanOrEqual(l10.years);
    const v10 = sumVital(v, 10);
    const vTot = sumVital(v, 0);
    expect(vTot?.births ?? 0).toBeGreaterThanOrEqual(v10?.births ?? 0);
  });

  it('a tabela de comparação ordena pela coluna escolhida', () => {
    const html = compareHtml(eco, 'population', true);
    const pops = html.split('<tr data-village').slice(1).map((row) => Number(row.split('<td>')[2].split('<')[0]));
    expect(pops.length).toBeGreaterThan(2);
    for (let k = 1; k < pops.length; k++) expect(pops[k]).toBeLessThanOrEqual(pops[k - 1]);
  });

  it('a História acha as linhas do lugar pelo id; pelo nome só nas linhas antigas, sem ids', () => {
    const o = eco.villages.find((q) => q !== v && !q.abandoned)!;
    const w = eco.map.width;
    const far = { year: 1, kind: 'povo' as const, x: -1, y: -1, major: false, key: '', count: 1, places: [] };
    // Linha nova: vale o id, mesmo que o nome apareça no texto.
    expect(aboutVillage({ ...far, text: `Algo em ${o.name}`, villages: [v.id] }, v, w, 5)).toBe(true);
    expect(aboutVillage({ ...far, text: `Algo em ${v.name}`, villages: [o.id] }, v, w, 5)).toBe(false);
    // Linha de save antigo (sem `villages`): pelo nome no texto.
    expect(aboutVillage({ ...far, text: `Algo em ${v.name}` }, v, w, 5)).toBe(true);
    expect(aboutVillage({ ...far, text: 'Algo longe' }, v, w, 5)).toBe(false);
    // Em qualquer caso, o que aconteceu dentro da área.
    expect(aboutVillage({ ...far, text: 'Um raio', x: v.x + 1, y: v.y, villages: [] }, v, w, 5)).toBe(true);
    // As linhas do mundo rodado têm ids, e a aba mostra as do lugar.
    const mine = eco.chronicle.filter((e) => e.villages?.includes(v.id));
    expect(mine.length).toBeGreaterThan(0);
    expect(settlementTabHtml(eco, v, 'history', (e) => e.text)).toContain(mine[0].text.slice(0, 10));
  });

  it('a situação econômica tem rótulo e tom', () => {
    expect(['Próspero', 'Estável', 'Em crise', 'Falido']).toContain(economicState(v).label);
  });
});
