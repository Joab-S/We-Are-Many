import { describe, expect, it } from 'vitest';
import { generateSurface } from '../../procgen/surface';
import { createEngine } from '../../sim/api/engine';
import { earthParams } from '../../sim/calibrate';
import { isLand } from '../../sim/ecosystem';
import { nativeSpecies } from '../../sim/species';
import { SITE_RAMP, SITE_TOP, siteCard, siteColor, siteLegend, SiteView } from './siteView';

describe('camada de depuração do campo de sítios', () => {
  it('a rampa escurece com a nota e fica nos extremos fora da faixa', () => {
    const lum = ([r, g, b]: number[]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
    let last = Infinity;
    for (let s = 0; s <= SITE_TOP; s += 0.25) {
      const l = lum(siteColor(s));
      expect(l).toBeLessThanOrEqual(last);
      last = l;
    }
    expect(siteColor(-3)).toEqual([...SITE_RAMP[0]]);
    expect(siteColor(SITE_TOP * 2)).toEqual([...SITE_RAMP[SITE_RAMP.length - 1]]);
    expect(siteLegend()).toContain('Notas dos sítios (N)');
  });

  it('a ficha mostra cada fator, a nota final e o veto; desligada, nada', () => {
    const params = earthParams(0.2);
    const engine = createEngine(generateSurface(params), { seed: 7, species: nativeSpecies(params) });
    for (let k = 0; k < 8; k++) engine.step(0.25);
    const view = engine.view;
    const settings = { showSites: false };
    const layer = new SiteView(() => view, settings);
    const v = view.villages[0];
    expect(layer.info(v.x, v.y)).toBe('');
    settings.showSites = true;
    // Em cima da praça: perto demais de outro assentamento (o próprio).
    const here = layer.info(v.x, v.y);
    for (const name of ['Água doce', 'Fértil', 'Mata', 'Pedra', 'Plano', 'Costa', 'Defesa', 'Sobreposição', 'Densidade', 'Distância da capital', 'Clima', 'Minério']) expect(here).toContain(name);
    expect(here).toContain('Não dá para fundar: é perto demais de outro assentamento');
    expect(here).toContain(`Visto de ${v.name}`);
    // Um ponto que passa no exame não tem veto.
    const map = view.map;
    let ok: string | null = null;
    for (let d = 16; d < 60 && !ok; d++) {
      for (const [ox, oy] of [
        [d, 0],
        [-d, 0],
        [0, d],
        [0, -d],
      ]) {
        const x = (Math.floor(v.x) + ox + map.width) % map.width;
        const y = Math.floor(v.y) + oy;
        if (y < 2 || y >= map.height - 2 || !isLand(map, y * map.width + x)) continue;
        const r = view.siteAt(x, y, v.id);
        if (r && !r.problem) {
          ok = siteCard(r, view);
          break;
        }
      }
    }
    expect(ok).not.toBeNull();
    expect(ok).toMatch(/Dá para fundar aqui|abaixo da mínima/);
    expect(ok).not.toContain('Não dá para fundar');
  }, 30000);
});
