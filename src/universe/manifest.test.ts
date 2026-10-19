import { describe, expect, it } from 'vitest';
import { indexManifest, selectNodes, type Manifest } from './manifest';

const manifest: Manifest = {
  version: 1,
  source: 'teste',
  units: 'pc',
  stride: 6,
  stars: 0,
  nodes: [
    { id: 'r', c: [0, 0, 0], h: 1024, n: 1, b: 0, k: ['r0', 'r7'] },
    { id: 'r0', c: [-512, -512, -512], h: 512, n: 1, b: 1, k: ['r00'] },
    { id: 'r00', c: [-768, -768, -768], h: 256, n: 1, b: 2, k: [] },
    { id: 'r7', c: [512, 512, 512], h: 512, n: 1, b: 1, k: [] },
  ],
};

describe('seleção de chunks', () => {
  const index = indexManifest(manifest);
  it('carrega os nós profundos perto do observador', () => {
    const s = selectNodes(index, [-700, -700, -700]);
    expect(s.has('r00')).toBe(true);
  });
  it('de muito longe, só a raiz', () => {
    const s = selectNodes(index, [1e6, 1e6, 1e6]);
    expect([...s]).toEqual(['r']);
  });
});
