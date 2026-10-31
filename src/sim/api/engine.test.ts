import { describe, expect, it } from 'vitest';
import { generateSurface } from '../../procgen/surface';
import * as B from '../balance';
import { earthParams } from '../calibrate';
import { Ecosystem, isLand } from '../ecosystem';
import { worldFingerprint } from '../fingerprint';
import { nativeSpecies } from '../species';
import { viewCommand } from './commands';
import { createEngine, ecosystemOf, SITE_NONE, type Engine } from './engine';
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

  it('campo de sítios pela vista: dado puro, com a versão subindo só quando alguma nota muda', () => {
    const e = engine(5);
    const eco = ecosystemOf(e);
    run(e, 2);
    const f = e.view.siteField()!;
    expect(f).not.toBeNull();
    const map = e.view.map;
    expect(f.cols).toBe(Math.ceil(map.width / f.cell));
    expect(f.rows).toBe(Math.ceil(map.height / f.cell));
    expect(f.score.length).toBe(f.cols * f.rows);
    // Uma célula de mar aberto (sem terra) tem a nota de "nenhum".
    const sea = [...Array(f.score.length).keys()].find((k) => eco.sites!.raw[k * 8 + 5] === 0);
    if (sea !== undefined) expect(f.score[sea]).toBe(SITE_NONE);
    expect(f.score).toEqual(eco.sites!.score);
    // Sem passo, nada muda: a mesma versão.
    expect(e.view.siteField()!.version).toBe(f.version);
    const before = f.version;
    let changed = false;
    for (let k = 0; k < 40 && !changed; k++) {
      run(e, 0.25);
      changed = e.view.siteField()!.version !== before;
    }
    expect(changed).toBe(true);
    expect(e.view.siteField()!.score).toEqual(eco.sites!.score);
    // Vai por postMessage.
    const copy = structuredClone(e.view.siteField()!);
    expect(copy.score).toEqual(eco.sites!.score);
    // O retrato restaurado é outro campo: a versão sobe.
    const v = e.view.siteField()!.version;
    e.restore(e.snapshot());
    expect(e.view.siteField()!.version).toBeGreaterThan(v);
  }, 30000);

  it('siteAt: a nota por partes soma a nota única de fundar, com o veto do lugar', () => {
    const e = engine(5);
    const eco = ecosystemOf(e);
    run(e, 2);
    const v = e.view.villages.find((it) => !it.abandoned)!;
    const map = e.view.map;
    let checked = 0;
    for (let d = 6; d <= 40; d += 2) {
      for (const [ox, oy] of [
        [d, 0],
        [-d, 0],
        [0, d],
        [0, -d],
      ]) {
        const x = (Math.floor(v.x) + ox + map.width) % map.width;
        const y = Math.floor(v.y) + oy;
        if (y < 2 || y >= map.height - 2 || !isLand(map, y * map.width + x)) continue;
        const r = e.view.siteAt(x, y, v.id)!;
        expect(r.from).toBe(v.id);
        expect(r.value).toBeCloseTo(eco.siteScore(v.species, x, y, v, r.motive, v.tech), 9);
        const sum = Object.values(r.parts).reduce((a, b) => a + b, 0);
        expect(sum).toBeCloseTo(r.value, 9);
        expect(r.parts.water).toBeCloseTo(B.SITE_W_WATER * r.look.water, 9);
        expect(r.problem).toBe(eco.siteFilter(v.species, x, y, v.tech));
        expect(JSON.parse(JSON.stringify(r))).toEqual(r);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(4);
    // Sem `from`, quem funda é o lugar vivo mais perto.
    expect(e.view.siteAt(Math.floor(v.x) + 3, Math.floor(v.y))!.from).toBeGreaterThanOrEqual(0);
    // Fora do mapa (linha), nada.
    expect(e.view.siteAt(0, -5)).toBeNull();
  }, 30000);

  it('as consultas de sítio não mexem no mundo (nem nos rótulos da água ainda por refazer)', () => {
    const a = engine(6);
    const b = engine(6);
    const eco = ecosystemOf(b);
    const map = b.view.map;
    run(a, 1);
    run(b, 1);
    // Rótulos sujos: a consulta leria a água de novo; depois dela, ficam como estavam.
    const f = eco.sites!;
    const land = [...Array(map.width * map.height).keys()].find((t) => isLand(map, t))!;
    const label = f.water[land];
    const dirty = f.waterDirty;
    f.water[land] = 2;
    f.waterDirty = true;
    const v = b.view.villages[0];
    b.view.siteAt(Math.floor(v.x) + 8, Math.floor(v.y));
    expect(f.waterDirty).toBe(true);
    expect(f.water[land]).toBe(2);
    f.water[land] = label;
    f.waterDirty = dirty;
    // A cada passo, a vista lê o campo e examina sítios; o mundo segue igual ao que ninguém olhou.
    for (let k = 0; k < 40; k++) {
      a.step(0.25);
      b.step(0.25);
      b.view.siteField();
      for (const it of b.view.villages) b.view.siteAt(Math.floor(it.x) + 9, Math.floor(it.y) + 3);
    }
    expect(worldFingerprint(ecosystemOf(b))).toBe(worldFingerprint(ecosystemOf(a)));
  }, 30000);

  it('não importa nada do cliente nem do three.js', () => {
    const imports = [...source.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    expect(imports.length).toBeGreaterThan(0);
    for (const p of imports) {
      expect(p).not.toMatch(/client/);
      expect(p).not.toMatch(/^three/);
    }
  });
});
