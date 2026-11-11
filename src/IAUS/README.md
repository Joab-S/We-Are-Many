# IAUS: a IA das pessoas

As pessoas inteligentes do mundo decidem com o **IAUS** (Infinite Axis Utility System), um motor de
utilidade que roda no navegador, sem chave de API e sem internet.

## O motor (os arquivos soltos desta pasta)

Vieram do pacote `iaus-ts`. O motor fica como está; só ganhou o que o fluxo das pessoas e o grafo do cérebro pediram
(tudo opcional, sem mudar o que já existia):

| Arquivo | O que tem |
|---|---|
| `enums.ts` | Context Type, Duration, tipos de curva, parâmetros das considerations e modos de seleção |
| `math.ts` | `clamp01`, `normalize`, vetores e o gerador com semente |
| `responseCurve.ts` | As Response Curves (linear, polinomial, logística, logit, normal, seno) |
| `consideration.ts` | Consideration = input → normalização (RangeMin/RangeMax) → curva; o registro de inputs |
| `behavior.ts`, `behaviorTypes.ts`, `packs.ts` | Behaviors (o porquê), Behavior Types (o quê), Behavior e Ability Packs |
| `context.ts` | Context, ContextInfo e Decision (um Behavior pontuado contra um alvo) |
| `brain.ts` | O cérebro: pontuação com compensação, corte antecipado, seleção e o ciclo de pensamento |
| `aiEntity.ts`, `history.ts`, `imap.ts`, `dataLoader.ts` | Entidades, tags e crenças, histórico de cooldown, mapa de influência e carga por JSON |
| `graph.ts` | O grafo do cérebro (`brainGraph`) e a esfera de aglomerados (`sphereLayout`), para a vista futura |

O que o motor ganhou:

- **Tagging System completo** (`aiEntity.ts`): além das tags de si (`tagSelf`, `untagSelf`), a pessoa marca outros
  (`mark`, `unmark`: a tag leva o id de quem marcou, "AlvoDeCaca:12") e tem **crenças** sobre os outros
  (`BeliefSet`: `perceive`, `forget`, `seesTag`), que vencem com o tempo. Crer que alguém é lenhador não muda o outro.
- **Percepção do mundo** (`BrainOptions.perceive`): mundos grandes passam quem a pessoa enxerga (grade espacial,
  lugares lembrados), em vez de varrer todas as entidades.
- **`decide` e `commit`**: pensar sem agir (o "e se" da ficha e as decisões do mundo agregado) e aplicar depois.
- **`idleThinkInterval`**: quem fica sem nada em andamento depois de uma decisão instantânea pensa de novo logo.
- **Corte antecipado também no sorteio entre as melhores** (`WeightedRandomTop` com `withinFractionOfBest`): a decisão
  que já ficou abaixo da fração da melhor não entraria no sorteio, então para de ser pontuada (o resultado é o mesmo).
- **Notas do último ciclo por comportamento** (`lastBehaviorScore`), que o grafo usa para acender os nós.

## As pessoas (`npc/`)

A arquitetura dos comportamentos está em [`npc/README.md`](npc/README.md), e a lista de todos eles, gerada do
catálogo, em [`docs/COMPORTAMENTOS.md`](../../docs/COMPORTAMENTOS.md).

| Pasta ou arquivo | O que tem |
|---|---|
| `npc/vocab.ts`, `npc/pessoa.ts`, `npc/curvas.ts` | O vocabulário (tipos de objeto, bens, ofícios, tags, stats), a pessoa e as curvas com nome |
| `npc/entradas.ts`, `npc/tipos.ts` | As entradas (o que uma consideration lê) e os Behavior Types (o que o corpo faz) |
| `npc/dsl.ts` | A linguagem curta de escrever pacotes (`pacote`, `c`, `curva`) |
| `npc/pacotes/` | Os 17 pacotes da pessoa, por camada, os pacotes de habilidade dos ofícios e os cérebros de nascença |
| `npc/mundo/` | O mundo agregado (Ecosystem): ofício, líder, mudança e jornada como pacotes pontuados pelo `Decisor`, a vida social do ano e os pesos (`ajustes.ts`) |
| `npc/pessoa/` | Traços de personalidade, laços entre pessoas e o diário |

## Como testar e ajustar

1. A pessoa com corpo: o laboratório da sociedade (`src/sim/sociedade`) roda os pacotes num mapa pequeno.
   `npx vitest run src/sim/sociedade` confere a fundação (assentar, casa, casamento, ofício, encomenda) e
   `npx vitest run --config vitest.calib.config.ts src/sim/sociedade/sociedade.calib.ts --silent=false` roda 40 anos
   e mostra a crônica (eleição, imposto, oficina, obra pública).
2. O mundo agregado: mude um peso em `npc/mundo/ajustes.ts` e veja o mundo inteiro com `npm run calibrar:longa`.
3. A biblioteca: `npx vitest run src/IAUS` (catálogo, troca de pacotes, Tagging System, contratar ou fazer, grafo).
4. No jogo, clique numa pessoa: a ficha mostra os traços, os laços e as últimas decisões com o porquê.
