import { describe, expect, it } from 'vitest';
import { generateSurface, type PlanetParams } from '../../../procgen/surface';
import { createEngine } from '../../../sim/api/engine';
import { eventVillages, isOfRealm, LEGENDS_LIMIT, type LegendEntry } from '../../../sim/api/events';
import { Ecosystem, YEAR_SECONDS } from '../../../sim/ecosystem';
import { restoreEcosystem, snapshotEcosystem } from '../../../save/snapshot';
import { nativeSpecies } from '../../../sim/species';
import { worldFingerprint } from '../../../sim/fingerprint';
import { legendsHtml, legendsJson, legendsOf, legendText, type LegendsSource } from './legends';

const PLANET: PlanetParams = { id: 'sol-3', name: 'Terra', radiusEarth: 0.15, temperatureK: 288, water: 0.6, life: 0.85 };

/** Um mundo pequeno de 60 anos: já tem fundações, degraus e eras. */
function world() {
  const map = generateSurface(PLANET);
  const engine = createEngine(map, { seed: 5, species: nativeSpecies(PLANET), yearSpan: YEAR_SECONDS });
  for (let i = 0; i < (60 * YEAR_SECONDS) / 0.25; i++) engine.step(0.25);
  return { map, engine };
}

const CITY = { id: 3, name: 'Roça', x: 10, y: 20, kingdom: 3 };
const SOURCE: LegendsSource = {
  year: 40,
  legendsLost: 0,
  species: [{ name: 'Humanos' }],
  villages: [
    { ...CITY, id: 0, name: 'Pedra', kingdom: 0 },
    { ...CITY, id: 1, name: 'Vau', kingdom: 0 },
    { ...CITY, id: 2, name: 'Lago', kingdom: 2 },
    CITY,
  ],
  legends: [
    { kind: 'found', year: 0, village: 0, from: -1, how: 'bando', x: 1, y: 1, realm: 0 },
    { kind: 'found', year: 2, village: 1, from: 0, how: 'colônia', x: 1, y: 1, realm: 0 },
    { kind: 'found', year: 3, village: 2, from: -1, how: 'bando', x: 1, y: 1, realm: 2 },
    { kind: 'polity', year: 9, village: 0, polity: 'reino', was: 'chefia', places: 2, realm: 0 },
    { kind: 'warStart', year: 12, a: 2, b: 0, target: 1, motive: 'land', naval: false, realm: 2 },
    { kind: 'conquest', year: 15, winner: 2, loser: 0, village: 1, razed: false, realm: 2 },
    { kind: 'tierUp', year: 20, village: 1, tier: 1, realm: 2 },
    { kind: 'found', year: 30, village: 3, from: -1, how: 'bando', x: 1, y: 1, realm: 3 },
    { kind: 'extinction', year: 35, species: 0, realm: -1 },
  ],
};

describe('lendas no motor', () => {
  it('guardam a história do ano 0 até agora, sem o miúdo e sem mudar o mundo', () => {
    const { engine } = world();
    const legends = engine.view.legends;
    expect(legends.length).toBeGreaterThan(0);
    expect(legends.some((e) => e.kind === 'found')).toBe(true);
    for (const e of legends) expect(['farmstead', 'migrate', 'colony']).not.toContain(e.kind);
    // Do mais antigo para o mais novo: a primeira fundação vem no começo do mundo.
    const years = legends.map((e) => e.year);
    expect(years).toEqual([...years].sort((a, b) => a - b));
    expect(years[0]).toBeLessThan(5);
  });

  it('a impressão digital não enxerga as lendas: registrar é só ler', () => {
    const eco = world().engine;
    const before = eco.debug.fingerprint();
    (eco.view.legends as LegendEntry[]).length = 0;
    expect(eco.debug.fingerprint()).toBe(before);
  });

  it('o limite tira as mais antigas e conta quantas saíram', () => {
    const eco = new Ecosystem(generateSurface(PLANET), 5);
    for (let i = 0; i < LEGENDS_LIMIT + 10; i++) eco.emit({ kind: 'extinction', year: i, species: 0 });
    expect(eco.legends.length).toBeLessThanOrEqual(LEGENDS_LIMIT);
    expect(eco.legendsLost + eco.legends.length).toBe(LEGENDS_LIMIT + 10);
    expect(eco.legends[eco.legends.length - 1].year).toBe(LEGENDS_LIMIT + 9);
  });

  it('a técnica entra só quando é a primeira do mundo', () => {
    const eco = new Ecosystem(generateSurface(PLANET), 5);
    eco.emit({ kind: 'tech', year: 1, village: -1, tech: 'fogo', first: false, lost: false });
    eco.emit({ kind: 'tech', year: 1, village: -1, tech: 'fogo', first: true, lost: true });
    expect(eco.legends).toEqual([]);
    eco.emit({ kind: 'tech', year: 1, village: -1, tech: 'fogo', first: true, lost: false });
    expect(eco.legends.length).toBe(1);
  });

  it('o desastre entra quando pegou um lugar ou mudou o mapa', () => {
    const eco = new Ecosystem(generateSurface(PLANET), 5);
    eco.emit({ kind: 'disaster', year: 1, what: 'wildfire', x: 1, y: 1, village: -1 });
    eco.emit({ kind: 'disaster', year: 1, what: 'drought', x: 1, y: 1, village: -1 });
    expect(eco.legends).toEqual([]);
    eco.emit({ kind: 'disaster', year: 1, what: 'comet', x: 1, y: 1, village: -1 });
    expect(eco.legends.length).toBe(1);
  });

  it('vão no save e voltam; um save de antes delas abre vazio', () => {
    const { map, engine } = world();
    const snap = engine.snapshot();
    const back = restoreEcosystem(structuredClone(snap.eco), snap.map);
    expect(back.legends).toEqual(engine.view.legends);
    const old = structuredClone(snap.eco);
    delete old.fields.legends;
    delete old.fields.legendsLost;
    expect(restoreEcosystem(old, snap.map).legends).toEqual([]);
    expect(snapshotEcosystem(back, 5).fields.legends).toEqual(engine.view.legends);
    expect(worldFingerprint(back)).toBe(engine.debug.fingerprint());
    expect(map).toBeTruthy();
  });

  it('todos os tipos têm texto, com os nomes do mundo', () => {
    const { engine } = world();
    for (const e of engine.view.legends) {
      const text = legendText(e, engine.view);
      expect(text).not.toContain('undefined');
      expect(text).not.toMatch(/^\?/);
    }
  });
});

