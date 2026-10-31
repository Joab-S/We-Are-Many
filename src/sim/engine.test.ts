import { describe, expect, it } from 'vitest';
import { seedWorld } from './calibrate';
import { Ecosystem, YEAR_SECONDS } from './ecosystem';

/** Padrões do motor (Game Programming Patterns): índices, handles e tipos. */

const run = (eco: Ecosystem, seconds: number) => {
  for (let t = 0; t < seconds; t += 0.25) eco.step(0.25);
};

/** "Quem mora em v" pela varredura antiga, para comparar com o índice. */
function scan(eco: Ecosystem, v: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < eco.count; i++) if (eco.alive[i] && eco.village[i] === v) out.push(i);
  return out;
}

describe('índice de moradores (Spatial Partition com Dirty Flag)', () => {
  it('cada lista é igual à varredura, em ordem crescente, depois de nascer, morrer e mudar de lugar', () => {
    const { eco } = seedWorld(7);
    run(eco, YEAR_SECONDS * 8);
    const check = () => {
      for (let v = 0; v < eco.villages.length; v++) expect([...eco.residents(v)], `lugar ${v}`).toEqual(scan(eco, v));
    };
    check();
    const live = eco.villages.filter((v) => !v.abandoned && v.population >= 2);
    expect(live.length).toBeGreaterThan(1);
    const [a, b] = live;
    // Mudança de lugar, morte e nascimento sujam o índice; a próxima pergunta o refaz.
    const moved = eco.residents(a.id)[0];
    eco.setVillage(moved, b.id);
    check();
    eco.kill(eco.residents(b.id)[0], true);
    check();
    const born = eco.spawn(a.species, a.x, a.y, a.id, 0);
    expect(born).toBeGreaterThanOrEqual(0);
    check();
    // Bicho nascendo ou morrendo não suja o índice (não mora em lugar nenhum).
    eco.residents(a.id);
    const wild = eco.species.findIndex((sp) => sp.kind === 'herbivore');
    const j = eco.spawn(wild, a.x + 3, a.y, -1, 1);
    if (j >= 0) {
      expect(eco.residentIndex.dirty).toBe(false);
      eco.kill(j, true);
      expect(eco.residentIndex.dirty).toBe(false);
    }
    run(eco, YEAR_SECONDS * 2);
    check();
  }, 60000);

  it('uma lista já entregue não muda quando o índice é refeito no meio do laço', () => {
    const { eco } = seedWorld(7);
    run(eco, YEAR_SECONDS * 2);
    const v = eco.villages.find((o) => !o.abandoned && o.population >= 3)!;
    const list = eco.residents(v.id);
    const copy = [...list];
    eco.kill(list[0], true);
    eco.residents(v.id);
    expect([...list]).toEqual(copy);
    expect([...eco.residents(v.id)]).toEqual(copy.slice(1));
  }, 60000);
});
