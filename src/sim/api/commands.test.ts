import { describe, expect, it } from 'vitest';
import { classify, generateSurface, type PlanetParams } from '../../procgen/surface';
import { Ecosystem, isLand } from '../ecosystem';
import { nativeSpecies } from '../species';
import { applyCommand, TERRAFORM_TOOLS, TileJournal, type EngineCommand } from './commands';
import source from './commands.ts?raw';

const earth: PlanetParams = { id: 'sol-3', name: 'Terra', radiusEarth: 0.4, temperatureK: 288, water: 0.6, life: 0.85 };

function world() {
  const map = generateSurface(earth);
  const eco = new Ecosystem(map, 42);
  for (const sp of nativeSpecies(earth)) eco.addSpecies(sp);
  eco.populate();
  return { map, eco };
}

/** Um ponto de terra longe dos assentamentos, para o pincel não derrubar nada. */
function landSpot(eco: Ecosystem): { x: number; y: number } {
  const map = eco.map;
  for (let y = Math.floor(map.height * 0.3); y < map.height * 0.7; y++) {
    for (let x = 0; x < map.width; x++) {
      const i = y * map.width + x;
      if (!isLand(map, i) || map.elevation[i] > 0.4) continue;
      if (eco.villages.some((v) => Math.hypot(v.x - x, v.y - y) < 30)) continue;
      return { x: x + 0.5, y: y + 0.5 };
    }
  }
  throw new Error('sem terra');
}

const fields = (map: ReturnType<typeof generateSurface>) => ({
  elevation: Float32Array.from(map.elevation),
  moisture: Float32Array.from(map.moisture),
  heat: Float32Array.from(map.heat),
  vegetation: Float32Array.from(map.vegetation),
  biome: Uint8Array.from(map.biome),
});