describe('janela Lendas', () => {
  it('a história de um reino vai do ano 0 ao atual, com o que ele sofreu de fora', () => {
    const list = legendsOf(SOURCE.legends, 'realm:0');
    expect(list.map((e) => e.year)).toEqual([0, 2, 9, 12, 15]);
    // A guerra e a conquista são do reino de Lago, mas Pedra estava do outro lado.
    expect(list.filter((e) => e.realm !== 0).map((e) => e.kind)).toEqual(['warStart', 'conquest']);
    expect(isOfRealm(SOURCE.legends[7], 0)).toBe(false);
  });

  it('a história de um lugar acompanha ele de reino em reino', () => {
    const list = legendsOf(SOURCE.legends, 'place:1');
    expect(list.map((e) => e.kind)).toEqual(['found', 'warStart', 'conquest', 'tierUp']);
    for (const e of list) expect(eventVillages(e)).toContain(1);
  });

  it('mostra as linhas em ordem, a linha do tempo e os reinos para escolher', () => {
    const html = legendsHtml(SOURCE, 'realm:0');
    expect(html.indexOf('Pedra foi fundado')).toBeLessThan(html.indexOf('Vau foi fundado'));
    expect(html.indexOf('Vau foi fundado')).toBeLessThan(html.indexOf('Lago tomou Vau de Pedra'));
    expect(html).toContain('data-filter="realm:2"');
    expect(html).toContain('data-filter="place:1"');
    expect(html).toContain('ano 40');
    expect(html).toContain('5 lendas');
    // Vau passou a Lago e nunca foi reino; Roça é o reino que continua.
    expect(legendsHtml(SOURCE, '')).not.toContain('Roça †');
  });

  it('não some nada quando a lista passa do limite de linhas: diz onde está o resto', () => {
    const legends = Array.from({ length: 350 }, (_, i): LegendEntry => ({ kind: 'found', year: i, village: 0, from: -1, how: 'bando', x: 1, y: 1, realm: 0 }));
    const html = legendsHtml({ ...SOURCE, legends }, '');
    expect(html).toContain('350 lendas');
    expect(html).toContain('mais recentes');
    expect(JSON.parse(legendsJson({ ...SOURCE, legends }, '', PLANET)).legends.length).toBe(350);
  });

  it('a exportação leva o dado cru, o texto e o filtro', () => {
    const out = JSON.parse(legendsJson(SOURCE, 'realm:2', PLANET));
    expect(out).toMatchObject({ planet: 'sol-3', year: 40, filter: 'realm:2', lost: 0 });
    expect(out.legends[0]).toMatchObject({ kind: 'found', village: 2, text: 'Lago foi fundado (bando)' });
    expect(out.legends.at(-1)).toMatchObject({ kind: 'tierUp', village: 1, tier: 1, text: 'Vau virou vila' });
  });
});
