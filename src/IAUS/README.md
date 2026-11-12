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
- **`stickWhenBest`** (`SelectionConfig`): no sorteio entre as melhores, a ação em andamento que continua na frente
  (já com o momentum) fica, em vez de ir ao sorteio. Sem isso, uma ação quase empatada trocava a cada pensamento.
- **`explain(decision)`**: a nota de uma decisão com o fator de cada consideração, para a ficha mostrar o porquê.

## Levar o IAUS para outro jogo

O motor (os arquivos soltos desta pasta) não importa nada de fora dela: copie a pasta sem `npc/` e ela funciona
sozinha. O jogo novo escreve só três coisas, e a mente da aldeia (`npc/aldeia/` com `src/sim/eco/people/mente.ts`)
é o exemplo completo de cada uma:

1. **Os comportamentos** (o porquê): pacotes de Behaviors, cada um com peso, alvos e considerações. Com a linguagem
   curta de `npc/dsl.ts` um comportamento cabe em poucas linhas (`npc/aldeia/pacotes.ts`). Cada comportamento aponta
   um **tipo de ação atômica** (Comer, Colher, Entregar...): uma coisa só, com um alvo, que termina.
2. **A percepção** (o que a pessoa sabe): `BrainOptions.perceive` devolve os alvos que a pessoa conhece agora, cada
   um um `AiEntity` com tipo e stats (a roça com `safra`, o celeiro com `comida`), e o jogo põe nos stats da própria
   pessoa o que ela sente (`fome`, `cansaco`, a carga na mão). As considerações só leem esses números. No jogo:
   `perceive` e `feel` em `mente.ts`.
3. **O corpo** (o que a ação faz no mundo): `Pessoa.corpo.agir(acao, ctx, dt)` é chamado a cada passo enquanto a
   ação dura e responde `continua`, `feito` ou `falhou`. É ele quem anda, colhe ou come, e quem diz que a ação
   acabou; o cérebro então pensa de novo. No jogo: `mindAct` em `mente.ts`.

O cérebro faz o resto: pontua cada comportamento contra cada alvo, multiplica as considerações (com a compensação),
soma o momentum da ação em andamento e escolhe. Nenhum lugar diz "primeiro come, depois trabalha": a ordem sai das
notas. O lenhador que vê uma caça no caminho larga a árvore se a caça valer bem mais que o momentum, e volta à árvore
depois porque ela continua lá e continua valendo.

Regras que mantêm as ações atômicas (tiradas do Dave Mark e do Curvature, de Mike Lewis):

- Uma ação, um alvo, um fim: "Levar a carga ao celeiro" acaba quando a carga chega; ir à roça, colher e levar são
  três decisões, não um roteiro.
- O que faz a ação parar é o mesmo número que fez ela começar: come-se até a fome passar, e a consideração de fome
  já não pede mais comida.
- O alvo de uma ação em andamento continua percebido (mesma chave de decisão), senão o momentum não vale.
- Os números da percepção mudam devagar perto da escala de uma ação: se um stat liga e desliga mais rápido que a
  ação leva para acontecer, a pessoa troca no meio.

## As pessoas (`npc/`)

A arquitetura dos comportamentos está em [`npc/README.md`](npc/README.md), e a lista de todos eles, gerada do
catálogo, em [`docs/COMPORTAMENTOS.md`](../../docs/COMPORTAMENTOS.md).

| Pasta ou arquivo | O que tem |
|---|---|
| `npc/vocab.ts`, `npc/pessoa.ts`, `npc/curvas.ts` | O vocabulário (tipos de objeto, bens, ofícios, tags, stats), a pessoa e as curvas com nome |
| `npc/entradas.ts`, `npc/tipos.ts` | As entradas (o que uma consideration lê) e os Behavior Types (o que o corpo faz) |
| `npc/dsl.ts` | A linguagem curta de escrever pacotes (`pacote`, `c`, `curva`) |
| `npc/pacotes/` | Os 17 pacotes da pessoa, por camada, os pacotes de habilidade dos ofícios e os cérebros de nascença |
| `npc/aldeia/` | A mente de quem mora num lugar na tela: os pacotes de necessidades, trabalho, convívio e infância, os cérebros de nascença e os nomes das atividades (`dia.ts`) |
| `npc/mundo/` | O mundo agregado (Ecosystem): ofício, líder e mudança como pacotes pontuados pelo `Decisor`, a vida social do ano e os pesos (`ajustes.ts`) |
| `npc/pessoa/` | Traços de personalidade, laços entre pessoas e o diário |

## Como testar e ajustar

1. A pessoa com corpo: o laboratório da sociedade (`src/sim/sociedade`) roda os pacotes num mapa pequeno.
   `npx vitest run src/sim/sociedade` confere a fundação (assentar, casa, casamento, ofício, encomenda) e
   `npx vitest run --config vitest.calib.config.ts src/sim/sociedade/sociedade.calib.ts --silent=false` roda 40 anos
   e mostra a crônica (eleição, imposto, oficina, obra pública).
2. O mundo agregado: mude um peso em `npc/mundo/ajustes.ts` e veja o mundo inteiro com `npm run calibrar:longa`.
3. A biblioteca: `npx vitest run src/IAUS` (catálogo, troca de pacotes, Tagging System, contratar ou fazer, grafo).
4. A aldeia na tela: `npx vitest run src/IAUS/npc/aldeia` confere as escolhas sem o mundo (fome, lenha na mão,
   momentum, alarme). Para ver uma aldeia viva, `npx vitest run --config vitest.calib.config.ts src/sim/mente.calib.ts --silent=false`
   roda o mundo, põe a câmera na maior aldeia e mostra as necessidades, o tempo parado, o trabalho e como as ações
   terminaram.
5. No jogo, clique numa pessoa: a ficha mostra os traços, os laços e as últimas decisões com o porquê.
