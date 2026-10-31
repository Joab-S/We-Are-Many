import { describe, expect, it } from 'vitest';
import { adaptiveMaxSpeed, directionalDistance } from '../core/flight';
import { stepSpeedFactor, THROTTLE } from '../core/shipControl';
import { AU_PER_PC } from '../core/units';
import { compressOrbit } from './planets';
import { etaSeconds, radarRadius, rankSuggestions, starInterest, type Candidate, type NavTarget } from './guide';
import { CELL_PC, findPoi, poisInCell, poisNear, TUTORIAL_POI } from './poi';
import { cometOffset, describeSystem, generateSystem, habitableZone, starVisualRadius, summarize, systemViewRadius } from './systemGen';

const star = (id: number, absmag = 5, ci = 0.65, name = `HYG ${id}`) => ({ id, name, absmag, ci });

describe('sistemas planetários', () => {
  it('são determinísticos pelo id da estrela', () => {
    const a = generateSystem(star(1234));
    const b = generateSystem({ ...star(1234) });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
  it('o Sol tem os planetas reais e cometas', () => {
    const sol = generateSystem(star(0, 4.85, 0.656, 'Sol'));
    expect(sol.planets.map((p) => p.name)).toContain('Terra');
    expect(sol.comets.length).toBeGreaterThan(0);
  });
  it('estrelas vizinhas conhecidas usam os exoplanetas reais', () => {
    const proxima = generateSystem(star(70666, 15.5, 1.8, 'Proxima Centauri'));
    expect(proxima.catalogued).toBe(true);
    expect(proxima.planets.map((p) => p.name)).toContain('Proxima b');
  });
  it('a maioria das estrelas tem planetas, nunca dentro do desenho da estrela', () => {
    let withPlanets = 0;
    for (let id = 1; id <= 400; id++) {
      const info = star(id, -2 + (id % 14), (id % 20) / 10 - 0.2);
      const sys = generateSystem(info);
      if (sys.planets.length) withPlanets++;
      for (const p of sys.planets) expect(compressOrbit(p.aAu)).toBeGreaterThan(starVisualRadius(info) * 3);
      expect(systemViewRadius(sys, info)).toBeGreaterThan(0);
    }
    expect(withPlanets).toBeGreaterThan(250);
  });
  it('a zona habitável cresce com a luminosidade', () => {
    const [i1, o1] = habitableZone(1);
    expect(i1).toBeGreaterThan(0.9);
    expect(o1).toBeLessThan(1.5);
    expect(habitableZone(100)[0]).toBeCloseTo(i1 * 10, 5);
  });
  it('resume e descreve o sistema', () => {
    const sol = summarize(generateSystem(star(0, 4.85, 0.656, 'Sol')));
    expect(sol.rocky).toBe(4);
    expect(sol.habitable).toBe(1);
    expect(describeSystem(sol)).toContain('8 planeta(s)');
  });
  it('cometas andam na elipse e ficam mais longe no afélio', () => {
    const c = generateSystem(star(0, 4.85, 0.656, 'Sol')).comets[1];
    const p = { x: 0, y: 0, z: 0 };
    const period = c.periodYears * 1200;
    const atPerihelion = (-c.phase / (Math.PI * 2)) * period;
    expect(cometOffset(c, atPerihelion, p)).toBeCloseTo(c.aAu * (1 - c.eccentricity), 6);
    expect(cometOffset(c, atPerihelion + period / 2, p)).toBeCloseTo(c.aAu * (1 + c.eccentricity), 6);
  });
});

describe('pontos de interesse', () => {
  it('cada célula gera sempre os mesmos pontos e eles são encontrados pelo id', () => {
    const a = poisInCell(3, -2, 5);
    expect(poisInCell(3, -2, 5)).toBe(a);
    for (const p of a) expect(findPoi(p.id)?.name).toBe(p.name);
  });
  it('há coisas para encontrar em qualquer região', () => {
    let total = 0;
    for (let x = 0; x < 10; x++) total += poisInCell(x, 7, -3).length;
    expect(total).toBeGreaterThan(3);
  });
  it('a busca por raio ordena pela distância e inclui o sinal tutorial perto do Sol', () => {
    const near = poisNear({ x: 0, y: 0, z: 0 }, 0.2 * AU_PER_PC);
    expect(near[0].id).toBe(TUTORIAL_POI.id);
    const wide = poisNear({ x: 10 * AU_PER_PC, y: 0, z: 0 }, 2 * CELL_PC * AU_PER_PC);
    for (let i = 1; i < wide.length; i++) expect(wide[i].dist).toBeGreaterThanOrEqual(wide[i - 1].dist);
  });
});

describe('GUIA', () => {
  const t = (id: string): NavTarget => ({ kind: 'poi', id, name: id, pos: [0, 0, 0], arrive: 1, info: '' });
  it('a chegada cresce com o logaritmo da distância', () => {
    const near = etaSeconds(1000, 1);
    const far = etaSeconds(1e6, 1);
    expect(far).toBeGreaterThan(near);
    expect(far / near).toBeLessThan(3);
    expect(etaSeconds(0.5, 1)).toBe(0);
  });
  it('vizinha a 1,3 pc chega em menos de 2 minutos com piloto automático (seção 3.5)', () => {
    expect(etaSeconds(1.3 * AU_PER_PC, 2.6)).toBeLessThan(120);
  });
  it('sugestões preferem o interessante e perto', () => {
    const cands: Candidate[] = [
      { target: t('longe'), distAu: 5e5, arriveAu: 1, interest: 4, reason: '' },
      { target: t('perto'), distAu: 10, arriveAu: 1, interest: 4, reason: '' },
      { target: t('chato'), distAu: 10, arriveAu: 1, interest: 0.2, reason: '' },
      { target: t('aqui'), distAu: 1, arriveAu: 1, interest: 6, reason: '' },
    ];
    const r = rankSuggestions(cands);
    expect(r[0].target.id).toBe('perto');
    expect(r.map((s) => s.target.id)).not.toContain('aqui');
    expect(r[r.length - 1].target.id).toBe('chato');
  });
  it('sistemas com vida valem mais que os desconhecidos', () => {
    const life = starInterest(false, true, { planets: 3, rocky: 2, habitable: 1, life: 'animals', comets: 0 });
    const unknown = starInterest(false, false, null);
    const visited = starInterest(true, true, null);
    expect(life.interest).toBeGreaterThan(unknown.interest);
    expect(unknown.interest).toBeGreaterThan(visited.interest);
  });
  it('o radar é logarítmico e limitado ao disco', () => {
    expect(radarRadius(0)).toBe(0);
    expect(radarRadius(1e12)).toBe(1);
    expect(radarRadius(1000) - radarRadius(100)).toBeCloseTo(radarRadius(100) - radarRadius(10), 6);
  });
});

describe('velocidade direcional e cruzeiro', () => {
  it('o que ficou para trás limita menos a velocidade', () => {
    expect(directionalDistance(10, 1)).toBe(10);
    expect(directionalDistance(10, -1)).toBe(40);
    expect(adaptiveMaxSpeed(directionalDistance(1, -1))).toBeGreaterThan(adaptiveMaxSpeed(1));
  });
  it('no cruzeiro a nave mantém a velocidade sem W', () => {
    let s = 0.8;
    for (let i = 0; i < 120; i++) s = stepSpeedFactor(s, 0, 1 / 60, THROTTLE, true);
    expect(s).toBe(0.8);
    s = stepSpeedFactor(s, -1, 0.1, THROTTLE, true);
    expect(s).toBeLessThan(0.8);
  });
});

describe('cometas visitantes', () => {
  it('aparecem em parte das janelas e passam perto da estrela no meio delas', async () => {
    const { visitorComet, VISITOR_WINDOW_S } = await import('./systemGen');
    const sys = generateSystem(star(0, 4.85, 0.656, 'Sol'));
    let seen = 0;
    for (let w = 0; w < 50; w++) {
      const c = visitorComet(sys, w);
      if (!c) continue;
      seen++;
      expect(visitorComet(sys, w)!.name).toBe(c.name);
      const r = cometOffset(c, (w + 0.5) * VISITOR_WINDOW_S, { x: 0, y: 0, z: 0 });
      expect(r).toBeCloseTo(c.aAu * (1 - c.eccentricity), 3);
    }
    expect(seen).toBeGreaterThan(15);
    expect(seen).toBeLessThan(45);
  });
});
