# Arquitetura: motor, plataforma e cliente

Documento técnico · 31/10/2026

O jogo roda inteiro no navegador, mas o código já está dividido para que o **motor** (a simulação) possa sair para um Web Worker e, depois, para um servidor, deixando no navegador só o **cliente** (desenho e HUD). Este documento descreve as camadas, o protocolo entre motor e cliente, as regras de determinismo, a classe parcial do `Ecosystem`, onde cada um dos 19 padrões do livro *Game Programming Patterns* (Robert Nystrom) aparece no código e o que falta para a separação.

## Camadas

| Camada | O que é | Pastas e arquivos | Regra |
| --- | --- | --- | --- |
| **Motor puro** | Simulação e geração, determinísticas, sem tela | `src/core`, `src/procgen` (menos o Worker), `src/sim` (com `src/sim/api`), `src/ai`, `src/nav`, `src/explore`, `src/universe/manifest.ts`, `src/universe/starIndex.ts`, `src/save/snapshot.ts` | Nada de three.js, DOM ou `src/client`, nem pelo que importam |
| **Plataforma** | Adaptadores do navegador | `src/universe/loader.ts` (fetch), `src/universe/chunkCache.ts` e `src/save/store.ts` (IndexedDB), `src/procgen/surface.worker.ts` (Worker), `src/save/game.ts` e `src/save/manager.ts` (o save do `GameState`, com a nave em `THREE.Vector3`) | O motor nunca os alcança |
| **Cliente** | Desenho, entrada e HUD | `src/client/**` | Fala com a simulação pela fachada (`src/sim/api`) |

O teste de fronteira `src/core/purity.test.ts` lê os arquivos do disco a cada execução, segue os imports a partir de todas as pastas do motor e falha se algum alcança three.js, `src/client`, uma API do navegador (`document.`, `window.`, `fetch(`, `indexedDB.`...) ou um adaptador de plataforma. Testes (`*.test.ts`) e calibração (`*.calib.ts`) ficam fora, porque rodam no Node com `node:fs`.

Em 31/10/2026 o teste achou uma violação: `src/save/snapshot.ts` importava three.js e o `GameState` do cliente. A correção mínima tirou de lá `snapshotGame` e `restoreGame` (que montam a nave em `THREE.Vector3`) para `src/save/game.ts`; o formato, a validação e o retrato do `Ecosystem` (`snapshotEcosystem`, `restoreEcosystem`) ficaram no motor.

## Protocolo entre motor e cliente

```
cliente                                   motor (src/sim)
──────────────────────────────────────    ──────────────────────────────────────
ferramentas, teclas, câmera
   └─ EngineCommand ──► SimDriver.enqueue ─► (fronteira do passo) Engine.apply
SimDriver.update(dt) ── N × Engine.step(0,25) ──► Ecosystem.step
HUD ◄── EventBus.on(kind) ◄── SimDriver ◄── Engine.drainEvents ◄── eco.emit
desenho, fichas ◄────────── Engine.view (só leitura)
repintura do mapa ◄──────── EngineHooks.tileChanged (síncrono)
```

A fachada é `src/sim/api/engine.ts`:

```ts
interface Engine {
  readonly view: EngineView;          // o que o cliente lê
  readonly seed: number;
  step(dt: number): void;             // um passo fixo
  apply(cmd: EngineCommand): CommandResult;   // entrada; o aviso do motor volta em `hint`
  drainEvents(): EngineEvent[];       // saída
  snapshot(): EngineSnapshot;         // cópia funda (terreno + ecossistema)
  restore(snap: EngineSnapshot): void;
  setHooks(h: EngineHooks): void;     // tileChanged, species
}
createEngine(map, { seed, eco?, species?, populate?, yearSpan? })
```

`createEngine` adota um `Ecosystem` existente (o do `GameState` ou de um save) ou monta um mundo novo com a semente e as espécies. Os eventos do povoamento são descartados: a história começa quando o motor nasce. `snapshot` e `restore` delegam a `src/save/snapshot.ts` e passam por `structuredClone`, então o retrato não muda quando o mundo anda e pode ser restaurado mais de uma vez.

