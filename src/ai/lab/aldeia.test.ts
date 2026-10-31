import { describe, expect, it } from 'vitest';
import { runWorld } from '../../sim/calibrate';
import { ROLE, ROLES, CHILD } from '../../sim/roles';
import { roleFit } from '../decisions/work';
import { TRAIT, TRAIT_COUNT } from '../traits';
import { BOND, countKind, partnerOf } from '../relations';

/**
 * Laboratório da IA local, passo 2: a IA solta num povo de verdade por 150 anos. Cada ofício tem que
 * juntar gente com o jeito dele (sem matar o povo), cada pessoa tem traços próprios, e as decisões ficam no diário.
 */
describe('IA local: um povo inteiro', () => {
  const { eco } = runWorld(11, 150);
  const people: number[] = [];
  for (let i = 0; i < eco.count; i++) if (eco.alive[i] && eco.village[i] >= 0 && eco.species[eco.kind[i]].kind === 'sapient') people.push(i);

  it('o povo sobrevive e cada pessoa é diferente', () => {
    expect(people.length).toBeGreaterThan(40);
    const seen = new Set(people.map((i) => eco.traits.slice(i * TRAIT_COUNT, (i + 1) * TRAIT_COUNT).join(',')));
    expect(seen.size).toBeGreaterThan(people.length * 0.95);
  });

  it('quem está num ofício combina com ele mais que a média do povo', () => {
    // Três povos (este e mais dois): num só, quantos ofícios passam de 5 pessoas aos 150 anos e o ganho
    // variam demais de semente para semente (na mesma versão do jogo, duas de cinco sementes ficavam abaixo).
    let gain = 0;
    let n = 0;
    let groups = 0;
    for (const w of [eco, runWorld(12, 150).eco, runWorld(13, 150).eco]) {
      const adults: number[] = [];
      for (let i = 0; i < w.count; i++) if (w.alive[i] && w.village[i] >= 0 && w.species[w.kind[i]].kind === 'sapient' && w.role[i] !== CHILD) adults.push(i);
      // Média ponderada pelo tamanho de cada ofício: um ofício de 5 pessoas não pesa o mesmo que um de 100.
      for (const r of ['hunter', 'farmer', 'woodcutter', 'builder', 'miner', 'gatherer'] as const) {
        const inRole = adults.filter((i) => w.role[i] === ROLE[r]);
        if (inRole.length < 5) continue;
        const mean = (list: number[]) => list.reduce((s, i) => s + roleFit(w.traits, i, r), 0) / list.length;
        gain += (mean(inRole) - mean(adults)) * inRole.length;
        n += inRole.length;
        groups++;
      }
    }
    expect(groups).toBeGreaterThan(6);
    expect(gain / n).toBeGreaterThan(0.02);
  }, 120000);

  it('a curiosidade vem do traço e a média fica perto da antiga', () => {
    const mean = people.reduce((s, i) => s + eco.curiosity(i), 0) / people.length;
    expect(mean).toBeGreaterThan(0.7);
    expect(mean).toBeLessThan(1.05);
    const curious = people.reduce((best, i) => (eco.traits[i * TRAIT_COUNT + TRAIT.curiosity] > eco.traits[best * TRAIT_COUNT + TRAIT.curiosity] ? i : best), people[0]);
    expect(eco.curiosity(curious)).toBeGreaterThan(1.2);
  });

  it('as escolhas de ofício ficam no diário de cada um, com o porquê', () => {
    const adults = people.filter((i) => eco.role[i] !== CHILD && eco.role[i] < ROLES.indexOf('soldier'));
    const withDiary = adults.filter((i) => eco.diary.get(eco.uid[i])?.some((t) => t.kind === 'ofício'));
    expect(withDiary.length).toBeGreaterThan(adults.length * 0.3);
    const line = eco.diary.get(eco.uid[withDiary[0]])!.find((t) => t.kind === 'ofício')!;
    expect(line.text).toMatch(/^(Virou|Trocou) .+: .+/);
  });

  it('o povo faz amigos, casa e tem rivais; os casais moram juntos', () => {
    const adults = people.filter((i) => eco.role[i] !== CHILD);
    let friends = 0;
    let married = 0;
    let couples = 0;
    let together = 0;
    for (const i of adults) {
      friends += countKind(eco.bonds, eco.uid[i], BOND.friend);
      const p = partnerOf(eco.bonds, eco.uid[i]);
      if (!p) continue;
      married++;
      // Só os casais com os dois vivos em terra: o laço com quem morreu ou está embarcado fica, e quantos são
      // depende da história da semente.
      const ties = eco.tiesOf(i);
      if (ties.partner < 0) continue;
      couples++;
      if (eco.village[ties.partner] === eco.village[i]) together++;
    }
    expect(friends / adults.length).toBeGreaterThan(1);
    expect(married / adults.length).toBeGreaterThan(0.2);
    expect(together / couples).toBeGreaterThan(0.8);
    expect(eco.tally.marriages).toBeGreaterThan(20);
  });

  it('líderes são escolhidos pelo povo: mais carismáticos que a média', () => {
    const leaders = people.filter((i) => eco.role[i] === ROLE.leader || eco.role[i] === ROLE.king);
    expect(leaders.length).toBeGreaterThan(3);
    const charisma = (list: number[]) => list.reduce((s, i) => s + eco.traits[i * TRAIT_COUNT + TRAIT.charisma], 0) / list.length;
    expect(charisma(leaders)).toBeGreaterThan(charisma(people) + 1);
  });
});
