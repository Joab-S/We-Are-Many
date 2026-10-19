# We Are Many: Requisitos da Vida nos Planetas

> Versão 0.1 · 19/10/2026 · complementa a seção 4.7 (SUP) do [REQUISITOS.md](REQUISITOS.md)
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
| RF-VIDA-11 | Tipos adicionais: **flora** (árvores, arbustos, algas, com espécies próprias), **aves** (voam por cima de água e terra, migram), **anfíbios** (costa), **insetos/enxames** (agregados, polinizam e viram praga), **grandes animais** (megafauna, poucos indivíduos, muito impacto). | Fase 5 |
| RF-VIDA-12 | Cada espécie tem: nome, origem (planeta), cor, faixa de temperatura, bioma preferido, velocidade, idade adulta, idade máxima, dieta, tamanho, sociabilidade (solitária, bando, colônia), fertilidade e agressividade. | Parcial: sem bioma, dieta detalhada, tamanho e sociabilidade |
| RF-VIDA-13 | Nomes de espécies alienígenas são gerados por sílabas; nomes da Terra são os comuns em português. Nunca nomes da obra de referência. | Implementado (Fase 0) |
| RF-VIDA-14 | Espécies inteligentes alienígenas têm aparência própria (sprite "alien" tingido) e nomes de aldeias no idioma gerado da espécie. | Implementado (Fase 0) |

### 3.2 Catálogo do jogador

| ID | Requisito |
|---|---|
| RF-VIDA-15 | O catálogo lista toda espécie conhecida com origem, faixa de clima, população total em todos os planetas e planetas onde vive. |
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
| RF-VIDA-30 | Cada indivíduo tem idade, energia e fase (filhote, adulto, velho). Só adultos com energia acima de um limiar se reproduzem. | Implementado (Fase 0), sem fase "velho" visível |
| RF-VIDA-31 | Morte por idade máxima, fome, predação, frio/calor fora da faixa, afogamento (terrestre na água) ou encalhe (peixe em terra). | Implementado (Fase 0) |
| RF-VIDA-32 | Reprodução por tipo: peixes desovam várias crias, herbívoros têm 1–2 filhotes, predadores ninhadas pequenas, inteligentes um filho por vez com intervalo longo. | Parcial |
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
| RF-VIDA-43 | **Caça por inteligentes:** caçadores saem da aldeia, perseguem herbívoros e peixes (pesca na costa), voltam com comida. A eficiência cresce com a era (lança, arco, armadilha, rede, barco). | Parcial: comem por perto, sem viagem de volta |
| RF-VIDA-44 | Predadores atacam inteligentes isolados nas eras iniciais; aldeias se defendem em grupo e, a partir do Bronze, caçam predadores próximos para proteger rebanhos. | Fase 5 |
| RF-VIDA-45 | Caça excessiva pode extinguir uma espécie localmente; a crônica registra a extinção local e global. | Fase 5 |
| RF-VIDA-46 | Territórios de caça: bandos de predadores evitam o território de outros bandos da mesma espécie (disputas ocasionais). | Fase 6 |

---

## 7. Evolução com o tempo

O jogador nunca cria espécies. A evolução modifica espécies existentes de forma lenta, legível e limitada.

| ID | Requisito |
|---|---|
| RF-VIDA-50 | **Adaptação:** populações que vivem por várias gerações perto do limite da sua faixa de temperatura deslocam a faixa aos poucos (ex.: +1 K a cada N gerações), até um limite por espécie. |
| RF-VIDA-51 | **Variantes:** uma população isolada geograficamente (sem contato por muitas gerações, por exemplo em outra ilha ou outro planeta) vira uma **subespécie** com nome derivado (ex.: "Cervo-das-neves"), cor ajustada e atributos levemente diferentes. |
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
| RF-VIDA-66 | Mudanças de terreno do jogador afetam a vida na hora: transformar mar em terra mata peixes, inundar terra afoga terrestres (implementado na Fase 0), aquecer demais mata quem está fora da faixa. |

---

## 9. Espécies inteligentes e civilização

### 9.1 Indivíduos