### Comandos (entrada)

`src/sim/api/commands.ts`: `EngineCommand` é uma união discriminada por `kind`, só com dados (sobrevive a `JSON.stringify`). `applyCommand(eco, map, cmd)` é o único lugar que executa as ações do jogador.

| `kind` | O que faz |
| --- | --- |
| `terraform` | Pincéis de terreno e clima (`TERRAFORM`), com reclassificação do bioma e limpeza do que o terreno novo não sustenta |
| `restoreTiles` | Desfaz um traço (Ctrl+Z), a partir do retrato do `TileJournal` |
| `clear`, `demolish`, `ore`, `introduce`, `feed`, `cull`, `teach`, `harvest`, `lava` | Ferramentas de natureza, vida e civilização |
| `politics` | Influência sobre reinos (provocar, amenizar, declarar guerra, inflamar, acalmar) |
| `event`, `surprise`, `events` | Eventos do mundo provocados, um aleatório, e as opções dos aleatórios |
| `view` | A vista do jogador: foco da câmera e lugar da pessoa aberta na ficha |

O comando `view` é a novidade desta etapa. O foco da câmera muda a simulação, e isso é de propósito: só os lugares na tela rodam as jornadas (RF-AS-31) e os bichos de terra fora dela decidem três vezes menos. Antes o cliente escrevia `eco.focus` e `eco.pinned` no meio do quadro. Agora a vista entra na fila do `SimDriver`, é aplicada na fronteira do passo e vai para o log. `viewCommand` arredonda o foco numa célula: o centro vai para o meio dela e o raio sobe meia célula e mais o que faltar para o múltiplo seguinte, então a tela inteira continua coberta. A célula tem `VIEW_CELL` = 8 tiles de perto e cresce com a vista de longe (`viewCell`: a potência de 2 perto de um oitavo da meia largura). O `SurfaceMode` só enfileira quando a vista muda (`sameView`): trocar de célula, de degrau de zoom ou de pessoa fixada. Assim o log não cresce a cada quadro, nem ao arrastar o mapa de longe. Numa rodada de 60 s em 5x (27 anos de jogo), com a câmera arrastada a cada 5 s, entraram 16 comandos de vista; com a célula fixa de 8 tiles eram 120.

### Eventos (saída)

`src/sim/api/events.ts`: `EngineEvent` é uma união discriminada, só com dados (ids numéricos, nenhuma referência a objeto). Cada evento leva o `year` do mundo. Os assentamentos vão pelo id (índice em `eco.villages`, que nunca é reaproveitado), os reinos pelo id da capital, as espécies pelo índice em `eco.species`; -1 é "nenhum".

No `Ecosystem`, `events` é a fila (FIFO, vai no save), `emit(e)` empurra e `drainEvents()` entrega e esvazia. A fila tem limite de segurança (`EVENT_QUEUE_LIMIT` = 2048): se ninguém drena (testes, calibração), os mais antigos saem. Emitir só lê e empurra, sem sorteio nem mudança de estado; a impressão digital confere, e `events.test.ts` compara um mundo com a fila desligada com um mundo drenado a cada passo.

