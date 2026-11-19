/**
 * A lista de todos os comportamentos em Markdown (docs/COMPORTAMENTOS.md), gerada do próprio catálogo para não
 * ficar velha: um teste confere que o arquivo é igual ao que esta função escreve.
 *
 *   Para regravar: npx vitest run src/IAUS/npc/lista.test.ts -u   (ou GRAVAR=1)
 */
import type { Behavior } from '../behavior';
import { BrainLibrary } from '../brain';
import { ContextType, DurationType } from '../enums';
import { CAMADAS, CEREBRO, HABILIDADES, PACOTES, TRABALHAR_NO_OFICIO } from './pacotes/index';
import { PACOTES_DO_MUNDO } from './mundo/index';
import { CEREBRO_DA_ALDEIA, PACOTES_DA_ALDEIA } from './aldeia/pacotes';
import type { Pacote } from './dsl';
import { ACOES, ACOES_DE_TAG } from './tipos';

const CONTEXTO: Record<number, string> = {
  [ContextType.Self]: 'eu',
  [ContextType.SingleTarget]: 'alvo',
  [ContextType.SingleTargetOnSelf]: 'alvo em mim',
  [ContextType.StandAlone]: 'sozinho',
  [ContextType.LocationTarget]: 'lugar',
};

const cel = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

function contexto(b: Behavior): string {
  const c = CONTEXTO[b.contextType] ?? String(b.contextType);
  return b.targetTypes?.length ? `${c}: ${b.targetTypes.join(', ')}` : c;
}

function linha(b: Behavior): string {
  const dur = b.duration === DurationType.Continuous ? 'contínuo' : 'instantâneo';
  const cons = b.considerations.map((c) => c.name).join(' · ');
  return `| ${b.id} | **${cel(b.name)}**<br>${cel(b.description)} | ${b.behaviorType} | ${contexto(b)} | ${dur} | ${b.weight} | ${cel(cons)} |`;
}

function tabela(p: Pacote, nivel = '###'): string[] {
  return [
    `${nivel} ${p.id}. ${p.nome}`,
    '',
    p.descricao,
    '',
    '| Id | Comportamento | Tipo | Contexto | Duração | Peso | Considerações |',
    '|---|---|---|---|---|---|---|',
    ...p.comportamentos.map(linha),
    '',
  ];
}

/** O Markdown da lista. */
export function listaDeComportamentos(): string {
  const out: string[] = [
    '# Comportamentos das pessoas',
    '',
    '<!-- Gerado por src/IAUS/npc/lista.ts a partir do catálogo. Não edite à mão: rode `npx vitest run src/IAUS/npc/lista.test.ts` com GRAVAR=1. -->',
    '',
    'Cada comportamento é um Behavior do IAUS: o **porquê** (as considerações, cada uma uma entrada e uma curva de resposta),',
    'o **quê** (o Behavior Type, que o corpo da pessoa executa), o **contexto** (sobre quem é pontuado: a própria pessoa ou',
    'cada alvo de um tipo) e o **peso** (1 ambiente e ócio, 2 útil e social, 3 trabalho, 4 e 5 emergência). As ações',
    'contínuas valem um pouco a mais enquanto duram (o foco, ou momentum), para não serem largadas pela metade.',
    '',
    'A arquitetura está em [src/IAUS/npc/README.md](../src/IAUS/npc/README.md).',
    '',
    '## Cérebros de nascença',
    '',
    'O cérebro troca os pacotes em grupo quando a vida muda (`ajustarPacotes`).',
    '',
    '| Cérebro | Quando | Pacotes |',
    '|---|---|---|',
  ];
  const nomeDoPacote = (id: number) => PACOTES.find((p) => p.id === id)?.nome ?? String(id);
  for (const id of Object.values(CEREBRO)) {
    const s = BrainLibrary.brains.get(id)!;
    out.push(`| ${s.name} | ${cel(s.description ?? '')} | ${s.behaviorPackIds.map(nomeDoPacote).join(', ')} |`);
  }
  out.push('', '## A pessoa, por camada', '');
  let n = 0;
  for (const camada of CAMADAS) {
    out.push(`### ${camada}`, '');
    for (const p of PACOTES.filter((x) => x.camada === camada)) {
      out.push(...tabela(p, '####'));
      n += p.comportamentos.length;
    }
    if (camada === 'Sustento') {
      out.push(
        '#### 100+. Pacotes de habilidade dos ofícios',
        '',
        'Um Behavior-Ability Pair: o mesmo porquê (o lugar precisa do ofício, há disposição) ligado à habilidade de cada ofício. Quem passa a praticar um ofício ganha o pacote dele.',
        '',
        '| Id | Comportamento | Tipo | Contexto | Duração | Peso | Considerações |',
        '|---|---|---|---|---|---|---|',
        linha(TRABALHAR_NO_OFICIO),
        '',
        `Pacotes: ${Object.values(HABILIDADES).map((h) => `${h.id} ${h.name}`).join(', ')}.`,
        '',
      );
      n += 1;
    }
  }
  out.push(
    '## A aldeia na tela',
    '',
    'Quem mora num lugar perto da câmera tem um cérebro próprio, com estes pacotes (src/IAUS/npc/aldeia): cada ação é atômica e tem um alvo percebido (o celeiro, a roça, a árvore, a pessoa), e o corpo diz quando ela acabou. Nada é roteiro: comer, trabalhar e conviver disputam a cada pensamento.',
    '',
    '| Cérebro | Pacotes |',
    '|---|---|',
  );
  const nomeDaAldeia = (id: number) => PACOTES_DA_ALDEIA.find((p) => p.id === id)?.nome ?? String(id);
  for (const id of Object.values(CEREBRO_DA_ALDEIA)) {
    const s = BrainLibrary.brains.get(id)!;
    out.push(`| ${s.name} | ${s.behaviorPackIds.map(nomeDaAldeia).join(', ')} |`);
  }
  out.push('');
  for (const p of PACOTES_DA_ALDEIA) {
    out.push(...tabela(p));
    n += p.comportamentos.length;
  }
  out.push(
    '## O mundo agregado',
    '',
    'O Ecosystem decide uma vez por ano, sem corpo: estes pacotes são pontuados pelo mesmo `Brain` (src/IAUS/npc/mundo).',
    '',
  );
  for (const p of PACOTES_DO_MUNDO) {
    out.push(...tabela(p));
    n += p.comportamentos.length;
  }
  out.push('## Tipos de comportamento (o quê)', '', '| Tipo | O que faz |', '|---|---|');
  for (const [k, v] of Object.entries(ACOES)) out.push(`| ${k} | ${cel(v)} |`);
  for (const [k, v] of Object.entries(ACOES_DE_TAG)) out.push(`| ${k} | ${cel(v)} (Tagging System) |`);
  out.push('', `Total: ${n} comportamentos em ${PACOTES.length + PACOTES_DA_ALDEIA.length + PACOTES_DO_MUNDO.length} pacotes e ${Object.keys(HABILIDADES).length} pacotes de habilidade.`, '');
  return out.join('\n');
}
