import { describe, expect, it } from 'vitest';
import { runWorld } from '../../sim/calibrate';
import { Ecosystem } from '../../sim/ecosystem';
import { compareHtml, economicState, SETTLEMENT_TABS, settlementTabHtml } from './settlementWindow';

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

  it('a tabela de comparação ordena pela coluna escolhida', () => {
    const html = compareHtml(eco, 'population', true);
    const pops = html.split('<tr data-village').slice(1).map((row) => Number(row.split('<td>')[2].split('<')[0]));
    expect(pops.length).toBeGreaterThan(2);
    for (let k = 1; k < pops.length; k++) expect(pops[k]).toBeLessThanOrEqual(pops[k - 1]);
  });

  it('a situação econômica tem rótulo e tom', () => {
    expect(['Próspero', 'Estável', 'Em crise', 'Falido']).toContain(economicState(v).label);
  });
});