| Evento | Campos | Onde é emitido |
| --- | --- | --- |
| `found` | `village`, `from`, `how`, `x`, `y` | `foundVillage` (`eco/settlements/lifecycle.ts`): toda fundação passa por ali |
| `colony` | `phase` (`depart`/`arrive`), `from`, `to`, `people`, `by` (`land`/`sea`) | Partida: `departColony` e `colonizeByLand` (`colonies.ts`), embarque em `ports.ts`. Chegada: `landColonists` (`boats.ts`) e o enxoval no `arrived` das caravanas (`caravans.ts`) |
| `farmstead` | `village`, `x`, `y` | `openFarmstead` (`colonies.ts`) |
| `migrate` | `family`, `from`, `to`, `people`, `cause` | `migrate` (`eco/people/migration.ts`), por família e na última leva; `seekRefuge` (`colonies.ts`) |
| `exodus` | `village`, `lack` | `exodusWithoutPlace` (`colonies.ts`) |
| `abandon` | `village`, `to` | `abandon` (`lifecycle.ts`) |
| `merge` | `village`, `into` | `mergeInto` (`eco/settlements/polity.ts`) |
| `tierUp`, `tierDown` | `village`, `tier` | `updateTier` (`eco/settlements/form.ts`) |
| `polity` | `village`, `polity`, `was`, `places` | `updatePolities` (`polity.ts`) |
| `era` | `village`, `era`, `first` | `updateVillages` (`lifecycle.ts`), na virada de era |
| `tech` | `village`, `tech`, `first`, `lost` | `learn` e o esquecimento no colapso (`eco/economy/tech.ts`) |
| `warStart`, `warEnd` | `a`, `b`, `target`, `motive`, `naval`/`years` | `startWar` e `endWar` (`eco/war/war.ts`): todas as guerras passam por ali |
| `conquest` | `winner`, `loser`, `village`, `razed` | `conquer` e `exterminate` (`war.ts`), paz com cessão em `makePeace` (`eco/politics/diplomacy.ts`) |
| `revolt` | `village`, `against`, `cause` | `revolts` (`eco/economy/year.ts`, instabilidade) e `updateLoyalty` (`eco/community/relations.ts`, lealdade) |
| `independence` | `village`, `from` | `newKingdom` (`diplomacy.ts`): revolta, lealdade e sucessão |
| `annex` | `village`, `from`, `to` | `updateLoyalty` (`relations.ts`) e `vassals` (`diplomacy.ts`) |
| `disaster` | `what`, `x`, `y`, `village` | Eventos do mundo em `src/sim/events.ts` (cometa, terremoto, vulcão, ilha, incêndio, seca, peste), raio em `burn` e lugar tragado em `sweep` (`eco/world/disasters.ts`), epidemia em `epidemics` (`eco/people/society.ts`) |
| `extinction` | `species` | `kill` (`eco/core/entities.ts`) |

A crônica continua com o texto longo, e cada linha ganhou `villages`: os ids do lugar onde aconteceu (quando `at` é um assentamento) e dos citados pelo nome no texto, preenchidos em `note()`. A janela do assentamento (`src/client/surface/settlementWindow.ts`) acha a história pelo id; só as linhas de saves antigos, sem `villages`, ainda são procuradas pelo nome.

No cliente, o `SimDriver` drena a fila depois dos passos de cada quadro (e dos comandos do quadro sem passo) e entrega pelo seu `bus`, um `EventBus` (`src/client/surface/EventBus.ts`) com `on(kind, fn)` e `onAny(fn)`. Hoje há dois consumidores:

- **Avisos** (`src/client/surface/hud/notices.ts` e `hud/Toast.ts`): fundação, colônia, guerra e a primeira era do mundo viram uma linha no balão. Os avisos do jogador passam na frente, e o aviso do motor sobre um comando inválido agora volta no resultado do comando (`CommandResult.hint`) em vez de ficar em `eco.hint` para o cliente ler e limpar.
- **Janela do assentamento** (`hud/SettlementView.ts`): Dirty Flag em vez de consulta por tempo. Fica suja por um evento que envolve o lugar (`eventVillages`), por linha nova na crônica (aba História) ou pelos passos da simulação (abas de números). Na pausa, não é refeita.

### Vista de leitura

`EngineView` é o subconjunto que o cliente lê: os arrays SoA das criaturas (`x`, `y`, `kind`, `alive`, `village`, `role`, `uid`...), `species`, `villages`, `chronicle`, `wars`, `boats`, `caravans`, `effects`, as ruas e casas por tile, `map`, `year`, e as consultas `pick`, `pickAll`, `findUid`, `activityOf`, `tierName`, `polityName`, `settlementAt`, `siteField` e `siteAt`. É só leitura por contrato. O TypeScript não tem array tipado readonly, mas quem muda o mundo é só `apply`.

As duas consultas de onde assentar servem à camada de depuração do campo de sítios e devolvem dado puro, pronto para o `postMessage`:

