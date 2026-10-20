import { describe, expect, it } from 'vitest';
import { runWorld } from './calibrate';
import { animalStage, DEATH_CAUSES, familyName, personName } from './people';

describe('pessoas como indivíduos (19.17)', () => {
  it('nomes saem iguais para o mesmo número e soam diferentes entre povos', () => {
    expect(personName(42, 3)).toBe(personName(42, 3));
    expect(familyName(7, 3)).toBe(familyName(7, 3));
    const a = new Set(Array.from({ length: 50 }, (_, k) => personName(k + 1, 3)));
    expect(a.size).toBeGreaterThan(30);
    expect(personName(5, 1)).not.toBe(personName(5, 2));
    expect(personName(9, 4)).toMatch(/^[A-Z][a-z]+$/);
  });

  it('animais aparecem como filhote, adulto ou velho', () => {
    expect(animalStage(1, 2, 12)).toBe('filhote');
    expect(animalStage(5, 2, 12)).toBe('adulto');
    expect(animalStage(11, 2, 12)).toBe('velho');
  });

  it('num mundo de 60 anos, filhos herdam a família, cada um tem um número único e o ano fica registrado', () => {
    const { eco } = runWorld(11, 60);
    const uids = new Set<number>();
    let heirs = 0;
    for (let i = 0; i < eco.count; i++) {
      if (!eco.alive[i]) continue;
      expect(uids.has(eco.uid[i])).toBe(false);
      uids.add(eco.uid[i]);
      if (eco.parent[i] && eco.species[eco.kind[i]].kind === 'sapient') {
        const p = eco.findUid(eco.parent[i]);
        if (p >= 0) {
          expect(eco.family[i]).toBe(eco.family[p]);
          expect(eco.familyOf(p).children).toContain(i);
          heirs++;
        }
      }
      expect(eco.activityOf(i).length).toBeGreaterThan(3);
    }
    expect(heirs).toBeGreaterThan(0);
    const live = eco.villages.filter((v) => !v.abandoned);
    const v = live.sort((a, b) => b.population - a.population)[0];
    expect(v.vital).toBeDefined();
    expect(v.history!.length).toBeGreaterThan(10);
    expect(Object.keys(v.vital!.deaths).every((c) => (DEATH_CAUSES as readonly string[]).includes(c))).toBe(true);
    expect(eco.deaths.length).toBeGreaterThan(0);
  }, 60000);

  it('a escolha por ponto vem da mais perto para a mais longe, e o retângulo pega quem está dentro', () => {
    const { eco } = runWorld(11, 20);
    const v = eco.villages.find((o) => !o.abandoned)!;
    const list = eco.pickAll(v.x, v.y, 6);
    expect(list.length).toBeGreaterThan(1);
    const d = (i: number) => Math.hypot(eco.x[i] - v.x, eco.y[i] - v.y);
    for (let k = 1; k < list.length; k++) expect(d(list[k])).toBeGreaterThanOrEqual(d(list[k - 1]) - 1e-6);
    expect(list[0]).toBe(eco.pick(v.x, v.y, 6));
    const box = eco.pickRect(v.x - 5, v.y - 5, v.x + 5, v.y + 5);
    for (const i of box) expect(Math.abs(eco.y[i] - v.y)).toBeLessThanOrEqual(5);
    expect(box.length).toBeGreaterThan(0);
  }, 60000);
});