| ID | Requisito | Situação |
|---|---|---|
| RF-VIDA-70 | Cada inteligente pertence a um assentamento, tem idade, energia e uma profissão: coletor, caçador, pescador, agricultor, construtor, guerreiro, sacerdote, comerciante (as profissões liberam conforme a era). | Parcial: pertence a assentamento, sem profissões |
| RF-VIDA-71 | Comportamento base: trabalhar perto de casa durante o dia, voltar ao centro, fugir de predadores, procurar comida quando com fome. | Parcial |
| RF-VIDA-72 | Líder por assentamento (chefe, rei, prefeito conforme a era), com traço de personalidade (pacífico, ambicioso, devoto, mercador) que influencia diplomacia e guerra. | Fase 6 |

### 9.2 Eras tecnológicas

As eras atuais do código (`ERAS` em `src/sim/ecosystem.ts`):

| Era | Desbloqueia |
|---|---|
| Idade da Pedra | Cabanas de palha, coleta, caça com lança, fogo, aldeias pequenas |
| Idade do Bronze | Casas de madeira com telhado, agricultura, domesticação, ferramentas melhores, comércio de troca, vilas |
| Idade do Ferro | Casas de pedra, armas de ferro, exércitos organizados, estradas, cidades, muralhas de madeira |
| Era Medieval | Castelos, muralhas de pedra, reinos, religião organizada, moedas, portos e barcos |
| Era Industrial | Fábricas, ferrovias, poluição (aquece e suja o planeta), crescimento populacional rápido |

| ID | Requisito | Situação |
|---|---|---|
| RF-VIDA-73 | Cada assentamento tem progresso tecnológico próprio que cresce com a raiz da população; a era aparece no painel e muda a arte das casas. | Implementado (Fase 0) |
| RF-VIDA-74 | Tecnologia se espalha: assentamentos vizinhos e parceiros comerciais avançam mais rápido; um reino compartilha a era da capital com atraso. | Fase 6 |
| RF-VIDA-75 | O jogador pode **ensinar** (adiantar o progresso), com custo e com risco: ensinar demais causa instabilidade (ver RF-VIDA-131). | Implementado (Fase 0), sem custo e sem risco |
| RF-VIDA-76 | Eras além da Industrial (Atômica, Espacial) ficam para depois e podem gerar uma espécie que vai ao espaço e se torna ator no 3D (contato, tratado, ameaça). | Futuro (Fase 6+) |
| RF-VIDA-77 | A Era Industrial polui: aumenta a temperatura média e reduz vegetação ao redor das cidades, criando tensão com a terraformação do jogador. | Fase 6 |

### 9.3 Cultura e crenças

| ID | Requisito |
|---|---|
| RF-VIDA-78 | Cada povo (cultura) tem nome, cor, idioma gerado (para nomes de lugares e líderes), um valor principal (guerra, comércio, fé, conhecimento) e tolerância a outros povos. |
| RF-VIDA-79 | Crenças leves: um povo pode adorar fenômenos que viu (o "cometa", a "luz no céu" que é a nave do jogador). As intervenções do jogador alimentam essas crenças e mudam a cultura (ex.: um povo que recebeu ajuda após um desastre fica mais pacífico e devoto). |
| RF-VIDA-80 | Templos e marcos culturais aparecem nas cidades conforme o valor principal. |
| RF-VIDA-81 | Cisma: um assentamento distante da capital com cultura divergente pode fundar um novo povo. |

---

## 10. Assentamentos: aldeias, vilas, cidades e reinos

### 10.1 Níveis

| ID | Requisito | Situação |
|---|---|---|
| RF-VIDA-90 | Níveis de assentamento pela população: **Aldeia** (< 25), **Vila** (25 a 59), **Cidade** (≥ 60). O nível sobe e desce com a população. | Implementado (Fase 0) |
| RF-VIDA-91 | **Reino:** uma cidade capital mais os assentamentos subordinados a ela: colônias que ela fundou e aldeias que ficaram dentro da sua área. O reino tem nome, cor e líder; o rótulo da capital mostra o reino. | Implementado (Fase 0), sem líder |
| RF-VIDA-92 | Quando a capital cai de nível (vira vila) ou é conquistada, o reino pode se desfazer ou mudar de capital para a maior cidade restante. | Fase 6 |
| RF-VIDA-93 | Impérios (vários reinos sob um) e confederações ficam como evolução do sistema de alianças (seção 12). | Futuro |

### 10.2 Área e fundação