- `siteField()` dá `{ cols, rows, cell, score, version }`: a nota de cada célula de 16×16 tiles (`SITE_NONE` no mar) e uma versão que sobe só quando alguma nota muda. A fachada guarda uma cópia das notas e compara a cada chamada (Dirty Flag por comparação, algumas mil células), então o motor não precisou de contador. Antes de o campo existir (mundo sem povos), dá null; a consulta não cria o campo.
- `siteAt(x, y, from?)` dá o que os batedores veem no tile (`siteLook`), a nota (`siteValue`), a parte de cada fator nela (`parts`, que somam a nota), a nota mínima das colônias e o veto (`siteFilter`). Quem funda é o lugar `from` ou, sem ele, o lugar vivo mais perto, com o motivo `espaço`. As partes saem da própria `siteValue` (a nota menos a nota com o fator no neutro), sem repetir a fórmula. O exame lê os rótulos dos corpos d'água; se eles estão sujos, a consulta os refaz e depois devolve os antigos, para não adiantar o que o passo faria.

Hoje a vista é um objeto próprio (`LiveView`, em `engine.ts`) que lê o `Ecosystem` vivo campo a campo, sem cópia, e troca de mundo no `restore`. Antes ela era o próprio `Ecosystem`; ficou separada para a fachada ter consultas suas sem mexer no motor. Dois avisos ficam fora da fila por serem síncronos e quentes (`EngineHooks`): `tileChanged`, o tile que mudou (dezenas de milhares por passo quando a mata cresce; a tela só marca o que repintar), e `species`, a variante nova que entra no catálogo.

### O que o cliente ainda acessa direto do Ecosystem

Já passam pela fachada: o `SimDriver` (passos, vista para interpolar, eventos), todos os comandos, inclusive a vista, os ganchos de tile e de espécie, e os avisos do motor. Ainda leem o `Ecosystem` direto (pela ponte `ecosystemOf(engine)`, que é dívida a pagar antes do Worker):

| Arquivo | O que lê |
| --- | --- |
| `src/client/state.ts`, `src/save/game.ts` | `GameState.ecosystems` guarda o `Ecosystem` (o save usa o retrato dele) |
| `src/client/surface/SurfaceMode.ts` | `eco` público para `?debug` e `tools/capture-settlements.mjs`; `villages`, `findUid` e `autoEvents` nos cliques do painel; `shake` e `effects` no desenho; os arrays das criaturas para a grade do desenho |
| `src/client/surface/SpriteCollector.ts` | Arrays das criaturas, assentamentos, barcos, caravanas, carcaças, efeitos e ruínas |
| `src/client/surface/MapRaster.ts` | Ruas, casas, muralhas e ruas principais por tile; `settlementAt` |
| `src/client/surface/overlay.ts` | Contornos (`villageContour`), territórios, guerras |
| `src/client/surface/selection.ts` | `pick`, `pickAll`, `pickRect`, `villageAt` e os arrays da criatura fixada |
| `src/client/surface/settlementWindow.ts` | Quase tudo de um assentamento (economia, moradores, prédios, relações, crônica) |
| `src/client/surface/hud/*.ts` | `InfoCard` (a ficha), `Windows` (crônica, reinos, espécies, itens, mundo), `SidePanel`, `Toolbar`, `Minimap`, `Labels`, `SettlementView`; `HudComponent.tick` recebe o `Ecosystem` |
| `src/client/surface/weatherView.ts` | `eco.weather` (clima vivo) |
| `src/client/surface/tools.ts` | `ToolContext.eco`: as ferramentas leem o mundo para montar o comando |

Nenhum desses arquivos escreve mais no `Ecosystem`. As últimas escritas, `eco.focus` e `eco.pinned` (agora comando `view`), `eco.onTileChanged` e `eco.onSpecies` (agora `setHooks`) e `eco.hint = ''` (agora `CommandResult.hint`), saíram nesta etapa. Sobra um efeito colateral: `pick`, `pickAll` e `pickRect` refazem a grade espacial do motor (ver as regras de determinismo).

## Regras de determinismo

