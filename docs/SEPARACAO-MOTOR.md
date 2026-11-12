# Separar o motor de simulação do motor gráfico

Estudo de arquitetura · 01/11/2026

Quanto custa tirar a simulação da thread da tela (Web Worker), levá-la para um servidor, trocar o desenho ou usar o motor sem tela, e por onde começar. As referências arquivo:linha são de 01/11/2026 e envelhecem. **[conferido]** foi lido no código; **[estimativa]** é conta ou conhecimento não testado aqui.

## Resumo

1. **Dá para separar.** O motor (`src/sim` e `src/IAUS`, umas 24 mil linhas sem os testes) já é puro e roda no Node, e os comandos e os eventos já são dados. O que prende é a **leitura**: a tela ainda lê o `Ecosystem` vivo.
2. Só há um `ecosystemOf` em produção (`SurfaceMode.ts`), mas ele entrega o `Ecosystem` a 18 arquivos do cliente: umas 300 linhas com `eco.` e 42 métodos chamados na hora (`pick`, `settlementAt`, `activityOf`, `priceAt`...).
3. **Volume:** cerca de 150 KB por passo, 3 MB/s em 5x **[medido na Terra em 100 anos; a estimativa era 0,5 MB e 10 MB/s; ver seção 2]**. Cabe em `postMessage` com buffers transferidos, sem `SharedArrayBuffer`. Os assentamentos não podem ir inteiros a cada passo: vão em projeção, por versão ou por assinatura.
4. **Esforço:**
   - motor sem tela: P a M, 3 a 6 dias;
   - Worker: G, 18 a 25 dias;
   - tela trocável: M na superfície, M a G no espaço;
   - servidor: G+, só depois do Worker.
5. **Ordem recomendada:**
   1. proteções;
   2. motor sem tela;
   3. Worker em duas metades: primeiro o cliente lê só dados serializáveis no mesmo processo, depois entra o Worker de verdade, sem `SharedArrayBuffer`.

## 1. O acoplamento de hoje [conferido]

### Quem lê o mundo vivo

| Onde | O que lê | Consultas síncronas |
|---|---|---|
| `src/client/surface/SurfaceMode.ts` | O único `ecosystemOf` de produção (as outras chamadas estão em testes). O `eco` vai para `MapRaster`, `WeatherView`, `Selection`, `MapOverlay`, o contexto das ferramentas e todo `tick(eco)` dos componentes do HUD | `findUid` |
| `SpriteCollector.ts` | Criaturas, lugares, jazidas, ruínas, pedágios, barcos, caravanas, carcaças e efeitos, a cada desenho | `materialOf`, `camp`, `underWork`, `kingdomSize`, `season`, `mounted` |
| `MapRaster.ts` | `road`, `built`, `wall`, `mainStreet` | `settlementAt`, por tile de rua repintado |
| `selection.ts` | A criatura fixada | `pick` (todo quadro), `pickAll`, `pickRect`, `villageAt`, `settlementAt` |
| `hud/InfoCard.ts` | A ficha inteira | `villageAt`, `floraAt`, `store`, `activityOf`, `pickAll`, `familyOf`, `tiesOf`, `dayOf`, `rates`... |
| `settlementWindow.ts` | Quase tudo do lugar | `leaderOf`, `knows`, `latent`, `priceAt` e mais umas 15 |
| `hud/component.ts` | `tick(eco: Ecosystem)` em Windows, SidePanel, Labels, Minimap, Toolbar, Toast e SettlementView | `kingdomStock`, `relation`, `allied`, `warOf`... |
| `overlay.ts`, `weatherView.ts`, `tools.ts` | Contornos, clima vivo, `ToolContext.eco` | `villageContour`, `weatherAt`, `settlementAt` |
| `state.ts` | `ecosystems: Map<string, Ecosystem>` | |
| `tools/capture-settlements.mjs` | **Escreve** no mundo: `foundVillage`, `step`, `yearSpan`, `watch` | |

Já passam só pela fachada: `SimDriver`, `notices`, `trails`, `siteView` e o painel de depuração (`hud/DebugPanel.ts`).

### Objetos mutáveis dos dois lados