describe('comandos do jogador (src/sim/api/commands.ts)', () => {
  it('o pincel muda só o círculo, reclassifica o bioma no motor e avisa cada tile mudado', () => {
    const { map, eco } = world();
    const at = landSpot(eco);
    const before = fields(map);
    const changed = new Set<number>();
    eco.onTileChanged = (i) => changed.add(i);
    applyCommand(eco, map, { kind: 'terraform', tool: 'raise', x: at.x, y: at.y, r: 4, power: 3, target: 288, limit: true });
    const center = Math.floor(at.y) * map.width + Math.floor(at.x);
    expect(map.elevation[center]).toBeGreaterThan(before.elevation[center]);
    // Um tile fora do raio não muda.
    const far = Math.floor(at.y) * map.width + Math.floor(at.x) + 8;
    expect(map.elevation[far]).toBe(before.elevation[far]);
    expect(changed.has(center)).toBe(true);
    expect(changed.size).toBe(49); // disco de raio 4 (sqrt(dx²+dy²) <= 4)
    for (const i of changed) expect(map.biome[i]).toBe(classify(map, i));
  });

  it('todos os pincéis de terreno e clima rodam sem erro', () => {
    const { map, eco } = world();
    const at = landSpot(eco);
    for (const tool of TERRAFORM_TOOLS) {
      expect(applyCommand(eco, map, { kind: 'terraform', tool, x: at.x, y: at.y, r: 3, power: 1, target: 300, limit: tool !== 'heat' }).ok).toBe(true);
    }
  });

  it('desfaz um traço inteiro com restoreTiles (retrato dos tiles tocados)', () => {
    const { map, eco } = world();
    const at = landSpot(eco);
    const before = fields(map);
    const journal = new TileJournal();
    // Um traço: vários toques arrastando o pincel, misturando terreno e clima.
    for (let k = 0; k < 10; k++) applyCommand(eco, map, { kind: 'terraform', tool: 'mountain', x: at.x + k, y: at.y, r: 5, power: 2, target: 288, limit: true }, { journal });
    applyCommand(eco, map, { kind: 'terraform', tool: 'forest', x: at.x, y: at.y, r: 5, power: 2, target: 288, limit: true }, { journal });
    applyCommand(eco, map, { kind: 'terraform', tool: 'cool', x: at.x, y: at.y, r: 5, power: 2, target: 200, limit: false }, { journal });
    expect(journal.size).toBeGreaterThan(80);
    const undo = journal.toCommand();
    // O retrato vai e volta em JSON (comando serializável).
    applyCommand(eco, map, JSON.parse(JSON.stringify(undo)) as EngineCommand);
    const after = fields(map);
    expect(after.elevation).toEqual(before.elevation);
    expect(after.moisture).toEqual(before.moisture);
    expect(after.heat).toEqual(before.heat);
    expect(after.vegetation).toEqual(before.vegetation);
    expect(after.biome).toEqual(before.biome);
  });

  it('todo comando é dado puro: sobrevive a JSON.stringify/parse', () => {
    const { eco } = world();
    const cmds: EngineCommand[] = [
      { kind: 'terraform', tool: 'heat', x: 1.5, y: 2.5, r: 6, power: 0.5, target: 300, limit: true },
      { kind: 'clear', x: 1, y: 2, r: 3 },
      { kind: 'demolish', x: 1, y: 2, r: 3 },
      { kind: 'ore', x: 1, y: 2, ore: 'iron' },
      { kind: 'introduce', species: eco.species[0], x: 1, y: 2 },
      { kind: 'feed', x: 1, y: 2, r: 3 },
      { kind: 'cull', x: 1, y: 2, r: 3 },
      { kind: 'teach', x: 1, y: 2, r: 3, amount: 0.1 },
      { kind: 'harvest', x: 1, y: 2, r: 3 },
      { kind: 'lava', x: 1, y: 2, r: 1, heat: 500 },
      { kind: 'politics', action: 'provoke', a: 0, b: 1 },
      { kind: 'event', event: 'comet', x: 1, y: 2 },
      { kind: 'surprise' },
      { kind: 'events', auto: false, rate: 2 },
      new TileJournal().toCommand(),
    ];
    for (const c of cmds) expect(JSON.parse(JSON.stringify(c))).toEqual(c);
  });

  it('a mesma lista de comandos dá o mesmo mundo (base do replay)', () => {
    const a = world();
    const b = world();
    const at = landSpot(a.eco);
    const sp = a.eco.species.find((s) => s.kind === 'herbivore')!;
    const log: EngineCommand[] = [
      { kind: 'terraform', tool: 'lake', x: at.x, y: at.y, r: 6, power: 3, target: 288, limit: true },
      { kind: 'introduce', species: sp, x: at.x + 10, y: at.y },
      { kind: 'feed', x: at.x, y: at.y, r: 20 },
      { kind: 'clear', x: at.x - 5, y: at.y, r: 3 },
    ];
    for (const w of [a, b]) {
      for (const c of log) {
        applyCommand(w.eco, w.map, c);
        for (let t = 0; t < 4; t++) w.eco.step(0.25);
      }
    }
    expect(b.map.elevation).toEqual(a.map.elevation);
    expect(b.map.vegetation).toEqual(a.map.vegetation);
    expect(b.eco.count).toBe(a.eco.count);
    expect(Array.from(b.eco.x.subarray(0, b.eco.count))).toEqual(Array.from(a.eco.x.subarray(0, a.eco.count)));
  });

  it('avisa o jogador quando não dá: minério na rua, influência fora de um assentamento, eventos ligados e desligados', () => {
    const { map, eco } = world();
    expect(applyCommand(eco, map, { kind: 'politics', action: 'soothe', a: 999, b: 999 }).ok).toBe(false);
    expect(eco.hint).toContain('Amenizar');
    applyCommand(eco, map, { kind: 'events', auto: false, rate: 2 });
    expect(eco.autoEvents).toBe(false);
    expect(eco.eventRate).toBe(2);
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