1. **Semente mais log.** O mundo é função da semente do planeta (`seedFor('<id>:life')`), do `yearSpan` e do log de comandos do `SimDriver` (passo e comando, `LOG_LIMIT` = 4096), **inclusive os de vista**. Nos testes e na calibração não há vista (`focus` nulo), e por isso a impressão digital não depende da tela.
2. **Passo fixo.** O jogo sempre chama `step(SIM_STEP)` com `SIM_STEP` = 0,25 s, o mesmo `dt` da calibração e dos testes longos, em qualquer velocidade. A velocidade muda quantos passos cabem no quadro (com teto de `MAX_STEPS_PER_FRAME` = 3 passos; o que passa disso é descartado e o jogo desacelera) e não o tamanho do passo. O desenho interpola entre o passo anterior e o atual (`alpha`).
3. **Comandos só na fronteira.** O `SimDriver` aplica a fila antes do próximo passo, ou no fim do quadro quando nenhum passo roda. Nada do cliente muda o mundo no meio de um passo.
4. **Fluxos de sorteio.** Cada subsistema tem o seu gerador, todos derivados da semente (`streams` em `src/sim/stochastic.ts`): `vida` (fauna e vegetação), `povos`, `politica`, `mundo` (eventos), `terreno` (jazidas), `clima`, `saber` (técnicas) e `mente` (IA das pessoas). Um sistema novo não muda a sequência dos outros. O estado de cada gerador vai no save. `Math.random` só aparece no cliente (o tremor da câmera).
5. **Emitir não é agir.** `emit`, `note` e as consultas da vista não sorteiam nada.
6. **Rede de segurança.** `src/sim/fingerprint.calib.ts` roda três mundos fixos por 200 anos (com povos, só fauna, e com vista) e compara a impressão digital com `fingerprint.baseline.json`. Uma refatoração sem mudança de comportamento mantém a impressão idêntica.

O que ainda vaza: as consultas `pick`, `pickAll` e `pickRect` (seleção e ficha, a cada quadro com o mouse no mapa) refazem a grade espacial do motor (`buildGrid`). O passo refaz a grade logo no começo, mas o fogo natural do verão (`wildfires`, `burn`) roda antes disso e usa a grade como estiver. Com o mouse no mapa, a grade é a das posições de agora; sem ele, é a do começo do passo anterior. O replay só é exato sem consultas entre passos. Há duas correções possíveis: dar às consultas uma grade própria, ou refazer a grade antes do fogo. A segunda muda a impressão digital e pede regravar o baseline.

## A classe parcial do Ecosystem

O `Ecosystem` (`src/sim/ecosystem.ts`) guarda o estado (todos os campos), o construtor, a crônica (`note`), a fila de eventos (`emit`, `drainEvents`) e o escalonador (`step` e `yearly`). Os métodos de cada domínio ficam em `src/sim/eco/<domínio>/*.ts`, como objetos literais com `this: Ecosystem`:

```ts
// src/sim/eco/settlements/polity.ts
export const polityPart = {
  mergeInto(this: Ecosystem, o: Village, v: Village): void { ... },
  updatePolities(this: Ecosystem): void { ... },
};
export type PolityPart = typeof polityPart;
```

`ecosystem.ts` junta os tipos à classe por merge de declaração (`export interface Ecosystem extends ..., PolityPart, ... {}`) e instala os métodos no protótipo logo depois da classe, não enumeráveis. O save lê a instância por reflexão (`Object.entries` em `src/save/snapshot.ts`): todo campo novo entra no save sem lista à mão, e nenhum método aparece nele.

Para acrescentar uma parte:

1. Criar `src/sim/eco/<domínio>/<parte>.ts` com `export const xPart = { ... }` e `export type XPart = typeof xPart`. Os métodos recebem `this: Ecosystem`.
2. Em `ecosystem.ts`, importar, pôr `XPart` na lista do `extends` e `xPart` na lista do laço que instala as partes.
3. Campos novos de estado ficam na classe, em `ecosystem.ts`, com comentário. Se o campo precisa de valor em saves antigos, ele vai em `fixAfterLoad` (`eco/core/save.ts`).
4. Constantes de equilíbrio vão em `src/sim/balance.ts`; as da estrutura, em `src/sim/eco/constants.ts`. Em laço quente, o valor é copiado para uma constante local ao carregar o módulo (o porquê está no topo de `ecosystem.ts`).
5. Um acontecimento que o cliente precisa saber é anotado com `this.emit({...})` no ponto único onde ele acontece. Antes, o tipo dele entra em `EngineEvent`.
6. Rodar a impressão digital: uma parte nova que só reorganiza código não pode mudá-la.

