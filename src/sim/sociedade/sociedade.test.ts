import { describe, expect, it } from 'vitest';
import { Sociedade } from './mundo';

/** Roda o laboratório da sociedade por `anos` anos, em passos de meio segundo. */
function rodar(semente: number, anos: number): Sociedade {
  const s = new Sociedade(semente, { pioneiros: 2, chegadas: 1.5 });
  for (let k = 0; k < anos * 60 * 2; k++) s.passo(0.5);
  return s;
}

const diario = (s: Sociedade) => [...s.gente.values()].flatMap((g) => g.diario);
const cronica = (s: Sociedade) => s.cronica.map((e) => e.texto);

describe('laboratório da sociedade: a fundação emergente', () => {
  it('a mesma semente dá a mesma história', () => {
    const a = rodar(3, 2);
    const b = rodar(3, 2);
    expect(a.resumo()).toEqual(b.resumo());
    expect(cronica(a)).toEqual(cronica(b));
  });

  it('em 14 anos, gente sozinha assenta, constrói casa, casa, escolhe ofício e encomenda o que não faz', () => {
    const s = rodar(7, 14);
    const r = s.resumo();
    const textos = cronica(s);
    const dias = diario(s);
    // Sobreviveu gente e há lugares com casas.
    expect(r.gente).toBeGreaterThanOrEqual(8);
    expect(r.lugares.length).toBeGreaterThan(0);
    expect(r.lugares.reduce((n, l) => n + l.casas, 0)).toBeGreaterThan(0);
    expect(textos.some((t) => /decidiu ficar perto de/.test(t))).toBe(true);
    expect(textos.some((t) => /terminou a casa/.test(t))).toBe(true);
    // Vínculos: alguém se juntou a um lugar e houve casamento.
    expect(textos.some((t) => /decidiu morar em/.test(t))).toBe(true);
    expect(textos.some((t) => /se casaram/.test(t))).toBe(true);
    // Especialização e troca.
    expect(textos.some((t) => /escolheu ser/.test(t))).toBe(true);
    expect(dias.some((t) => /Encomendou/.test(t))).toBe(true);
  }, 60_000);
});