| ID | Requisito | Situação |
|---|---|---|
| RF-VIDA-94 | Cada assentamento tem uma **área circular** com raio por nível: aldeia **8**, vila **12**, cidade **18** tiles. | Implementado (Fase 0) |
| RF-VIDA-95 | **Nenhum assentamento pode ser fundado dentro da área de outro.** Colonos e o jogador (ferramenta de espécie inteligente) só fundam fora de todas as áreas existentes. | Implementado (Fase 0) |
| RF-VIDA-96 | A área de uma **cidade pode crescer e conter aldeias**; essas aldeias passam a pertencer ao reino da cidade. **O contrário não acontece**: uma aldeia ou vila nunca contém uma cidade, e assentamentos que não são cidades não expandem a área sobre outros. | Implementado (Fase 0) |
| RF-VIDA-97 | A área é visível como contorno suave com a cor do reino quando o jogador passa o mouse ou ativa a camada "Território". | Fase 5 |
| RF-VIDA-98 | Fronteiras de reino: a união das áreas dos assentamentos do reino; tiles disputados entre dois reinos geram tensão (seção 12). | Fase 6 |
| RF-VIDA-99 | Fundação inteligente: colonos preferem locais com água doce ou costa por perto, terra plana, vegetação e distância razoável do assentamento de origem; evitam montanha, gelo e deserto. | Parcial: escolhe terra habitável |

### 10.3 Planta do assentamento

| ID | Requisito | Situação |
|---|---|---|
| RF-VIDA-100 | Todo assentamento tem uma **praça central** com fogueira (Pedra/Bronze) ou poço (Ferro em diante). | Implementado (Fase 0), fogueira |
| RF-VIDA-101 | **Ruas em cruz** saem da praça nas quatro direções; o comprimento cresce com o nível (aldeia curta, cidade longa). Ruas são tiles de terra batida pintados no mapa e não passam por água. | Implementado (Fase 0) |
| RF-VIDA-102 | **Casas em lotes ao longo das ruas**, de frente para elas, com espaçamento regular, ocupando primeiro os lotes mais perto da praça. Casas nunca ficam na água nem sobre a rua. | Implementado (Fase 0) |
| RF-VIDA-103 | **Estradas de terra** ligam assentamentos do mesmo reino, contornando água quando possível. | Implementado (Fase 0), traçado em linha reta interrompido na água |
| RF-VIDA-104 | Ruas secundárias paralelas surgem em cidades quando os lotes das ruas principais acabam (malha). | Fase 5 |
| RF-VIDA-105 | **Campos cultivados** (seção 11) em volta das casas da periferia, a partir do Bronze. | Fase 5 |
| RF-VIDA-106 | **Muralhas por era:** paliçada de madeira (Ferro), muralha de pedra com portões nas ruas (Medieval), contornando a área da cidade. | Fase 6 |
| RF-VIDA-107 | **Edifícios especiais:** castelo/palácio na capital do reino, templo, mercado, quartel, celeiro, ferraria, porto (assentamentos na costa a partir do Medieval), pontes onde estradas cruzam rios estreitos, marcos (estátua, torre) que contam a história. | Fase 6 |
| RF-VIDA-108 | Assentamentos abandonados (população zero) deixam ruínas por um tempo; ruínas podem ser reocupadas. | Parcial: some, sem ruínas |

### 10.4 Crescimento

| ID | Requisito | Situação |
|---|---|---|
| RF-VIDA-109 | Novas casas surgem quando a população passa da capacidade das casas existentes. | Implementado (Fase 0) |
| RF-VIDA-110 | Assentamentos lotados enviam colonos para fundar novas aldeias fora de qualquer área existente; a nova aldeia pertence ao reino de origem. | Implementado (Fase 0) |
| RF-VIDA-111 | Casas são reconstruídas no estilo da era quando o assentamento avança. | Implementado (Fase 0) |

---

## 11. Agricultura, domesticação, economia e comércio