## Os 19 padrões no código

| Padrão | Onde vive hoje | O que falta |
| --- | --- | --- |
| **Command** | `src/sim/api/commands.ts` (`EngineCommand`, `applyCommand`, `TileJournal` para o desfazer); fila e log no `SimDriver`; vista como comando (`viewCommand`); no espaço, `src/client/space/commands.ts` | O desfazer guarda o retrato do traço no cliente (`ApplyContext.journal`); com o motor no Worker, o motor devolve o `restoreTiles` |
| **Flyweight** | Espécie por índice (`kind[i]` aponta para `species`), bioma em `Uint8Array`, `SpriteAtlas` e a pixel art com cores trocadas (`src/client/surface/sprites.ts`, `art.ts`) | Nada |
| **Observer** | `EventBus` do cliente (`src/client/surface/EventBus.ts`); ganchos síncronos `EngineHooks` (`tileChanged`, `species`) | Mais consumidores: o mapa de influência, o luto, a ficha |
| **Prototype** | `makeVariant` (`src/sim/species.ts`): a espécie nova nasce de outra | Nada |
| **Singleton** | Evitado: só buffers de rascunho no módulo e a conexão do IndexedDB (`src/save/store.ts`) | Nada |
| **State** | A mão do jogador (`src/client/surface/toolStates.ts`, `ToolMachine`) e a pilha do Esc (`overlays.ts`); a ação dos bichos (`ACT` em `src/sim/eco/constants.ts`) é enum com switch, sem entrar e sair | State para a fissão do grupo (estável, tenso, cisma, partida) |
| **Double Buffer** | Posições do passo anterior no `SimDriver` (`prevX`, `prevY`) para interpolar | O `Weather` atualiza no lugar (viés pela direção do vento); o futuro mapa de influência precisa de dois buffers |
| **Game Loop** | `SimDriver` (`src/client/surface/SimDriver.ts`): passo fixo de 0,25 s, teto, acumulador e interpolação; `requestAnimationFrame` em cada modo (`src/client/mode.ts`) | No Worker, o relógio vai junto com o motor e o cliente só interpola |
| **Update Method** | `Ecosystem.step` por criatura; `Weather.step`; `HudComponent.tick` no HUD | Sistemas com relógio declarado (por passo, por segundo, por ano) |
| **Bytecode** | Não se aplica: as considerações da IA são funções (`src/ai/utility.ts`) | Nada |
| **Subclass Sandbox** | Os contextos do motor (`PlanContext` em `src/sim/plan.ts`, `RoleContext` em `src/sim/roles.ts`, `BuildContext` em `src/sim/eco/types.ts`); `ToolContext` e `HudComponent` no cliente | Nada |
| **Type Object** | `Species`, `TECHS` (`src/sim/progress.ts`), `BOATS` e `ERAS` (`src/sim/eco/constants.ts`), `ITEMS` (`src/sim/items.ts`), `ROLES` (`src/sim/roles.ts`) | Um tipo único de construção (`BuildingType`), em andamento em outra frente |
| **Component** | `SurfaceMode` e `SpaceMode` compostos de partes (`Viewport`, `SimDriver`, `MapRaster`, `SpriteCollector`, `hud/*`); o `Ecosystem` dividido por domínio (classe parcial) | O `Ecosystem` ainda é um objeto só; `Creatures`, `FaunaSystem` e `TradeSystem` no molde do `Weather` |
| **Event Queue** | `src/sim/api/events.ts` e `Ecosystem.events`/`emit`/`drainEvents`; a fila de comandos do `SimDriver`; `ProbeEvent` em `src/explore/probes.ts` | Crônica, luto e vitais como consumidores da fila em vez de chamadas diretas |
| **Service Locator** | Não usado, de propósito: são poucos serviços, e eles entram por parâmetro (`ToolContext`, construtores do HUD, `EngineHooks`) | Nada. Um locator esconderia a dependência que a fronteira quer deixar à vista |
| **Data Locality** | Criaturas em cerca de 40 arrays tipados SoA no `Ecosystem`; terreno e ruas por tile em arrays | Carcaças, barcos e caravanas ainda são objetos com `splice` |
| **Dirty Flag** | Tiles sujos do mapa (`src/client/surface/dirty.ts`, `MapRaster`); `HtmlSlot` no HUD; janela do assentamento suja por evento (`SettlementView`); caches do motor (`footprint` em `v.foot`, `lotCache`, `fieldCache`) | Painel e janelas ainda são refeitos por tempo |
| **Object Pool** | Lista livre dos slots de criatura (`eco.free`), sem geração; partículas em `src/client/surface/pool.ts`; vetores reaproveitados no espaço | Validar referências por `uid` (líder, caçada) |
| **Spatial Partition** | Grade de células com lista ligada no motor (`gridHead`, `gridNext`, `forEachNear` em `eco/core/entities.ts`); células ecológicas (`src/sim/eco/cells.ts`); `CreatureGrid` do desenho (`src/client/surface/spatial.ts`); octree das estrelas (`src/universe/manifest.ts`, `starIndex.ts`) | Índice vila→moradores; grade própria para as consultas do cliente (ver determinismo) |

