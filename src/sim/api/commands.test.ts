import { describe, expect, it } from 'vitest';
import { classify, generateSurface, type PlanetParams } from '../../procgen/surface';
import { Ecosystem, isLand } from '../ecosystem';
import { nativeSpecies } from '../species';
import { applyCommand, sameView, TERRAFORM_TOOLS, TileJournal, VIEW_CELL, viewCell, viewCommand, type EngineCommand } from './commands';
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
      viewCommand(100.3, 40.7, 33, 2),
      { kind: 'view', focus: null, pinned: -1 },
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

  it('a vista é um comando: põe o foco e o lugar fixado no motor, arredondados na célula', () => {
    const { map, eco } = world();
    expect(eco.focus).toBeNull();
    const cmd = viewCommand(100.3, 40.7, 33, 2);
    expect(cmd).toEqual({ kind: 'view', focus: { x: 12.5 * VIEW_CELL, y: 5.5 * VIEW_CELL, r: 5 * VIEW_CELL }, pinned: 2 });
    expect(applyCommand(eco, map, cmd).ok).toBe(true);
    expect(eco.focus).toEqual(cmd.focus);
    // O motor guarda uma cópia: o comando no log não vira estado do mundo.
    expect(eco.focus).not.toBe(cmd.focus);
    expect(eco.pinned).toBe(2);
    applyCommand(eco, map, { kind: 'view', focus: null, pinned: -1 });
    expect(eco.focus).toBeNull();
    expect(eco.pinned).toBe(-1);
  });

  it('a vista só muda quando troca de célula, de raio ou de lugar fixado (o log não cresce a cada quadro)', () => {
    const a = viewCommand(100.3, 40.7, 33, -1);
    expect(sameView(a, viewCommand(101.9, 41.2, 34.5, -1))).toBe(true);
    expect(sameView(a, viewCommand(104.1, 40.7, 33, -1))).toBe(false);
    expect(sameView(a, viewCommand(100.3, 40.7, 41, -1))).toBe(false);
    expect(sameView(a, viewCommand(100.3, 40.7, 33, 5))).toBe(false);
    expect(sameView(a, null)).toBe(false);
    expect(sameView(null, null)).toBe(true);
    // A célula arredonda o centro, mas a tela continua coberta: o raio cobre o centro de verdade mais a meia largura.
    for (const [x, y, r] of [
      [3.9, 7.1, 25],
      [250.2, 0.4, 61],
      [700.6, 300.2, 440],
    ]) {
      const c = viewCell(r);
      const f = viewCommand(x, y, r, -1).focus!;
      expect(Math.abs(f.x - x)).toBeLessThanOrEqual(c / 2);
      expect(Math.abs(f.y - y)).toBeLessThanOrEqual(c / 2);
      expect(f.r).toBeGreaterThanOrEqual(r + Math.max(Math.abs(f.x - x), Math.abs(f.y - y)));
    }
    // De perto a célula é a mínima; de longe ela cresce, e arrastar meio mapa de célula não muda a vista.
    expect(viewCell(30)).toBe(VIEW_CELL);
    expect(viewCell(440)).toBe(64);
    expect(sameView(viewCommand(130, 200, 440, -1), viewCommand(150, 210, 440, -1))).toBe(true);
  });

  it('a mesma semente e o mesmo log, vistas incluídas, dão o mesmo mundo', () => {
    const a = world();
    const b = world();
    const v = a.eco.villages.find((q) => !q.abandoned)!;
    const log: EngineCommand[] = [viewCommand(v.x, v.y, 30, -1), { kind: 'feed', x: v.x, y: v.y, r: 10 }, viewCommand(v.x + 40, v.y, 30, v.id), { kind: 'view', focus: null, pinned: -1 }];
    for (const w of [a, b]) {
      for (const c of log) {
        applyCommand(w.eco, w.map, c);
        for (let t = 0; t < 8; t++) w.eco.step(0.25);
      }
    }
    expect(b.eco.count).toBe(a.eco.count);
    expect(Array.from(b.eco.x.subarray(0, b.eco.count))).toEqual(Array.from(a.eco.x.subarray(0, a.eco.count)));
    expect([...b.eco.watched]).toEqual([...a.eco.watched]);
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