| ID | Requisito |
|---|---|
| RF-VIDA-120 | **Plantação:** a partir do Bronze, agricultores criam campos (tiles marcados, com sprite de lavoura que muda com a estação) em solo fértil perto das casas. Campos produzem comida e reduzem a necessidade de caça. |
| RF-VIDA-121 | Colheita sazonal; secas, pragas e frio reduzem a produção e podem causar fome. |
| RF-VIDA-122 | Irrigação (Ferro em diante) permite campos mais longe da água. |
| RF-VIDA-123 | **Domesticação:** herbívoros próximos podem ser domesticados; viram rebanho (sprites seguindo pastores), fornecem comida e tração. Rebanhos atraem predadores. |
| RF-VIDA-124 | **Recursos do assentamento:** comida, madeira (corte de árvores próximas, que somem do mapa), pedra, metal (minas em montanhas a partir do Bronze), bens de luxo. Estoques simples por assentamento. |
| RF-VIDA-125 | **Comércio:** assentamentos ligados por estrada ou costa trocam excedentes. Comerciantes viajam visivelmente pelas estradas; comércio aproxima povos e espalha tecnologia. |
| RF-VIDA-126 | Desmatamento e mineração aparecem no mapa e afetam a vegetação e a fauna. |

---

## 12. Relações entre povos: diplomacia, união, guerra e revoltas

### 12.1 Diplomacia e união

| ID | Requisito |
|---|---|
| RF-VIDA-127 | Cada par de reinos/povos tem uma relação de −100 (guerra) a +100 (aliança), alterada por fronteiras próximas, comércio, cultura parecida, incidentes e personalidade dos líderes. |
| RF-VIDA-128 | Estados: paz, tensão, guerra, trégua, aliança. Mudanças de estado geram linha na crônica. |
| RF-VIDA-129 | **União:** dois reinos aliados por muito tempo podem se fundir (casamento real, federação) num reino só. Aldeias isoladas podem pedir proteção a um reino vizinho e virar vassalas. |
| RF-VIDA-130 | Povos diferentes (espécies diferentes no mesmo planeta, por exemplo humanos levados para um planeta com inteligentes nativos) têm relação inicial baixa e podem conviver, comerciar, se aliar ou guerrear. |

### 12.2 Guerra

| ID | Requisito |
|---|---|
| RF-VIDA-131 | Guerra declarada por disputa de território, recursos, fé ou ambição do líder. O reino forma um **exército**: guerreiros (sprites com arma da era) que marcham pelas estradas até o alvo. |
| RF-VIDA-132 | **Combate:** unidades lutam ao se encontrar; força depende da era (Pedra < Bronze < Ferro < Medieval < Industrial), do número e da defesa (muralhas). |
| RF-VIDA-133 | **Cerco e conquista:** um exército que domina a praça de um assentamento o conquista; o assentamento muda de reino (e de cor) e parte da população foge ou morre. Casas podem ser queimadas. |
| RF-VIDA-134 | Fim de guerra por paz negociada, exaustão (perdas altas) ou conquista da capital. |
| RF-VIDA-135 | Guerras afetam o ecossistema (incêndios, fome) e a cultura (povos vencidos guardam rancor). |

### 12.3 Revoltas e instabilidade

| ID | Requisito |
|---|---|
| RF-VIDA-136 | Cada assentamento tem estabilidade, reduzida por fome, doença, distância da capital, cultura diferente da capital, impostos/guerra longa e por **intervenção excessiva do jogador** (ensinar demais em pouco tempo). |
| RF-VIDA-137 | Estabilidade baixa gera revolta: o assentamento declara independência e vira um reino novo, possivelmente em guerra com o antigo. |
| RF-VIDA-138 | Guerras civis quando a capital perde o líder sem sucessor claro. |

---

## 13. Papel do jogador