## Caminho para a separação

**Etapa 1: motor num Web Worker.** O `SimDriver` e o motor vão para o Worker. O cliente manda comandos por `postMessage` e recebe, a cada passo ou quadro, os eventos drenados e o que mudou.

Já está pronto:

- comandos e eventos são dados puros, e os testes conferem a ida e volta em JSON;
- a fachada `Engine` concentra a entrada, a saída e o relógio;
- a vista entra como comando, e o relógio é de passo fixo com log;
- os avisos do motor voltam no resultado do comando;
- o retrato do mundo (`snapshot`/`restore`) é `structuredClone`, o mesmo formato que o `postMessage` usa;
- a geração do terreno já roda num Worker (`src/procgen/surface.worker.ts`);
- o teste de fronteira garante que o motor não depende do navegador.

Falta:

- **A vista de leitura.** Hoje ela é o próprio `Ecosystem`. No Worker, os arrays das criaturas podem ir num `SharedArrayBuffer` (o que pede *cross-origin isolation* no servidor: cabeçalhos COOP e COEP), ou numa cópia por passo transferida com `postMessage(…, [buffers])`. O resto (assentamentos, guerras, crônica) iria em diffs, ou num retrato completo a cada N passos.
- **Os ganchos síncronos.** `tileChanged` vira uma lista de tiles sujos por passo, mandada junto com os eventos, e `species` vira um evento.
- **As consultas.** `pick`, `pickAll`, `activityOf`, a ficha e a janela do assentamento passam a ser pedidas ao Worker, de forma assíncrona, ou calculadas no cliente sobre a cópia da vista. As que mudam a grade (`pick`) deixam de mexer no motor.
- **O HUD.** A tabela "o que o cliente ainda acessa direto" é a lista de trabalho: cada arquivo passa a ler `EngineView`, e a ponte `ecosystemOf` sai.
- **O desfazer dos pincéis.** O `TileJournal` vai para o motor, e o cliente pede o `restoreTiles`.
- **O save.** O `GameState` guarda o retrato (`EngineSnapshot`) em vez do `Ecosystem`.

**Etapa 2: servidor.** Com o motor atrás de mensagens, ele pode rodar num servidor (Node, sem DOM, como nos testes). O protocolo é o mesmo, com transporte por WebSocket. O determinismo (semente e log, passo fixo, fluxos de sorteio) permite três coisas:

- replay e verificação: o servidor refaz o mundo a partir do log;
- coop: vários clientes mandam comandos para o mesmo log;
- cliente leve: o cliente só interpola e desenha.

Antes disso é preciso fechar o vazamento das consultas na grade espacial e pôr o `yearSpan` no cabeçalho do log.
