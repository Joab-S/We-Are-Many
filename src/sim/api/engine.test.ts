import { describe, expect, it } from 'vitest';
import { generateSurface } from '../../procgen/surface';
import { earthParams } from '../calibrate';
import { Ecosystem, isLand } from '../ecosystem';
import { worldFingerprint } from '../fingerprint';
import { nativeSpecies } from '../species';
import { viewCommand } from './commands';
import { createEngine, ecosystemOf, type Engine } from './engine';
import source from './engine.ts?raw';

const params = earthParams(0.2);

function engine(seed = 7): Engine {
  return createEngine(generateSurface(params), { seed, species: nativeSpecies(params) });
}

const run = (e: Engine, seconds: number) => {
  for (let t = 0; t < seconds; t += 0.25) e.step(0.25);
};

describe('fachada do motor (src/sim/api/engine.ts)', () => {
  it('cria o mundo com as espécies e povoa; a vista é só leitura do mesmo mundo', () => {
    const e = engine();
    const eco = ecosystemOf(e);
    expect(eco).toBeInstanceOf(Ecosystem);
    expect(e.view.villages.length).toBeGreaterThan(0);
    expect(e.view.count).toBe(eco.count);
    expect(e.view.species.length).toBe(nativeSpecies(params).length);
    // O nascimento do mundo não vira evento: a história começa agora.
    expect(e.drainEvents()).toEqual([]);
    run(e, 6);
    expect(e.view.year).toBeCloseTo(1);
    expect(e.view.x).toBe(eco.x);
  });

  it('é o mesmo mundo que montar o Ecosystem à mão (adotar não muda nada)', () => {
    const a = engine(9);
    const map = generateSurface(params);
    const eco = new Ecosystem(map, 9);
    for (const sp of nativeSpecies(params)) eco.addSpecies(sp);
    eco.populate();
    const b = createEngine(map, { seed: 9, eco });
    expect(ecosystemOf(b)).toBe(eco);
    run(a, 30);
    run(b, 30);
    expect(worldFingerprint(ecosystemOf(b))).toBe(worldFingerprint(ecosystemOf(a)));
  }, 30000);

  it('comandos entram por `apply`: o tile mudado vai ao gancho e o aviso sai no resultado', () => {
    const e = engine();
    const eco = ecosystemOf(e);
    const changed = new Set<number>();
    e.setHooks({ tileChanged: (i) => changed.add(i) });
    const map = e.view.map;
    let land = -1;
    for (let i = map.width * Math.floor(map.height / 2); i < map.width * map.height && land < 0; i++) if (isLand(map, i) && !eco.road[i] && !eco.built[i]) land = i;
    const x = (land % map.width) + 0.5;
    const y = Math.floor(land / map.width) + 0.5;
    expect(e.apply({ kind: 'terraform', tool: 'raise', x, y, r: 2, power: 1, target: 288, limit: true }).ok).toBe(true);
    expect(changed.has(land)).toBe(true);
    // Influência fora de um assentamento: o aviso vem no resultado e não fica no mundo.
    const res = e.apply({ kind: 'politics', action: 'soothe', a: 999, b: 999 });
    expect(res.ok).toBe(false);
    expect(res.hint).toContain('Amenizar');
    expect(eco.hint).toBe('');
    expect(e.apply({ kind: 'feed', x, y, r: 3 }).hint).toBeUndefined();
    // A vista também é comando.
    e.apply(viewCommand(x, y, 30, -1));
    expect(eco.focus).toEqual(viewCommand(x, y, 30, -1).focus);
  });

  it('os eventos saem por `drainEvents` (e a fila fica vazia)', () => {
    const e = engine();
    const eco = ecosystemOf(e);
    const s = eco.species.findIndex((sp) => sp.kind === 'sapient');
    const v = e.view.villages[0];
    eco.foundVillage(s, Math.floor(v.x) + 25, Math.floor(v.y), 2, eco.villages[v.id], 'colônia');
    const got = e.drainEvents();
    expect(got.map((ev) => ev.kind)).toContain('found');
    expect(e.drainEvents()).toEqual([]);
  });

  it('snapshot é independente do mundo vivo e restore continua idêntico', () => {
    const a = engine(3);
    run(a, 12);
    const snap = a.snapshot();
    const year = (snap.eco.fields as { year: number }).year;
    run(a, 24);
    // O mundo andou, o retrato não.
    expect((snap.eco.fields as { year: number }).year).toBe(year);
    const b = engine(3);
    b.restore(snap);
    expect(b.view.year).toBe(year);
    // O mesmo retrato restaura de novo (não foi consumido).
    const c = engine(3);
    c.restore(snap);
    run(b, 24);
    run(c, 24);
    expect(worldFingerprint(ecosystemOf(b))).toBe(worldFingerprint(ecosystemOf(a)));
    expect(worldFingerprint(ecosystemOf(c))).toBe(worldFingerprint(ecosystemOf(a)));
    // O retrato é dado puro (vai por postMessage): sobrevive ao clone estrutural.
    expect(structuredClone(snap).eco.seed).toBe(3);
  }, 60000);

  it('restore religa os ganchos no mundo novo', () => {
    const a = engine(4);
    const snap = a.snapshot();
    const b = engine(4);
    let n = 0;
    b.setHooks({ tileChanged: () => n++ });
    b.restore(snap);
    const map = b.view.map;
    let land = -1;
    for (let i = map.width * Math.floor(map.height / 2); i < map.width * map.height && land < 0; i++) if (isLand(map, i)) land = i;
    b.apply({ kind: 'terraform', tool: 'lower', x: (land % map.width) + 0.5, y: Math.floor(land / map.width) + 0.5, r: 1, power: 1, target: 288, limit: true });
    expect(n).toBeGreaterThan(0);
  });

  it('não importa nada do cliente nem do three.js', () => {
    const imports = [...source.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    expect(imports.length).toBeGreaterThan(0);
    for (const p of imports) {
      expect(p).not.toMatch(/client/);
      expect(p).not.toMatch(/^three/);
    }
  });
});
