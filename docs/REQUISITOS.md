# We Are Many: Documento de Requisitos e Plano de Desenvolvimento

> Versão 0.3 · 20/10/2026 · incorpora as decisões do Joab sobre escala, controles, arte, base secreta, multiplayer e nomes, e agora o GUIA (assistente de navegação), a velocidade revista e as sondas de extração (ver [Registro de decisões](#12-registro-de-decisões))
> Jogo de navegador em three.js inspirado na temática de *Somos Legião, Somos Bob* (Dennis E. Taylor).

---

## Sumário

1. [Visão do jogo](#1-visão-do-jogo)
2. [Pilares de design](#2-pilares-de-design)
3. [Dados reais do universo: o que existe e como usar](#3-dados-reais-do-universo-o-que-existe-e-como-usar)
4. [Requisitos funcionais](#4-requisitos-funcionais)
5. [Requisitos não funcionais](#5-requisitos-não-funcionais)
6. [Arquitetura proposta](#6-arquitetura-proposta)
7. [Priorização (MoSCoW)](#7-priorização-moscow)
8. [Plano de desenvolvimento por fases](#8-plano-de-desenvolvimento-por-fases)
9. [Riscos e mitigação](#9-riscos-e-mitigação)
10. [Questões em aberto](#10-questões-em-aberto)
11. [Glossário](#11-glossário)
12. [Registro de decisões](#12-registro-de-decisões)

---

## 1. Visão do jogo

**We Are Many** é um jogo de exploração espacial e gestão para navegador. O jogador é uma sonda autorreplicante, uma consciência digital dentro de uma nave, que parte do Sistema Solar para explorar uma galáxia mapeada a partir de catálogos astronômicos reais.

O ciclo central é:

1. **Explorar**: navegar em 3D pela vizinhança estelar, vendo estrelas reais crescerem de pontos de luz até sistemas completos.
2. **Coletar**: minerar anéis planetários, cinturões de asteroides e luas para obter recursos.
3. **Replicar**: fabricar novas naves (cópias do jogador, cada uma com pequenas variações de personalidade) e equipamentos.
4. **Transformar**: observar planetas, abrir a superfície numa visão 2D estilo WorldBox, terraformar e gerenciar espécies existentes.
5. **Expandir**: estender a rede de comunicação e influência, encontrar ameaças e, no modo cooperativo, outros jogadores.

**Plataforma:** PC (navegador desktop), controle por teclado e mouse.
**Modo principal:** solo, com multiplayer cooperativo opcional.
**Monetização:** nenhuma por enquanto; recursos pagos podem ser avaliados no futuro.

### Nota sobre propriedade intelectual

O livro serve de **inspiração temática**. Termos comuns e genéricos podem ser usados livremente (motor, propulsor, sonda, replicação, espécie primitiva, terraformação, drone). Nomes e termos **específicos** da obra não podem ser usados: Bob, Bobiverse, Deltanos (Deltans), Outros (Others), SCUT, SURGE, nomes de personagens etc. Exemplos de nomes próprios do jogo neste documento: "rede de comunicação quântica" e "Enxame" (facção hostil).

---

## 2. Pilares de design

| Pilar | O que significa na prática |
|---|---|
| **Universo real** | Estrelas e exoplanetas conhecidos estão onde a astronomia diz que estão. O que a ciência ainda não catalogou é preenchido proceduralmente, de forma determinística e coerente. |
| **Escala contínua** | Sem telas de carregamento entre galáxia, sistema e órbita. A transição é um zoom contínuo. A única troca de "modo" é a entrada na superfície 2D. |
| **Nunca longe de algo interessante** | O jogador voa rápido e livre. A escala de tempo e velocidade é ajustada para que o próximo ponto de interesse esteja sempre a poucos minutos, nunca horas. |
| **Simples e belo** | Arte 3D limpa e leve, sem exageros. Arte 2D em pixel art no estilo WorldBox. |
| **Leve no navegador** | Só o que está perto é carregado. Tudo é transmitido em chunks e descartado quando sai do alcance. |
| **Você é muitos** | O jogador não controla uma nave, controla uma linhagem. Cópias agem de forma semi-autônoma e o jogo escala de micro (uma nave) para macro (frota). |
| **Solo primeiro, coop depois** | O jogo é pensado para ser jogado sozinho. Mesmo assim, o estado do mundo é validado por um núcleo de simulação separado da renderização, para que um servidor possa assumir esse papel no modo cooperativo. |

---

## 3. Dados reais do universo: o que existe e como usar

**Resposta curta: sim, existem fontes públicas e gratuitas** que permitem posicionar estrelas e exoplanetas reais. Nenhuma delas deve ser chamada diretamente pelo navegador do jogador durante o jogo (limites de requisição, latência, CORS e volume de dados). O caminho certo é um **pipeline offline** que baixa, filtra e converte os dados em chunks binários servidos por CDN.

### 3.1 Fontes recomendadas

| Fonte | Conteúdo | Volume | Acesso | Licença / crédito | Uso no jogo |
|---|---|---|---|---|---|
| **HYG Database (v4)** | Fusão de Hipparcos, Yale Bright Star e Gliese. Posição cartesiana (x, y, z em parsecs), magnitude, índice de cor, tipo espectral, nomes próprios. | ~120 mil estrelas | CSV no GitHub (astronexus/HYG-Database) | CC BY-SA 4.0 | **Base do MVP.** Pequeno, limpo, já vem em coordenadas 3D. Cobre bem as estrelas visíveis e a vizinhança de ~100 pc. |
| **Gaia DR3 (ESA)** | Posição, paralaxe, movimento próprio, fotometria, temperatura estimada. | ~1,8 bilhão de fontes (~1,47 bi com paralaxe) | TAP/ADQL em `gea.esac.esa.int/tap-server/tap`, ou download em massa | Uso livre com crédito ESA/Gaia/DPAC | **Expansão.** Fatiado por distância e brilho para fases futuras. A Gaia DR4 está prevista para dezembro de 2026 e pode ser incorporada depois. |
| **Gaia Catalogue of Nearby Stars (GCNS)** | Subconjunto curado do Gaia até 100 pc. | ~330 mil objetos | Download (CDS/VizieR) | Crédito ESA/Gaia | Ponte entre HYG e Gaia completo: vizinhança densa e confiável. |
| **Distâncias Bailer-Jones (Gaia EDR3)** | Distâncias geométricas corrigidas a partir da paralaxe. | ~1,47 bi | VizieR / TAP do ARI Heidelberg | Crédito dos autores | Converter paralaxe em distância sem erros grosseiros em estrelas distantes. |
| **NASA Exoplanet Archive** | Exoplanetas confirmados: massa, raio, período, semieixo maior, excentricidade, temperatura de equilíbrio, estrela hospedeira (com ID Gaia/HIP). | ~6 mil planetas | API TAP: `exoplanetarchive.ipac.caltech.edu/TAP/sync?query=...` (tabela `pscomppars`) | Domínio público, crédito solicitado | **Planetas reais** associados às estrelas do catálogo pelo ID Hipparcos/Gaia. |
| **Exoplanet.eu / Open Exoplanet Catalogue** | Catálogos alternativos e complementares. | ~7 mil | CSV/XML (OEC no GitHub) | Abertos | Validação cruzada e campos faltantes. |
| **JPL Horizons / SSD (NASA)** | Efemérides e elementos orbitais do Sistema Solar, asteroides, luas. | Milhares de corpos | API REST | Domínio público | Sistema Solar inicial fiel (planetas, luas, cinturão, anéis de Saturno). |
| **SIMBAD (CDS)** | Nomes, identificadores cruzados e classificação de objetos. | Milhões | TAP | Crédito CDS | Nomes populares de estrelas e cruzamento de IDs. |
| **Texturas planetárias (Solar System Scope, NASA)** | Mapas de superfície do Sistema Solar. | Dezenas | Download | CC BY 4.0 / domínio público | Visual dos planetas reais do Sistema Solar. |

### 3.2 O que os dados reais NÃO trazem (e como preencher)

| Lacuna | Solução |
|---|---|
| A maioria das estrelas não tem planetas conhecidos | Gerar planetas proceduralmente com semente determinística a partir do ID da estrela. Distribuição inspirada em estatísticas reais (Kepler/TESS: frequência por tipo espectral, tamanho e período). Marcar no jogo como "não catalogado". |
| Exoplanetas reais não têm superfície conhecida | Superfície gerada a partir dos parâmetros reais (raio, massa, temperatura de equilíbrio, tipo de estrela) por ruído determinístico. |
| Anéis e cinturões só são conhecidos no Sistema Solar | Gerados proceduralmente (probabilidade maior em gigantes gasosos e sistemas jovens). |
| Catálogo fica incompleto com a distância | Além do raio de completude do catálogo usado, preencher com estrelas procedurais seguindo um modelo de densidade da Via Láctea (disco fino/espesso, bojo, braços). Visualmente, o fundo distante da galáxia pode ser uma nuvem de partículas ou um skybox renderizado do próprio modelo. |
| Estrelas binárias e múltiplas | Usar as marcações de sistemas múltiplos presentes no HYG/Gaia quando existirem; tratar como um único "sistema" com várias estrelas. |

**Regra de determinismo:** qualquer coisa procedural é função pura de `(id_do_objeto, versão_do_gerador)`. Assim todos os jogadores do coop veem o mesmo universo sem precisar armazená-lo, e o servidor guarda apenas o que mudou (diffs).

### 3.3 Pipeline de dados (offline)

```
Fontes (HYG CSV, Gaia TAP, Exoplanet TAP, Horizons)
        │
        ▼
[1] Ingestão (Python: astroquery, pandas, astropy)
        │  normaliza coordenadas para sistema galáctico cartesiano, em parsecs, com o Sol na origem
        ▼
[2] Cruzamento de IDs (HIP ↔ Gaia ↔ nome ↔ exoplanetas)
        ▼
[3] Enriquecimento: cor RGB a partir de B-V/temperatura, raio/luminosidade estimados, semente procedural
        ▼
[4] Particionamento em octree (chunks cúbicos com LOD por magnitude)
        ▼
[5] Serialização binária (Float32 posições + Uint8/Uint16 atributos), compressão (gzip/brotli)
        ▼
[6] Publicação em CDN estática: /universe/v1/{nível}/{x}_{y}_{z}.bin + índice manifest.json
```

- O pipeline é versionado (`v1`, `v2`...). Uma nova versão do catálogo nunca quebra saves antigos: IDs de estrela são estáveis.
- Tamanho estimado do MVP com HYG: poucos MB no total, alguns KB por chunk.
- Com Gaia completo: dezenas a centenas de GB no servidor, mas o jogador só baixa os chunks ao seu redor.

### 3.4 Estratégia de chunks

- **Estrutura:** octree espacial centrado no Sol. Nível 0 cobre a galáxia inteira, cada nível subdivide em 8.
- **LOD por brilho:** níveis grossos guardam só as estrelas mais brilhantes (magnitude absoluta baixa). Ao se aproximar, níveis mais finos adicionam estrelas mais fracas. É o mesmo princípio de tiles de mapas web.
- **Carga:** a cada frame (ou a cada N ms), calcular quais nós do octree intersectam o raio de visão com base na distância da câmera; requisitar os que faltam; descartar os que saíram do alcance mais uma margem de histerese.
- **Cache:** IndexedDB no navegador para chunks já baixados; cabeçalhos HTTP de cache longo na CDN (os arquivos são imutáveis por versão).
- **Renderização:** cada chunk vira um `THREE.Points` (ou `InstancedMesh` para estrelas próximas) com shader próprio que calcula tamanho aparente e brilho a partir da magnitude e da distância.

### 3.5 Escala de jogo: real nas posições, jogável nas distâncias

Na escala real, a estrela mais próxima (Proxima Centauri) fica a 4,2 anos-luz; mesmo a 1.000 vezes a velocidade da luz seriam mais de 2 horas de viagem. Por isso a escala real **não** é usada para o tempo de viagem. Duas técnicas, combinadas, resolvem isso sem trabalho grande:

1. **Velocidade adaptativa (principal, pouco trabalho).** A velocidade máxima da nave é proporcional à distância do corpo mais próximo, como o "supercruise" de jogos espaciais e o SpaceEngine. No espaço vazio entre estrelas a nave anda anos-luz por segundo; ao entrar num sistema ela desacelera sozinha para UA por segundo; perto de um planeta, para quilômetros por segundo. As posições reais das estrelas continuam intactas (constelações e vizinhanças corretas), só a velocidade muda.
2. **Compressão dos sistemas (complementar).** Dentro de um sistema, as distâncias entre planetas são comprimidas (escala logarítmica ou fator fixo, por exemplo 1/20) e os planetas e estrelas são desenhados maiores que o real. Isso deixa o sistema legível e bonito, e evita que o jogador gaste tempo indo de um planeta a outro. Os dados reais continuam disponíveis no painel de informações.

**Metas de tempo (requisitos):**

| Trajeto | Tempo alvo com o motor inicial |
|---|---|
| Estrela vizinha (1 a 3 parsecs) | 30 s a 2 min |
| Atravessar um sistema planetário | 15 s a 45 s |
| Da borda do sistema até a órbita de um planeta | menos de 20 s |
| Tempo máximo sem nada interessante por perto | nunca mais que ~3 min |

- Upgrades de motor aumentam o teto da velocidade adaptativa (o jogador sente a progressão).
- Não há dilatação temporal nem relógio "real" da viagem: o tempo do jogo é único para simplificar a simulação e o coop.
- Regiões com poucas estrelas catalogadas recebem estrelas e pontos de interesse procedurais para manter a densidade de coisas para fazer.

**Regras de velocidade implementadas (20/10/2026):**

- Teto de velocidade = 0,4 × distância "efetiva" ao obstáculo mais limitante, por segundo (antes 0,3).
- **Velocidade direcional:** um corpo à frente conta pela distância real; um corpo ao lado ou atrás conta até 4 vezes mais longe. A nave sai depressa de planetas e estrelas e só freia para o que está no caminho. Entram na conta a estrela e os planetas do sistema, as 12 estrelas mais próximas e os pontos de interesse grandes (planetas errantes, anãs marrons); cometas, destroços e sinais são pequenos demais para segurar a nave (a colisão continua valendo).
- **Cruzeiro (C):** a nave mantém a velocidade sem segurar W; S continua freando.
- **Piloto automático:** o próprio alvo vira obstáculo, então a nave chega freando sozinha, sem passar do ponto. Na reta final até um corpo que se move (planeta, cometa), a nave acompanha o movimento dele.
- **Passo de simulação até 0,25 s:** em PCs lentos ou sem placa de vídeo a viagem não fica em câmera lenta.
- Medido no navegador: Sol → Alfa Centauri (1,34 pc) em cerca de 55 s com o piloto automático; Saturno → Marte em menos de 30 s.

---

## 4. Requisitos funcionais

Identificadores: `RF-<área>-<n>`. A prioridade (MoSCoW) está na seção 7.

### 4.1 Navegação 3D e escala (NAV)

| ID | Requisito |
|---|---|
| RF-NAV-01 | Controles de voo livre no PC: **W/S** acelera para frente e para trás, **A/D** desloca para os lados, **mouse** mira a direção da nave (a nave segue o cursor), **Espaço** sobe e **Shift** desce. Teclas remapeáveis. Ponteiro travado (Pointer Lock) durante o voo, com uma tecla para liberar o cursor e usar menus. |
| RF-NAV-02 | A galáxia é exibida como campo de estrelas reais carregado por chunks, com cor e brilho coerentes com o tipo espectral. |
| RF-NAV-03 | A câmera opera em escalas contínuas: galáctica (kpc), estelar (pc/anos-luz), sistema (UA) e orbital (km), sem tela de carregamento entre elas. |
| RF-NAV-04 | Ao se aproximar de uma estrela, ela deixa de ser um ponto e se torna um sistema: estrela com halo, órbitas, planetas, anéis e cinturões aparecem progressivamente. |
| RF-NAV-05 | O jogador não pode entrar em planetas nem estrelas. Há uma distância mínima (órbita baixa); a nave para nessa órbita. |
| RF-NAV-06 | Ao entrar em órbita de um planeta, lua ou cinturão, aparece o **menu de ações** do corpo (observar, minerar, construir, enviar sonda etc.). |
| RF-NAV-07 | Velocidade adaptativa conforme a seção 3.5: rápida no espaço vazio, desacelerando automaticamente perto de estrelas e planetas, respeitando as metas de tempo da tabela. |
| RF-NAV-08 | Mapa estelar navegável (vista "de cima"), com busca por nome de estrela, filtros (exoplanetas conhecidos, visitados, recursos) e definição de rota. |
| RF-NAV-09 | HUD com: alvo selecionado, distância, tempo estimado de chegada, velocidade, combustível/energia. |
| RF-NAV-10 | Informações do corpo celeste ao selecionar: nome, tipo, dados reais (fonte citada) ou rótulo "não catalogado". |
| RF-NAV-11 | Piloto automático opcional: selecionar um alvo no mapa e a nave voa até ele (útil para trajetos longos), podendo ser interrompido a qualquer momento por WASD. |

Situação em 20/10/2026: RF-NAV-09 e RF-NAV-11 implementados pelo GUIA (seção 4.13). RF-NAV-08 implementado em parte: painel com busca por nome e listas por categoria; a vista "de cima" do mapa estelar ainda falta.

### 4.2 Sistemas estelares e corpos (SYS)

| ID | Requisito |
|---|---|
| RF-SYS-01 | Cada estrela possui um sistema: planetas reais (NASA Exoplanet Archive) quando houver, completados por planetas procedurais coerentes. |
| RF-SYS-02 | Planetas têm tipo (rochoso, super-Terra, netuniano, gigante gasoso, gelado), atmosfera, temperatura, gravidade e composição. |
| RF-SYS-03 | Corpos menores: luas, anéis, cinturões de asteroides e cometas, cada um com perfil de recursos. |
| RF-SYS-04 | Movimento orbital visível (keplerian simplificado), com tempo do sistema acelerado. |
| RF-SYS-05 | O Sistema Solar é fiel ao real (planetas, luas principais, anéis de Saturno, cinturão principal) e é o ponto de partida. |
| RF-SYS-06 | Classificação de habitabilidade: zona habitável calculada pela luminosidade da estrela. |
| RF-SYS-07 | Distâncias e tamanhos dentro do sistema são exibidos em escala comprimida (seção 3.5); o painel de informações mostra os valores reais. |

Situação em 20/10/2026:

- **RF-SYS-01 (feito em parte):** toda estrela do catálogo tem um sistema gerado pelo id (`src/nav/systemGen.ts`): número de planetas, órbitas, tipo (rochoso, gigante gasoso, gigante de gelo), raio, temperatura de equilíbrio, água, atmosfera e anéis coerentes com a luminosidade, a zona habitável e a linha de gelo. Cerca de 1 em 6 estrelas não tem planetas; estrelas muito quentes têm poucos. Vizinhas com exoplanetas confirmados usam os planetas reais: Proxima Centauri (b, d), Estrela de Barnard (b), Ross 128 (b), Wolf 1061 (b, c, d), Lalande 21185 (b, c), Estrela de Luyten (b, c) e Ran/Épsilon Eridani (Ægir). A integração completa com o NASA Exoplanet Archive no pipeline continua na Fase 2.
- **RF-SYS-03 (feito em parte):** cometas em órbitas elípticas com cauda apontando para longe da estrela e órbita desenhada; anéis com pedras e blocos de gelo visíveis de perto. Luas e cinturões de asteroides ainda faltam.
- **Cometas visitantes:** a cada janela de 8 minutos de jogo, cada sistema tem 60% de chance de receber um cometa de órbita muito alongada, que passa perto da estrela no meio da janela. O GUIA avisa quando ele entra. Sorteado pelo id da estrela e pela janela, então é igual para todos.
- **RF-SYS-06 (feito):** a zona habitável aparece como duas linhas verdes no sistema e entra nas informações de cada planeta.
- **Vida nativa:** o potencial de vida dos planetas gerados sai da temperatura e da água; o nível (vegetação, animais, inteligente) segue as chances de [REQUISITOS-VIDA.md](REQUISITOS-VIDA.md). Planetas rochosos gerados podem ser observados em 2D (F) como os do Sistema Solar.

### 4.3 Recursos e mineração (RES)

| ID | Requisito |
|---|---|
| RF-RES-01 | Tipos de recurso: metais comuns (ferro, níquel), metais raros/terras-raras, silicatos, voláteis (água, gelo, metano, amônia), físseis, hélio-3 e energia. |
| RF-RES-02 | Anéis, asteroides e luas possuem jazidas com quantidade e concentração; recursos se esgotam. |
| RF-RES-03 | A mineração é feita por drones lançados pela nave; o tempo de coleta depende do número e nível dos drones. |
| RF-RES-04 | Nave tem capacidade de carga; recursos podem ser processados (refino) em material utilizável. |
| RF-RES-05 | Varredura (scan) revela recursos de um corpo; scans melhores dão mais detalhe. |
| RF-RES-06 | Depósitos/estações orbitais podem armazenar recursos em um sistema. |

Situação em 20/10/2026: RF-RES-02, 03 e 05 implementados em parte pelas sondas (seção 4.14); refino, capacidade de carga e depósitos orbitais continuam na Fase 2.

### 4.4 Fabricação e replicação (FAB)

| ID | Requisito |
|---|---|
| RF-FAB-01 | Uma fábrica automatizada (a bordo ou como estação) converte recursos refinados em componentes, módulos e naves. |
| RF-FAB-02 | **Replicação:** o jogador pode construir uma nova nave-sonda que é uma cópia sua. |
| RF-FAB-03 | Cada cópia recebe um nome (escolhido ou gerado) e um conjunto de **traços de personalidade** com pequenas variações (por exemplo: curiosa, cautelosa, engenheira, combativa) que afetam bônus e comportamento autônomo. |
| RF-FAB-04 | Cópias podem receber ordens (explorar região, minerar sistema, defender, construir) e agir de forma autônoma. |
| RF-FAB-05 | O jogador pode "assumir" qualquer cópia para controlar diretamente. |
| RF-FAB-06 | Árvore genealógica das cópias (quem replicou quem, geração). |
| RF-FAB-07 | Fila de produção com tempo e custo por item. |
| RF-FAB-08 | Construção de outros tipos de estrutura: drones, estações orbitais, satélites, naves de transporte (colonos), armas e defesas. |

### 4.5 Pesquisa e progressão (PES)

| ID | Requisito |
|---|---|
| RF-PES-01 | Árvore tecnológica: propulsão, sensores, mineração, fabricação, comunicação, terraformação, biologia, defesa. |
| RF-PES-02 | Pesquisa consome tempo e recursos; cópias com traço "cientista" pesquisam mais rápido. |
| RF-PES-03 | Descobertas (anomalias, planetas raros, vida) podem desbloquear tecnologias. |

### 4.6 Comunicação e rede (COM)

| ID | Requisito |
|---|---|
| RF-COM-01 | Sem tecnologia avançada, comunicação entre cópias é limitada pela velocidade da luz (atraso real ou comprimido). |
| RF-COM-02 | Tecnologia de **relés de comunicação quântica** permite comunicação instantânea dentro do alcance de relés construídos. |
| RF-COM-03 | Só é possível dar ordens em tempo real a cópias dentro da rede; fora dela, elas agem pela última ordem recebida. |
| RF-COM-04 | Visualização da rede de relés no mapa estelar. |

### 4.7 Observação de planetas e superfície 2D (SUP)

| ID | Requisito |
|---|---|
| RF-SUP-01 | No menu de ações orbital, a opção **Observar** abre a superfície do planeta numa visão 2D de cima **praticamente igual ao WorldBox**: mesmo tipo de enquadramento, mapa em grade onde **cada pixel do mapa representa um elemento** (um tile de terreno, água, árvore, rocha), unidades e construções pequenas em pixel art, barra de ferramentas (poderes) na parte de baixo, câmera com zoom e arrastar. |
| RF-SUP-02 | Ao entrar na visão 2D, toda a cena 3D é descarregada da memória (geometrias, texturas, chunks), mantendo só o estado lógico necessário para voltar. Ao sair, a cena 3D é recarregada na mesma posição. |
| RF-SUP-03 | O mapa 2D é gerado deterministicamente a partir dos parâmetros do planeta (temperatura, água, gravidade, atmosfera, tipo da estrela). Ele "dá a volta" horizontalmente (mundo cilíndrico). |
| RF-SUP-13 | O tamanho do mapa é proporcional ao tamanho do planeta. Referência inicial: planeta do tamanho de Marte ≈ 256×128 pixels, Terra ≈ 512×256, super-Terra (2 raios terrestres) ≈ 1024×512, com teto técnico para manter o desempenho. Luas pequenas e asteroides grandes podem ter mapas menores. |
| RF-SUP-14 | Gigantes gasosos não têm superfície terraformável; "Observar" mostra apenas a atmosfera em camadas (faixas, tempestades) e recursos coletáveis da atmosfera. |
| RF-SUP-04 | Biomas: oceano, costa, planície, floresta, deserto, tundra, gelo, montanha, vulcânico, além de biomas exóticos (lava, metano líquido). |
| RF-SUP-05 | Camadas visualizáveis: relevo, temperatura, umidade, atmosfera, recursos, vida. |
| RF-SUP-06 | **Ferramentas de terraformação** (desbloqueadas por pesquisa e com custo de recursos): elevar/rebaixar terreno, adicionar/remover água, impacto de cometa (traz voláteis), semear micro-organismos/vegetação, ajustar atmosfera (geradores, espelhos orbitais), aquecer/resfriar regiões. |
| RF-SUP-07 | Mudanças globais (temperatura média, pressão atmosférica, nível do mar) evoluem com o tempo a partir das ações do jogador, em vez de instantâneas. |
| RF-SUP-08 | **Gestão de espécies:** planetas podem ter espécies nativas (flora, fauna, espécies inteligentes primitivas). O jogador pode observar, proteger, realocar, controlar populações, introduzir espécies de outros planetas e orientar o desenvolvimento de espécies inteligentes. **Não é possível criar uma espécie do zero.** |
| RF-SUP-09 | Espécies inteligentes primitivas têm aldeias, população, nível tecnológico e cultura; o jogador pode intervir de forma discreta (ensinar, proteger de predadores, de catástrofes) com consequências. |
| RF-SUP-10 | Colonização humana: naves de transporte trazem colonos humanos (de uma Terra em crise) para planetas habitáveis ou terraformados. |
| RF-SUP-11 | Eventos naturais: terremotos, vulcões, secas, eras glaciais, pragas, impactos. |
| RF-SUP-12 | Indicador de habitabilidade do planeta (para humanos e para espécies nativas). |

> A vida nos planetas (espécies, ecossistema, evolução, civilizações, assentamentos, guerra, diplomacia e arte em pixel) está detalhada em **[REQUISITOS-VIDA.md](REQUISITOS-VIDA.md)**.

### 4.8 Ameaças, conflito e narrativa (AME)

| ID | Requisito |
|---|---|
| RF-AME-01 | Sondas rivais de outras nações/facções humanas que competem por recursos e podem atacar. |
| RF-AME-02 | Uma facção alienígena hostil (o **Enxame**) que consome sistemas inteiros e avança pela galáxia, como ameaça de longo prazo. |
| RF-AME-03 | Combate simples entre naves (mísseis cinéticos, drones, defesas), resolvido de forma automática ou semiautomática. |
| RF-AME-04 | Narrativa leve com marcos: partida da Terra, primeiro sistema, primeira cópia, primeira espécie encontrada, contato com o Enxame. |
| RF-AME-05 | Eventos e anomalias exploráveis (sinais, ruínas, naves abandonadas). |

### 4.9 Multiplayer cooperativo (ONL)

O jogo é **solo por padrão**. O multiplayer é **cooperativo e opcional**, e vem depois do jogo solo estar completo.

| ID | Requisito |
|---|---|
| RF-ONL-01 | Conta de jogador e salvamento na nuvem (opcional no solo, obrigatório no coop). |
| RF-ONL-02 | **Coop por convite:** o jogador pode convidar amigos para o seu universo. Todos compartilham o mesmo mapa real e o estado modificado de sistemas e planetas. |
| RF-ONL-03 | Outros jogadores e suas cópias são visíveis quando próximos; troca de recursos e rede de relés compartilhada entre jogadores do mesmo grupo. |
| RF-ONL-04 | Cada jogador mantém a sua própria base secreta (seção 4.11), invisível e inacessível aos outros, mesmo no coop. |
| RF-ONL-05 | Regras de propriedade sobre planetas terraformados (quem pode alterar o quê) para evitar que um jogador desfaça o trabalho de outro. |
| RF-ONL-06 | O jogo continua progredindo enquanto o jogador está fora (minas, fábricas e cópias autônomas trabalham), calculado ao reabrir no solo e no servidor no coop. |
| RF-ONL-07 | *(A avaliar depois)* **Universo público:** cada jogador nasce numa posição aleatória da galáxia, longe dos demais, para jogar com tranquilidade; encontros acontecem só se os jogadores se deslocarem um até o outro. Sem PvP por padrão. |
| RF-ONL-08 | *(Opcional)* Chat com atraso dependente da rede de comunicação do jogo, como elemento de imersão. |

### 4.11 Base secreta e respawn (BAS)

| ID | Requisito |
|---|---|
| RF-BAS-01 | Cada jogador possui uma **base secreta** fixada em um ponto do espaço escolhido por ele (no vazio entre estrelas ou dentro de um sistema). |
| RF-BAS-02 | Só o dono tem acesso à base. Ela não aparece para outros jogadores nem para inimigos e não pode ser atacada. |
| RF-BAS-03 | A base pode ser movida, mas com **custo elevado** em recursos e com **limite de mudança por tempo** (exemplo inicial: uma mudança a cada 24 horas de jogo, valor a balancear). |
| RF-BAS-04 | Quando uma nave é destruída, as outras cópias continuam. Quando **todas** as naves são destruídas, o jogador renasce na base com **uma única nave**. |
| RF-BAS-05 | A nave renascida recupera upgrades, pesquisas e personalidade a partir do **último backup** armazenado na base. A base guarda **um único backup por jogador** (sem versões), sempre substituído pelo mais recente. |
| RF-BAS-06 | Regra de backup a decidir entre duas opções (ver seção 10, questão 1): **(A)** backup manual, com opção de agendar o envio automático; ou **(B)** sincronização automática constante com o estado mais recente das naves. |
| RF-BAS-07 | Recursos e carga que estavam a bordo das naves destruídas são perdidos (podem ficar como destroços coletáveis no local). Recursos guardados na base não são perdidos. |
| RF-BAS-08 | A base tem funções mínimas: armazém, fábrica básica para reconstruir uma nave e ponto de partida. Não substitui estações de produção em sistemas. |

### 4.12 Direção de arte (ART)

| ID | Requisito |
|---|---|
| RF-ART-01 | **3D simples e belo:** estrelas como pontos luminosos com halo suave, planetas como esferas com textura simples (procedural ou de baixa resolução) e uma atmosfera em brilho na borda, anéis como discos translúcidos com partículas leves, naves low-poly. Sem pós-processamento pesado; bloom leve opcional. |
| RF-ART-02 | Paleta coerente por tipo de estrela (azul, branco, amarelo, laranja, vermelho), para que a cor diga algo ao jogador. |
| RF-ART-03 | **2D em pixel art no estilo WorldBox:** um pixel do mapa por elemento, cores fortes e planas por bioma, sombreamento simples de relevo, sprites pequenos para criaturas, vilas e construções. |
| RF-ART-04 | A paleta 2D de cada planeta deriva das suas condições (um planeta frio tem gelo e tons azulados, um planeta de estrela vermelha tem vegetação de tons diferentes etc.). |
| RF-ART-05 | Configuração gráfica com predefinições (baixo, médio, alto) que alteram densidade de estrelas, resolução de texturas e efeitos. |

### 4.10 Interface e meta (UI)

| ID | Requisito |
|---|---|
| RF-UI-01 | Menu principal, novo jogo, carregar, configurações (gráficos, áudio, controles). |
| RF-UI-02 | Painéis: inventário, frota/cópias, produção, pesquisa, mapa estelar, log de descobertas (diário de bordo). |
| RF-UI-03 | Tutorial guiado no Sistema Solar. |
| RF-UI-04 | Créditos das fontes de dados científicos exibidos no jogo (exigido pelas licenças). |
| RF-UI-05 | Suporte a mouse/teclado; suporte a toque desejável. |
| RF-UI-06 | Internacionalização (pt-BR e en no início). |

### 4.13 GUIA: assistente de navegação (GUI)

O GUIA (Gerenciador Unificado de Inteligência e Astronavegação) é a inteligência de bordo que ajuda o jogador a não se perder e a decidir para onde ir. É inspirado no assistente da nave do livro, mas com nome próprio, para respeitar a regra de não usar nomes da obra. Ele fala por mensagens curtas no topo da tela e tem radar, marcadores, painel e piloto automático. Tudo é DOM e Canvas 2D, então funciona igual com ou sem placa de vídeo.

| ID | Requisito | Situação |
|---|---|---|
| RF-GUI-01 | **Radar** no canto inferior direito, visto de cima e girando com a nave (a frente é para cima). Escala logarítmica de 0,01 UA a ~50 pc, com anéis em 1 UA, 100 UA, 1 ano-luz e 10 anos-luz, para que planetas e estrelas caibam no mesmo disco. Cada ponto tem uma haste que indica se o objeto está acima ou abaixo do plano da nave. Cores por tipo (estrelas na cor real, planetas por tipo, pontos de interesse, marcadores, casa); sugestões têm anel amarelo e o alvo, anel branco. Cone de visão desenhado. | Feito |
| RF-GUI-02 | **Alvo:** o jogador escolhe um alvo pelo painel, pela mira (**T** trava o que estiver perto da cruz), pelas sugestões (**N**) ou pela casa (**H**). **X** limpa o alvo. | Feito |
| RF-GUI-03 | **Marcador do alvo na tela:** colchete com nome e distância; fora da tela, uma seta na borda aponta para o lado em que ele está. | Feito |
| RF-GUI-04 | **Cartão do alvo:** nome, descrição, distância, tempo estimado de chegada e modo de pilotagem (manual, cruzeiro, automático). Sem alvo, mostra a melhor sugestão. | Feito |
| RF-GUI-05 | **Estimativa de chegada** coerente com a velocidade adaptativa: cresce com o logaritmo da distância e inclui o tempo para se afastar do corpo de onde a nave sai. | Feito |
| RF-GUI-06 | **Piloto automático (J):** a nave vira suavemente para o alvo, acelera quando está alinhada, desvia da colisão como no voo manual, freia sozinha e para na distância de chegada (sistema inteiro à vista, órbita do planeta, borda da nebulosa etc.). Qualquer comando manual (W, S, A, D, Q, E, Espaço, Shift, mouse forte) devolve o controle. O turbo pode ser usado durante o piloto. | Feito |
| RF-GUI-07 | **Rota em duas etapas:** um planeta ou cometa de outro sistema leva primeiro ao sistema e, quando o sistema aparece, segue direto para o corpo. | Feito |
| RF-GUI-08 | **Cruzeiro (C):** mantém a velocidade sem segurar W. | Feito |
| RF-GUI-09 | **Varredura de longo alcance (V):** onda no radar; num raio de 4 pc revela os pontos de interesse e o que existe nos sistemas (planetas, zona habitável, sinais de vida). Recarga de 5 s. Estrelas a menos de 0,3 pc e o sistema em que a nave entra são varridos sozinhos. | Feito |
| RF-GUI-10 | **Sugestões:** o GUIA ordena o que vale visitar por interesse dividido pelo tempo de viagem. Interesse: vida inteligente > animais > vegetação > mundo na zona habitável > planetas > desconhecido > visitado; sinais e destroços valem mais que cometas e planetas errantes; "voltar para casa" aparece quando a nave está longe. Cada sugestão diz o motivo. | Feito |
| RF-GUI-11 | **Ajuda proativa:** sem alvo e sem novidade por 45 s, o GUIA sugere um destino e diz como aceitar (N e depois J). Ao detectar algo por perto, avisa. | Feito |
| RF-GUI-12 | **Painel de navegação (G):** sugestões, corpos do sistema atual, marcadores, pontos de interesse e estrelas próximas, cada um com tipo, informações, distância e botão **Ir**; busca por nome (inclui estrelas com nome entre as carregadas); diário de bordo. Teclado: ↑/↓ escolhe, Enter vai. O painel solta o mouse para clicar. | Feito |
| RF-GUI-13 | **Marcadores do jogador (B):** salva a posição atual com nome; aparecem no radar, na tela e no painel, onde podem ser apagados. A casa (Terra) é um marcador fixo. | Feito |
| RF-GUI-14 | **Diário de bordo:** primeira visita a cada sistema, órbitas, pontos visitados, detecções da varredura, sinais de vida e cargas das sondas, com hora de jogo. | Feito |
| RF-GUI-15 | **Marcador de rumo:** círculo verde onde a nave está de fato indo (o vetor velocidade), para entender a deriva nas curvas. | Feito |
| RF-GUI-16 | **Anúncio de sistema:** ao entrar num sistema, o GUIA resume o que há nele (planetas, rochosos, zona habitável, vida, cometas) e se os planetas são de catálogo real. | Feito |
| RF-GUI-17 | **Pontos de interesse no espaço profundo** (`src/nav/poi.ts`): o espaço é dividido em células de 2 pc e cada célula gera de 0 a 2 pontos pelo próprio índice: nebulosas (vistas de até 3 pc), planetas errantes, cometas interestelares, destroços com história, sinais desconhecidos e anãs marrons. Nada é guardado; a mesma célula sempre gera os mesmos pontos. Ficam ocultos até a varredura ou até a nave chegar a 0,15 pc; visitá-los mostra a descrição e vai para o diário. Um sinal fixo na Nuvem de Oort ensina o piloto automático no começo. | Feito |
| RF-GUI-18 | Mapa estelar em vista de cima, com zoom e rotas desenhadas. | A fazer |
| RF-GUI-19 | Alertas de perigo (Enxame, radiação, estrelas instáveis) quando as ameaças existirem (Fase 6). | A fazer |
| RF-GUI-20 | Salvar alvo, marcadores, diário e descobertas junto com o save (Fase 2, primeiro save/load). Hoje duram a sessão inteira, inclusive na ida e volta à superfície 2D. | A fazer |
| RF-GUI-21 | Melhorias do GUIA como progressão: alcance maior da varredura, sugestões mais detalhadas, varredura que revela recursos à distância. | A fazer |

**Teclas do GUIA:** G painel · T trava alvo na mira · N próxima sugestão · J piloto automático · C cruzeiro · V varredura · B marcador · H casa · X limpa alvo · M/R sonda.

### 4.14 Sondas de extração (SON)

No livro, as naves enviam sondas para explorar e extrair matéria-prima de planetas rochosos, anéis e cometas. No jogo, a nave começa com 3 sondas (`src/explore/probes.ts`).

| ID | Requisito | Situação |
|---|---|---|
| RF-SON-01 | **Fontes:** planetas rochosos (em órbita), anéis de planetas, cometas dos sistemas (inclusive visitantes), cometas interestelares, planetas errantes e destroços. Gigantes gasosos e de gelo só pelos anéis. | Feito |
| RF-SON-02 | **Recursos:** metais, silicatos, gelo (água), voláteis e elementos raros, em quantidades que dependem da fonte (cometas têm gelo e voláteis; anéis, gelo e silicatos; rochosos, metais e silicatos, mais gelo se tiverem água; destroços, sucata de metais e raros). | Feito |
| RF-SON-03 | **Depósitos finitos e determinísticos:** cada corpo tem um total gerado pelo id; o jogo guarda só o quanto já foi extraído (diff, RNF-10). Um corpo esgotado não rende mais nada. | Feito |
| RF-SON-04 | **Missão:** viagem (6 s), prospecção (6 s, revela o que há), extração (até 30 s ou 60 t, na proporção do que existe) e volta (6 s). A carga vai para o porão da nave. | Feito |
| RF-SON-05 | **Comandos:** **M** envia uma sonda ao corpo mais próximo ao alcance, **R** aos anéis. O menu de órbita mostra o que resta em cada corpo depois da prospecção. | Feito |
| RF-SON-06 | **Painel de sondas:** sondas livres, missões com barra de progresso, o que está ao alcance e o porão. O GUIA avisa prospecção, retorno e esgotamento; as cargas vão para o diário. | Feito |
| RF-SON-07 | **Visual:** cada sonda é um ponto verde que voa até o corpo, circula enquanto trabalha e volta para a nave. Os anéis mostram pedras e blocos de gelo de perto (também no modo sem placa de vídeo). | Feito |
| RF-SON-08 | Fabricar mais sondas e melhorar capacidade e velocidade (Fase 3). | A fazer |
| RF-SON-09 | Refino e uso dos recursos na fabricação; limite de carga do porão (Fase 2). | A fazer |
| RF-SON-10 | Sondas que continuam trabalhando enquanto a nave vai embora ou o jogador está na superfície, calculadas por evento ("começou em T, termina em T+Δ", seção 6.5). Hoje elas param enquanto o jogador está no 2D. | A fazer |
| RF-SON-11 | Luas e cinturões de asteroides como fontes (com RF-SYS-03). | A fazer |

---

## 5. Requisitos não funcionais

| ID | Categoria | Requisito |
|---|---|---|
| RNF-01 | Desempenho | 60 FPS em notebook de gama média com GPU integrada (referência: Intel Iris Xe) em 1080p; mínimo aceitável de 30 FPS. |
| RNF-02 | Memória | Uso de memória do jogo abaixo de ~1 GB no navegador; nunca manter 3D e 2D carregados ao mesmo tempo. |
| RNF-03 | Carregamento | Primeira tela jogável em menos de 10 s numa conexão de 10 Mbps; download inicial abaixo de 15 MB. |
| RNF-04 | Streaming | Chunks pequenos (alvo: menos de 100 KB comprimidos) carregados de forma assíncrona, sem travar o frame. |
| RNF-05 | Precisão | Sem tremedeira (jitter) de vértices em qualquer escala: uso de **origem flutuante** (floating origin), coordenadas em double na simulação e relativas à câmera na GPU, e depth buffer logarítmico. |
| RNF-06 | Determinismo | Geração procedural idêntica em qualquer máquina e no servidor (PRNG próprio e versionado, sem `Math.random` no conteúdo). |
| RNF-07 | Compatibilidade | Chrome, Edge, Firefox e Safari atuais com WebGL2. WebGPU como melhoria opcional futura. |
| RNF-08 | Escalabilidade do coop | Grupos cooperativos pequenos (alvo inicial: até 4 jogadores por universo) com baixa latência; arquitetura que permita, no futuro, um universo público escalável por região do espaço. |
| RNF-09 | Segurança | No coop, servidor autoritativo: o cliente nunca decide recursos, produção ou combate; validação de todas as ações. No solo, a simulação roda localmente. |
| RNF-10 | Persistência | O estado do universo é salvo como diferenças em relação à geração procedural (não se armazena o universo inteiro). |
| RNF-11 | Manutenibilidade | TypeScript estrito; núcleo de simulação independente de renderização e testável em Node. |
| RNF-12 | Licenciamento | Respeitar licenças dos dados (CC BY-SA do HYG, crédito ESA/Gaia, crédito NASA) e evitar elementos protegidos da obra original. |
| RNF-13 | Acessibilidade | Tamanho de fonte ajustável, paleta amigável a daltônicos nas camadas do mapa 2D, remapeamento de teclas. |

---

## 6. Arquitetura proposta

### 6.1 Stack

| Camada | Tecnologia sugerida | Motivo |
|---|---|---|
| Linguagem | TypeScript | Mesmo código de simulação no cliente e no servidor. |
| Build | Vite | Rápido, bom suporte a workers e assets. |
| 3D | three.js (WebGL2) | Pedido do projeto; ecossistema maduro. |
| 2D (superfície) | three.js com câmera ortográfica e tilemap renderizado em shader (DataTexture) | Mantém uma só engine e um só contexto WebGL. Alternativa: PixiJS se o 2D crescer muito. |
| UI | React (ou Svelte) sobreposto ao canvas, estado com Zustand | Painéis complexos (inventário, pesquisa) são mais fáceis em DOM. |
| Concorrência | Web Workers (com Comlink) | Decodificação de chunks, geração procedural e simulação da superfície fora da thread principal. |
| Cache local | IndexedDB | Chunks e saves locais. |
| Pipeline de dados | Python (astroquery, astropy, pandas, numpy) | Ferramentas padrão da astronomia. |
| Servidor (fase coop) | Node.js + WebSocket (Colyseus ou uWebSockets), PostgreSQL, Redis | Reaproveita o núcleo TS; Colyseus resolve salas e sincronização. |
| Hospedagem de dados | CDN estática (Cloudflare R2/Pages, S3 + CloudFront) | Chunks imutáveis e baratos de servir. |

### 6.2 Módulos

```
packages/
  core/          Simulação pura (sem three.js): tempo, órbitas, recursos, produção, cópias,
                 pesquisa, ecossistema. Roda no navegador e no servidor.
  procgen/       Geração determinística: sistemas, planetas, anéis, mapas de superfície, espécies.
  universe-data/ Leitura do manifest, octree, decodificação de chunks.
  client/        three.js, câmera, origem flutuante, LOD, cenas 3D e 2D, UI.
  server/        (fase coop) autoridade, persistência, salas por universo.
tools/
  pipeline/      Scripts Python que geram os chunks a partir dos catálogos.
```

### 6.3 Sistema de escalas (o problema mais difícil do 3D)

- **Unidades:** posição galáctica em parsecs (double), posição no sistema em UA, órbita em km.
- **Cenas aninhadas:** um "frame de referência" ativo por vez. Longe: só o campo de estrelas. Perto de uma estrela: a cena do sistema é instanciada com origem na estrela. Em órbita: a cena local é instanciada com origem no planeta. O campo de estrelas continua ao fundo, desenhado em outra camada.
- **Origem flutuante:** a câmera está sempre próxima de (0,0,0) no espaço da GPU; o mundo é transladado em torno dela.
- **Profundidade:** `logarithmicDepthBuffer` ou renderização em múltiplas passadas (fundo, sistema, objetos próximos) com limpeza do depth entre elas.
- **Brilho aparente:** tamanho e intensidade das estrelas calculados pela magnitude aparente real a partir da distância da câmera, o que faz as estrelas "crescerem" naturalmente ao se aproximar.

### 6.4 Transição 3D ⇄ 2D

1. Jogador escolhe **Observar** no menu orbital.
2. Fade de saída; o estado lógico (posição, alvo, tempo) é guardado no `core`.
3. A cena 3D é descartada (`dispose()` em geometrias, materiais, texturas; chunks liberados, só os mais próximos ficam em cache no IndexedDB).
4. Worker gera ou carrega o mapa 2D do planeta (semente + diffs salvos).
5. Cena 2D ortográfica é montada; a simulação do ecossistema roda em worker.
6. Ao sair, o processo inverso: estado 2D salvo como diff, cena 2D descartada, cena 3D reconstruída a partir do estado lógico.

### 6.5 Modelo solo e cooperativo

- **Solo:** o núcleo `core` roda no navegador (em worker). O save fica em IndexedDB, com opção de salvar na nuvem.
- **Coop:** o mesmo `core` roda num servidor Node.js. O anfitrião cria o universo e convida amigos; o servidor é a autoridade sobre o estado.
- **Universo estático** (estrelas, planetas base) vem da CDN, igual para todos.
- **Estado dinâmico** (jazidas consumidas, estruturas, terraformação, cópias, base secreta) é salvo como diff em relação à geração procedural.
- **Simulação por eventos:** atividades longas (mineração, produção, pesquisa) são armazenadas como "começou em T, termina em T+Δ" e calculadas sob demanda. Isso permite progresso enquanto o jogador está fora e deixa o servidor barato.
- **Superfície 2D no coop:** um planeta tem um "dono" da simulação ativa por vez; os outros jogadores veem a mesma simulação em modo espectador ou com permissões dadas pelo dono.
- **Universo público (futuro, a avaliar):** jogadores nascem em posições aleatórias distantes entre si; o servidor particiona o estado por região do octree.

---

## 7. Priorização (MoSCoW)

| Prioridade | Requisitos |
|---|---|
| **Must** (MVP jogável) | RF-NAV-01 a 07, 09, 10, RF-SYS-01 a 05, 07, RF-RES-01 a 05, RF-FAB-01, 02, 07, RF-SUP-01 a 06, 13, RF-ART-01 a 03, RF-UI-01, 02, 04, RNF-01 a 07, 11, 12 |
| **Should** (primeira versão completa, solo) | RF-NAV-08, 11, RF-SYS-06, RF-RES-06, RF-FAB-03 a 06, 08, RF-PES-01 a 03, RF-COM-01 a 04, RF-SUP-07 a 12, 14, RF-BAS-01 a 08, RF-ART-04, 05, RF-AME-01, 03, 04, RF-UI-03, 05, 06 |
| **Could** (coop e expansão) | RF-AME-02, 05, RF-ONL-01 a 06, 08, RNF-08 a 10, Gaia completo |
| **Won't** (por enquanto) | Monetização, universo público (RF-ONL-07), PvP, pouso em planetas em 3D, combate em tempo real detalhado, criação de espécies do zero (decisão de design), WebGPU obrigatório, mobile |

---

## 8. Plano de desenvolvimento por fases

Cada fase termina com algo jogável ou demonstrável. Fases 1 a 6 são **solo**, mas já com a separação `core` × `client` que permite o coop na Fase 7.

### Fase 0: Pré-produção e provas técnicas

**Objetivo:** reduzir os riscos técnicos antes de construir o jogo.

- Repositório monorepo (TypeScript, Vite, lint, testes).
- **Spike 1:** renderizar as ~120 mil estrelas do HYG com `THREE.Points` e shader de magnitude a 60 FPS.
- **Spike 2:** origem flutuante, controles WASD + mouse + Espaço/Shift e **velocidade adaptativa**: voo contínuo de Alfa Centauri até a órbita da Terra sem jitter e dentro das metas de tempo da seção 3.5.
- **Spike 3:** pipeline Python gerando octree de chunks binários a partir do HYG e carregamento por proximidade.
- **Spike 4:** tela 2D estilo WorldBox com mapa de 512×256 (um pixel por elemento) renderizado por shader, com zoom, arrastar e edição em tempo real.
- Definir nomes próprios do jogo e a bíblia de arte (paleta 3D por tipo de estrela, paleta 2D por bioma).

**Critério de saída:** os quatro spikes funcionam num notebook de referência.

### Fase 1: MVP de navegação

**Objetivo:** voar livremente pela vizinhança estelar real.

- Campo de estrelas HYG com streaming por chunks e cache em IndexedDB.
- Controles finais da nave, velocidade adaptativa, HUD, seleção de estrela, informações reais.
- Sistema Solar fiel (dados) com escala comprimida (visual) e órbitas animadas.
- Aproximação: estrela → sistema → órbita, com parada na distância mínima.
- Menu de ações orbital (ainda com ações de placeholder).
- Mapa estelar com busca por nome e piloto automático.
- Tela de créditos das fontes de dados.

**Critério de saída:** sair da Terra, voar até Alfa Centauri em menos de 2 minutos, entrar em órbita de Proxima b (planeta real) e ver seus dados.

### Fase 2: Sistemas e recursos

**Objetivo:** ter algo para fazer em cada sistema.

- Integração do NASA Exoplanet Archive no pipeline.
- Gerador procedural de sistemas (planetas, luas, anéis, cinturões) determinístico.
- Scan de corpos e perfil de recursos.
- Drones de mineração, carga, refino e inventário.
- Energia/combustível e upgrades de motor que aumentam o teto da velocidade.
- Primeiro save/load local.

**Critério de saída:** ciclo explorar → escanear → minerar → refinar funcionando em qualquer estrela.

### Fase 3: Fabricação, replicação e base secreta

**Objetivo:** o "We Are Many" de fato.

- Fábrica, receitas, fila de produção.
- Construção de nova sonda-cópia com nome e traços de personalidade.
- Ordens para cópias (explorar, minerar, construir) e comportamento autônomo básico.
- Trocar o controle entre cópias; árvore genealógica.
- Árvore tecnológica inicial (propulsão, mineração, fabricação, sensores).
- Comunicação com atraso e relés quânticos.
- **Base secreta:** fixar, mover (custo e limite por tempo), armazém, backup único e respawn com uma nave.

**Critério de saída:** o jogador cria 5 ou mais cópias que exploram e mineram sozinhas; perde todas e renasce na base com os upgrades do último backup.

### Fase 4: Superfície 2D e terraformação básica

**Objetivo:** a segunda metade do jogo.

- Ação "Observar" com transição 3D ⇄ 2D e descarga de memória.
- Tela no estilo WorldBox: barra de poderes, câmera com zoom e arrastar, um pixel por elemento.
- Geração do mapa 2D a partir dos parâmetros do planeta, com tamanho proporcional ao raio.
- Biomas, camadas de visualização.
- Ferramentas de terraformação iniciais (relevo, água, impacto de cometa, semear vida simples).
- Simulação climática simplificada (temperatura, umidade, nível do mar) em worker.
- Persistência do planeta como diff.

**Critério de saída:** pegar um planeta árido, terraformar e vê-lo mudar de bioma ao longo do tempo, voltar ao 3D e encontrar o planeta alterado.

### Fase 5: Espécies e colonização

**Objetivo:** vida e consequências.

- Espécies nativas geradas (flora, fauna, uma espécie inteligente primitiva em planetas raros).
- Ecossistema simplificado (populações, cadeia alimentar, migração).
- Ferramentas de gestão: proteger, realocar, controlar populações, introduzir espécies de outro planeta.
- Espécies primitivas com aldeias e evolução tecnológica; intervenção discreta.
- Naves de transporte de colonos humanos e colônias.
- Eventos naturais.

**Critério de saída:** acompanhar uma espécie primitiva por várias gerações, com intervenções do jogador mudando seu destino.

### Fase 6: Ameaças, narrativa e conteúdo

**Objetivo:** tensão e propósito.

- Sondas rivais com IA (competem por sistemas, atacam).
- Combate automático/semiautomático e defesas; destruição de naves e destroços coletáveis.
- O Enxame como ameaça crescente de longo prazo.
- Anomalias, eventos e linha narrativa com marcos.
- Tutorial completo e balanceamento.

**Critério de saída:** uma campanha solo com começo, meio e um "fim de ato" jogável do início ao fim.

### Fase 7: Multiplayer cooperativo

**Objetivo:** jogar com amigos.

- Servidor autoritativo usando o `core` existente; contas, login e save na nuvem.
- Criar universo coop e convidar amigos (até 4 jogadores).
- Visibilidade de outros jogadores, troca de recursos, rede de relés compartilhada.
- Bases secretas individuais e regras de permissão sobre planetas.
- Progresso enquanto os jogadores estão fora, calculado no servidor.

**Critério de saída:** 4 jogadores no mesmo universo por várias sessões, sem inconsistências de estado.

### Fase 8: Escala e polimento

- Expansão do catálogo com GCNS e fatias do Gaia DR3 (e DR4 quando disponível).
- Fundo galáctico procedural para além do catálogo.
- Otimizações (WebGPU opcional, compressão de texturas KTX2/Basis).
- Localização adicional.
- Avaliar universo público com nascimento em posições aleatórias distantes (RF-ONL-07) e possíveis recursos pagos.

---

## 9. Riscos e mitigação

| Risco | Impacto | Mitigação |
|---|---|---|
| Precisão numérica em escalas gigantes (jitter, z-fighting) | Alto | Spike na Fase 0; origem flutuante, frames aninhados e depth logarítmico desde o início. |
| Escopo enorme (dois jogos em um: 4X espacial + god game) | Alto | Fases com critério de saída jogável; superfície 2D só depois do loop espacial estar divertido. |
| Velocidade adaptativa desconfortável (enjoo, perda de referência) | Médio | Efeitos visuais de velocidade (streaks de estrelas), desaceleração suave, testes cedo no Spike 2. |
| Universo real é "vazio" e repetitivo | Médio | Conteúdo procedural rico, anomalias, eventos, e foco em sistemas com dados reais interessantes. |
| Volume do Gaia | Médio | Começar com HYG; Gaia só em fatias e LOD por brilho. |
| Mapas 2D grandes (super-Terras) pesados | Médio | Teto técnico de tamanho, simulação em worker, renderização do mapa inteiro como textura. |
| Simulação de ecossistema pesada no navegador | Médio | Rodar em worker, com tick reduzido e simplificação estatística em vez de agentes individuais em larga escala. |
| Transição 3D/2D com vazamento de memória | Médio | Rotina de `dispose` testada e medição de memória em CI (Playwright + métricas). |
| Propriedade intelectual da obra original | Alto | Termos genéricos permitidos; nomes específicos da obra proibidos. |
| Custo de servidor no coop | Baixo | Grupos pequenos, simulação por eventos, dados estáticos em CDN. |

---

## 10. Questões em aberto

1. **Backup para o respawn:** escolher entre
   - **(A) Backup manual com agendamento:** o jogador envia o backup para a base quando quer ou programa envios automáticos (por exemplo, a cada X minutos). Dá uma decisão a mais ao jogador e um risco real ao explorar.
   - **(B) Sincronização automática:** a base sempre tem o estado mais recente das naves. Mais simples e sem frustração.
   - **Sugestão:** um meio-termo entre os dois. A sincronização é automática (B), mas só acontece enquanto a nave está ligada à base pela rede de relés de comunicação. Fora da rede, vale o último backup recebido. Isso reaproveita a mecânica de comunicação, mantém um backup único e dá motivo para expandir a rede, sem exigir que o jogador lembre de enviar backups.
2. **Custo e limite para mover a base:** valores iniciais para balancear (sugestão: grande quantidade de recursos raros e uma mudança a cada 24 horas de jogo).
3. **Nomes próprios:** nome da rede de comunicação, da facção hostil (o nome provisório é "Enxame"), da primeira espécie primitiva de destaque e da própria base secreta.
4. **Fator de compressão dos sistemas:** escala logarítmica ou fator fixo? A decisão sai do Spike 2, testando as duas.
5. **Universo público:** confirmar, mais adiante, se vale a pena além do coop por convite.

---

## 11. Glossário

| Termo | Significado |
|---|---|
| Chunk | Bloco de dados de uma região do espaço, carregado e descarregado sob demanda. |
| Octree | Estrutura que divide o espaço em cubos, cada um subdividido em 8, usada para indexar chunks. |
| LOD | Nível de detalhe: menos detalhe para o que está longe. |
| Origem flutuante | Técnica que mantém a câmera perto da origem numérica para evitar erros de precisão. |
| Paralaxe | Deslocamento aparente de uma estrela usado para medir sua distância. |
| Magnitude | Medida de brilho; quanto menor o número, mais brilhante. |
| Diff | Registro apenas do que mudou em relação ao estado gerado proceduralmente. |
| TAP/ADQL | Protocolo e linguagem de consulta padrão de arquivos astronômicos (similar a SQL). |
| Cópia | Nova sonda criada por replicação do jogador, com personalidade levemente diferente. |

---

### Fontes de dados citadas

- HYG Database: github.com/astronexus/HYG-Database
- ESA Gaia Archive: gea.esac.esa.int/archive
- NASA Exoplanet Archive: exoplanetarchive.ipac.caltech.edu
- Exoplanet.eu: exoplanet.eu · Open Exoplanet Catalogue: github.com/OpenExoplanetCatalogue
- JPL Horizons: ssd.jpl.nasa.gov/horizons
- SIMBAD: simbad.cds.unistra.fr
- Solar System Scope Textures: solarsystemscope.com/textures

---

## 12. Registro de decisões

| Data | Decisão |
|---|---|
| 19/10/2026 | Tempo de viagem: nada de horas reais. Posições reais das estrelas, com velocidade adaptativa e sistemas em escala comprimida, para que o próximo ponto de interesse fique sempre a poucos minutos. |
| 19/10/2026 | Plataforma PC; controles WASD + mouse para mirar, Espaço sobe, Shift desce. |
| 19/10/2026 | Arte 3D simples e bela, leve. Arte 2D simples, praticamente igual ao WorldBox (um pixel por elemento), com tamanho do mapa proporcional ao planeta. |
| 19/10/2026 | Naves podem ser destruídas. Base secreta privada, posicionável, móvel com custo alto e limite por tempo; respawn com uma nave a partir de um backup único (regra exata do backup em aberto). |
| 19/10/2026 | Sem monetização por enquanto; recursos pagos podem ser avaliados no futuro. |
| 19/10/2026 | Solo como modo principal, coop opcional. Universo público com nascimento em pontos distantes fica para avaliar depois. |
| 19/10/2026 | Termos genéricos (motor, propulsor, espécie primitiva) liberados; nomes específicos da obra (Deltanos, Bobiverse, Bob etc.) proibidos. |
| 20/10/2026 | Navegação revista: velocidade direcional (só freia para o que está à frente), ganho 0,4, cruzeiro e passo de simulação maior para PCs lentos. |
| 20/10/2026 | Assistente de navegação com nome próprio, **GUIA**, em vez do nome do livro: radar, alvos, piloto automático, sugestões, varredura, marcadores e diário (seção 4.13). |
| 20/10/2026 | Toda estrela tem sistema planetário gerado pelo id; vizinhas com exoplanetas confirmados usam os reais. Pontos de interesse procedurais no espaço profundo e cometas visitantes garantem algo interessante sempre por perto. |
| 20/10/2026 | Sondas de extração adiantadas da Fase 2: planetas rochosos, anéis, cometas e destroços, com recursos finitos por corpo (seção 4.14). |
| 19/10/2026 | Vida nos planetas detalhada em [REQUISITOS-VIDA.md](REQUISITOS-VIDA.md): vida nativa rara em três níveis (25% vegetação, 8% animais, 1 em 10 destes inteligente), assentamentos com níveis, áreas, ruas e reinos, arte 16 bits. |
