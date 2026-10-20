# We Are Many: Requisitos da Vida nos Planetas

> Versão 0.2 · 20/10/2026 · complementa a seção 4.7 (SUP) do [REQUISITOS.md](REQUISITOS.md)
> Escopo: tudo o que acontece na superfície 2D depois que existe vida: espécies, ecossistema, evolução, civilizações, assentamentos, guerra, diplomacia, arte em pixel e o papel do jogador.

Itens marcados com **Implementado (Fase 0)** já existem no PR #1. O resto é requisito para as fases indicadas na seção 15.

---

## Sumário

1. [Princípios](#1-princípios)
2. [Onde existe vida](#2-onde-existe-vida)
3. [Espécies](#3-espécies)
4. [Ecossistema e cadeia alimentar](#4-ecossistema-e-cadeia-alimentar)
5. [Reprodução, ciclo de vida e população](#5-reprodução-ciclo-de-vida-e-população)
6. [Predação e caçada](#6-predação-e-caçada)
7. [Evolução com o tempo](#7-evolução-com-o-tempo)
8. [Clima, estações, doenças e desastres](#8-clima-estações-doenças-e-desastres)
9. [Espécies inteligentes e civilização](#9-espécies-inteligentes-e-civilização)
10. [Assentamentos: aldeias, vilas, cidades e reinos](#10-assentamentos-aldeias-vilas-cidades-e-reinos)
11. [Agricultura, domesticação, economia e comércio](#11-agricultura-domesticação-economia-e-comércio)
12. [Relações entre povos: diplomacia, união, guerra e revoltas](#12-relações-entre-povos-diplomacia-união-guerra-e-revoltas)
13. [Papel do jogador](#13-papel-do-jogador)
14. [Interface, arte e crônica](#14-interface-arte-e-crônica)
15. [Requisitos não funcionais](#15-requisitos-não-funcionais)
16. [Plano por fases](#16-plano-por-fases)
17. [Questões em aberto](#17-questões-em-aberto)
18. [Registro de decisões](#18-registro-de-decisões)

---

## 1. Princípios

1. **Vida é rara e valiosa.** Encontrar vida nativa é um acontecimento; a regra comum é o jogador levar vida da Terra e terraformar para ela sobreviver.
2. **O jogador gerencia, não cria.** Nenhuma espécie nasce do zero pela mão do jogador. Ele transporta, protege, controla, ensina e interfere.
3. **Tudo é visível no mapa.** Cada criatura é um pixel de longe e um sprite de perto, como no WorldBox. Casas, estradas, campos e exércitos aparecem no mapa, não só em painéis.
4. **Simulação emergente e barata.** Regras simples por indivíduo (fome, medo, reprodução, lealdade) geram comportamentos grandes (migrações, guerras, impérios). Nada de IA cara por criatura.
5. **O tempo é o motor.** Anos de jogo passam em segundos (hoje 1 ano = 6 s a 1x). Evolução, eras e impérios acontecem numa sessão, não em semanas.
6. **Consequências legíveis.** Toda mudança importante (extinção, guerra, nova era) vira uma linha na crônica, com o local no mapa.

---

## 2. Onde existe vida

| ID | Requisito | Situação |
|---|---|---|
| RF-VIDA-01 | Só planetas com clima favorável (água líquida possível e temperatura média tolerável) podem ter vida nativa. | Implementado (Fase 0) |
| RF-VIDA-02 | Entre os planetas favoráveis, a vida nativa vem em três níveis sorteados de forma determinística pela semente do planeta: **25% só vegetação**, **8% com animais nativos**, e **1 em cada 10** dos planetas com animais tem também uma **espécie inteligente** (~0,8% dos favoráveis). | Implementado (Fase 0) |
| RF-VIDA-03 | A Terra sempre tem vida completa: Peixe, Cervo, Lobo e Humano, mais vegetação. | Implementado (Fase 0) |
| RF-VIDA-04 | As espécies da Terra começam "a bordo": o jogador pode levá-las a qualquer planeta desde o início. Espécies nativas descobertas em outros planetas entram no catálogo e também podem ser levadas. | Implementado (Fase 0) |
| RF-VIDA-05 | Planetas "só vegetação" mostram flora nativa com paleta própria (derivada da estrela e do clima) e servem de base para introduzir fauna. | Parcial: vegetação genérica |
| RF-VIDA-06 | Vida microbiana pode existir como camada invisível que acelera a terraformação (solo fértil mais rápido) e é revelada por um scanner orbital. | Fase 5 |
| RF-VIDA-07 | O indicador de habitabilidade (RF-SUP-12) mostra, por espécie conhecida, a fração do mapa onde ela sobreviveria hoje. | Fase 5 |

---

## 3. Espécies

### 3.1 Tipos e atributos

| ID | Requisito | Situação |
|---|---|---|
| RF-VIDA-10 | Tipos de espécie: **peixe** (água), **herbívoro**, **predador** e **inteligente** (terra). | Implementado (Fase 0) |
| RF-VIDA-11 | Tipos adicionais: **flora** (árvores, arbustos, algas, com espécies próprias), **aves** (voam por cima de água e terra, migram), **anfíbios** (costa), **insetos/enxames** (agregados, polinizam e viram praga), **grandes animais** (megafauna, poucos indivíduos, muito impacto). | Parcial: anfíbios de costa (sapo, caranguejo, tartaruga, pinguim, crocodilo) andam na terra baixa e na água rasa; megafauna (mamute, elefante, baleia) com sprite maior |
| RF-VIDA-11a | **Banco genético da Terra:** 30 espécies com sprite próprio virado para a direção em que andam: coelho, galinha, sapo, caranguejo, besouro, cobra, tartaruga, pinguim, raposa, lobo, cervo, cabra, ovelha, javali, lhama, macaco, hiena, onça, urso, bisão, camelo, elefante, mamute, crocodilo, piranha, baleia, tartaruga-marinha, lula, peixe e tubarão. Na Terra já vivem 14 delas (peixe, cervo, lobo, humano, tubarão, coelho, bisão, raposa, urso, caranguejo, tartaruga, pinguim, baleia, camelo). Cada tipo divide o espaço entre as espécies do mesmo tipo, para que mais espécies não esgotem a vegetação. | Implementado (Fase 0) |
| RF-VIDA-11b | Predadores comem caça miúda (não sobrevivem só de presas grandes), caçam só com fome e as presas têm refúgio, para que lobo e cervo convivam por séculos. | Implementado (Fase 0) |
| RF-VIDA-12 | Cada espécie tem: nome, origem (planeta), cor, faixa de temperatura, bioma preferido, velocidade, idade adulta, idade máxima, dieta, tamanho, sociabilidade (solitária, bando, colônia), fertilidade e agressividade. | Parcial: sem bioma, dieta detalhada, tamanho e sociabilidade |
| RF-VIDA-13 | Nomes de espécies alienígenas são gerados por sílabas; nomes da Terra são os comuns em português. Nunca nomes da obra de referência. | Implementado (Fase 0) |
| RF-VIDA-14 | Espécies inteligentes alienígenas têm aparência própria e nomes de aldeias no idioma gerado da espécie. Corpos possíveis: réptil, felino, ave, inseto, anfíbio e urso (com versões de criança e de cada profissão), além do humano. | Implementado (Fase 0) |

### 3.2 Catálogo do jogador

| ID | Requisito |
|---|---|
| RF-VIDA-15 | O catálogo lista toda espécie conhecida com origem, faixa de clima, população total em todos os planetas e planetas onde vive. Hoje: janela **Espécies** (tecla E) com filtro por tipo, sprite, população, clima, situação (viva, extinta, nunca viveu aqui) e botão Soltar. |
| RF-VIDA-16 | Uma espécie extinta em todos os planetas fica marcada como extinta e não pode mais ser introduzida. |
| RF-VIDA-17 | Variantes evoluídas (seção 7) aparecem no catálogo como subespécies ligadas à original. |

---

## 4. Ecossistema e cadeia alimentar

| ID | Requisito | Situação |
|---|---|---|
| RF-VIDA-20 | Cadeia alimentar básica: vegetação → herbívoros → predadores; plâncton implícito → peixes; inteligentes comem peixes, caça e plantações. | Implementado (Fase 0), sem plâncton nem plantações |
| RF-VIDA-21 | Herbívoros consomem a vegetação do tile; vegetação comida demora a voltar. Superpopulação gera desertificação local. | Parcial: consumo existe, desertificação não |
| RF-VIDA-22 | Capacidade de suporte por espécie calculada pelo habitat disponível (área de água ou terra com clima tolerável), recalculada quando o terreno muda. | Implementado (Fase 0) |
| RF-VIDA-23 | Ciclos predador–presa emergentes (populações oscilam), sem extinção imediata de nenhum lado em condições normais. | Implementado (Fase 0), equilíbrio a ajustar |
| RF-VIDA-24 | Decompositores implícitos: corpos de animais mortos enriquecem a fertilidade do tile por um tempo. | Fase 5 |
| RF-VIDA-25 | Fertilidade do solo como camada própria (nova camada de visualização), afetada por vegetação, cinzas vulcânicas, erosão e agricultura. | Fase 5 |
| RF-VIDA-26 | Espécies invasoras: uma espécie introduzida sem predador natural pode explodir e desequilibrar o ecossistema; o jogo avisa quando a população passa de 2× a capacidade prevista. | Fase 5 |

---

## 5. Reprodução, ciclo de vida e população

| ID | Requisito | Situação |
|---|---|---|
| RF-VIDA-30 | Cada indivíduo tem idade, energia e fase (filhote, adulto, velho). Só adultos com energia acima de um limiar se reproduzem. Inteligentes: crianças (menores, sem profissão, ficam perto de casa) ganham profissão ao virar adultas; idosos (a partir de 75% da expectativa de vida) têm cabelo grisalho e bengala, andam devagar, não trabalham nem têm filhos. A expectativa de vida cresce 12% por era. A morte de reis e líderes de reinos entra nos acontecimentos com a idade. | Implementado (Fase 0) |
| RF-VIDA-31 | Morte por idade máxima, fome, predação, frio/calor fora da faixa, afogamento (terrestre na água) ou encalhe (peixe em terra). | Implementado (Fase 0) |
| RF-VIDA-32 | Reprodução por tipo: peixes desovam várias crias, herbívoros têm 1–2 filhotes, predadores ninhadas pequenas, inteligentes um filho por vez com intervalo longo (cerca de 0,13 filho por adulto por ano, para a história durar). | Parcial |
| RF-VIDA-33 | Gestação/intervalo mínimo entre crias por espécie, para evitar explosões. | Fase 5 |
| RF-VIDA-34 | Teto global de indivíduos simulados por planeta (orçamento, seção 15). Acima dele, a população é agregada (um indivíduo representa vários) sem mudar o comportamento visível. | Fase 5 |
| RF-VIDA-35 | Filhotes seguem adultos do bando; inteligentes jovens ficam perto de casa. | Fase 5 |
| RF-VIDA-36 | Reprodução sazonal opcional por espécie (seção 8). | Fase 5 |

---

## 6. Predação e caçada

| ID | Requisito | Situação |
|---|---|---|
| RF-VIDA-40 | Predadores procuram a presa mais próxima num raio, perseguem e matam; ganham energia ao comer. | Implementado (Fase 0) |
| RF-VIDA-41 | Presas fogem de predadores próximos (raio de alerta por espécie). | Parcial |
| RF-VIDA-42 | **Caçada em grupo:** predadores sociais (ex.: lobos) caçam em matilha, cercando a presa; a chance de sucesso cresce com o tamanho do grupo; podem abater presas maiores (megafauna). | Fase 5 |
| RF-VIDA-43 | **Caça por inteligentes:** caçadores saem da aldeia, perseguem herbívoros e peixes (pesca na costa), voltam com comida. A eficiência cresce com a era (lança, arco, armadilha, rede, barco). Caça sustentável: poupam a espécie quando ela cai abaixo de 25% do teto. | Parcial: caçadores abatem herbívoros por perto; pesca feita por barcos (seção 10.5) |
| RF-VIDA-44 | Predadores atacam inteligentes isolados nas eras iniciais; aldeias se defendem em grupo e, a partir do Bronze, caçam predadores próximos para proteger rebanhos. | Fase 5 |
| RF-VIDA-45 | Caça excessiva pode extinguir uma espécie localmente; a crônica registra a extinção local e global. | Fase 5 |
| RF-VIDA-46 | Territórios de caça: bandos de predadores evitam o território de outros bandos da mesma espécie (disputas ocasionais). | Fase 6 |

---

## 7. Evolução com o tempo

O jogador nunca cria espécies. A evolução modifica espécies existentes de forma lenta, legível e limitada.

| ID | Requisito |
|---|---|
| RF-VIDA-50 | **Adaptação:** populações que vivem por várias gerações perto do limite da sua faixa de temperatura deslocam a faixa aos poucos (ex.: +1 K a cada N gerações), até um limite por espécie. |
| RF-VIDA-51 | (Parcial: o evento "espécie nova" cria uma variante já adaptada a um lugar, ex.: "Lobo-das-neves", "Camelo-do-deserto", ligada à original no catálogo.) **Variantes:** uma população isolada geograficamente (sem contato por muitas gerações, por exemplo em outra ilha ou outro planeta) vira uma **subespécie** com nome derivado (ex.: "Cervo-das-neves"), cor ajustada e atributos levemente diferentes. |
| RF-VIDA-52 | **Especiação lenta:** uma subespécie que acumula diferenças suficientes vira espécie nova no catálogo. Isso leva centenas de anos de jogo, não minutos. |
| RF-VIDA-53 | Atributos que podem mudar: faixa de temperatura, tamanho, velocidade, fertilidade, cor. Dieta e tipo (peixe vira terrestre etc.) **não** mudam, para manter a legibilidade. |
| RF-VIDA-54 | **Extinção:** uma espécie some de um planeta quando a população chega a zero; some do jogo quando some de todos. Extinções locais podem ser revertidas reintroduzindo de outro planeta. |
| RF-VIDA-55 | **Surgimento de inteligência:** só a partir de espécies que já sejam inteligentes. Herbívoros e predadores nunca viram inteligentes (decisão para preservar a raridade e o pilar "não criar"). |
| RF-VIDA-56 | Pressões evolutivas visíveis num painel da espécie: "adaptando-se ao frio", "isolada há 120 anos", com a tendência dos atributos. |

---

## 8. Clima, estações, doenças e desastres

| ID | Requisito |
|---|---|
| RF-VIDA-60 | **Estações:** o ano tem estações conforme a inclinação do planeta. No inverno a vegetação para de crescer nas latitudes altas, a água congela perto dos polos e animais migram. |
| RF-VIDA-61 | **Migração:** espécies se deslocam para áreas mais favoráveis quando o tile fica hostil (frio, seca, fome). Aves fazem migrações sazonais longas. |
| RF-VIDA-62 | **Doenças:** surtos começam em populações densas (aldeias grandes, rebanhos). Espalham-se por contato, com taxa de mortalidade por doença. Espécies vindas de outro planeta podem trazer doenças desconhecidas aos nativos. |
| RF-VIDA-63 | **Pragas:** enxames de insetos ou herbívoros em excesso devoram plantações e vegetação. |
| RF-VIDA-64 | **Desastres:** secas, enchentes, incêndios florestais (espalham-se pela vegetação seca), vulcões, terremotos, eras glaciais, impactos. Desastres naturais seguem o clima e a geologia; desastres causados pelo jogador (cometa) seguem as ferramentas. |
| RF-VIDA-65 | Desastres e doenças sempre geram uma linha na crônica com o local, e o jogador pode clicar para levar a câmera até lá. |
| RF-VIDA-67 | **Gestão de eventos:** o mundo sorteia eventos aleatórios, 2,5% por ano normalmente e 20% por ano quando passam 30 anos sem nada importante (mundo monótono). O sorteio pesa o estado do mundo: espécie extinta favorece o reaparecimento, poucos povos favorecem nômades, mundo grande favorece peste. Na janela **Mundo** o jogador liga ou desliga os eventos automáticos e escolhe a frequência (rara, normal, frequente). | Implementado (Fase 0) |
| RF-VIDA-68 | **Eventos:** cometa (cratera que vira lago, borda levantada, minério do espaço, povo perto passa a crer no cometa), terremoto (falha que levanta o chão, derruba casas, abre caverna com minério), vulcão e ilha vulcânica (lava que esfria em rocha e jazidas), incêndio florestal, seca, peste num assentamento grande, nômades (um povo novo, com cultura própria, surge longe dos outros), espécie nova (variante, RF-VIDA-51), reaparecimento de espécie extinta, migração de rebanho e era de ouro (um povo aprende mais rápido por um tempo). Os desastres ficam longe das capitais quando sorteados, mas o jogador pode lançá-los onde quiser (aba Eventos). | Implementado (Fase 0) |
| RF-VIDA-69 | Efeitos visuais dos eventos: cometa descendo, explosão, fumaça, fogo, tremor da câmera e ruínas onde casas foram destruídas (somem em 40 anos). | Implementado (Fase 0) |
| RF-VIDA-66 | Mudanças de terreno do jogador afetam a vida na hora: transformar mar em terra mata peixes, inundar terra afoga terrestres (implementado na Fase 0), aquecer demais mata quem está fora da faixa. |

---

## 9. Espécies inteligentes e civilização

### 9.1 Indivíduos

| ID | Requisito | Situação |
|---|---|---|
| RF-VIDA-70 | Cada inteligente pertence a um assentamento, tem idade, energia e uma profissão: coletor, caçador, pescador, agricultor, construtor, guerreiro, sacerdote, comerciante (as profissões liberam conforme a era). | Parcial: 11 profissões com aparência própria (coletor, caçador, agricultor, lenhador, construtor, minerador, ferreiro, soldado, guarda, líder, rei), liberadas por era, nível e condições: minerador desde a Pedra (explora e trabalha nas minas), ferreiro só com ferraria, pescador só com porto, mais soldados em povos guerreiros; faltam sacerdote e comerciante |
| RF-VIDA-71 | Comportamento base: trabalhar perto de casa durante o dia, voltar ao centro, fugir de predadores, procurar comida quando com fome. | Parcial |
| RF-VIDA-72 | Líder por assentamento (chefe, rei, prefeito conforme a era), com traço de personalidade (pacífico, ambicioso, devoto, mercador) que influencia diplomacia e guerra. | Fase 6 |

### 9.2 Eras tecnológicas

As eras atuais do código (`ERAS` em `src/sim/ecosystem.ts`):

| Era | Desbloqueia |
|---|---|
| Era | Desbloqueia | Condição para sair dela |
|---|---|---|
| Idade da Pedra | Cabanas de palha, coleta, caça com lança, fogo, aldeias pequenas, canoas | Fazer 5 peças de bronze (cobre + estanho numa ferraria) |
| Idade do Bronze | Casas de madeira com telhado, agricultura, ferramentas melhores, comércio de troca, vilas, fundição de ferro | Fazer 8 peças de ferro |
| Idade do Ferro | Casas de pedra, armas de ferro, exércitos organizados, estradas, cidades, deserto colonizável | Extrair 120 de pedra e fazer 30 peças de ferro |
| Era Medieval | Castelos, reinos, religião organizada, caravelas, aço (ferro + carvão) | Extrair 60 de carvão e fazer 10 peças de aço |
| Era Industrial | Fábricas, navios a vapor, cidades densas. Última era: os povos não vão ao espaço | — |

| ID | Requisito | Situação |
|---|---|---|
| RF-VIDA-73 | Cada assentamento tem progresso tecnológico próprio; a era aparece no painel e muda a arte das casas. **Ritmo lento:** com 30 habitantes, cada era leva 300, 350, 450 e 550 anos (Industrial perto do ano 1.300); população e tamanho do reino aceleram no máximo 1,3× e 1,25×. O painel mostra o progresso rumo à próxima era. **Mudar de era exige condições, não só tempo** (tabela acima): sem os minérios achados e trabalhados, o progresso para em 99% e o painel do assentamento diz o que falta. Povos que valorizam conhecimento aprendem 20% mais rápido. | Implementado (Fase 0) |
| RF-VIDA-74 | Tecnologia se espalha: assentamentos vizinhos e parceiros comerciais avançam mais rápido; um reino compartilha a era da capital com atraso. | Fase 6 |
| RF-VIDA-75 | O jogador pode **ensinar** (adiantar o progresso), com custo e com risco: ensinar demais causa instabilidade (ver RF-VIDA-131). | Implementado (Fase 0), sem custo e sem risco |
| RF-VIDA-76 | **Os povos não vão ao espaço por conta própria.** A Era Industrial é a última era; depois dela a história continua no planeta (crescimento das cidades, colonização pelo mar, relações entre povos). | Decidido |
| RF-VIDA-77 | A Era Industrial polui: aumenta a temperatura média e reduz vegetação ao redor das cidades, criando tensão com a terraformação do jogador. | Fase 6 |

### 9.3 Cultura e crenças

| ID | Requisito | Situação |
|---|---|---|
| RF-VIDA-78 | Cada povo (cultura) tem nome (derivado do assentamento fundador, ex.: Tekvenses), cor, um valor principal (guerra, comércio, fé, conhecimento), tolerância a outros povos e uma crença. Colônias herdam o povo; assentamentos conquistados mantêm o seu. O valor muda o comportamento: guerra = mais soldados e relações piores; comércio = mercado desde aldeia e comércio em dobro; fé = templo desde o Bronze e relações melhores; conhecimento = eras 20% mais rápidas. | Implementado (Fase 0), sem idioma gerado |
| RF-VIDA-79 | Crenças leves: um povo pode adorar fenômenos que viu (o "cometa", a "luz no céu" que é a nave do jogador). As intervenções do jogador alimentam essas crenças e mudam a cultura (ex.: um povo que recebeu ajuda após um desastre fica mais pacífico e devoto). | Parcial: cada povo tem uma crença (o Sol, o Mar, a Luz no Céu...), ainda sem efeito das intervenções |
| RF-VIDA-80 | Templos e marcos culturais aparecem nas cidades conforme o valor principal. | Parcial: templo mais cedo em povos de fé |
| RF-VIDA-81 | **Cisma e independência:** um assentamento grande (20+) e longe da capital (50+ tiles) pode declarar independência, levando os vizinhos próximos, e formar um povo novo com cultura e cor próprias. Capitais intolerantes perdem colônias com o dobro da chance. | Implementado (Fase 0) |

---

## 10. Assentamentos: aldeias, vilas, cidades e reinos

### 10.1 Níveis

| ID | Requisito | Situação |
|---|---|---|
| RF-VIDA-90 | Níveis de assentamento pela população: **Aldeia** (< 25), **Vila** (25 a 59), **Cidade** (60 a 139), **Metrópole** (≥ 140). O nível sobe quando a população alcança o limite; descer de nível quando a população cai fica para depois. | Implementado (Fase 0), só sobe |
| RF-VIDA-91 | **Reino:** uma cidade capital mais os assentamentos subordinados a ela: colônias que ela fundou e aldeias que ficaram dentro da sua área. O reino tem nome, cor e líder; o rótulo da capital mostra o reino. | Implementado (Fase 0), sem líder |
| RF-VIDA-92 | Quando a capital cai de nível (vira vila) ou é conquistada, o reino pode se desfazer ou mudar de capital para a maior cidade restante. | Fase 6 |
| RF-VIDA-93 | Impérios (vários reinos sob um) e confederações ficam como evolução do sistema de alianças (seção 12). | Futuro |

### 10.2 Área e fundação

| ID | Requisito | Situação |
|---|---|---|
| RF-VIDA-94 | Cada assentamento tem uma **área circular** com raio por nível: aldeia **8**, vila **12**, cidade **18**, metrópole **25** tiles. | Implementado (Fase 0) |
| RF-VIDA-95 | **Nenhum assentamento pode ser fundado dentro da área de outro.** Colonos e o jogador (ferramenta de espécie inteligente) só fundam fora de todas as áreas existentes. | Implementado (Fase 0) |
| RF-VIDA-96 | A área de uma **cidade pode crescer e conter aldeias**; essas aldeias passam a pertencer ao reino da cidade. **O contrário não acontece**: uma aldeia ou vila nunca contém uma cidade, e assentamentos que não são cidades não expandem a área sobre outros. | Implementado (Fase 0) |
| RF-VIDA-97 | A área é visível como contorno suave com a cor do reino quando o jogador passa o mouse ou ativa a camada "Território". | Fase 5 |
| RF-VIDA-98 | Fronteiras de reino: a união das áreas dos assentamentos do reino; tiles disputados entre dois reinos geram tensão (seção 12). | Fase 6 |
| RF-VIDA-99 | Fundação inteligente: colonos preferem locais com água doce ou costa por perto, terra plana, vegetação e distância razoável do assentamento de origem; evitam montanha, gelo e deserto (a partir da Idade do Ferro, poços e irrigação abrem o deserto). Por terra, só vão a pé: não atravessam água. | Parcial: escolhe terra habitável e alcançável a pé |

### 10.3 Planta do assentamento

| ID | Requisito | Situação |
|---|---|---|
| RF-VIDA-100 | Todo assentamento tem uma **praça central** com fogueira (Pedra) ou poço (Bronze em diante); a praça de uma cidade ganha uma fortaleza com a bandeira do reino. | Implementado (Fase 0) |
| RF-VIDA-101 | **Ruas orgânicas:** de 3 a 5 ruas principais saem da praça em direções sorteadas e serpenteiam; o comprimento cresce com o nível (aldeia curta, cidade longa). Cada assentamento tem sua planta própria e estável: o nível seguinte só estende as ruas. Ruas são tiles de terra batida pintados no mapa e não passam por água. | Implementado (Fase 0) |
| RF-VIDA-102 | **Casas em lotes ao longo das ruas**, dos dois lados, a cada 3 tiles com uma pequena folga irregular, ocupando primeiro os lotes mais perto da praça. Casas nunca ficam na água nem sobre a rua. | Implementado (Fase 0) |
| RF-VIDA-103 | **Estradas de terra** ligam assentamentos do mesmo reino, contornando água quando possível. | Implementado (Fase 0), traçado em linha reta interrompido na água |
| RF-VIDA-104 | Ruas laterais nascem das principais em ângulos variados, mais numerosas e longas em vilas, cidades e metrópoles (sem grade quadrada). Futuro: ruas crescem sob demanda, quando os lotes acabam. | Implementado (Fase 0), planta fixa por nível |
| RF-VIDA-105 | **Campos cultivados** (seção 11) em volta das casas da periferia, a partir do Bronze. | Fase 5 |
| RF-VIDA-106 | **Muralhas por era:** paliçada de madeira (Ferro), muralha de pedra com portões nas ruas (Medieval), contornando a área da cidade. | Fase 6 |
| RF-VIDA-107 | **Edifícios especiais:** castelo/palácio na capital do reino, templo, mercado, quartel, celeiro, ferraria (exige metal no estoque), moinho, fábrica (Industrial), porto (seção 10.5), mina (seção 11.1), pontes onde estradas cruzam rios estreitos, marcos (estátua, torre, maravilha; RF-VIDA-124d) que contam a história. Toda construção custa madeira e pedra do estoque do reino (casa: 4 de madeira, ou 4 de pedra e 1 de madeira a partir da Era Medieval; especiais: 10 de madeira e 2 a 8 de pedra; porto: 12 de madeira; mina: 6 de madeira); sem material, a obra espera. | Parcial: faltam pontes e torres |
| RF-VIDA-108 | Assentamentos abandonados (população zero) deixam ruínas por um tempo; ruínas podem ser reocupadas. | Parcial: some, sem ruínas |

### 10.4 Crescimento

| ID | Requisito | Situação |
|---|---|---|
| RF-VIDA-109 | Novas casas surgem quando a população passa da capacidade das casas existentes. Cada casa abriga 4 + era pessoas (sobrados e prédios abrigam mais), e o teto de inteligentes do planeta cresce 30% por era, para as cidades não pararem de crescer. | Implementado (Fase 0) |
| RF-VIDA-110 | Assentamentos lotados (mais de 26 pessoas, ou sem lote livre, como numa ilha pequena) enviam colonos para fundar novas aldeias fora de qualquer área existente, por terra ou por mar; a nova aldeia pertence ao reino de origem. | Implementado (Fase 0) |
| RF-VIDA-111 | Casas são reconstruídas no estilo da era quando o assentamento avança. | Implementado (Fase 0) |

### 10.5 Mar: portos, barcos e perigos

Povos presos numa ilha ou numa costa usam o mar para crescer, com barcos coerentes com a época.

| ID | Requisito | Situação |
|---|---|---|
| RF-VIDA-112 | **Porto:** a partir do fim da Idade da Pedra, um assentamento com costa para o mar (não para um lago) constrói um porto no tile de costa mais perto do centro, ligado à praça por uma rua. | Implementado (Fase 0) |
| RF-VIDA-113 | **Barcos por era:** canoa (Pedra), barco a remo (Bronze), veleiro (Ferro), caravela (Medieval) e navio a vapor (Industrial). Cada um mais rápido, maior (4, 6, 8, 12 e 20 colonos), com mais alcance (35 a 700 tiles de mar) e mais seguro. Os barcos têm a cor do reino. | Implementado (Fase 0) |
| RF-VIDA-114 | **Pesca:** com porto, surgem pescadores; até 3 barcos de pesca saem do porto, pescam em volta e voltam. O peixe fica guardado e alimenta quem tem fome. | Implementado (Fase 0) |
| RF-VIDA-115 | **Colonização pelo mar:** quando não há onde fundar a pé, o assentamento procura pelo mar (busca de rota pela água, dentro do alcance do barco) uma costa livre e manda adultos que não sejam o líder; ao chegar, fundam uma aldeia do mesmo reino. | Implementado (Fase 0) |
| RF-VIDA-116 | **Tempestades:** a cada tile navegado há chance de naufrágio, alta na canoa e quase nula no navio a vapor; todos a bordo morrem e os destroços boiam um pouco. | Implementado (Fase 0) |
| RF-VIDA-117 | **Predadores marinhos** (tubarão na Terra; espécie própria em planetas com animais): caçam peixes e atacam barcos que passam perto. Canoas e barcos a remo podem afundar; barcos maiores perdem um colono. | Implementado (Fase 0) |
| RF-VIDA-118 | **Outros riscos:** ficar à deriva (o barco para e a comida pode acabar) e doença a bordo em viagens longas. Todo naufrágio e morte no mar entra nos acontecimentos. | Implementado (Fase 0) |
| RF-VIDA-119 | Futuro: comércio por mar entre portos, guerras navais, faróis e estaleiros. | Fase 6 |

---

## 11. Agricultura, domesticação, economia e comércio

A economia faz parte do crescimento: o povo junta recursos, constrói com eles, troca o que sobra e só avança de era quando acha e trabalha os minérios certos. Não é questão de tempo, é questão de condições.

| ID | Requisito | Situação |
|---|---|---|
| RF-VIDA-120 | **Plantação:** a partir do Bronze, agricultores criam campos (tiles marcados, com sprite de lavoura que muda com a estação) em solo fértil perto das casas. Campos produzem comida e reduzem a necessidade de caça. | Parcial: campos de trigo, sem estação |
| RF-VIDA-121 | Colheita sazonal; secas, pragas e frio reduzem a produção e podem causar fome. | Fase 5 |
| RF-VIDA-122 | Irrigação (Ferro em diante) permite campos mais longe da água. | Parcial: deserto colonizável a partir do Ferro |
| RF-VIDA-123 | **Domesticação:** herbívoros próximos podem ser domesticados; viram rebanho (sprites seguindo pastores), fornecem comida e tração. Rebanhos atraem predadores. | Fase 5 |
| RF-VIDA-124 | **Estoque do reino** (guardado na capital, usado por todos os assentamentos do reino): madeira, pedra, cobre, estanho, ferro, carvão, ouro, ferramentas e armas, mais a comida dos barcos de pesca. Madeira e pedra têm limite de armazém (200 + 20 por habitante). O painel do assentamento (mouse sobre a área) mostra o estoque. | Implementado (Fase 0) |
| RF-VIDA-124a | **Lenha:** lenhadores produzem madeira conforme a floresta em volta; o corte desbasta a vegetação perto do assentamento. | Implementado (Fase 0) |
| RF-VIDA-124b | **Pedra:** mineradores sem mina e construtores tiram pedra, quatro vezes mais onde há rocha ou colina por perto. | Implementado (Fase 0) |
| RF-VIDA-124c | **Ferraria:** cada ferreiro faz cerca de 0,6 peça por ano com o metal do estoque: bronze (2 cobre + 1 estanho), ferro (2 ferro, a partir do Bronze), aço (2 ferro + 1 carvão, a partir da Era Medieval). Primeiro ferramentas (até 30% dos adultos; aumentam a produção em 40% e se gastam), depois armas (definem a força na guerra). O que os ferreiros fazem depende do que foi minerado. | Implementado (Fase 0) |
| RF-VIDA-124d | **Monumentos:** cidades grandes erguem estátuas (pedra e ouro) e a capital de um reino rico ergue uma maravilha conforme o valor do povo: Grande Arena (guerra, dá força), Grande Bazar (comércio), Catedral (fé) e Grande Biblioteca (conhecimento). | Implementado (Fase 0) |
| RF-VIDA-125 | **Comércio:** uma vez por ano, reinos vizinhos em paz e com mercado trocam excedentes (madeira e pedra: quem tem mais de 25 manda 5 a quem tem menos de 5; minérios: mais de 10 manda 4 a quem tem menos de 4), pagando em ouro quando podem. Vizinhos amigos (relação > 20) fazem escambo mesmo sem mercado, e reinos com porto e mercado comerciam pelo mar com quem já conhecem. Comércio melhora a relação (em dobro para povos comerciantes). Futuro: comerciantes visíveis nas estradas e espalhar tecnologia. | Parcial |
| RF-VIDA-126 | Desmatamento e mineração aparecem no mapa e afetam a vegetação e a fauna. | Parcial: corte desbasta a vegetação; minas aparecem no mapa |

### 11.1 Minérios, cavernas e minas

| ID | Requisito | Situação |
|---|---|---|
| RF-VIDA-127a | **Jazidas limitadas:** o planeta nasce com jazidas de cobre, estanho (mais raro), ferro, ouro e carvão em rocha, montanha e colinas (cerca de uma a cada 2.200 tiles de terra), cada uma com 30 a 260 unidades. 60% são **cavernas** (entrada escura na rocha), o resto são **veios** na superfície; os pontos do sprite têm a cor do minério. | Implementado (Fase 0) |
| RF-VIDA-127b | **Descoberta:** coletores, caçadores, lenhadores, construtores e mineradores que passam a até 2 tiles de uma jazida a descobrem para o reino ("Enka encontrou estanho numa caverna"). Caçadores e mineradores sem mina exploram mais longe de casa. | Implementado (Fase 0) |
| RF-VIDA-127c | **Abrir mina:** um assentamento com mineradores abre mina numa jazida conhecida, alcançável a pé e a até seu raio + 25 tiles, pagando madeira; prefere o minério que falta para a próxima era. Até 1 + nível minas por assentamento. Uma estrada liga a mina ao centro, e o sprite vira entrada escorada com carrinho. | Implementado (Fase 0) |
| RF-VIDA-127d | **Extração:** cada minerador tira cerca de 0,8 unidade por ano (mais com ferramentas) para o estoque do reino; quando a jazida acaba, a mina fecha ("A mina de cobre de Orlu se esgotou") e o povo precisa achar outra. | Implementado (Fase 0) |
| RF-VIDA-127e | **Ajuda do jogador:** ferramentas de Terreno colocam um veio de cobre, estanho, ferro, ouro ou carvão (100 unidades) num tile de terra livre. É ajuda leve: o povo ainda precisa encontrar o veio e abrir a mina. | Implementado (Fase 0) |
| RF-VIDA-127f | Futuro: minas profundas na Era Industrial (mais produção, mais risco de desabamento), minérios alienígenas em planetas com vida própria. | Fase 6 |

### 11.2 Catálogo de itens

| ID | Requisito | Situação |
|---|---|---|
| RF-VIDA-128a | **Itens:** 34 itens em quatro categorias (ferramentas, armas, armaduras, joias) e seis materiais (madeira, pedra, bronze, ferro, aço, ouro), cada um com ícone em pixel pintado na cor do material: machado, faca, martelo, vara de pesca, enxada, picareta, serra, lança, arco, espada, besta, machado de guerra, mosquete, escudo, elmo, cota de malha, armadura de placas, anel, amuleto e coroa. A era mínima limita o que sai (besta no Renascimento, mosquete na Era Industrial). | Implementado (Fase 0) |
| RF-VIDA-128b | Na Idade da Pedra construtores e coletores fazem ferramentas, lanças, arcos e escudos de pedra e madeira, sem ferraria. Com ferraria o material vem do metal minerado; parte das peças vira armadura (conta na força da guerra). Ourives transformam ouro em joias. O primeiro item de metal do mundo vai para a crônica. | Implementado (Fase 0) |
| RF-VIDA-128c | Janela **Itens** (tecla I): todos os itens, quantos já foram feitos no mundo e os que ainda ninguém sabe fazer (apagados). | Implementado (Fase 0) |

---

## 12. Relações entre povos: diplomacia, união, guerra e revoltas

### 12.1 Diplomacia e união

As guerras são entre os povos: o jogador não as comanda e influencia pouco, só de forma leve e com as ferramentas de gestão do mundo (alimentar, ensinar, colocar minérios).

| ID | Requisito | Situação |
|---|---|---|
| RF-VIDA-127 | Cada par de reinos vizinhos (assentamentos a até 60 tiles) tem uma relação de −100 a +100. Todo ano: fronteira −1,5; espécies diferentes −1; povos diferentes −0,5; cada povo guerreiro −1,5; cada povo de fé ou comerciante +0,5; tolerância dos dois soma até +2,4; comércio +3 (ou +6). Uma cidade que cresce sobre aldeias de outro reino piora a relação em 10. | Implementado (Fase 0) |
| RF-VIDA-128 | Estados: paz, tensão, guerra, trégua, aliança. Mudanças de estado geram linha na crônica. A janela **Reinos** (tecla R) mostra cada reino com povo, cultura, estoque e a relação com cada vizinho. | Implementado (Fase 0) |
| RF-VIDA-128d | **Incidentes:** 3% por ano para cada par de vizinhos: presentes (+6), casamento real entre cidades da mesma espécie (+12), disputa por jazida (−7), escaramuça na fronteira (−9) ou insulto (−5). Povos de fé e comércio têm mais incidentes bons; guerreiros, mais ruins. | Implementado (Fase 0) |
| RF-VIDA-128e | **Alianças:** com relação acima de 50, 12% por ano de aliança; desfaz abaixo de 15. Aliados entram nas guerras um do outro. Depois de 50 anos de aliança, reinos da mesma espécie com relação acima de 80 podem se unir numa federação (3% por ano). | Implementado (Fase 0) |
| RF-VIDA-128f | **Primeiro contato:** barcos de exploração (a partir do Bronze, mais em povos curiosos) cruzam o mar, descobrem jazidas e fazem contato com povos de outras terras, que passam a ter relação, comércio e guerra pelo mar. | Implementado (Fase 0) |
| RF-VIDA-129 | **União:** dois reinos aliados por muito tempo podem se fundir (casamento real, federação) num reino só. Aldeias isoladas podem pedir proteção a um reino vizinho e virar vassalas. | Implementado (Fase 0): federação (RF-VIDA-128e) e aldeias sozinhas pedem proteção a um reino amigo da mesma espécie a até 45 tiles (3% por ano) |
| RF-VIDA-130 | Povos diferentes (espécies diferentes no mesmo planeta, por exemplo humanos levados para um planeta com inteligentes nativos) têm relação inicial baixa e podem conviver, comerciar, se aliar ou guerrear. | Implementado (Fase 0): relação inicial −30 |

### 12.2 Guerra

| ID | Requisito | Situação |
|---|---|---|
| RF-VIDA-131 | (Atualizado: guerra com relação abaixo de −35, ou −20 se um povo for guerreiro, e 4% por ano de guerra por ambição de um reino forte; depois da paz há trégua de 25 anos. Sem caminho por terra, a guerra é **naval**: os soldados vão de barco e desembarcam perto do alvo. Monumento de povo guerreiro dá força.) **Declaração:** com relação abaixo de −40, os dois em paz e um caminho por terra entre eles, há 12% de chance por ano (24% se um povo for guerreiro) de guerra. Ataca quem tem mais força (soldados × armas, mínimo 4); o alvo é o assentamento inimigo mais perto. Os soldados do atacante a até 90 tiles marcham até o alvo. | Implementado (Fase 0) |
| RF-VIDA-132 | **Combate:** soldados e guardas lutam com inimigos a até 1,5 tile; vence com chance proporcional à força (soldado 1,2, guarda 1,1, líder 0,8, civil 0,4; +15% por era; até +150% com armas de aço suficientes). Soldados armados que morrem perdem a arma. O painel lista as guerras com o número de mortos. | Implementado (Fase 0), sem muralhas |
| RF-VIDA-133 | **Cerco e conquista:** 3 ou mais soldados atacantes na praça sem nenhum defensor armado por perto conquistam o assentamento: ele muda de reino e de cor, metade do estoque do reino vencido vai para o vencedor (saque), e se era capital, os outros assentamentos daquele reino ficam independentes. | Implementado (Fase 0), sem casas queimadas |
| RF-VIDA-134 | Fim de guerra por conquista do alvo, ou paz: 3% por ano, mais 1% a cada 1,5 morto, mais 10% depois de 30 anos. Depois da paz a relação volta a −10. | Implementado (Fase 0) |
| RF-VIDA-135 | Guerras afetam o ecossistema (incêndios, fome) e a cultura (povos vencidos guardam rancor). | Parcial: relação −20 depois de uma conquista |

### 12.3 Revoltas e instabilidade

| ID | Requisito |
|---|---|
| RF-VIDA-136 | Cada assentamento tem estabilidade, reduzida por fome, doença, distância da capital, cultura diferente da capital, impostos/guerra longa e por **intervenção excessiva do jogador** (ensinar demais em pouco tempo). |
| RF-VIDA-137 | Estabilidade baixa gera revolta: o assentamento declara independência e vira um reino novo, possivelmente em guerra com o antigo. (Hoje a independência vem da distância da capital, RF-VIDA-81, e começa com relação −45.) |
| RF-VIDA-138 | Guerras civis quando a capital perde o líder sem sucessor claro. Implementado (Fase 0): quando morre o rei de um reino com 4 ou mais assentamentos, há 30% de chance de um pretendente levar a metade mais distante e começar uma guerra civil. Colônias distantes também declaram independência mais cedo em reinos grandes. |

---

## 13. Papel do jogador

| ID | Requisito | Situação |
|---|---|---|
| RF-VIDA-140 | Ferramentas de vida: introduzir espécie conhecida (**uma criatura por clique**; para nascer filhote é preciso um parceiro adulto da mesma espécie por perto), alimentar (pincel), reduzir população (clique). | Implementado (Fase 0) |
| RF-VIDA-141 | Ferramentas de civilização: introduzir um inteligente conhecido, **sozinho** (anda até o assentamento do seu povo mais perto, até 40 tiles, e se junta a ele; sem nenhum por perto, funda um novo só com ele; filhos só com pelo menos dois no mesmo assentamento), ensinar (adianta o conhecimento, mas não pula a condição de era) e boa colheita (dá madeira e comida a um assentamento). Ferramentas de Terreno colocam veios de minério (RF-VIDA-127e). | Implementado (Fase 0) |
| RF-VIDA-141a | **Ferramentas de terraformação:** Terreno (elevar, rebaixar, montanha, mar, nivelar, areia, veios de minério) e Clima (aquecer, esfriar, chuva, secar, plantar, floresta). Aba **Eventos:** cometa, terremoto, vulcão, ilha vulcânica, incêndio, seca e surpresa (evento aleatório). | Implementado (Fase 0) |
| RF-VIDA-142 | Ferramentas futuras: **proteger** (área onde predadores e desastres não entram por um tempo), **curar** (encerra surto), **realocar** (captura um grupo e solta em outro lugar ou planeta, usando a nave), **inspirar** (sinal no céu que aumenta estabilidade ou fé), **semear discórdia/paz** (altera relações), **colher amostra** (adiciona espécie ao catálogo sem matá-la). | Fase 5/6 |
| RF-VIDA-143 | Toda ferramenta de vida e civilização tem custo (energia, recursos da nave) e recarga, para que a interferência seja escolha, não spam. | Fase 5 |
| RF-VIDA-144 | **Não criar do zero:** não existe ferramenta que crie espécie nova, mude o tipo de uma espécie ou crie inteligência. O jogador só usa o que encontrou ou trouxe. | Implementado (Fase 0) |
| RF-VIDA-145 | **Interferência limitada:** intervenções muito visíveis em povos inteligentes viram crença (RF-VIDA-79); ensinar demais gera instabilidade (RF-VIDA-136). Observar sem interferir é sempre uma opção viável. | Fase 6 |
| RF-VIDA-146 | **Colonização humana** (RF-SUP-10): naves de colonos trazem humanos da Terra; eles fundam assentamentos como qualquer povo, com tecnologia inicial definida pela nave. | Fase 5 |
| RF-VIDA-147 | Controle do tempo: pausa, 1x, 2x, 5x (Espaço pausa). | Implementado (Fase 0) |
| RF-VIDA-148 | Objetivos opcionais por planeta (ex.: "faça uma espécie da Terra prosperar por 100 anos", "leve um povo à Idade do Ferro sem guerra") dão recompensas de pesquisa. | Fase 6 |

---

## 14. Interface, arte e crônica

### 14.1 Interface

| ID | Requisito | Situação |
|---|---|---|
| RF-VIDA-150 | Abas Terreno, Clima, Vida, Civilização e Eventos, com as ferramentas agrupadas (ex.: Vida em Terra, Costa, Água e Variantes, cada espécie com o seu sprite) e uma dica de uma linha sobre a ferramenta escolhida. | Implementado (Fase 0) |
| RF-VIDA-150a | **Janelas** no menu do topo: Crônica (C), Reinos (R), Espécies (E), Itens (I) e Mundo (configuração de eventos e rótulos). Esc fecha a janela; 1 a 4 mudam a velocidade. | Implementado (Fase 0) |
| RF-VIDA-150b | **Mão vazia:** o jogador começa sem ferramenta; o botão esquerdo arrasta o mapa e não muda nada. Clicar de novo na ferramenta, no botão ✋ Mão ou Esc guarda a ferramenta; trocar de aba não escolhe ferramenta. O ícone da ferramenta acompanha o cursor. | Implementado (Fase 0) |
| RF-VIDA-150c | **Relógio no topo** (era, ano, progresso da era e velocidade), **minimapa** com os assentamentos e o retângulo da vista (clicar ou arrastar leva a câmera), painel lateral recolhível (P), ajuda de controles (H ou ?), pincel com [ e ], e **ficha fixada**: um clique curto de mão vazia numa criatura (a ficha a segue) ou num assentamento fixa a ficha até Esc ou um clique no vazio. A barra de ferramentas inteira recebe o mouse e rola para o lado. | Implementado (Fase 0) |
| RF-VIDA-151 | Painel lateral: era, ano, controle de tempo, população por espécie com cor, lista de assentamentos (clicar leva a câmera), acontecimentos recentes. | Implementado (Fase 0) |
| RF-VIDA-152 | Rótulos de assentamento no mapa com nome, nível e população; capital mostra o reino. | Implementado (Fase 0) |
| RF-VIDA-153 | Inspecionar criatura: espécie, assentamento, era, idade, energia; inspecionar tile: bioma, altitude, temperatura, umidade, vegetação. | Implementado (Fase 0) |
| RF-VIDA-154 | Painéis futuros: espécie (atributos, tendência evolutiva, mapa de distribuição), assentamento (nível, recursos, estabilidade, líder), reino (assentamentos, relações, guerras), gráficos de população ao longo do tempo. | Fase 5/6 |
| RF-VIDA-155 | Camadas de visualização adicionais: território, fertilidade, doenças, relações. | Fase 5/6 |
| RF-VIDA-156 | **Crônica:** histórico completo do planeta (fundações, eras, guerras, extinções, desastres, intervenções do jogador), filtrável, com clique para ir ao local. Exportável como texto. | Implementado (Fase 0), sem exportar: até 400 linhas, filtros (importantes, povos, guerras, natureza, mar, economia, você). Repetições do mesmo assunto em 30 anos viram uma linha com contagem e lugares (ex.: "Tempestades afundaram barcos de pesca (Xita, Luru…) ×35"), para que um evento frequente não esconda os outros. |

### 14.2 Arte em pixel (estilo 16 bits)

| ID | Requisito | Situação |
|---|---|---|
| RF-VIDA-160 | Estilo **16 bits simples e bonito**: elementos grandes (casas ~16×16 px de arte, árvores ~12–16 px) com **contorno escuro**, **3 a 4 tons por material** e **luz vinda de cima à esquerda**. Nada exagerado: cores mais bonitas e objetos bem definidos no zoom próximo. | Implementado (Fase 0) |
| RF-VIDA-161 | Criaturas pequenas: de longe são 1 pixel na cor da espécie (peixe = 1 pixel), de perto viram sprites; o humano segue a referência do WorldBox (corpo simples, roupa na cor do reino). | Implementado (Fase 0) |
| RF-VIDA-162 | Casas mudam por era: **cabana de palha** (Pedra), **casa de madeira com telhado de palha** (Bronze), **casa enxaimel com telhado de telha** (Ferro), **casa de pedra com telhado de ardósia** (Medieval) e **sobrado de tijolo** (Industrial, e nas cidades já a partir da Medieval). Futuro: a cor do telhado ou de um detalhe identifica o reino. | Implementado (Fase 0), sem cor de reino nas casas |
| RF-VIDA-163 | Árvores por bioma (folhosa, floresta tropical, pinheiro, acácia, cacto) e pedras, com o mesmo estilo, desenhadas sobre o tile no zoom alto. | Implementado (Fase 0) |
| RF-VIDA-164 | Ruas e estradas como tiles de terra batida (pedra a partir da Era Medieval), com leve variação por tile; praça com fogueira animada. | Implementado (Fase 0), fogueira estática |
| RF-VIDA-165 | Futuro: lavouras por estação, muralhas, ruínas, exércitos com bandeira na cor do reino. | Fase 5/6 |
| RF-VIDA-167 | **Terreno de perto (zoom médio e próximo):** a fronteira entre tiles diferentes ondula em vez de formar quadrados; manchas e grãos por material (grama com manchas e fios, areia com grãos); linha de espuma colada na costa, água rasa, areia molhada e barranco quando a água fica ao sul. | Implementado (Fase 0) |
| RF-VIDA-168 | Sprites de porto, canoa, barco a remo, veleiro, caravela, navio a vapor (com fumaça), destroços, tubarão, crianças, idosos, pescador e fábrica, no mesmo estilo. | Implementado (Fase 0) |
| RF-VIDA-166 | Paleta da flora alienígena derivada da estrela (RF-ART-04): plantas de estrela vermelha mais escuras/arroxeadas, de estrela azul mais claras. | Fase 5 |

---

## 15. Requisitos não funcionais

| ID | Requisito |
|---|---|
| RNF-VIDA-01 | **Orçamento de CPU:** a simulação de vida usa no máximo ~2 ms por quadro no planeta observado, a 5x, num PC modesto. Hoje: ~8 ms por segundo simulado com ~3.800 criaturas (≈ 1 ms por quadro a 5x, medido em Node). |
| RNF-VIDA-02 | **Teto de indivíduos** por planeta observado: ~12.000 simulados individualmente (limite atual da camada de sprites). Acima disso, agregação (RF-VIDA-34). |
| RNF-VIDA-03 | Decisões por indivíduo espaçadas (hoje a cada 0,4 s de jogo), com grade espacial para vizinhança; nada de busca O(n²). |
| RNF-VIDA-04 | **Fora da tela:** criaturas fora da área visível continuam simuladas, mas sem desenho. |
| RNF-VIDA-05 | **Planetas não observados:** quando o jogador está no 3D ou em outro planeta, a vida é simulada de forma **agregada** (populações por espécie e por assentamento, eras, relações), em passos grandes, e reconstituída em indivíduos ao observar de novo. Custo desprezível por planeta. |
| RNF-VIDA-06 | Simulação determinística dada a semente e a sequência de ações do jogador, para reproduzir bugs e, no coop, sincronizar. |
| RNF-VIDA-07 | Funciona no renderizador por software (sem placa de vídeo), com os mesmos sprites. |
| RNF-VIDA-08 | Todo texto de interface e nomes em português; nomes alienígenas gerados; nenhum nome da obra de referência. |

### 15.1 Persistência

| ID | Requisito |
|---|---|
| RNF-VIDA-09 | O save guarda, por planeta com vida: espécies e populações, assentamentos (posição, nível, casas, ruas, reino, era, recursos, estabilidade), reinos e relações, a crônica e as camadas alteradas do terreno (como diff, RF-SUP). |
| RNF-VIDA-10 | Indivíduos podem ser salvos de forma compacta (posição quantizada, idade, espécie, assentamento) ou regenerados a partir das populações se o save precisar ser pequeno. |
| RNF-VIDA-11 | O save do planeta entra no backup único da base secreta (regra do backup em aberto no REQUISITOS.md). |

---

## 16. Plano por fases

Mapeado às fases do [REQUISITOS.md](REQUISITOS.md#8-plano-de-desenvolvimento-por-fases).

| Fase | O que entra da vida nos planetas |
|---|---|
| **Fase 0** (feito, PR #1) | Raridade em três níveis, espécies da Terra a bordo, ecossistema com peixes/herbívoros/predadores/inteligentes, eras, assentamentos com níveis, áreas, ruas, casas em lotes, estradas e reinos, arte 16 bits, abas e painel, modo sem GPU. |
| **Fase 4** (superfície e terraformação) | Estações, fertilidade do solo, migração por clima, desastres naturais básicos, contorno de território. |
| **Fase 5** (espécies e colonização) | Tipos novos (flora, aves, anfíbios, insetos, megafauna), reprodução com intervalos, caçada em grupo, caça por inteligentes com viagem, agricultura e domesticação, doenças, agregação de população, catálogo, ferramentas proteger/curar/realocar com custo, colonos humanos, simulação agregada fora de observação, persistência. |
| **Fase 6** (ameaças, narrativa e conteúdo) | Evolução (adaptação, variantes, especiação), cultura e crenças, comércio, diplomacia, união, guerra, cercos, revoltas, muralhas, castelos, portos, crônica completa, objetivos por planeta, poluição industrial. |
| **Fase 7** (coop) | Sincronização determinística da simulação de vida entre jogadores. |
| **Fase 8** (escala e polimento) | Otimização para planetas grandes (2048×1024) cheios, animações extras, eras Atômica e Espacial. |

**Critério de saída da vida nos planetas:** levar espécies da Terra a um planeta terraformado, vê-las se adaptar ao longo de gerações, acompanhar uma civilização da Idade da Pedra até reinos que comerciam, se aliam e guerreiam, e ver na crônica o efeito das intervenções do jogador.

---

## 17. Questões em aberto

1. **Custo das ferramentas de vida:** sair de energia da nave, dos recursos minerados ou de uma recarga por tempo?

---

## 18. Registro de decisões

| Data | Decisão |
|---|---|
| 19/10/2026 | Vida nativa fora da Terra é rara, em três níveis entre os planetas favoráveis: 25% só vegetação, 8% com animais, 1 em cada 10 destes com espécie inteligente. |
| 19/10/2026 | As espécies da Terra começam a bordo e podem ser levadas a qualquer planeta. |
| 19/10/2026 | Assentamentos com níveis (aldeia < 25, vila 25–59, cidade ≥ 60), áreas circulares (8/12/18 tiles), sem fundação dentro de outra área; cidade pode conter aldeias, nunca o contrário; reinos formados por capital e subordinados. |
| 19/10/2026 | Planta com praça central, ruas em cruz, casas em lotes de frente para as ruas e estradas entre assentamentos do mesmo reino. |
| 19/10/2026 | Arte em pixel no estilo 16 bits simples: contorno escuro, 3–4 tons por material, luz de cima à esquerda, elementos grandes ~16 px. |
| 20/10/2026 | Eras bem mais lentas (séculos por era) e crescimento lento dos inteligentes; idade visível (crianças e idosos); portos e barcos por era; perigos no mar (tempestade, predador marinho, deriva, doença). |
| 20/10/2026 | Os povos não vão ao espaço por conta própria: a Era Industrial é a última. |
| 20/10/2026 | Guerras são entre os povos; o jogador não comanda e só ajuda de leve com ferramentas de gestão do mundo. |
| 20/10/2026 | Avançar de era depende de condições (achar jazidas, abrir minas, trabalhar o metal), não de tempo. Minérios são limitados; o que os ferreiros fazem depende do que foi minerado; o jogador pode colocar veios. |
| 20/10/2026 | Economia (estoque do reino, custo de construção, comércio), culturas com valor e crença, independência de colônias distantes. |
| 20/10/2026 | Cidades não estagnam: metrópole (≥ 140), mais gente por casa e por era, deserto colonizável a partir do Ferro e limite de 100 assentamentos vivos. |
| 20/10/2026 | Adicionar espécies usa o banco genético da Terra que está a bordo; as "espécies novas" que surgem sozinhas são variantes evolutivas das que já existem. Assim o jogador continua gerenciando, sem criar do zero (RF-VIDA-144). |
| 20/10/2026 | Eventos aleatórios quando o mundo fica monótono, crônica que agrupa repetições, alianças, federação, guerra naval, guerra civil, primeiro contato pelo mar, catálogo de itens e HUD com janelas. Sondas, cometas e anéis no espaço ficam com a navegação espacial. |
| 20/10/2026 | Ruas e casas com traçado orgânico, sem a grade quadrada; barra de ferramentas rola para o lado com a roda, arrastando ou pela barra de rolagem. |
| 20/10/2026 | O jogador solta uma criatura por clique; inteligentes chegam sozinhos e decidem onde viver; reprodução exige um parceiro. Começa de mão vazia. |
| 19/10/2026 | Evolução só modifica espécies existentes (adaptação, variantes, especiação lenta); inteligência nunca surge de espécies não inteligentes. |