| ID | Requisito | Situação |
|---|---|---|
| RF-VIDA-140 | Ferramentas de vida: introduzir espécie conhecida (pincel), alimentar (pincel), reduzir população (clique). | Implementado (Fase 0) |
| RF-VIDA-141 | Ferramentas de civilização: introduzir espécie inteligente conhecida (funda um assentamento fora das áreas existentes) e ensinar. | Implementado (Fase 0) |
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
| RF-VIDA-150 | Abas Terreno, Vida e Civilização com as ferramentas de cada uma. | Implementado (Fase 0) |
| RF-VIDA-151 | Painel lateral: era, ano, controle de tempo, população por espécie com cor, lista de assentamentos (clicar leva a câmera), acontecimentos recentes. | Implementado (Fase 0) |
| RF-VIDA-152 | Rótulos de assentamento no mapa com nome, nível e população; capital mostra o reino. | Implementado (Fase 0) |
| RF-VIDA-153 | Inspecionar criatura: espécie, assentamento, era, idade, energia; inspecionar tile: bioma, altitude, temperatura, umidade, vegetação. | Implementado (Fase 0) |
| RF-VIDA-154 | Painéis futuros: espécie (atributos, tendência evolutiva, mapa de distribuição), assentamento (nível, recursos, estabilidade, líder), reino (assentamentos, relações, guerras), gráficos de população ao longo do tempo. | Fase 5/6 |
| RF-VIDA-155 | Camadas de visualização adicionais: território, fertilidade, doenças, relações. | Fase 5/6 |
| RF-VIDA-156 | **Crônica:** histórico completo do planeta (fundações, eras, guerras, extinções, desastres, intervenções do jogador), filtrável, com clique para ir ao local. Exportável como texto. | Parcial: últimos 5 acontecimentos |

### 14.2 Arte em pixel (estilo 16 bits)

| ID | Requisito | Situação |
|---|---|---|
| RF-VIDA-160 | Estilo **16 bits simples e bonito**: elementos grandes (casas ~16×16 px de arte, árvores ~12–16 px) com **contorno escuro**, **3 a 4 tons por material** e **luz vinda de cima à esquerda**. Nada exagerado: cores mais bonitas e objetos bem definidos no zoom próximo. | Implementado (Fase 0) |
| RF-VIDA-161 | Criaturas pequenas: de longe são 1 pixel na cor da espécie (peixe = 1 pixel), de perto viram sprites; o humano segue a referência do WorldBox (corpo simples, roupa na cor do reino). | Implementado (Fase 0) |
| RF-VIDA-162 | Casas mudam por era: **cabana de palha** (Pedra), **casa de madeira com telhado** (Bronze), **casa de pedra** (Ferro), **casarões e torres** nas cidades (Medieval em diante). A cor do telhado ou de um detalhe identifica o reino. | Implementado (Fase 0), casarão a partir da Era Medieval nas cidades |
| RF-VIDA-163 | Árvores por bioma (folhosa, floresta tropical, pinheiro, acácia, cacto) e pedras, com o mesmo estilo, desenhadas sobre o tile no zoom alto. | Implementado (Fase 0) |
| RF-VIDA-164 | Ruas e estradas como tiles de terra batida com borda mais escura; praça com fogueira animada. | Implementado (Fase 0), fogueira estática |
| RF-VIDA-165 | Futuro: lavouras por estação, muralhas, castelo, templo, porto, barcos, ruínas, exércitos com bandeira na cor do reino, fumaça de fábricas. | Fase 5/6 |
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

1. **Guerra controlável?** O jogador pode só observar e influenciar guerras (proposta atual) ou também comandar um povo diretamente em algum modo?
2. **Até onde vão as eras?** Parar na Era Industrial ou permitir que um povo chegue ao espaço e vire ator no 3D (contato, tratado, ameaça)?
3. **Custo das ferramentas de vida:** sair de energia da nave, dos recursos minerados ou de uma recarga por tempo?

---

## 18. Registro de decisões

| Data | Decisão |
|---|---|
| 19/10/2026 | Vida nativa fora da Terra é rara, em três níveis entre os planetas favoráveis: 25% só vegetação, 8% com animais, 1 em cada 10 destes com espécie inteligente. |
| 19/10/2026 | As espécies da Terra começam a bordo e podem ser levadas a qualquer planeta. |
| 19/10/2026 | Assentamentos com níveis (aldeia < 25, vila 25–59, cidade ≥ 60), áreas circulares (8/12/18 tiles), sem fundação dentro de outra área; cidade pode conter aldeias, nunca o contrário; reinos formados por capital e subordinados. |
| 19/10/2026 | Planta com praça central, ruas em cruz, casas em lotes de frente para as ruas e estradas entre assentamentos do mesmo reino. |
| 19/10/2026 | Arte em pixel no estilo 16 bits simples: contorno escuro, 3–4 tons por material, luz de cima à esquerda, elementos grandes ~16 px. |
| 19/10/2026 | Evolução só modifica espécies existentes (adaptação, variantes, especiação lenta); inteligência nunca surge de espécies não inteligentes. |
