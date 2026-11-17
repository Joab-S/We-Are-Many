import { describe, expect, it } from 'vitest';
import { ANDARILHO } from '../IAUS/npc/aldeia/andarilho';
import { seedWorld } from './calibrate';

describe('andarilho (quem vive sem lugar)', () => {
  it('perto da tela tem mente própria: dorme, come do mato, faz fogo e procura o povo, cada coisa uma ação', () => {
    const { eco } = seedWorld(1234);
    const e = eco as unknown as { uid: Int32Array; x: Float32Array; y: Float32Array; village: Int32Array; mindNow(i: number): { brain: { currentDecision: { context: { behavior: { name: string } } } | null } } | undefined };
    const s = eco.species.findIndex((x) => x.kind === 'sapient');
    // Um ponto de terra longe de todas as aldeias.
    let at = -1;
    for (let k = 0; k < 4000 && at < 0; k++) {
      const x = (k * 37) % eco.map.width;
      const y = (k * 53) % eco.map.height;
      if (eco.villages.some((v) => !v.abandoned && Math.hypot(v.x - x, v.y - y) < 60)) continue;
      at = eco.introduceOne(s, x + 0.5, y + 0.5);
    }
    expect(at).toBeGreaterThanOrEqual(0);
    const uid = e.uid[at];
    const pack = new Set(ANDARILHO.comportamentos.map((b) => b.name));
    const seen = new Set<string>();
    // A ficha mostra a decisão dele (e não o texto fixo de quem vive solto).
    let noted = false;
    // Dois dias na tela, com a câmera em cima dele.
    for (let t = 0; t < 120; t += 0.25) {
      const i = eco.findUid(uid);
      if (i < 0 || e.village[i] >= 0) break;
      eco.focus = { x: e.x[i], y: e.y[i], r: 24 };
      eco.step(0.25);
      const j = eco.findUid(uid);
      const d = j >= 0 && e.village[j] < 0 ? e.mindNow(j)?.brain.currentDecision : null;
      if (d) seen.add(d.context.behavior.name);
      if (d && eco.dayOf(j).note) noted = true;
    }
    for (const n of seen) expect(pack.has(n)).toBe(true);
    expect(seen.size).toBeGreaterThanOrEqual(4);
    expect([...seen].some((n) => ['Ir para o lugar do seu povo', 'Ir ao encontro de outro andarilho', 'Procurar um bom lugar para viver'].includes(n))).toBe(true);
    expect(noted).toBe(true);
  }, 60000);
});
