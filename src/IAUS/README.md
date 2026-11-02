# IAUS: a IA das pessoas

As pessoas inteligentes do mundo decidem com o **IAUS** (Infinite Axis Utility System), um motor de
utilidade que roda no navegador, sem chave de API e sem internet. Esta pasta substitui a IA antiga de
`src/ai` (que ficou ao lado só para comparação: a simulação não importa mais nada de lá).

## O motor (os arquivos soltos desta pasta)

Vieram do pacote `iaus-ts`, sem mudança no código:

| Arquivo | O que tem |
|---|---|
| `enums.ts` | Context Type, Duration, tipos de curva, parâmetros das considerations e modos de seleção |
| `math.ts` | `clamp01`, `normalize`, vetores e o gerador com semente |
| `responseCurve.ts` | As Response Curves (linear, polinomial, logística, logit, normal, seno) |
| `consideration.ts` | Consideration = input → normalização (RangeMin/RangeMax) → curva; o registro de inputs |
| `behavior.ts`, `behaviorTypes.ts`, `packs.ts` | Behaviors (o porquê), Behavior Types (o quê), Behavior e Ability Packs |
| `context.ts` | Context, ContextInfo e Decision (um Behavior pontuado contra um alvo) |
| `brain.ts` | O cérebro: pontuação com compensação, corte antecipado, seleção e o ciclo de pensamento |
| `aiEntity.ts`, `history.ts`, `imap.ts`, `dataLoader.ts` | Entidades e tags, histórico de cooldown, mapa de influência e carga por JSON |
| `example.ts` | A demonstração do pacote (vila com guarda, maga e orcs); a simulação não a usa |

## As decisões das pessoas (`npc/`)

| Arquivo | O que tem |
|---|---|
| `npc/mind.ts` | A ponte: cada decisão vira uma `Mind`, um conjunto fixo de Behaviors do IAUS; as opções do momento entram como alvos, e o `Brain` pontua e sorteia |
| `npc/decisions/work.ts` | Ofício de quem vira adulto (um Behavior "ofício", pontuado por ofício) e quem troca na falta |
| `npc/decisions/leader.ts` | Escolha do líder (um Behavior "liderar", por candidato), herdeiro e temperamento do rei |
| `npc/decisions/move.ts` | Ficar (Self), migrar (por lugar) ou fundar (por sítio) |
| `npc/decisions/day.ts` | A jornada: comer, descansar, conversar e rezar (Self) e as tarefas do quadro (por tarefa, com peso maior na urgência) |
| `npc/decisions/social.ts` | Um ano de vida social (encontros, amizade, rivalidade, casamento): regras diretas, sem escolha entre opções |
| `npc/traits.ts`, `npc/relations.ts`, `npc/trace.ts` | Traços de personalidade, laços entre pessoas e o diário de cada uma |
| `npc/tuning.ts` | **Todos os pesos num lugar só** (o ajuste automático escreve aqui) |
| `npc/lab/` | O laboratório: testes de uma pessoa, um casal, uma aldeia, uma mudança e uma jornada |

### Como uma decisão passa pelo IAUS

1. Cada consideration é um input registrado no IAUS (`Inputs.register`, com o nome `decisão.behavior.consideração`)
   e uma Response Curve. As curvas da IA antiga viraram curvas do IAUS: a reta de `lo` a `hi` é a Linear com
   `m = hi − lo` e `b = lo`; a curva de traço (de −1 a 1) é uma Linear com RangeMin −1 e RangeMax 1; a logística é a
   Logistic. As duas formas que o IAUS não tem (a exponencial da nota de um lugar e a queda da lotação) são
   calculadas no próprio input, com a curva identidade.
2. A nota é a do `Brain`: peso do Behavior × produto das considerations, com a compensação pelo número delas.
3. A escolha é a seleção `WeightedRandomTop` com `withinFractionOfBest` = a faixa da pessoa (a paciente fica quase
   sempre com a melhor, a impulsiva varia mais). O sorteio usa o gerador do mundo (fluxo `mente`), então a mesma
   semente dá a mesma história.
4. O porquê sai do detalhamento do `Brain` (a nota de cada consideration), igual ao que o diário e a ficha já mostravam.

Na troca, as mesmas entradas dão as mesmas escolhas e as mesmas notas que a IA antiga (conferido em 80 mil decisões
sorteadas, com traços comuns e extremos).

## Como testar e ajustar

1. Mude um peso em `npc/tuning.ts`.
2. Rode o laboratório: `npx vitest run src/IAUS/npc/lab`.
3. Veja o mundo inteiro: `npm run calibrar:longa` (3 mundos × 1000 anos).
4. No jogo, clique numa pessoa: a ficha mostra os traços, os laços e as últimas decisões com o porquê.