- **`SurfaceMap`.** O motor escreve vegetação e bioma (`eco/flora/growth.ts`), muda o relevo no `terraform` e cria `map.felled`. A tela pinta lendo esse mesmo mapa, que também fica em `state.surfaces`.
- **`Species`.** O catálogo do cliente guarda os mesmos objetos de `eco.species`, e o motor os muda em `adaptNatives` (`eco/fauna/space.ts`). O comando `introduce` leva o objeto do cliente para dentro do motor.
- **`TileJournal` (desfazer).** O motor escreve no diário que o cliente passa (`commands.ts`).
- **Grade de vizinhança.** `pick` e `pickAll` refaziam a grade da simulação, e o fogo do ano a lê antes de o passo refazê-la: o mouse sobre o mapa mudava o mundo. **Corrigido** (`eco/core/queries.ts`, `withFreshGrid`; teste em `src/sim/api/pick.test.ts`).
- **Caches que entram no save.** `lotCache`, `v.area` e `v.foot` são preenchidos por consultas. A vista de depuração os guarda e devolve (`untouched` em `src/sim/api/debugView.ts`); qualquer leitor novo precisa do mesmo cuidado.
- **Arrays realocados.** `grow()` dobra e troca os cerca de 45 arrays das criaturas (`eco/core/entities.ts`). Quem guarda a referência fica com o array velho.

### Ganchos síncronos

`EngineHooks` (`engine.ts`) liga `onTileChanged` (53 pontos em 18 arquivos do motor; a tela só marca o tile para repintar) e `onSpecies` (refaz as ferramentas).

### O caminho do save

O autosave roda a cada 20 s, no `visibilitychange` e no `pagehide` (`main.ts`). O `SaveManager.save` chama `snapshotGame`, que roda `snapshotEcosystem` sobre cada `Ecosystem` vivo do `GameState` (`save/game.ts`). É uma leitura por reflexão, sem cópia; quem copia é o IndexedDB no `put`. O `Engine.snapshot()` existe, mas o save não o usa.

### O modo do espaço

Não tem fachada nem passo fixo, e é tela com regras puras, de um jogador só:
- **Nave:** `ShipController` muda `GameState.shipPos` e a `velocity` (`THREE.Vector3`), com o `dt` do quadro.
- **Sondas:** `stepProbes` é puro (`explore/probes.ts`), mas a tela o chama com o `dt` do quadro, e ele só anda no espaço.
- **Órbitas:** função pura do tempo (`nav/planets.ts`).

Num coop, a nave pediria uma autoridade à parte.

## 2. Volume de dados

**[conferido]:**
- O mapa da Terra tem 1024×512 = 524.288 tiles; o máximo é 2048×1024.
- A `EngineView` expõe 14 arrays por criatura, 39 bytes por criatura.
- O passo é de 0,25 s: 4, 8 e 20 passos por segundo em 1x, 2x e 5x.
- A vegetação mexe em cerca de 2.600 tiles por passo.
- O campo de sítios tem 64×32 células, e a crônica, no máximo 400 linhas.

**[medido em 05/11/2026]**, com `src/sim/frame.calib.ts`: a Terra com raio 1 (1024×512), semente 1234, 6 aldeias semeadas, 100 anos e 2.400 passos, sem tela. O teste de orçamento `src/sim/api/frame.test.ts` confere a ordem de grandeza num mundo menor.

| O que | Média | p95 | Máximo |
|---|---|---|---|
| Slots de criatura (`count`) | 3.401 | 3.702 | 3.712 |
| Tiles sujos por passo | 1.199 | 1.719 | 4.053 |
| Barcos, caravanas e efeitos (KB, JSON) | 6,7 | 12,5 | 15,6 |
| Todos os lugares vivos (KB, JSON; lido uma vez por ano) | 463 | 862 | 909 |
| O maior lugar (KB, JSON) | 49 | 80 | 82 |
| **Por passo: criaturas, tiles e listas (KB)** | **148** | **161** | **171** |

Mundos mais velhos ou mais povoados, e o crescimento com o jogador soltando espécies, ficam sem essa medida. Medir a cena `terra-cidade` ou 400 anos antes de dimensionar o transporte.

