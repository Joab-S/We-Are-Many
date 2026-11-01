# Jogos de referência, outros planetas e a visão 3D do planeta

Estudo de design e arquitetura · 01/11/2026 · A lista de tarefas com as estratégias de cada etapa está em [`TODO-PLANETAS-E-3D.md`](TODO-PLANETAS-E-3D.md).

Três perguntas: como os jogos de referência tratam cada problema que enfrentamos aqui; como começar a exploração de outros planetas; e como chegar a uma visão 3D contínua ao se aproximar do planeta, como em Spore e No Man's Sky. As referências ao código são da branch `claude/painel-depuracao` (commit `3577d28`) e envelhecem. **[conferido]** foi lido no código ou na fonte citada; **[estimativa]** é conta ou dedução.

## Resumo

1. **Descer em outros planetas já funciona.** <kbd>F</kbd> em órbita de qualquer rochoso abre a superfície dele, gerada pelos parâmetros do planeta, com fauna nativa e, em 0,8% dos casos, um povo inteligente. O que falta é o planeta ser **diferente da Terra** de verdade (clima, estações, ano, umidade) e haver **o que fazer lá** (custo, carga, tempo que passa).
2. **A superfície gerada já aparece na esfera em órbita.** O caminho para a visão 3D não começa do zero: começa por melhorar essa esfera e, depois, subdividi-la por distância.
3. **A técnica da visão 3D é bem documentada** (Kerbal, Spore, Elite, Outerra): esfera feita de um cubo com faces em quadtree, o **mesmo mapa de altura** nos dois níveis de detalhe, e uma fusão numa faixa de altitude. O nosso mapa 1024×512 com volta horizontal é um cilindro, que é o que o Civilization IV enrolava numa esfera para fazer o globo. A simulação continua na grade 2D; o 3D é uma função dela.
4. **Voxels como No Man's Sky não cabem** num jogo de navegador. WebGL2 com atmosfera de Bruneton (código BSD com demo em WebGL) cabe.
5. **Esforço:** correções baratas em 1 a 2 dias; esfera boa em 1 semana; quadtree com descida livre em 2 a 3 semanas; transição contínua até o mapa 2D em mais 1 a 2 semanas. Uma vista 2,5D no chão, ao estilo tribal do Spore, é um projeto à parte (G) e depende de `docs/SEPARACAO-MOTOR.md`.
6. **Três requisitos precisam ser revistos** antes: o pilar "a única troca de modo é a entrada na superfície 2D", o "pouso em 3D" na lista *Won't*, e o RF-SUP-02, que manda descartar o 3D inteiro ao entrar no 2D.

## Parte 1: como os jogos de referência tratam cada problema

Fontes primárias quando existem (palestras, diários dos estúdios, código aberto); o que vem de fórum ou de dedução está marcado. A lista de links está no fim.

### 1.1 Onde assentar e quando sair

