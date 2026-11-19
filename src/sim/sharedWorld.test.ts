import { describe, expect, it } from 'vitest';
import { snapshotEcosystem } from '../save/snapshot';
import { runWorld } from './calibrate';
import { sharedWorld } from './sharedWorld';

describe('mundo dividido entre testes', () => {
  it('a foto de cada ano é o mesmo mundo de rodar até ali, e cada cópia é independente', () => {
    const world = sharedWorld(5, [1, 2]);
    expect(snapshotEcosystem(world.at(2), 5)).toEqual(snapshotEcosystem(runWorld(5, 2).eco, 5));
    const a = world.at(1);
    a.step(1);
    expect(world.at(1).year).not.toBe(a.year);
  });
});