| O que a tela lê | Frequência | Bytes por passo |
|---|---|---|
| Criaturas (14 arrays, ~3,4 mil slots) | por passo | ~130 KB, medido (só x e y: ~27 KB). Antes: ~470 KB, estimados com 12 mil slots |
| Tiles sujos (índice, vegetação, bioma e `felled`; ~1,2 mil) | por passo | ~12 KB, medido; 40 KB no pico. Antes: 10 a 30 KB |
| Barcos, caravanas e efeitos | por passo | ~7 KB, medido; 16 KB no pico. Antes: 5 a 20 KB, com carcaças e ruínas, que não estão na medida |
| Projeção de desenho dos lugares (posição, era, cor, reino, contorno; casas só quando mudam) | quando muda | 5 a 15 KB [estimativa] |
| Lugar inteiro (114 campos com casas, `ledgers` e `history`) | só a janela aberta, 4 Hz | até 82 KB cada, medido. Antes: 10 a 30 KB |
| Ruas, casas e muralhas por tile | quando muda | poucos KB (2 MB na carga) [estimativa] |
| Campo de sítios e clima | por versão; 1 a 2 Hz | 8 KB; 25 a 100 KB [estimativa] |
| Carga inicial (mapa e arrays por tile) | uma vez | ~33 MB [estimativa] |

Os arrays tipados vão por buffers transferidos, com uma piscina de ida e volta, por menos de 1 ms por passo. O caro é o `structuredClone` de listas de objetos.

## 3. Os caminhos

### A. Motor num Web Worker (G, 18 a 25 dias)

**Relógio e latência.** O `SimDriver` continua sendo o relógio no cliente (velocidade, teto de passos e log). A cada quadro ele manda `{avançar: n, comandos}` ao Worker e recebe o quadro. A latência é de um quadro, escondida pela interpolação.

**Como ficam as consultas síncronas de hoje:**
- **No cliente, sobre a cópia:** `pick`, `pickAll`, `pickRect` e `findUid` (com a `CreatureGrid` de `spatial.ts`); `settlementAt`, `villageAt`, `radius`, `kingdomSize`, `season`, `camp`, `underWork` e `mounted`, pela projeção dos lugares. Para não divergir, essas contas viram funções puras exportadas do `sim` e usadas dos dois lados.
- **Por assinatura (`inspect`):** um pedido fora do log, que não muda o mundo. Cobre a criatura escolhida, o lugar aberto, o tile sob o mouse e a janela aberta, e o Worker responde no ritmo do HUD. Isso pede dividir `InfoCard.ts` e `settlementWindow.ts` em dados (motor) e HTML (cliente).
- **Assíncronas:** `siteAt` e a vista de depuração. Hoje `engine.debug` é síncrona; no Worker vira assinatura, e os dados dela já são puros.
- **Ganchos:** `tileChanged` vira uma lista de tiles no quadro, e `species` vira um evento.
- **Desfazer:** o `TileJournal` vai para dentro do motor.
- **Save:** o `GameState` guarda `EngineSnapshot`, e o Worker grava no IndexedDB, que existe no Worker. No `pagehide` não dá para esperar a resposta, então podem se perder até 20 s.

**COOP e COEP:** `netlify.toml` e `vercel.json` só têm `Cache-Control`, e `vite.config.ts` não tem `server.headers`. As fontes do Google vêm de outra origem, e o IndexedDB não grava `SharedArrayBuffer`. Por isso, comece sem `SharedArrayBuffer`.

**Arquivos tocados:**
- motor: `engine.ts`, `commands.ts`, `events.ts`, e dois novos, `sim/api/protocol.ts` e `sim/api/frame.ts`;
- o Worker novo;
- cliente: `SimDriver.ts`, `SurfaceMode.ts`, `SpriteCollector.ts`, `MapRaster.ts`, `overlay.ts`, `selection.ts`, `weatherView.ts`, `settlementWindow.ts`, os componentes de `hud/`, `tools.ts` e `state.ts`;
- save: `save/game.ts` e `save/manager.ts`;
- ferramentas: `capture-settlements.mjs`.

**Riscos:** um tique de atraso no HUD, contas repetidas que podem divergir e uma cópia do mapa (~14 MB) nos dois lados.

**O que se ganha:** o passo sai da thread da tela, e o caminho do servidor fica pronto.

### B. Motor num servidor (G+, 4 a 8 semanas depois de A)

**Determinismo entre máquinas:**
- **[conferido]** Não há `Math.random`, `Date` nem `performance.now` nas contas do motor; a medição do painel não entra em conta nenhuma. Mas nenhum teste impede que entrem.
- **[conferido]** A ordem de `Map`, `Set` e das chaves de objeto é fixada pela especificação.
- **[conferido]** O comando `view` (a câmera) muda o nível de detalhe da simulação. Com duas câmeras, seria preciso juntar os focos no log.
- **[conferido]** O `yearSpan` fica fora do log, e o log tem limite de 4.096 comandos, sem ponto de retomada.
- **[estimativa]** Soma, multiplicação, divisão e `sqrt` são iguais em qualquer motor JS. `hypot`, `sin`, `cos`, `exp`, `atan2`, `log`, `pow` e `acos` são aproximadas a critério de cada motor: o V8 é coerente consigo, mas Firefox e Safari podem diferir no último bit.
- **[estimativa]** Um comparador de `sort` que devolve NaN dá ordem diferente em cada motor; há 35 `sort` no motor.