| Jogo | Como resolve | Fonte |
|---|---|---|
| Civilization IV (código aberto) | `AI_foundValue` soma rendimentos e recursos no raio da cidade, penaliza pela distância à cidade mais próxima e poda sítios vizinhos de valor parecido. Recalcular tudo por turno chegou a 43% do tempo da thread principal numa reimplementação | fórum, lendo o código |
| Civilization V/VI | "Fertilidade" do tile: rendimentos por anel com pesos 6/3/2, mais recursos e valor estratégico | fórum |
| Dwarf Fortress | Um teto global de sítios novos; cada sítio novo eleva o teto de população da civilização. Mundos fora dos mínimos são rejeitados e sorteados de novo, com o motivo num log | documentado |
| Victoria 3 | Migração por **atração** de cada estado mais **agitação** por povo. Em 1.6 passaram a mover pops inteiros e fundir na chegada, para limitar o número de entidades | documentado (DD#17, DD#105) |
| RimWorld | Não há povos fundando cidades; o narrador escolhe incidentes pela riqueza, colonos e tempo desde o último evento | documentado |
| Caves of Qud | História por máquina de estados e gramática, gerada de trás para frente | documentado (GDC 2018) |
| Mapas de influência | Dave Mark: o mapa **informa** a decisão, não a toma; Pottinger (Age of Empires): sítios de coleta por atração e repulsão numa grade | documentado |

**O que serve aqui.** A nossa nota de sítio por anéis com desconto por distância é a do Civ, e o campo de notas é o mapa de influência de Mark. A pressão social com fissão é o modelo do Vic3, e mover famílias inteiras também. Dá para copiar ainda: o **teto de população ligado ao número de sítios** (Dwarf Fortress), barato e com incentivo claro para fundar; e a **rejeição de semente** com log do motivo. Não cabe: a história com milhares de entidades do Legends.

### 1.2 Ecossistema, bioma e sociedade

| Jogo | Como resolve | Fonte |
|---|---|---|
| Eco | Cada planta tem faixas **ideal e extrema** de temperatura, umidade, água e poluição, como dados; o servidor guarda séries temporais das populações e mostra em gráficos e mapas de calor | documentado |
| Dwarf Fortress | Teto de população por bioma, extinção local e repovoamento lento | documentado |
| Rain World | Tabela de relações entre criaturas, objetos e lugares; as criaturas existem por si | documentado |
| Equilinox | "Mais jogo que simulação": vidas curtas e expansão limitada, para o ecossistema mexer em tempo de jogo | resposta do desenvolvedor |
| Spore | Pouca documentação técnica; o estágio tribal virou um mini-RTS e um estágio de cidade foi cortado | entrevistas |

**O que serve aqui.** A tabela de rendimento por bioma (`BIOME_YIELD`) está no caminho do Eco: faixas por espécie como dados. Vale acrescentar a **tabela de relações** (presa, predador, domesticável) por espécie em vez de regras no código, e o **teto por bioma com extinção local**. O painel de depuração já faz o papel dos gráficos do Eco. Não cabe: simular milhares de animais individuais; o nosso agregado por célula está certo.

### 1.3 Calibração e balanceamento

| Jogo | Como resolve | Fonte |
|---|---|---|
| Factorio | Estatísticas de produção de um jogo inteiro para fixar uma meta numérica (FFF-217); suíte de testes de determinismo e replays num servidor de build (FFF-60, 62); salvar e carregar sem mudar o resultado (FFF-270) | documentado |
| Victoria 3 | Telemetria da taxa de conclusão de conteúdo; "desequilíbrios não são inerentemente ruins" | documentado |
| Dwarf Fortress | Rejeição de mundos por mínimos, com log | documentado |
| The Sims | Os primeiros Sims eram bons demais em sobreviver e tiveram de ficar mais burros | entrevista |
| Civilization | FireTuner com Autoplay (a IA joga todas as civs por N turnos); nenhuma declaração oficial sobre rodadas automáticas | fórum |
| King (Candy Crush) | Bots que imitam jogadores para estimar dificuldade | documentado (GDC 2024) |

**O que serve aqui.** A nossa calibração longa é o ciclo do FFF-217: rodar mundos, agregar e ajustar contra metas. **Nenhum estúdio pesquisado documenta ajuste automático de constantes**; o nosso CMA-ES está além do que eles publicam. O que falta copiar do Factorio: um **teste de que salvar e carregar não muda o mundo** e a **rejeição de sementes** inviáveis. A lição dos Sims vale para a fome: um povo que nunca passa falta é chato.

### 1.4 Ferramentas de depuração no jogo

| Jogo | Como resolve | Fonte |
|---|---|---|
| RimWorld | Dev mode com *Tweak Values* (constantes ao vivo), *Debug actions* (disparar eventos), camadas e "pausar no erro" | documentado |
| Factorio | F4 com tempo por sistema; **replay gravado junto do save** | documentado |
| Dwarf Fortress | Legends mode navega toda a história; exporta XML | documentado |
| Minecraft | F3 com estado do jogo à esquerda e sistema à direita | documentado |
| Civilization VI | FireTuner com console Lua e painéis | fórum |

**O que serve aqui.** O painel F3 cobre o Minecraft e parte do Factorio. Os próximos passos naturais: **constantes ao vivo** e **botões de evento** no painel, passando pelo log de comandos para o replay continuar valendo (RimWorld); o **replay gravado com o save** (Factorio), que depende do item "motor sem tela" de `SEPARACAO-MOTOR.md`; e um **modo lendas** como visualizador do log de eventos, com exportação.

### 1.5 Motor separado da tela, determinismo e multijogador

| Jogo | Como resolve | Fonte |
|---|---|---|
| Factorio | Lockstep determinístico: só as entradas trafegam, todos simulam o mesmo tick, CRC por tick detecta dessincronização; o cliente mais lento trava todos | documentado (FFF-76, 47, 188, 415) |
| Age of Empires | "1500 archers on a 28.8": turnos de comunicação de 200 ms, comandos agendados dois turnos à frente, checksums | documentado (GDC 2001) |
| Supreme Commander | Thread da simulação separada da de desenho; dessincronizações em ARM por sin e cos de hardware | fórum da FAF |
| Cities: Skylines II | Simulação em ECS e desenho em HDRP; a interação ruim entre os dois foi o problema | documentado e entrevista |
| Minecraft | Cliente e servidor mesmo em um jogador só; 20 ticks por segundo | documentado |
| RimWorld | Sem multijogador por decisão de design; um mod aberto prova que a simulação é quase determinística | documentado |

**O que serve aqui.** Semente mais log de comandos é lockstep pronto. O que falta, e vale pouco esforço: um **hash por tick** (já existe a impressão digital, basta expô-la num intervalo) e o replay. Armadilhas documentadas: ponto flutuante entre máquinas (as funções `sin`, `cos`, `hypot`, `exp` não são garantidas iguais entre motores JS) e threading. O caminho e o custo estão em `SEPARACAO-MOTOR.md`.

### 1.6 Chegada ao planeta e visão 3D

| Jogo | Como resolve | Fonte |
|---|---|---|
| Kerbal Space Program | Esfera por **cubo subdividido em quadtree** (PQS). A esfera de baixo detalhe (ScaledSpace, 1:600 000) e o quadtree mostram **o mesmo mapa de altura**, com **fusão por dither** numa faixa de altitude (`fadeStart`, `fadeEnd`). No KSP2 as posições da malha são relativas à origem flutuante | documentado (Developer Insights #12) |
| Spore | Planeta por **cube map** ("o melhor compromisso": distorção nos cantos, não nos polos); textura por mapa de controle derivado do relevo (nível da água, inclinação, curvatura) | documentado (SIGGRAPH 2007, *Creating Spherical Worlds*) |
| No Man's Sky | Voxels em octree com poligonização, textura, população e simulação em cadeia contínua; motor C++ próprio | documentado (GDC 2017, McKendrick) |
| Elite Dangerous | Cubos com faces projetadas na esfera; o terreno do Odyssey sai de forma determinística dos valores da Stellar Forge | recapitulação da Frontier |
| Star Citizen | Terreno gerado sob demanda a partir de temperatura e umidade, sem texturas pré-cozidas | documentado (CitizenCon 2019) |
| Starfield (contraexemplo) | Superfície e espaço são "duas realidades"; o pouso é animação e carregamento | entrevista |
| Civilization IV | O mapa cilíndrico era **enrolado numa faixa da esfera**, com calotas falsas | fórum |
| Técnica | Ulrich, *Chunked LOD*: quadtree, erro projetado na tela, **saias** nas emendas e geomorph; Bruneton, *Precomputed Atmospheric Scattering* (BSD, demo WebGL); Cesium (erro de 2 px, saias sempre); 3DTilesRendererJS (quadtree com streaming em three.js) | documentado |

Correções de premissa que a pesquisa achou: não existe palestra "GDC 2007" de Chris Hecker sobre planetas do Spore; o trabalho está no sketch *Creating Spherical Worlds* (SIGGRAPH 2007). A palestra técnica de Sean Murray é de 2017, não de 2015.

**O que serve aqui** está na Parte 3. O que não serve: voxels (memória e geração) e streaming de dezenas de GB.

## Parte 2: exploração de outros planetas

### O que já existe [conferido]

- **Parâmetros.** `PlanetData` → `planetParams` (`src/client/space/bodies.ts:23-32`) → `PlanetParams`: id, nome, raio, temperatura, água e vida. Vêm de três fontes: os 8 do Sistema Solar (`nav/planets.ts:37-46`), 12 exoplanetas reais numa lista feita à mão (`nav/systemGen.ts:93-114`) e os procedurais por semente da estrela (`systemGen.ts:162-237`), de 0 a 7 por sistema, com tipo pela linha de gelo.
- **Geração.** `generateSurface` (`src/procgen/surface.ts:78-148`): placas por Voronoi, nível do mar pelo quantil `water`, clima com chuva pelo vento, biomas por Whittaker. O tamanho segue o raio (`mapSizeFor`): Terra 1024×512, Marte 544×272, teto 2048×1024. Tudo sai do id, então o mesmo planeta sai igual em qualquer resolução.
- **Vida nativa.** `lifePotential` só é maior que zero com água ≥ 0,15 e 248 a 328 K. `nativeLifeTier` sorteia: 25% só plantas, 8% animais, e desses 10% com um povo inteligente (0,8% do total). Os alienígenas (`alienFauna`) ganham massa, velocidade e ninhada pela gravidade do raio. Os inteligentes alienígenas recebem de 2 a 6 aldeias.
- **O jogador.** As mesmas ferramentas em todo planeta, sem custo. `knownSpecies` vale para o jogo inteiro: dá para soltar uma espécie de um planeta em outro, inclusive alienígenas na Terra. As sondas extraem metais, silicatos, gelo e raros por planeta, mas o porão não tem consumidor.
- **Save.** Por planeta, o `SurfaceMap` inteiro (uns 13 MB para a Terra, 50 MB no teto) e o retrato do `Ecosystem`. O planeta para no tempo quando não é observado.

### O que falta

**A Terra escondida em todo planeta** (`SurfaceMode`, `procgen/climate.ts`, `sim/weather.ts`):

| Suposição da Terra | Onde | Efeito em outro planeta |
|---|---|---|
| Temperatura `T + 22 − 55·lat² − 30·altitude` com constantes fixas | `surface.ts:151-157` | O gradiente polo-equador é sempre o da Terra |
| Umidade **equalizada** para 0,04 a 0,96 | `climate.ts:202-220` | Um planeta sem água tem a mesma umidade que a Terra, e pode fechar mata |
| Ventos em faixas fixas de latitude | `climate.ts:86-90` | Não dependem da rotação |
| Estações com amplitude por latitude, **os dois hemisférios com verão ao mesmo tempo** | `weather.ts:112-116` | Sem inclinação do eixo, sem hemisfério sul |
| Ano de 12 s na tela e 6 s de ação em todo planeta | `tools.ts:67`, `eco/constants.ts:11` | Não se liga ao período orbital |
| Faixa de temperatura da Terra no peixe, no tubarão e no povo inteligente | `species.ts:67-73` | Só os herbívoros alienígenas são adaptados ao clima |
| Metas e constantes de equilíbrio calibradas na Terra | `calibrate.ts`, `balance.ts` | Num planeta frio ou seco, quase toda meta de povo fica vermelha |
| Ruído amostrado num cilindro, polos sem ligação | `surface.ts:90-100` | Na esfera, a linha polar inteira vira um ponto |

**O que fazer lá.** Nada custa, nada se leva e nada acontece enquanto não se olha. As sondas e o porão existem, mas não se ligam à superfície.

### Roteiro

**A. O planeta deixa de ser a Terra disfarçada (M, 1 a 2 semanas).**
1. `PlanetParams` ganha estrela (tipo e luminosidade), inclinação do eixo, dia, período e atmosfera. Sobe `SAVE_VERSION`; planetas já visitados mantêm o mapa salvo, que carrega os próprios parâmetros.
2. Temperatura, estações e vento por planeta: hemisférios opostos pela inclinação, amplitude pela inclinação e pela atmosfera, gradiente pela luminosidade. Um teste de clima por planeta (Marte, um mundo de maré, um oceano quente).
3. Umidade sem equalização global num planeta seco; nível do mar por volume, não por quantil, quando `water` é pequeno.
4. As faixas de temperatura dos modelos (peixe, tubarão, inteligente) centradas no planeta, como já é para os herbívoros.

**B. Vida e metas por planeta (M, 1 semana).**
1. Metas de calibração relativas à **área habitável** do planeta (fração de tiles com `isLand` e temperatura na faixa), em vez de contagens absolutas da Terra. O painel F3 passa a mostrar as metas certas em qualquer planeta.
2. Uma calibração curta em 2 ou 3 planetas tipo (frio, seco, oceano quente) com um povo alienígena semeado, para achar o que quebra.
3. Rejeição de semente com log (Dwarf Fortress): um planeta "com inteligentes" que não sustenta uma aldeia por 50 anos troca o sorteio.

**C. O que fazer lá (M a G, 2 a 3 semanas).**
1. **Levar e trazer custa.** Soltar uma espécie em outro planeta pede carga no porão (a sonda já extrai) e tempo de viagem. A espécie fora da faixa de temperatura dela morre, e o painel diz por quê.
2. **O tempo passa nos planetas que não estão sendo olhados.** Duas opções: congelar (hoje) ou **pôr em dia** ao voltar: a simulação sem tela roda os anos perdidos num Worker, com teto de tempo. A segunda é o motivo mais concreto para o item "motor sem tela" de `SEPARACAO-MOTOR.md`.
3. **Um motivo para voltar:** o povo alienígena avança de era sozinho e manda sinais; um planeta pode "pedir" terraformação pelos indicadores (fome, calor).
4. Gigantes gasosos (RF-SUP-14): luas, não superfície. Fica para depois.

**Decisões para tomar antes de A:** se o tempo passa nos planetas não observados; se as espécies viajam entre planetas de graça ou com custo; e se os planetas procedurais podem mudar quando a geração muda (hoje o mesmo id passaria a ser outro planeta).

## Parte 3: a visão 3D ao chegar perto

### O que já existe [conferido]

- **A esfera já mostra o mapa.** `createPlanetBody` (`bodies.ts:153-166`) pinta o `SurfaceMap` com `paintSurface` e o usa como `DataTexture` numa `MeshLambertMaterial` em `SphereGeometry(64, 32)`: o mapa completo, com a terraformação, para planeta visitado; uma prévia de 256 px, gerada de forma síncrona na thread principal, para os outros. Sem mipmaps (cintila de longe), sem ruas nem casas, e a textura não se atualiza.
- **Escala.** O raio na cena é o real × 100 (`PLANET_SCALE`); um tile da Terra mede uns 2,6e-5 UA. "Em órbita" é a menos de 4 raios; a colisão segura a nave a 1,6 raio, uns 98 tiles acima do chão. A câmera é perspectiva de 70° com profundidade logarítmica. `FloatingOrigin` já põe a câmera na origem; em float32 a precisão a essa distância fica em torno de 2,5e-10 UA, folga de sobra para a escala do tile.
- **Voo.** Não há gravidade; o teto de velocidade é 0,4 × distância até a superfície. Nada de nivelamento com o horizonte nem atmosfera.
- **Troca de modo.** `switchTo` descarta o modo inteiro, põe a tela preta, cria o novo no próximo quadro e desfaz o preto em 0,25 s. A superfície desenha num `SoftRenderer` próprio mesmo com WebGL. O `MapRaster` produz um buffer RGBA de um pixel por tile (2 MB na Terra) com ruas e casas, e o comentário dele já prevê usá-lo como textura.
- **Sem WebGPU.** O three 0.186 traz o caminho, mas nada o importa. O `SoftRenderer` (sem WebGL) desenha a esfera como um disco com metade da textura e ignora malhas com mais de 5.000 vértices: uma malha de terreno com LOD não apareceria nele.
- **Três problemas achados no caminho.** O eixo de giro dos planetas está no plano da órbita (`SphereGeometry` com polos em ±Y, órbitas em XY, inclinação de 0,2 rad em Z): todo planeta fica deitado como Urano. `orbitPlanetId` é gravado no save mas nunca lido, e o `SpaceMode` novo nasce sem `orbitBody`, então **ao voltar da superfície a nave provavelmente perde a órbita** [estimativa: não testado no navegador]. `disposeObject` não libera textura dentro de `uniforms` de `ShaderMaterial`.

### A técnica (o que Kerbal, Spore e Elite fazem)

1. **Esfera por cubo com quadtree.** Seis faces; cada vértice `p` do cubo vira `normalize(p) · R`. Cada face é um quadtree de patches de 16 a 32 vértices de lado. Um nó se divide quando o erro geométrico projetado na tela passa de uns 2 px (Cesium). Com R em unidades de km e 7 níveis, o patch mais fino tem aresta perto da célula do nosso mapa (0,35° no equador, uns 39 km numa Terra sem o exagero); não há por que ir além, o resto é ruído de detalhe no shader.
2. **O mapa 2D é a fonte.** Cada vértice calcula `lon = atan2(z, x)` e `lat = asin(y)` e amostra o mapa equirretangular (`u = lon/2π`, `v = 0,5 − lat/π`, `RepeatWrapping` na horizontal), como o Civ IV enrolava o cilindro. Altura pela elevação do mapa com exagero vertical; cor pelo `MapRaster`, que já tem ruas e casas. Nos polos o mapa tem amostra demais por área: aceitar, ou declarar calotas de gelo, como o Civ IV fazia com calotas falsas.
3. **Emendas e pop.** Saias (Ulrich, Cesium) nas bordas dos patches de níveis diferentes, invisíveis de órbita; geomorph entre níveis se o pop incomodar.
4. **Transição sem corte.** O padrão do Kerbal: dois representantes do **mesmo mapa de altura** e uma fusão numa faixa de altitude. Aqui são três estágios: de órbita até ~1 raio de altitude, a esfera com atmosfera; abaixo disso, o quadtree refina sem troca de malha; perto do chão e com a câmera quase a prumo, **fusão entre o WebGL e o Canvas 2D**, que mostram as mesmas células do mesmo mapa. Alinhar o centro (lon e lat sob a câmera → célula) e a escala (altitude → px por tile), e desvanecer o canvas por cima do WebGL. No sentido inverso, afastar além do zoom mínimo volta à esfera.
5. **Atmosfera.** Bruneton, *Precomputed Atmospheric Scattering*: código BSD com demo em WebGL. Dia e noite na textura (o terminador) é barato e dá a sensação de chegada.
6. **Origem flutuante.** Já existe. O planeta gira (`time · 0,05`) e a nave só acompanha a translação: para a descida, acompanhar a rotação também, ou parar o giro perto do chão.

### Roteiro

**Etapa 0: correções baratas (P, 1 a 2 dias).**
- Mipmaps na textura do planeta; prévia gerada no Worker em vez de na thread principal.
- Polos perpendiculares ao plano da órbita (eixo Z), com a inclinação do eixo vinda do `PlanetParams` da Parte 2.
- Ler `orbitPlanetId` ao voltar da superfície e reancorar a nave no planeta; teste no navegador.
- `disposeObject` libera texturas em `uniforms`.
- Textura do planeta visitado a partir do `MapRaster` (com ruas e casas), refeita ao voltar da superfície.

**Etapa 1: a esfera boa (M, 1 semana).**
- Shader próprio para o rochoso: amostra por lon e lat no fragmento (evita o aperto nos polos da `SphereGeometry`), normais derivadas da elevação, oceano com reflexo, terminador dia e noite, nuvens simples.
- Atmosfera de Bruneton no lugar do shader de borda, ou o de borda melhorado se o custo pesar.
- Entrada no sistema: pré-gerar o mapa completo do planeta mais próximo no Worker, para a Etapa 3 não esperar.

**Etapa 2: quadtree e descida livre (G, 2 a 3 semanas).**
- Cube-sphere com quadtree por face, erro projetado, saias; altura e cor do mapa; ruído de detalhe no shader abaixo do tile.
- Voo: liberar a descida abaixo de 1,6 raio com velocidade pela altitude e nivelamento com o horizonte; a chegada do piloto automático (RF-NAV-05) passa a mirar uma altitude, não um raio.
- Sem WebGL, fica a esfera da Etapa 1 (o `SoftRenderer` não desenha a malha): aceitar e dizer no README.
- Medir: draw calls, memória da GPU (o painel DEV mostra contagens; passar a mostrar bytes) e quadros numa máquina modesta.

**Etapa 3: transição contínua até o mapa 2D (M, 1 a 2 semanas).**
- Rever os três requisitos: o pilar da troca única, o *Won't* do pouso 3D e o RF-SUP-02.
- `switchTo` com fusão em vez de tela preta: a superfície nasce com `center` e `zoom` casados com a câmera, e os dois modos vivem juntos por um segundo [estimativa: pico de memória de uns 30 MB a mais na Terra].
- A volta: afastar além do zoom mínimo desvanece para a esfera, na mesma lon e lat.
- Teste com o Playwright: descer e subir dez vezes sem vazar memória da GPU.

**Etapa 4, opcional: vista 2,5D no chão (G, projeto à parte).** Câmera inclinada sobre o quadtree com sprites como cartazes, ao estilo do estágio tribal do Spore. Depende de um `SurfaceBackend` (os pintores de `overlay`, `fx`, `trails`, `weatherView` e `softArt` ainda desenham direto no Canvas 2D) e do `SpriteLayer`, cujo shader trabalha em pixels de tela. Só vale começar depois de `SEPARACAO-MOTOR.md` A1.

### Riscos

- **Dois caminhos de desenho** (WebGL para o 3D, Canvas para o 2D) precisam mostrar as mesmas cores do mesmo mapa; uma função só de "cor do tile" para os dois.
- **O exagero de 100× no raio** fica visível na descida: um tile da Terra parece ter 3.900 km. A alternativa, raio real, muda escalas de voo e de órbita calibradas há tempo. Decidir antes da Etapa 2.
- **Memória:** o mapa completo na textura (8 MB em 2048×1024, 10,7 MB com mipmaps), o quadtree e os dois modos vivos na transição.
- **O `SoftRenderer`** fica sem a descida. É uma perda aceitável para o caminho sem GPU.
- **Polos:** o ruído cilíndrico pinça a linha polar num ponto. Resolver na geração (amostrar o ruído na esfera) muda todo planeta já gerado: fazer junto com a Parte 2 e o `SAVE_VERSION`.

## As dez fontes mais úteis

1. Kerbal Space Program, *Developer Insights #12: Planet Tech* (quad-sphere, origem flutuante, fusão por dither): https://www.kerbalspaceprogram.com/news/dev-diaries-developer-insights-12-planet-tech
2. Compton et al., *Creating Spherical Worlds* (Spore, SIGGRAPH 2007): https://history.siggraph.org/learning/creating-spherical-worlds-by-compton-grieve-goldman-quigley-stratton-et-al/ · slides: https://www.andrewwillmott.com/maxis-sketches
3. McKendrick, *Continuous World Generation in No Man's Sky* (GDC 2017): https://gdcvault.com/play/1024265/Continuous-World-Generation-in-No
4. Ulrich, *Rendering Massive Terrains using Chunked LOD* (quadtree, saias, erro de tela): https://masters.donntu.ru/2011/fknt/liseenko/library/article1.htm
5. Bruneton, *Precomputed Atmospheric Scattering* (BSD, demo WebGL): https://github.com/ebruneton/precomputed_atmospheric_scattering
6. Factorio, FFF-76 *MP inside out* e FFF-217 (estatísticas para balanceamento): https://factorio.com/blog/post/fff-76 · https://factorio.com/blog/post/fff-217
7. Bettner e Terrano, *1500 Archers on a 28.8*: https://www.gamedeveloper.com/programming/1500-archers-on-a-28-8-network-programming-in-age-of-empires-and-beyond
8. Victoria 3, DD#17 e DD#105 (migração por atração e agitação; mover pops inteiros): https://forum.paradoxplaza.com/forum/threads/victoria-3-dev-diary-105-migration-in-1-6.1624226/
9. Dwarf Fortress wiki, *World gen*, *World rejection*, *Immigration*: https://dwarffortresswiki.org/index.php/DF2014:World_gen
10. RimWorld wiki, *Development mode* e *Storyteller*: https://rimworldwiki.com/wiki/Development_mode

Outras citadas: Civ IV `AI_foundValue` (fórum CivFanatics), Dave Mark *Modular Tactical Influence Maps* (Game AI Pro 2), Eco *How the Eco-Sim works*, Rain World (Game Developer), Caves of Qud (GDC 2018), Elite Dangerous *Planetary Tech with Dr Kay Ross* (fórum da Frontier), Star Citizen *Terra Firmer* (CitizenCon 2019), Starfield (PCGamesN), Civ IV globo (Apolyton), Cesium *skirts*, 3DTilesRendererJS (NASA), Sebastian Lague *Procedural Planets*.