| | Lockstep | Estado autoritativo |
|---|---|---|
| Rede | Mínima (só comandos) | 50 a 150 KB/s por cliente, recortado pela vista **[estimativa]** |
| Pede | Resultado idêntico bit a bit entre navegadores; cada cliente roda tudo; entrar no meio pede um retrato de ~33 MB | Servidor Node com WebSocket; Netlify e Vercel são estáticos, então o servidor vai para outro host |
| Desync | Impressão digital a cada N segundos | Não se aplica |

Recomendado: estado autoritativo. É um jogo de deus, sem avatar, então não precisa de predição no cliente. A velocidade e a pausa compartilhadas viram decisão de design.

### C. Tela trocável

**Superfície (M, 6 a 10 dias).** Desenha sempre em Canvas 2D.
- **Emendas que já existem:** o `MapRaster` produz um buffer RGBA com blocos sujos, e o `SpriteCollector` monta uma lista de desenho (`SpriteLayer.push`).
- **Sem emenda:** `overlay`, `fx`, `trails`, `weatherView`, `siteView` e `softArt` pintam direto no Canvas 2D; rótulos e HUD são DOM.
- **Falta:** uma interface `SurfaceBackend` (chão, sprites e caminhos). Para um cliente nativo, o `SpriteCollector` ainda precisa de A, porque lê o `Ecosystem`.

**Espaço.** A interface `GameRenderer` (`renderer.ts`) cobre o WebGL e o `SoftRenderer`, mas é tipada em three.
- **WebGPU do three (M, 5 a 10 dias):** portar para TSL os shaders GLSL de `starField.ts` e `bodies.ts`.
- **Outro motor ou cliente nativo (G):** é reescrever umas 4.600 linhas; o `ShipController` mistura a matemática do three com as regras de voo.

### D. Motor sem tela como biblioteca (P a M, 3 a 6 dias)

**Já existe:**
- o teste de pureza;
- `calibrate.ts` (`seedWorld`, `runWorld`, `indicatorsOf`);
- a impressão digital com baseline e as calibrações;
- `tools/tune.mjs`;
- a base do replay em `commands.test.ts` e em `SimDriver.test.ts` (o caso copiado do painel refaz o mesmo mundo).

**Falta:**
- rodar sem o vitest;
- a calibração passar pela fachada;
- um formato de log (semente, `yearSpan`, versão, comandos com o passo) e um comando de replay fora dos testes.

**Ganha:** reproduzir bugs pelo "Copiar caso" do painel, ajustar mais rápido e a base do servidor.

## 4. Recomendação

**Ordem:**
1. proteções;
2. D (o log e a entrada no Node);
3. A1: o cliente lê só dados serializáveis, no mesmo processo, com um transporte local que faz `structuredClone` de cada mensagem;
4. A2: o Worker de verdade;
5. C na superfície, se precisar;
6. B só se houver decisão de fazer coop.

**Primeiros passos:**
1. **Teste-catraca (0,5 dia).** Conta no `src/client` de produção as chamadas a `ecosystemOf(`, os arquivos que importam `Ecosystem` e as linhas com `eco.`, e só deixa os números caírem.
2. **Pureza ampliada (0,5 dia).** `purity.test.ts` passa a proibir `Math.random`, `Date.now`, `new Date` e `performance.now` nas contas do motor. A medição do painel fica na lista de exceções.
3. ~~Fechar o vazamento do `pick`~~ **(feito: `withFreshGrid`, teste em `src/sim/api/pick.test.ts`).**
4. **Ganchos viram dados (1 dia; feito).** A fachada junta os tiles sujos de cada passo (`drainTiles(): Int32Array`), e a espécie nova vira um `EngineEvent`.
5. **Medir os bytes (1 dia; feito).** Um `frame.calib.ts` roda a Terra com raio 1 por 100 anos e mede `count`, os tiles sujos por passo e o tamanho dos lugares, barcos e caravanas. Ele troca as estimativas acima por números e vira teste de orçamento.

Depois de A1, um teste de fumaça com o transporte local: 30 anos, com a impressão digital igual à de um mundo rodado direto.
