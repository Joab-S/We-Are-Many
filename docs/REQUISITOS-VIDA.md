# We Are Many: Requisitos da Vida nos Planetas

> Versão 1.4 · 21/10/2026 · Etapa F (guerra por preparo, influência do jogador sobre os povos, região orgânica do assentamento e madeira que não derruba as casas) e Etapa H implementadas (eras por desenvolvimento: marcos de metal + pontos em seis pilares, 14 técnicas, recursos latentes, vocação com pilar dobrado e decadência rara; aba Resumo mostra os pilares) · versão 1.2.2 · 21/10/2026 · mapa organizado (pedido do Joab): no máximo 5 currais e 5 roças por assentamento, pelo tamanho; sem cercas e muralhas; o povo evolui o assentamento inicial antes de fundar outros (colonos só com tudo cheio, de vila em diante); menos caravanas e mercadores · versão 1.2.1 · 20/10/2026 · mapa mais limpo (pedido do Joab): currais do tamanho do rebanho, desmontados quando ele encolhe ou morre, sem ir para o lado do vizinho; roças só para quem trabalha nelas; cerca e muralha em volta das casas, não no raio da área · versão 1.2 · Etapa E implementada: caravanas visíveis com preço pela escassez, acordos comerciais, estradas que nascem e melhoram pelo uso, feira anual, barcos mercantes, bens de luxo, pedágio, pedidos da capital, moeda por era e transumância · versão 1.1: Etapa D implementada: estilo por casa com troca gradual na era nova, material da região, ruas principais, vielas e avenida, defesa por era, casas vazias na crise e brasão do reino · versão 1.0: Etapa I implementada: seleção de criaturas (realce, pilha, anel, seguir, nomes, ficha completa, grupo, destaque) e janela do assentamento com seis abas, balão leve e tabela comparativa · versão 0.9: Etapa C implementada: estoque próprio com teto, consumo, vocação, rebanhos, profissões novas e camadas do mapa · versão 0.8: ruas que abrem bloco a bloco e estradas só dentro do reino, onde há movimento (pedido do Joab, RF-VIDA-190b e 207) · versão 0.7: as 8 ideias novas foram aprovadas e a sequência de implementação da seção 19 foi definida (19.13) · versão 0.6: seção 19.17 nova: seleção de criaturas e informações do assentamento; ícone da vocação no rótulo e no painel · versão 0.5: seção 19 atualizada com as respostas do Joab: estoque próprio por assentamento com teto e consumo, extermínio só entre povos inteligentes, todas as ideias complementares aprovadas, base de simulação estocástica (19.15) e melhorias visuais (19.16) · versão 0.4: seção 19 nova: crescimento controlado, vocação, economia viva, guerras com motivo, eras por desenvolvimento e o defeito das ruas em grade (proposta, ainda não implementada) · versão 0.3: complementa a seção 4.7 (SUP) do [REQUISITOS.md](REQUISITOS.md) · revisão geral: situação de todos os requisitos conferida com o código da branch `development`, correções, próximos requisitos (seção 16.1) e regra de preservação
> Escopo: tudo o que acontece na superfície 2D depois que existe vida: espécies, ecossistema, evolução, civilizações, assentamentos, guerra, diplomacia, arte em pixel e o papel do jogador.

Itens marcados com **Implementado (Fase 0)** já existem no jogo (branch `development`). **Parcial** diz o que falta. O resto é requisito para a fase indicada, mapeada na seção 16.

> **Regra de preservação** (a mesma do [REQUISITOS.md, seção 0](REQUISITOS.md#0-como-manter-este-documento)): nada do que está implementado ou registrado aqui é removido sem necessidade ou pedido do Joab. Toda remoção entra no [Registro de remoções](REQUISITOS.md#13-registro-de-remoções), com a data, o motivo e o que ficou no lugar. Um requisito que muda guarda o valor antigo entre parênteses ("antes: ...").

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
19. [Crescimento controlado, vocação e economia viva](#19-crescimento-controlado-vocação-e-economia-viva)
20. [Comunidade, assentamentos e relações (RF-AS)](#20-comunidade-assentamentos-e-relações-rf-as)
21. [Bioma e sociedade](#21-bioma-e-sociedade)

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

| ID | Requisito | Situação |
|---|---|---|
| RF-VIDA-15 | O catálogo lista toda espécie conhecida com origem, faixa de clima, população total em todos os planetas e planetas onde vive. Hoje: janela **Espécies** (tecla E) com filtro por tipo, sprite, população, clima, situação (viva, extinta, nunca viveu aqui) e botão Soltar. | Parcial: janela Espécies do planeta atual; população em todos os planetas e lista de planetas onde vive faltam (Fase 5) |
| RF-VIDA-16 | Uma espécie extinta em todos os planetas fica marcada como extinta e não pode mais ser introduzida. | A fazer (Fase 5): hoje as espécies da Terra estão sempre no banco genético e podem ser soltas de novo |
| RF-VIDA-17 | Variantes evoluídas (seção 7) aparecem no catálogo como subespécies ligadas à original. | Parcial: as variantes do evento "espécie nova" entram no catálogo ligadas à original (RF-VIDA-51) |

---

## 4. Ecossistema e cadeia alimentar

| ID | Requisito | Situação |
|---|---|---|
| RF-VIDA-20 | Cadeia alimentar básica: vegetação → herbívoros → predadores; plâncton implícito → peixes; inteligentes comem peixes, caça e plantações. | Implementado (Fase 0). Plâncton implícito: o peixe ganha menos energia quanto mais apertado o cardume (raio de 3 tiles). Plantações a partir do fim da Idade da Pedra enchem o celeiro. Urso e raposa são onívoros. Detalhes em [ANALISE-SOBREVIVENCIA.md](ANALISE-SOBREVIVENCIA.md). |
| RF-VIDA-21 | Herbívoros consomem a vegetação do tile; vegetação comida demora a voltar. Superpopulação gera desertificação local. | Parcial: consumo existe, desertificação não |
| RF-VIDA-22 | Capacidade de suporte por espécie calculada pelo habitat disponível (área de água ou terra com clima tolerável), recalculada quando o terreno muda. | Implementado (Fase 0) |
| RF-VIDA-23 | Ciclos predador–presa emergentes (populações oscilam), sem extinção imediata de nenhum lado em condições normais. Extinção rara, mas possível: na Terra sem interferência, de 0 a 1 espécie em 200 anos (antes, 8 de 14). | Implementado (Fase 0) |
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
| RF-VIDA-35 | Filhotes seguem adultos do bando; inteligentes jovens ficam perto de casa. | Parcial: crianças inteligentes ficam perto de casa (RF-VIDA-30) e bichos começam em bandos (RF-VIDA-38); filhotes seguindo o bando na Fase 5 |
| RF-VIDA-36 | Reprodução sazonal opcional por espécie (seção 8). | Fase 5 |
| RF-VIDA-37 | **Natalidade controlada:** a chance de filhote cai com o quadrado do quanto a espécie ocupa do teto (perto dele, 8% do normal); abaixo de 20% do teto, 2,2 vezes o normal, para a espécie se recuperar. | Implementado (Fase 0) |
| RF-VIDA-38 | **Procurar parceiro:** adultos bem alimentados andam até o adulto da mesma espécie mais perto (24 tiles; 48 quando a espécie está rara); bichos acham parceiro a até 12 tiles. Bichos começam o mundo em bandos (cardumes de 6, manadas de 5, matilhas de 3, pares de tubarões). | Implementado (Fase 0) |
| RF-VIDA-39 | **Evitar a fome e o clima ruim:** toda espécie busca comida antes de morrer de fome: herbívoros procuram pasto mais longe quanto mais fome têm; predadores procuram presa até 36 tiles e, sem presa, vão para onde é mais verde; qualquer predador pesca na beira d'água; anfíbios comem na água; inteligentes caçam (qualquer adulto, com fome e sem comida no celeiro) e plantam. Na beirada ou fora da faixa de temperatura, todo bicho anda para um lugar melhor. Sem destino, seguem num rumo em vez de rodar no lugar. Morrer de fome continua possível quando não há saída. | Implementado (Fase 0) |
| RF-VIDA-39a | **Andarilhos:** de vez em quando um adulto do mesmo povo chega andando a um assentamento e se junta a ele; chance por ano de 35% com até 3 moradores, 15% com menos de 10, 5% com menos de 30 e 1% acima disso. | Implementado (Fase 0) |

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

| ID | Requisito | Situação |
|---|---|---|
| RF-VIDA-50 | **Adaptação:** populações que vivem por várias gerações perto do limite da sua faixa de temperatura deslocam a faixa aos poucos (ex.: +1 K a cada N gerações), até um limite por espécie. | Fase 6 |
| RF-VIDA-51 | (Parcial: o evento "espécie nova" cria uma variante já adaptada a um lugar, ex.: "Lobo-das-neves", "Camelo-do-deserto", ligada à original no catálogo.) **Variantes:** uma população isolada geograficamente (sem contato por muitas gerações, por exemplo em outra ilha ou outro planeta) vira uma **subespécie** com nome derivado (ex.: "Cervo-das-neves"), cor ajustada e atributos levemente diferentes. | Parcial (evento "espécie nova") |
| RF-VIDA-52 | **Especiação lenta:** uma subespécie que acumula diferenças suficientes vira espécie nova no catálogo. Isso leva centenas de anos de jogo, não minutos. | Fase 6 |
| RF-VIDA-53 | Atributos que podem mudar: faixa de temperatura, tamanho, velocidade, fertilidade, cor. Dieta e tipo (peixe vira terrestre etc.) **não** mudam, para manter a legibilidade. | Decidido |
| RF-VIDA-54 | **Extinção:** uma espécie some de um planeta quando a população chega a zero; some do jogo quando some de todos. Extinções locais podem ser revertidas reintroduzindo de outro planeta. | Parcial: extinção local registrada ("Extinta aqui") e reversível soltando do banco genético; extinção global na Fase 5 (RF-VIDA-16) |
| RF-VIDA-55 | **Surgimento de inteligência:** só a partir de espécies que já sejam inteligentes. Herbívoros e predadores nunca viram inteligentes (decisão para preservar a raridade e o pilar "não criar"). | Decidido |
| RF-VIDA-56 | Pressões evolutivas visíveis num painel da espécie: "adaptando-se ao frio", "isolada há 120 anos", com a tendência dos atributos. | Fase 6 |

---

## 8. Clima, estações, doenças e desastres

| ID | Requisito | Situação |
|---|---|---|
| RF-VIDA-60 | **Estações:** o ano tem estações conforme a inclinação do planeta. No inverno a vegetação para de crescer nas latitudes altas, a água congela perto dos polos e animais migram. | Fase 4 |
| RF-VIDA-61 | **Migração:** espécies se deslocam para áreas mais favoráveis quando o tile fica hostil (frio, seca, fome). Aves fazem migrações sazonais longas. | Parcial: todo bicho foge do frio, do calor e da fome (RF-VIDA-39) e há o evento migração de rebanho; migração sazonal e aves na Fase 4/5 |
| RF-VIDA-62 | **Doenças:** surtos começam em populações densas (aldeias grandes, rebanhos). Espalham-se por contato, com taxa de mortalidade por doença. Espécies vindas de outro planeta podem trazer doenças desconhecidas aos nativos. | Parcial: evento peste em assentamentos grandes e doença a bordo nas viagens longas; contágio por contato e doenças de outro planeta na Fase 5 |
| RF-VIDA-63 | **Pragas:** enxames de insetos ou herbívoros em excesso devoram plantações e vegetação. | Fase 5 |
| RF-VIDA-64 | **Desastres:** secas, enchentes, incêndios florestais (espalham-se pela vegetação seca), vulcões, terremotos, eras glaciais, impactos. Desastres naturais seguem o clima e a geologia; desastres causados pelo jogador (cometa) seguem as ferramentas. | Parcial: seca, incêndio, vulcão, terremoto e cometa (RF-VIDA-68); enchentes, eras glaciais e incêndio que se espalha pela vegetação seca na Fase 4/5 |
| RF-VIDA-65 | Desastres e doenças sempre geram uma linha na crônica com o local, e o jogador pode clicar para levar a câmera até lá. | Implementado (Fase 0): toda linha da crônica com local leva a câmera até lá |
| RF-VIDA-67 | **Gestão de eventos:** o mundo sorteia eventos aleatórios, 2,5% por ano normalmente e 20% por ano quando passam 30 anos sem nada importante (mundo monótono). O sorteio pesa o estado do mundo: espécie extinta favorece o reaparecimento, poucos povos favorecem nômades, mundo grande favorece peste. Na janela **Mundo** o jogador liga ou desliga os eventos automáticos e escolhe a frequência (rara, normal, frequente). | Implementado (Fase 0) |
| RF-VIDA-68 | **Eventos:** cometa (cratera que vira lago, borda levantada, minério do espaço, povo perto passa a crer no cometa), terremoto (falha que levanta o chão, derruba casas, abre caverna com minério), vulcão e ilha vulcânica (lava que esfria em rocha e jazidas), incêndio florestal, seca, peste num assentamento grande, nômades (um povo novo, com cultura própria, surge longe dos outros), espécie nova (variante, RF-VIDA-51), reaparecimento de espécie extinta, migração de rebanho e era de ouro (um povo aprende mais rápido por um tempo). Os desastres ficam longe das capitais quando sorteados, mas o jogador pode lançá-los onde quiser (aba Eventos). | Implementado (Fase 0) |
| RF-VIDA-69 | Efeitos visuais dos eventos: cometa descendo, explosão, fumaça, fogo, tremor da câmera e ruínas onde casas foram destruídas (somem em 40 anos). | Implementado (Fase 0) |
| RF-VIDA-66 | Mudanças de terreno do jogador afetam a vida na hora: transformar mar em terra mata peixes, inundar terra afoga terrestres (implementado na Fase 0), aquecer demais mata quem está fora da faixa. | Parcial: mar virando terra mata peixes e terra inundada afoga terrestres; aquecer demais ainda não mata na hora |

---

## 9. Espécies inteligentes e civilização

### 9.1 Indivíduos

| ID | Requisito | Situação |
|---|---|---|
| RF-VIDA-70 | Cada inteligente pertence a um assentamento, tem idade, energia e uma profissão: coletor, caçador, pescador, agricultor, construtor, guerreiro, sacerdote, comerciante (as profissões liberam conforme a era). | Parcial: 11 profissões com aparência própria (coletor, caçador, agricultor, lenhador, construtor, minerador, ferreiro, soldado, guarda, líder, rei), liberadas por era, nível e condições: minerador desde a Pedra (explora e trabalha nas minas), ferreiro só com ferraria, pescador só com porto, mais soldados em povos guerreiros; faltam sacerdote e comerciante |
| RF-VIDA-71 | Comportamento base: trabalhar perto de casa durante o dia, voltar ao centro, fugir de predadores, procurar comida quando com fome. | Parcial |
| RF-VIDA-72 | Líder por assentamento (chefe, rei, prefeito conforme a era), com traço de personalidade (pacífico, ambicioso, devoto, mercador) que influencia diplomacia e guerra. | Fase 6 |

### 9.2 Eras tecnológicas

As eras do código (`ERAS` em `src/sim/eco/constants.ts`). Não há relógio de séculos (o antigo `ERA_YEARS` saiu do código em 31/10/2026): a era de cada assentamento é calculada por `organicTech` (`src/sim/progress.ts`) a partir das técnicas que o lugar conhece e das peças que forjou (`v.made`), e nunca volta. A tabela diz o que o código faz hoje.

| Era | O que muda no lugar | Condição para entrar nela (`organicTech`) |
|---|---|---|
| Idade da Pedra | Tendas e cabanas, coleta, caça, roças pequenas (uma a cada quatro casas), ferramentas de pedra e madeira, canoas, escambo | — (começo; sobe de 0 a 0,95 com ferramentas, roça, porto, rebanho e as primeiras técnicas) |
| Idade do Bronze | Uma roça a cada duas casas, celeiro e ferraria, barco a remo, lingotes como moeda, soldados entre os ofícios, rendimento da roça ×1,2 (`ERA_YIELD`) | Fundição de cobre e bronze, ou uma peça de bronze forjada, ou cerâmica com domesticação, tecelagem ou roda e já com roça, rebanho ou vila |
| Idade do Ferro | Construções especiais pedem mais pedra, templo, quartel, estátua, veleiro, moeda de prata, sobrado na vila, rendimento ×1,45 | Fundição de ferro, ou uma peça de ferro forjada, ou fundição com duas peças de bronze e escrita, moinho, cavalaria ou cidade |
| Era Medieval | Casas de pedra, grande obra na capital, caravela, rotação de culturas (o solo cansa pela metade), moeda cunhada, rendimento ×1,75 | Aço e alvenaria, ou fundição de ferro com 3 peças de ferro e moeda, cavalaria, imprensa ou cidade com 20 de pedra extraída |
| Era Industrial | Fábrica (dobra a ferraria), navio a vapor, papel-moeda, rendimento ×2,4. Última era: os povos não vão ao espaço | Vapor, com uma peça de aço, 5 de carvão ou 4 peças de ferro |

O avanço emprestado (`advance`: comércio que ensina e a ajuda do jogador) só passa de era com a técnica da porta (fundição, siderurgia, aço ou vapor) ou com as peças de `ERA_NEEDS` (`src/sim/economy.ts`: 2 de bronze; 4 de ferro; 40 de pedra e 12 de ferro; 20 de carvão e 4 de aço) e os pontos de desenvolvimento da era (`ERA_POINTS`). As peças são do próprio lugar (trava local, 31/10/2026): as forjadas ali (`v.made`) e as que o comércio trouxe (cada ferramenta, arma ou armadura de metal que chega de quem a forjou conta `TRADED_PIECES` de uma peça do metal mais nobre do vendedor). Antes contavam o máximo entre o lugar e a capital, e a capital somava o que as colônias mineravam e forjavam: a vila sem minério acompanhava a era do reino minerador.

| ID | Requisito | Situação |
|---|---|---|
| RF-VIDA-73 | Cada assentamento tem progresso tecnológico próprio; a etapa aparece no painel e muda a arte das casas. **Evolução orgânica (reformulado em 24/10/2026):** em vez de um relógio fixo de séculos que travava em 99%, o avanço (`v.tech`, `organicTech`) nasce das técnicas e materiais realmente dominados pelo assentamento, respeitando a sequência física dos materiais (ferramentas iniciais de pedra e madeira → fornos de cerâmica → fundição de metais macios como cobre, estanho ou bronze → siderurgia do ferro → aço com carvão → vapor). O painel do assentamento mostra o próximo passo lógico (`nextStepText`). Povos que valorizam conhecimento descobrem e ensinam mais rápido. | Implementado (reformulado em 24/10/2026) |
| RF-VIDA-74 | Tecnologia se espalha: assentamentos vizinhos e parceiros comerciais avançam mais rápido; um reino compartilha a era da capital com atraso. | Implementado: difusão pelo reino, acordos comerciais, caravanas e feiras. Desde 31/10/2026, aprender com o vizinho (e com os mercadores) pede a condição material do próprio lugar (`t.use`), e a era sobe pelas peças do lugar, não as do reino |
| RF-VIDA-75 | ~~O jogador pode **ensinar** (adiantar o progresso), com custo e com risco: ensinar demais causa instabilidade (ver RF-VIDA-131).~~ **Pausado na interface em 24/10/2026 a pedido do Joab:** o botão "📜 Ensinar" saiu da barra Civilização para ser repensado no futuro de forma menos vaga e menos automática (métodos internos mantidos para testes). | Pausado na interface (24/10/2026) |
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
| RF-VIDA-97 | A área é visível como contorno suave com a cor do reino quando o jogador passa o mouse ou ativa a camada "Território". | Implementado (Fase 0): área tingida e contornada com a cor do reino, ligada com T ou na janela Mundo (RF-VIDA-152) |
| RF-VIDA-98 | Fronteiras de reino: a união das áreas dos assentamentos do reino; tiles disputados entre dois reinos geram tensão (seção 12). | Fase 6 |
| RF-VIDA-99 | Fundação inteligente: colonos preferem locais com água doce ou costa por perto, terra plana, vegetação e distância razoável do assentamento de origem; evitam montanha, gelo e deserto (a partir da Idade do Ferro, poços e irrigação abrem o deserto). Por terra, só vão a pé: não atravessam água. | Parcial: escolhe terra habitável e alcançável a pé |

### 10.3 Planta do assentamento

| ID | Requisito | Situação |
|---|---|---|
| RF-VIDA-100 | Todo assentamento tem uma **praça central** com fogueira (Pedra) ou poço (Bronze em diante); a praça de uma cidade ganha, da Idade do Bronze em diante, uma fortaleza com a bandeira do reino. | Implementado (Fase 0) |
| RF-VIDA-101 | **Ruas orgânicas:** de 3 a 5 ruas principais saem da praça em direções sorteadas e serpenteiam; o comprimento cresce com o nível (aldeia curta, cidade longa). Cada assentamento tem sua planta própria e estável: o nível seguinte só estende as ruas. Ruas são tiles de terra batida pintados no mapa e não passam por água. | Implementado (Fase 0); **defeito aberto:** ruas em escada e ruas paralelas coladas, correção em RF-VIDA-190 a 196 |
| RF-VIDA-102 | **Casas em lotes ao longo das ruas**, dos dois lados, a cada 3 tiles com uma pequena folga irregular, ocupando primeiro os lotes mais perto da praça. Casas nunca ficam na água nem sobre a rua. | Implementado (Fase 0) |
| RF-VIDA-103 | **Estradas de terra** ligam assentamentos do mesmo reino, contornando água quando possível. Desenho em pixel: faixa contínua com cantos arredondados que se liga às vizinhas, borda e sulcos de carroça na terra batida, paralelepípedos com meio-fio a partir da Era Medieval e lajes na praça; o chão em volta aparece dos lados. | Implementado (Fase 0): estrada em curva suave, interrompida na água |
| RF-VIDA-104 | Ruas laterais nascem das principais em ângulos variados, mais numerosas e longas em vilas, cidades e metrópoles (sem grade quadrada). Futuro: ruas crescem sob demanda, quando os lotes acabam (RF-VIDA-207). | Implementado (Fase 0), planta fixa por nível; **defeito aberto:** laterais nascem coladas na principal e formam grade (RF-VIDA-193) |
| RF-VIDA-105 | **Campos cultivados** (seção 11) em volta das casas da periferia, a partir do Bronze. | Fase 5 |
| RF-VIDA-106 | **Muralhas por era:** paliçada de madeira (Ferro), muralha de pedra com portões nas ruas (Medieval), contornando a área da cidade. | Fase 6 |
| RF-VIDA-107 | **Edifícios especiais:** castelo/palácio na capital do reino, templo, mercado, quartel, celeiro, ferraria (exige metal no estoque), moinho, fábrica (Industrial), porto (seção 10.5), mina (seção 11.1), pontes onde estradas cruzam rios estreitos, marcos (estátua, torre, maravilha; RF-VIDA-124d) que contam a história. Toda construção custa madeira e pedra do estoque do reino (casa: 4 de madeira, ou 4 de pedra e 1 de madeira a partir da Era Medieval; especiais: 10 de madeira e 2 a 8 de pedra; porto: 12 de madeira; mina: 6 de madeira); sem material, a obra espera. | Parcial: faltam pontes e torres |
| RF-VIDA-108 | Assentamentos abandonados (população zero) deixam ruínas por um tempo: as casas caem na hora, e ruas e plantações vão sumindo em três etapas de 12 anos (plantações e um terço das ruas, outro terço, o resto com a praça), sem mexer no que estiver dentro de um assentamento vivo. Quem funda um assentamento perto das ruínas (inteligente solitário, que anda até elas, ou colônia) recomeça na antiga praça e aproveita as ruas e plantações que sobraram; a crônica registra "fundou X sobre as ruínas de Y". A crônica também diz por que o último morador morreu (de fome, de velhice). | Implementado (Fase 0) |

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
| RF-VIDA-120 | **Plantação:** a partir do Bronze, agricultores criam campos (tiles marcados, com sprite de lavoura que muda com a estação) em solo fértil perto das casas. Campos produzem comida e reduzem a necessidade de caça. | Parcial: campos de trigo, sem estação. Só se planta o que os agricultores dão conta, mais duas roças; roça sobrando volta a ser campo (`FIELD_FALLOW_RATE` 0,5 por ano) (v1.2.1; antes: uma roça a cada duas casas, trabalhada ou não) |
| RF-VIDA-121 | Colheita sazonal; secas, pragas e frio reduzem a produção e podem causar fome. | Implementado: a colheita vem pela estação (`SEASON_HARVEST`), com a amplitude que cresce com a latitude e o bioma; a seca do clima do ano e a água no solo cortam a safra; o frio encurta a estação de crescimento (seção 21) |
| RF-VIDA-122 | Irrigação (Ferro em diante) permite campos mais longe da água. | Parcial: deserto colonizável a partir do Ferro; com a técnica `irrigacao`, a roça rende a roça irrigada do bioma (o oásis no deserto, o arrozal no pântano; seção 21) |
| RF-VIDA-123 | **Domesticação:** herbívoros próximos podem ser domesticados; viram rebanho (sprites seguindo pastores), fornecem comida e tração. Rebanhos atraem predadores. | Implementado: só os domesticáveis pelos critérios de Diamond, da região do lugar, e o rebanho é o que a fauna local dá (seção 21.4) |
| RF-VIDA-124 | **Estoque do reino** (guardado na capital, usado por todos os assentamentos do reino): madeira, pedra, cobre, estanho, ferro, carvão, ouro, ferramentas e armas, mais a comida dos barcos de pesca. Madeira e pedra têm limite de armazém (200 + 20 por habitante). O painel do assentamento (mouse sobre a área) mostra o estoque. | **Substituído na Etapa C** pelo estoque próprio de cada assentamento (RF-VIDA-212, decisão do Joab de 20/10/2026); a janela de reinos mostra a soma dos estoques do reino. Registrado no Registro de remoções |
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
| RF-VIDA-128a | **Itens:** 34 itens em quatro categorias (ferramentas, armas, armaduras, joias) e seis materiais (madeira, pedra, bronze, ferro, aço, ouro), cada um com ícone em pixel pintado na cor do material: machado, faca, martelo, vara de pesca, enxada, picareta, serra, lança, arco, espada, besta, machado de guerra, mosquete, escudo, elmo, cota de malha, armadura de placas, anel, amuleto e coroa. A era mínima limita o que sai (besta na Era Medieval, mosquete na Era Industrial; antes o texto dizia "besta no Renascimento", era que não existe no jogo). | Implementado (Fase 0) |
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
| RF-VIDA-133 | **Cerco e conquista:** 3 ou mais soldados atacantes na praça sem nenhum defensor armado por perto conquistam o assentamento: ele muda de reino e de cor, metade do estoque do reino vencido vai para o vencedor (saque), e se era capital, os outros assentamentos daquele reino ficam independentes. | Implementado (Fase 0), sem casas queimadas; com o estoque próprio (RF-VIDA-212), o saque passa a levar parte do estoque do assentamento conquistado |
| RF-VIDA-134 | Fim de guerra por conquista do alvo, ou paz: 3% por ano, mais 1% a cada 1,5 morto, mais 10% depois de 30 anos. Depois da paz a relação volta a −10. | Implementado (Fase 0) |
| RF-VIDA-135 | Guerras afetam o ecossistema (incêndios, fome) e a cultura (povos vencidos guardam rancor). | Implementado (Etapa F): roças e casas queimadas, saque e rancor duradouro (RF-VIDA-243) |

### 12.3 Revoltas e instabilidade

| ID | Requisito | Situação |
|---|---|---|
| RF-VIDA-136 | Cada assentamento tem estabilidade, reduzida por fome, doença, distância da capital, cultura diferente da capital, impostos/guerra longa e por **intervenção excessiva do jogador** (ensinar demais em pouco tempo). | Fase 6 |
| RF-VIDA-137 | Estabilidade baixa gera revolta: o assentamento declara independência e vira um reino novo, possivelmente em guerra com o antigo. (Hoje a independência vem da distância da capital, RF-VIDA-81, e começa com relação −45.) | Parcial: independência por distância da capital (RF-VIDA-81) |
| RF-VIDA-138 | Guerras civis quando a capital perde o líder sem sucessor claro. Implementado (Fase 0): quando morre o rei de um reino com 4 ou mais assentamentos, há 30% de chance de um pretendente levar a metade mais distante e começar uma guerra civil. Colônias distantes também declaram independência mais cedo em reinos grandes. | Implementado (Fase 0) |

---

## 13. Papel do jogador

| ID | Requisito | Situação |
|---|---|---|
| RF-VIDA-140 | Ferramentas de vida: introduzir espécie conhecida (**uma criatura por clique**; para nascer filhote é preciso um parceiro adulto da mesma espécie por perto), alimentar (pincel), reduzir população (clique). | Implementado (Fase 0) |
| RF-VIDA-141 | Ferramentas de civilização: introduzir um inteligente conhecido, **sozinho** (anda até o assentamento do seu povo mais perto, até 40 tiles, e se junta a ele; sem nenhum por perto, prefere reocupar ruínas a até 30 tiles; senão funda um novo só com ele, mas só num lugar onde dá para viver sozinho (vegetação ≥ 0,3, ou verde na beira da água, e temperatura com folga dentro da faixa da espécie), andando até um lugar assim a até 25 tiles. Uma aldeia de um só dura enquanto o fundador viver; filhos só com pelo menos dois no mesmo assentamento) e boa colheita (dá madeira e comida a um assentamento); o botão "📜 Ensinar" ficou pausado na interface em 24/10/2026 a pedido do Joab (RF-VIDA-75). Ferramentas de Terreno colocam veios de minério (RF-VIDA-127e). | Implementado (Fase 0; "Ensinar" pausado na interface em 24/10/2026) |
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
| RF-VIDA-152 | Rótulos de assentamento no mapa com nome, nível e população; capital mostra o reino. **Cor do reino:** cada reino tem uma cor própria (nenhum reino vivo repete a cor de outro); a área de cada assentamento fica tingida e contornada com essa cor (borda cheia na capital, tracejada nos outros) e o rótulo leva uma faixa da cor. Liga e desliga com T ou na janela Mundo. | Implementado (Fase 0) |
| RF-VIDA-153 | Inspecionar criatura: espécie, assentamento, era, idade, energia; inspecionar tile: bioma, altitude, temperatura, umidade, vegetação. | Implementado (Fase 0); melhorias detalhadas em 19.17 (RF-VIDA-330 a 337) |
| RF-VIDA-154 | Painéis futuros: espécie (atributos, tendência evolutiva, mapa de distribuição), assentamento (nível, recursos, estabilidade, líder), reino (assentamentos, relações, guerras), gráficos de população ao longo do tempo. | Fase 5/6; a janela do assentamento está detalhada em 19.17 (RF-VIDA-341 a 349a) |
| RF-VIDA-155 | Camadas de visualização adicionais: território, fertilidade, doenças, relações. | Fase 5/6 |
| RF-VIDA-156 | **Crônica:** histórico completo do planeta (fundações, eras, guerras, extinções, desastres, intervenções do jogador), filtrável, com clique para ir ao local. Exportável como texto. | Implementado (Fase 0), sem exportar: até 400 linhas, filtros (importantes, povos, guerras, natureza, mar, economia, você). Repetições do mesmo assunto em 30 anos viram uma linha com contagem e lugares (ex.: "Tempestades afundaram barcos de pesca (Xita, Luru…) ×35"), para que um evento frequente não esconda os outros. |

### 14.2 Arte em pixel (estilo 16 bits)

| ID | Requisito | Situação |
|---|---|---|
| RF-VIDA-160 | Estilo **16 bits simples e bonito**: elementos grandes (casas ~16×16 px de arte, árvores ~12–16 px) com **contorno escuro**, **3 a 4 tons por material** e **luz vinda de cima à esquerda**. Nada exagerado: cores mais bonitas e objetos bem definidos no zoom próximo. | Implementado (Fase 0) |
| RF-VIDA-161 | Criaturas pequenas: de longe são 1 pixel na cor da espécie (peixe = 1 pixel), de perto viram sprites; o humano segue a referência do WorldBox (corpo simples, roupa na cor do reino). | Implementado (Fase 0) |
| RF-VIDA-162 | Casas mudam por era: **cabana de palha** (Pedra), **casa de madeira com telhado de palha** (Bronze), **casa enxaimel com telhado de telha** (Ferro), **casa de pedra com telhado de ardósia** (Medieval) e **sobrado de tijolo** (Industrial, e nas cidades já a partir da Medieval). A cor do telhado e dos detalhes identifica o reino. | Implementado (Fase 0): casas, portos e construções especiais pintados com a cor do reino |
| RF-VIDA-163 | Árvores por bioma (folhosa, floresta tropical, pinheiro, acácia, cacto) e pedras, com o mesmo estilo, desenhadas sobre o tile no zoom alto. | Implementado (Fase 0) |
| RF-VIDA-164 | Ruas e estradas como tiles de terra batida (pedra a partir da Era Medieval), com leve variação por tile; praça com fogueira animada (chamas em dois quadros) em todo assentamento da Idade da Pedra, mesmo cidades, e fogueiras pequenas no quintal de algumas cabanas. Ruas e plantações desenhadas em pixel art bem de perto (zoom 8); plantação dourada em qualquer zoom; o véu do território quase some de perto. | Implementado (Fase 0) |
| RF-VIDA-165 | Futuro: lavouras por estação, muralhas, ruínas, exércitos com bandeira na cor do reino. | Parcial: ruínas (RF-VIDA-108) e ícone de espadas nas batalhas; lavouras por estação, muralhas e bandeiras na Fase 5/6 |
| RF-VIDA-167 | **Terreno de perto (zoom médio e próximo):** a fronteira entre tiles diferentes ondula em vez de formar quadrados; manchas e grãos por material (grama com manchas e fios, areia com grãos); linha de espuma colada na costa, água rasa, areia molhada e barranco quando a água fica ao sul. | Implementado (Fase 0) |
| RF-VIDA-168 | Sprites de porto, canoa, barco a remo, veleiro, caravela, navio a vapor (com fumaça), destroços, tubarão, crianças, idosos, pescador e fábrica, no mesmo estilo. | Implementado (Fase 0) |
| RF-VIDA-166 | Paleta da flora alienígena derivada da estrela (RF-ART-04): plantas de estrela vermelha mais escuras/arroxeadas, de estrela azul mais claras. | Fase 5 |

---

## 15. Requisitos não funcionais

| ID | Requisito | Situação |
|---|---|---|
| RNF-VIDA-01 | **Orçamento de CPU:** a simulação de vida usa no máximo ~2 ms por quadro no planeta observado, a 5x, num PC modesto. Hoje: ~8 ms por segundo simulado com ~3.800 criaturas (≈ 1 ms por quadro a 5x, medido em Node). | Parcial: dentro do orçamento medido em Node; a simulação ainda roda na thread principal (worker na Fase 5) |
| RNF-VIDA-02 | **Teto de indivíduos** por planeta observado: ~12.000 simulados individualmente (limite atual da camada de sprites). Acima disso, agregação (RF-VIDA-34). | Implementado (Fase 0): camada de sprites com 12.000; agregação na Fase 5 |
| RNF-VIDA-03 | Decisões por indivíduo espaçadas (hoje a cada 0,4 s de jogo), com grade espacial para vizinhança; nada de busca O(n²). | Implementado (Fase 0) |
| RNF-VIDA-04 | **Fora da tela:** criaturas fora da área visível continuam simuladas, mas sem desenho. | Implementado (Fase 0) |
| RNF-VIDA-05 | **Planetas não observados:** quando o jogador está no 3D ou em outro planeta, a vida é simulada de forma **agregada** (populações por espécie e por assentamento, eras, relações), em passos grandes, e reconstituída em indivíduos ao observar de novo. Custo desprezível por planeta. | A fazer (Fase 5): hoje o ecossistema de um planeta fica guardado na memória e para no tempo enquanto o jogador está no espaço ou em outro planeta |
| RNF-VIDA-06 | Simulação determinística dada a semente e a sequência de ações do jogador, para reproduzir bugs e, no coop, sincronizar. | Parcial: PRNG com semente por planeta, mas o passo de tempo segue os quadros; passo fixo na Fase 7 |
| RNF-VIDA-07 | A superfície (2D) não usa placa de vídeo: desenha sempre em Canvas 2D, igual em qualquer computador; só o espaço (3D) precisa de WebGL. De longe, o mapa é chapado (um pixel por tile) com enfeites a partir do zoom 5; bem de perto (zoom 8 em diante), entra a arte detalhada (bordas onduladas, espuma na costa, ruas e só manchas suaves no chão, sem granulado), com 8 pixels de arte por tile, a mesma escala das casas e criaturas, pintada na CPU em blocos de 32x32 tiles guardados em cache e refeitos só quando um tile muda. Árvores, pedras e trigo ficam fora do chão e mantêm a arte original de 16 pixels em qualquer zoom (a partir do 5). | Implementado (Fase 0) |
| RNF-VIDA-08 | Todo texto de interface e nomes em português; nomes alienígenas gerados; nenhum nome da obra de referência. | Implementado (Fase 0) |

### 15.1 Persistência

| ID | Requisito | Situação |
|---|---|---|
| RNF-VIDA-09 | O save guarda, por planeta com vida: espécies e populações, assentamentos (posição, nível, casas, ruas, reino, era, recursos, estabilidade), reinos e relações, a crônica e as camadas alteradas do terreno (como diff, RF-SUP). | Feito em 22/10/2026 (RF-VIDA-381; guarda tudo, sem diff) |
| RNF-VIDA-10 | Indivíduos podem ser salvos de forma compacta (posição quantizada, idade, espécie, assentamento) ou regenerados a partir das populações se o save precisar ser pequeno. | A fazer (Fase 2) |
| RNF-VIDA-11 | O save do planeta entra no backup único da base secreta (regra do backup em aberto no REQUISITOS.md). | A fazer (Fase 3) |

---

## 16. Plano por fases

Mapeado às fases do [REQUISITOS.md](REQUISITOS.md#8-plano-de-desenvolvimento-por-fases). As linhas das Fases 4 a 8 são o plano original e foram mantidas como estavam (regra de preservação); muito do que elas listam já foi adiantado na Fase 0. A situação de cada item está nas seções acima, e o que falta está na seção 16.1.

| Fase | O que entra da vida nos planetas |
|---|---|
| **Fase 0** (feito, PRs #1, #2, #4 e #6 a #10 e commit 0f7b0c7) | Raridade em três níveis, banco genético da Terra a bordo (30 espécies), ecossistema com peixes, herbívoros, predadores, anfíbios, megafauna e inteligentes, natalidade controlada e busca ativa de comida, idade visível, eras por condição, profissões, assentamentos com níveis, áreas, ruas orgânicas, casas em lotes, estradas e reinos com cor própria, portos, barcos e perigos no mar, minérios, minas e ferraria, economia e comércio, culturas e crenças, diplomacia, alianças, federação, guerra (inclusive naval e civil), independência, eventos do mundo, crônica, catálogo de itens, HUD com janelas, minimapa e mão vazia, ruínas reocupáveis, andarilhos, arte 16 bits e superfície em Canvas 2D sem placa de vídeo. Isso adiantou boa parte das Fases 4, 5 e 6 abaixo. |
| **Fase 4** (superfície e terraformação) | Estações, fertilidade do solo, migração por clima, desastres naturais básicos, contorno de território. |
| **Fase 5** (espécies e colonização) | Tipos novos (flora, aves, anfíbios, insetos, megafauna), reprodução com intervalos, caçada em grupo, caça por inteligentes com viagem, agricultura e domesticação, doenças, agregação de população, catálogo, ferramentas proteger/curar/realocar com custo, colonos humanos, simulação agregada fora de observação, persistência. |
| **Fase 6** (ameaças, narrativa e conteúdo) | Evolução (adaptação, variantes, especiação), cultura e crenças, comércio, diplomacia, união, guerra, cercos, revoltas, muralhas, castelos, portos, crônica completa, objetivos por planeta, poluição industrial. |
| **Fase 7** (coop) | Sincronização determinística da simulação de vida entre jogadores. |
| **Fase 8** (escala e polimento) | Otimização para planetas grandes (2048×1024) cheios, animações extras, eras Atômica e Espacial. |

### 16.1 Próximos requisitos (backlog da vida, 20/10/2026)

O que falta, juntando os itens **Parcial** e **Fase N** acima e os requisitos novos que a implementação gerou. A ordem geral com o resto do jogo está no [REQUISITOS.md, seção 8.1](REQUISITOS.md#81-backlog-revisado-em-20102026-próximos-passos).

| ID | Requisito | Fase | Origem |
|---|---|---|---|
| RF-VIDA-170 | **Save do planeta:** espécies, indivíduos (compactos), assentamentos, reinos, relações, crônica e terreno alterado entram no save do jogo e voltam iguais. | 2 | Feito em 22/10/2026 (RF-VIDA-381) |
| RF-VIDA-171 | **Vida fora da observação:** ao sair do planeta, a simulação continua agregada (populações, eras, relações, guerras) e, ao voltar, os indivíduos são reconstituídos; a crônica registra o que houve no intervalo. | 5 | RNF-VIDA-05; hoje o planeta para no tempo |
| RF-VIDA-172 | **Testes que protegem o que já existe:** extinções raras na Terra em 200 anos (semente fixa), plantações e fogueiras presentes cedo, aldeia de solitário que dura enquanto ele vive, ruínas que somem ou são reocupadas; e captura de tela da superfície comparada a uma referência. | 1 | Novo: regra de preservação e regressões já relatadas (fogueiras e roças "sumidas") |
| RF-VIDA-173 | **Simulação num Web Worker**, com a tela só desenhando o estado. | 5 | RNF-VIDA-01; mapas maiores e até 100 assentamentos vivos |
| RF-VIDA-174 | **Assentamento desce de nível** quando a população cai (hoje só sobe), e o reino muda de capital ou se desfaz quando a capital cai (RF-VIDA-92). | 5/6 | RF-VIDA-90 |
| RF-VIDA-175 | **Custo e recarga das ferramentas** de vida, civilização e terraformação, pagos com os recursos das sondas (RF-SON-12) ou com energia. | 3/5 | RF-VIDA-143, questão aberta 1 |
| RF-VIDA-176 | **Ensinar com risco:** ensinar demais gera instabilidade e vira crença (hoje ensinar não tem custo nem risco). | 6 | RF-VIDA-75, 136, 145 |
| RF-VIDA-177 | **Catálogo entre planetas:** população de cada espécie em todos os planetas, planetas onde vive e extinção global (não pode mais ser solta). | 5 | RF-VIDA-15, 16 |
| RF-VIDA-178 | **Comerciantes visíveis** nas estradas e barcos de comércio entre portos, espalhando tecnologia entre parceiros. | 6 | RF-VIDA-74, 119, 125 |
| RF-VIDA-179 | **Sacerdote e comerciante** como profissões com aparência própria. | 5 | RF-VIDA-70 |
| RF-VIDA-180 | **Estações do ano** com lavouras que mudam de aparência, colheita sazonal e migração das aves. | 4/5 | RF-VIDA-36, 60, 61, 120, 121 |
| RF-VIDA-181 | **Domesticação e rebanhos**, campos cultivados na periferia, muralhas por era, pontes e torres. | 5/6 | RF-VIDA-105 a 107, 123 |
| RF-VIDA-182 | **Doenças por contato**, pragas e espécies invasoras com aviso. | 5 | RF-VIDA-26, 62, 63 |
| RF-VIDA-183 | **Evolução:** adaptação ao clima, variantes por isolamento e especiação lenta, com painel da espécie. | 6 | RF-VIDA-50 a 56 |
| RF-VIDA-184 | **Flora alienígena** com cor derivada da estrela e espécies de flora próprias. | 5 | RF-VIDA-05, 11, 166 |
| RF-VIDA-185 | **Ferramentas novas:** proteger, curar, realocar (com a nave), inspirar, semear paz ou discórdia, colher amostra. | 5/6 | RF-VIDA-142 |
| RF-VIDA-186 | **Colonos humanos** trazidos por naves de transporte. | 5 | RF-VIDA-146, RF-SUP-10 |
| RF-VIDA-187 | **Exportar a crônica** como texto. | 5 | RF-VIDA-156 |
| RF-VIDA-190 a 196 | **Corrigir as ruas em grade e em escada** (rede viária única, sem rua dupla, diagonais limpas, teste). Etapa A da seção 19. | 0/1 | Defeito relatado pelo Joab (20/10/2026), seção 19.2 |
| RF-VIDA-200 a 349b | **Crescimento controlado, vocação, economia viva, caravanas, guerras com motivo, arquitetura por era, falência e eras por desenvolvimento.** Etapas S, B a H, I e V da seção 19, com estoque próprio por assentamento, base estocástica e melhorias visuais. | 5/6 | Pedido do Joab (20/10/2026), seção 19 |

**Critério de saída da vida nos planetas:** levar espécies da Terra a um planeta terraformado, vê-las se adaptar ao longo de gerações, acompanhar uma civilização da Idade da Pedra até reinos que comerciam, se aliam e guerreiam, e ver na crônica o efeito das intervenções do jogador.

---

## 17. Questões em aberto

1. **Custo das ferramentas de vida:** sair de energia da nave, dos recursos minerados ou de uma recarga por tempo?
2. ~~**Vocação no rótulo** (seção 19.14, item 3): mostrar o ícone sempre ou só no painel?~~ Respondida em 20/10/2026: no rótulo, de forma simples, e no painel.

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
| 20/10/2026 | Territórios e rótulos com a cor do reino; estradas em pixel art (terra batida, calçamento, praça) e em curva. |
| 20/10/2026 | Solitários fundam só onde conseguem viver (antes morriam de fome e a aldeia sumia); ruínas somem aos poucos ou são reocupadas por quem chega perto. |
| 20/10/2026 | Rebalanceamento da vida: natalidade logística, procura de parceiro, bandos, fuga do clima ruim, busca ativa de comida, plâncton para os peixes, onívoros, tetos revistos e andarilhos. Roças e fogueiras voltam a aparecer cedo. |
| 20/10/2026 | A superfície passa a desenhar sempre em Canvas 2D, sem placa de vídeo; arte detalhada só bem de perto e textura do chão mais leve. |
| 20/10/2026 | Regra de preservação: nada é removido sem necessidade ou pedido, e toda remoção vai para o [Registro de remoções](REQUISITOS.md#13-registro-de-remoções). Revisão da situação de todos os requisitos e backlog da vida (seção 16.1). |
| 20/10/2026 | Proposta registrada (seção 19, sem implementação): crescer para dentro antes de para fora (estrutura de referência, reformas, expansão mais lenta), necessidades essenciais e vocação de cada assentamento (inclusive cavalos para guerra), caravanas e acordos, guerras com motivo e moderadas, arquitetura que muda aos poucos com a era, falência com causa, eras por marcos mais pontos de desenvolvimento, tudo parametrizado. Diagnóstico e correção planejada das ruas em grade. |
| 20/10/2026 | As 8 ideias novas (RF-VIDA-290 a 297) foram aprovadas; sequência de implementação: S e A, B, C, I, D, E, F, G, H, V (seção 19.13). |
| 20/10/2026 | Respostas do Joab à proposta: estoque próprio por assentamento, sem estoque compartilhado do reino (o comércio nasce da diferença), com teto por recurso e consumo obrigatório para a economia não explodir; extermínio só entre povos inteligentes, inclusive da mesma espécie quando os interesses são diferentes, e nunca entre animais; todas as ideias complementares entram; toda a vida passa a seguir simulação estocástica; lógica nova vem sempre com o seu visual, e os elementos existentes também melhoram. |
| 20/10/2026 | Ícone da vocação no rótulo, de forma simples, e no painel. Requisitos de seleção de criaturas (realce, escolha entre amontoadas, marcador, seguir, nome, ficha completa, grupo) e da janela do assentamento com abas (seção 19.17). |
| 21/10/2026 | Etapa F implementada (seção 19.7). Visual do mapa no estilo das referências do Joab (organizado e bonito, sem poluição): terreiro limpo em volta de casas, prédios, ruas, roças e pastos dentro da área (a madeira vai para o estoque; o mato volta quando as ruínas somem); ruas de terra com três quartos do tile e de pedra com quase o tile todo; casas alinhadas na beira da rua, à mesma distância dela; o véu e a borda do território somem aos poucos bem de perto (continuam de longe e na tecla T). |
| 21/10/2026 | Pedidos do Joab: guerra sem limite e sem trégua fixa, decidida por preparo e vantagem percebida (RF-VIDA-245 a 251); jogador influencia os povos com animação (RF-VIDA-252, 253); região orgânica do assentamento (RF-VIDA-379); casas deixam de desabar em massa (RF-VIDA-378). Removidos por pedido dele: `WARS_MAX`/`WARS_PER_KINGDOMS`, `WAR_COOLDOWN` e o texto de moderação do RF-VIDA-241. |
| 30/10/2026 | Plano novo de comunidade, assentamentos e relações (seção 20), todas as fases: degraus por funções com limiares novos (vila 40, cidade 120, metrópole 400, além das funções), com o porte econômico pelos limiares antigos; produção só por entrega no lugar na tela; ruas pelo uso; lealdade no lugar da independência só por distância. |

---

## 19. Crescimento controlado, vocação e economia viva

> Pedido do Joab em 20/10/2026, atualizado no mesmo dia com as respostas dele (19.14). **Situação: proposta, nada implementado ainda.** Esta seção junta o pedido, o que já existe no código, o diagnóstico do defeito das ruas, os requisitos novos, ideias complementares, os parâmetros e a ordem sugerida de implementação. Ela não remove nada das seções anteriores: onde um requisito novo muda um antigo, o antigo continua valendo até a etapa correspondente ser entregue, e a mudança entra no registro de decisões (e no de remoções, se tirar algo que o jogador via).

**Princípios desta seção**

1. **Sob medida, nada exagerado.** Guerra, falência, caravana e crise acontecem com causa visível e com frequência baixa; o mundo deve parecer vivo, não caótico.
2. **Para dentro antes de para fora.** Um assentamento se completa e se melhora antes de se espalhar. Expandir continua possível, só fica mais lento.
3. **Todo avanço aparece.** Uma técnica, uma vocação ou um recurso em uso tem que ser visto no mapa (construção, rebanho, rua, sprite) ou no painel. Nenhum progresso invisível.
4. **Tudo é probabilidade.** Todo acontecimento segue a simulação estocástica (19.15): taxas explícitas, sorteios com distribuições adequadas e calibração por muitas rodadas, nunca regra fixa escondida.
5. **Tudo parametrizado.** Cada taxa, limite e peso desta seção é uma constante com nome, num lugar só (RF-VIDA-208), para o Joab poder ajustar sem caçar números no código.
6. **Identidade local.** Dois assentamentos do mesmo povo podem ser bem diferentes: um vive de trigo, outro de cavalos, outro do porto.
7. **Toda lógica tem visual.** Cada mecânica nova vem com a sua arte, e os elementos que já existem também melhoram (19.16).

### 19.1 Como é hoje (base para a proposta)

- **Crescimento:** casas novas surgem quando a população passa da capacidade (RF-VIDA-109). Com mais de 26 pessoas, ou sem lote livre, o assentamento manda colonos com chance de 5% por ano, mais 25% por era (`COLONY_RATE`, RF-VIDA-110). A planta (ruas e lotes) é fixa por nível e só cresce quando o nível sobe (RF-VIDA-101 e 104).
- **Resultado medido** (Terra 1024×512, semente 42, 6 aldeias semeadas e 4 inteligentes soltos, 250 anos): **25 assentamentos, nenhum passou de vila**, a maior com 31 pessoas. O povo se espalha em muitas aldeias pequenas parecidas em vez de formar cidades completas.
- **Economia:** estoque único por reino (madeira, pedra, minérios, ouro, ferramentas, armas, RF-VIDA-124), comida por assentamento (caça, coleta, pesca, roças). Comércio anual abstrato entre reinos vizinhos (RF-VIDA-125). Não há pecuária, roupas, cerâmica, dinheiro local nem despesas.
- **Eras:** avançam por tempo, por condições de metal (bronze, ferro, pedra, carvão e aço; RF-VIDA-73) e, desde a Etapa H, por pontos de desenvolvimento em seis pilares (RF-VIDA-270): um povo com terra boa, cavalos e comércio chega antes de um que não tem nada disso.
- **Guerra:** nasce de relação ruim ou ambição e termina em conquista ou paz (RF-VIDA-131 a 134). Não tem motivo econômico explícito.
- **Arquitetura:** as casas são refeitas no estilo da era assim que ela muda (RF-VIDA-111); ruas viram pedra na Era Medieval.

### 19.2 Defeito: ruas em grade e em escada

**O que o Joab viu:** ruas paralelas a 1 tile de distância, ligadas por pedaços perpendiculares, formando grade ou escada.

**Medição** (mesmo cenário de 19.1, 250 anos): **93 blocos 2×2 inteiramente de rua fora das praças**. Pela origem do tile: 54 vêm das ruas internas (`layStreets`), 31 das estradas entre assentamentos (`connect`) e 8 das estradas de porto e de mina (`lineRoad`).

**Causas encontradas no código** (`src/sim/settlement.ts` e `src/sim/ecosystem.ts`):

1. **Cada estrada é desenhada sozinha, sem olhar as que já existem.** `lineRoad` traça uma curva do centro do assentamento até o destino e pinta os tiles por cima de tudo. A estrada do porto corre colada, lado a lado, com uma rua que já ia na mesma direção; estradas de várias aldeias até a mesma capital chegam paralelas. É a principal origem da "grade".
2. **Passo diagonal vira degrau.** `walk` (ruas) e `lineRoad` (estradas) põem um tile de canto a cada passo diagonal. Uma rua a 45° vira uma escada; duas escadas próximas formam blocos 2×2.
3. **Ruas laterais nascem coladas na principal.** O primeiro passo da rua lateral sai de um tile da principal, num ângulo de 63° a 109° que, com o serpentear, faz o começo correr ao lado dela. Laterais de braços vizinhos também se cruzam e se encostam.
4. **A mesma ligação pode gerar duas estradas.** A curva de `lineRoad` desvia para o lado que depende da ordem dos pontos (A→B ou B→A): ligar o mesmo par duas vezes, em ordens diferentes, cria duas estradas lado a lado.
5. **Estrada interrompida por casa.** `setRoad` não pinta sobre casa; a estrada fica com um buraco e o desenho parece um desvio.

| ID | Requisito | Situação |
|---|---|---|
| RF-VIDA-190 | **Rede viária única.** As ruas e estradas de um assentamento e do reino formam uma rede (grafo de tiles). Toda estrada nova (entre assentamentos, até o porto, até a mina) é traçada por busca de caminho (A*) que: anda barato sobre rua existente; paga caro para ficar **ao lado** de uma rua sem estar nela; não passa por água nem por casa; prefere terreno plano. Ela sai do ponto da rede mais perto do destino, não do centro da praça. | Implementado (Fase 0): busca A* com os custos de `balance.ts`, seguindo a curva de antes como guia |
| RF-VIDA-190b | **Estradas só onde há movimento** (pedido do Joab, 20/10/2026: as estradas que uniam reinos ficavam grosseiras, desnecessárias e enfeavam o mapa). Estrada entre assentamentos só existe dentro do mesmo reino, até `ROAD_LINK_RANGE` (40 tiles), quando os dois já têm `ROAD_LINK_POP` (15) moradores; cada um se liga uma vez ao vizinho mais perto. Colonos não abrem estrada ao fundar, e alianças, uniões e vassalagem não traçam estrada entre capitais. Estradas até a mina e até o porto continuam. (Antes: toda colônia, união de reinos e vassalagem traçava na hora uma estrada até a origem, de qualquer distância.) Também corrigido: o porto podia sair longe da cidade, com uma estrada atravessando o mapa, por causa do raio fracionário da área. | Implementado (Fase 0) |
| RF-VIDA-191 | **Sem rua dupla.** Fora da praça, nenhum bloco 2×2 é todo de rua, e duas ruas diferentes não correm lado a lado por mais de 2 tiles. A exceção é a avenida da cidade (RF-VIDA-253), que é larga de propósito e marcada como tal. | Implementado (Fase 0): planta e mundo sem blocos 2x2 (teste em `roads.test.ts`); a avenida (Etapa D) é marcada com tipo próprio e fica fora da contagem |
| RF-VIDA-192 | **Diagonal limpa.** Num trecho diagonal, o tile de canto fica sempre do mesmo lado do trecho inteiro (degrau regular, não zigue-zague), e cada tile de rua tem no máximo 2 vizinhos de rua, salvo cruzamentos. A arte (RNF-VIDA-07) desenha o degrau como uma curva suave. | Parcial: degrau sempre do mesmo lado; falta a arte desenhar o degrau como curva |
| RF-VIDA-193 | **Ruas laterais espaçadas.** Uma lateral começa perpendicular à principal e só é aceita se ficar a pelo menos `STREET_GAP` tiles (3: um lote de 2 e uma folga) de qualquer outra rua que não seja a de origem; se não couber, ela é encurtada ou descartada. | Implementado (Fase 0): laterais saem perpendiculares e param a 3 tiles de outra rua |
| RF-VIDA-194 | **Mesma ligação, mesma estrada.** Ligar A e B dá sempre o mesmo traçado, em qualquer ordem, e não refaz a estrada se a rede já liga os dois. | Implementado (Fase 0) |
| RF-VIDA-195 | **Limpeza da rede.** Ao subir de nível, mudar de era ou fundar sobre ruínas, um passo de limpeza remove tiles de rua redundantes (que formam bloco 2×2 e cuja retirada não desliga nada) e emenda buracos deixados por casas. | Parcial: limpeza dos blocos 2x2 ao traçar ruas e estradas; falta emendar ruas cortadas por casas antigas |
| RF-VIDA-196 | **Teste que protege a rede:** em 250 anos na Terra (sementes 42 e 7), zero blocos 2×2 de rua fora das praças, todo assentamento do reino ligado à capital quando há caminho por terra, e todo lote de casa encostado numa rua. | Implementado (Fase 0): sementes 42 e 7, 200 anos, zero blocos e nenhuma casa longe de rua |

### 19.3 Crescimento controlado: estrutura de referência e reformas

Cada assentamento passa a ter uma **estrutura de referência** por nível: a lista do que um assentamento daquele tamanho "deveria ter". Ele cresce na ordem **preencher → reformar → adensar → expandir**.

| Nível | Estrutura de referência (sugestão inicial) |
|---|---|
| Aldeia | Praça com fogueira; cabanas para todos; uma roça ou área de caça/pesca; depósito de comida simples; trilha até a água. |
| Vila | Praça com poço; celeiro; casas de madeira; roças ou pastos conforme a vocação (RF-VIDA-220); oficina básica (oleiro ou carpinteiro); ruas principais completas; estrada até o reino. |
| Cidade | Mercado; templo; ferraria; prédio da vocação (curral, haras, cais, serraria ou mina); ruas principais calçadas (cascalho ou pedra conforme a era); paliçada ou muralha conforme a era; quartel se o povo for guerreiro. |
| Metrópole | Avenida; fortaleza ou castelo (capital); dois mercados ou feira; edifícios de produção da era (moinho, tecelagem, fábrica); muralha com portões; monumento. |

| ID | Requisito | Situação |
|---|---|---|
| RF-VIDA-200 | **Estrutura de referência** por nível (tabela acima), ajustada pela vocação (19.5) e pela era (19.8). É dados, não código espalhado: uma tabela que lista, por nível, os itens com quantidade mínima. | Implementado (Fase 0): `src/sim/plan.ts`; só entra o que já dá para fazer na era; vocação e defesa entram nas Etapas C e D |
| RF-VIDA-201 | **Completude:** cada assentamento calcula de 0 a 100% o quanto tem da estrutura do seu nível. O painel mostra "Planta: 70%, falta celeiro e poço". | Implementado (Fase 0): painel mostra "Planta 71% · falta roças para as casas e celeiro" |
| RF-VIDA-202 | **Ordem de crescimento:** (1) **preencher** os lotes livres dentro da área; (2) **reformar** o que existe (RF-VIDA-203) e construir o que falta da estrutura; (3) **adensar** (casas maiores, sobrados, mais gente por casa) quando os lotes acabam; (4) **expandir**: subir de nível, crescer a área e mandar colonos. Cada passo só domina quando o anterior está satisfeito, mas nenhum é proibido. | Implementado (Fase 0) |
| RF-VIDA-203 | **Reformas internas:** casa que melhora de padrão (palha → madeira → pedra → tijolo), rua de terra que vira cascalho e depois pedra, praça que ganha poço e depois fonte, prédio velho que é refeito. Cada reforma custa material e trabalho de construtores, leva tempo e aparece no mapa como obra (andaime) enquanto dura. | Parcial: casas ganham andar (sobrado) com andaime durante a obra, e construções novas também mostram andaime; calçamento gradual e poço que vira fonte entram na Etapa D |
| RF-VIDA-204 | **Expansão mais lenta, não proibida.** A chance anual de mandar colonos passa a ser `COLONY_RATE × f(completude) × pressão`, onde `f` é baixo com a planta incompleta (`COLONY_MIN_FACTOR`, 0,2) e 1 com ela completa, e a pressão sobe com lotação, fome ou falta de um recurso que só existe fora (terra fértil, pasto, jazida, porto). Uma aldeia apertada numa ilha ainda manda colonos. (Antes: 5% por ano com mais de 26 pessoas, RF-VIDA-110, que continua valendo até a Etapa B.) | Implementado (Fase 0): `COLONY_MIN_FACTOR`, `COLONY_MIN_POP` (40) e `COLONY_PRESSURE_*`. Mais lenta ainda (v1.2.2, pedido do Joab): só manda colonos quem já esgotou lotes, reformas e ruas (lotado), de vila em diante (`COLONY_MIN_TIER`), a `COLONY_RATE` 0,03 (antes: 0,05, mesmo com espaço e a partir de 40 moradores); o povo evolui o assentamento inicial primeiro. Rotas comerciais e navios de colonos continuam fundando lugares novos, raramente |
| RF-VIDA-205 | **Subir de nível exige planta.** Além da população (RF-VIDA-90), subir exige completude mínima do nível atual (`TIER_UP_COMPLETENESS`, 70%). Sem ela, o assentamento fica "vila cheia" e adensa. | Implementado (Fase 0) |
| RF-VIDA-206 | **Área que cresce aos poucos.** O raio cresce com a população dentro do intervalo do nível (por exemplo, a vila vai de 12 a 15 tiles antes de virar cidade com 18), em vez de saltar só na troca de nível. Os limites de RF-VIDA-94 a 96 continuam valendo. | Implementado (Fase 0): o raio cresce junto com as ruas sob demanda, sem engolir vizinhos |
| RF-VIDA-207 | **Ruas sob demanda, bloco a bloco** (pedido do Joab, 20/10/2026). A planta de ruas do nível é calculada inteira, mas só é aberta aos poucos: a aldeia nasce com `STREET_START` (10) tiles de rua em volta da praça e, quando faltam lotes para casa ou para a planta, abre mais um trecho de `STREET_BLOCK` (6) tiles, andando pelas próprias ruas a partir da praça (`STREET_BLOCK_RATE`, 3 trechos por ano no máximo). Subir de nível não abre ruas: só aumenta a planta disponível. Com a planta toda aberta, ela cresce rumo ao nível seguinte (RF-VIDA-206). (Antes: a planta inteira do nível era aberta de uma vez, ao fundar e a cada nível.) | Implementado (Fase 0) |
| RF-VIDA-208 | **Parametrização central.** Todas as constantes desta seção (19.12) ficam num módulo só (`src/sim/balance.ts`), com nome, comentário em português e valor inicial; os testes usam os mesmos nomes. Futuro: uma janela de ajustes para testes locais. | Parcial: `src/sim/balance.ts` com as constantes das Etapas S, A e B; as próximas etapas acrescentam as suas |

### 19.4 Recursos essenciais, profissões e economia local

Todo assentamento precisa de um conjunto de **necessidades essenciais**. Cada uma tem produção, consumo e estoque; a falta de uma delas freia o crescimento e a estabilidade.

| Necessidade | De onde vem | Era em que entra |
|---|---|---|
| Comida | Coleta, caça, pesca (já existem); grão das roças; carne e leite dos rebanhos; pão (moinho e padaria) | Pedra; rebanhos no Bronze; pão no Ferro |
| Água | Rio, lago ou costa; poço; aqueduto ou cisterna em cidade grande | Pedra; poço no Bronze |
| Combustível | Lenha (já existe); carvão | Pedra; carvão na Era Medieval |
| Material de construção | Madeira e pedra (já existem); barro e tijolo (olaria) | Pedra; tijolo no Bronze |
| Roupa | Peles da caça; lã (ovelhas), couro (gado), linho (roça) | Pedra; tecelagem no Bronze |
| Ferramentas | Ferraria e artesãos (já existem, RF-VIDA-124c e 128b) | Pedra |

| ID | Requisito | Situação |
|---|---|---|
| RF-VIDA-210 | **Necessidades essenciais** por assentamento (tabela acima), com um índice de atendimento de 0 a 100% por necessidade. Atendimento baixo reduz a natalidade dos inteligentes, a velocidade das obras e a estabilidade (RF-VIDA-136). | Implementado (Etapa C): índice de 0 a 100% de comida, água, lenha, moradia, roupa e ferramentas; atendimento baixo freia a natalidade, as obras e a estabilidade |
| RF-VIDA-211 | **Cadeias de produção curtas e visíveis:** roça → grão → moinho → pão; ovelha → lã → tecelão → roupa; gado → couro e leite, e tração que dobra a área que um agricultor cuida (arado); barro → oleiro → tijolo e telha; árvore → lenhador → madeira (existente); jazida → mina → ferraria (existente). No máximo dois elos por cadeia. | Implementado (Etapa C): roça → moinho (pão, +30% com moleiro); ovelha → lã → tear → roupa; gado e cabra → leite, carne e couro, boi e cavalo no arado dobram a área do agricultor; barro → oleiro → tijolo (serve no lugar da pedra); árvore → lenhador; jazida → mina → ferraria |
| RF-VIDA-212 | **Estoque próprio de cada assentamento, nada compartilhado** (decisão do Joab, 20/10/2026). Cada assentamento guarda só o que é seu: comida, água armazenada, lenha, madeira, pedra, barro e tijolo, minérios, metal, ferramentas, armas, roupa, animais e ouro. Um bem só sai de um assentamento para outro carregado: caravana, barco, colonos levando o enxoval, exército levando suprimentos, saque ou tributo. A falta num lugar e a sobra no outro são o que faz o comércio acontecer (19.6). (Antes: estoque único do reino guardado na capital, RF-VIDA-124, que continua valendo até a Etapa C; o PR da Etapa C registra a remoção no [Registro de remoções](REQUISITOS.md#13-registro-de-remoções).) | Implementado (Etapa C): estoque em cada assentamento; bens só mudam de lugar carregados (carroças dentro do reino, enxoval dos colonos, saque, comércio entre reinos pelo assentamento que tem sobra). Remoção do estoque do reino registrada |
| RF-VIDA-218 | **Teto de estoque por recurso.** Cada recurso tem um teto que faz sentido para o tamanho e as construções do assentamento: uma base por nível mais o que cada construção guarda (celeiro guarda comida, armazém guarda materiais, depósito da mina guarda minério, curral e pasto limitam os animais pela área de pasto, tesouro limita o ouro). Valores iniciais na 19.12. Chegando ao teto, a produção daquele recurso para, os trabalhadores mudam de setor (RF-VIDA-214) e o excedente vira oferta para o comércio. | Implementado (Etapa C): tetos da 19.12 (`STORE_BASE`, celeiro, armazém, mercado como tesouro, depósito de cada mina); o que passa do teto se perde. Rebanho limitado pelo pasto |
| RF-VIDA-219 | **Consumo obrigatório.** O que está estocado precisa ser consumido: cada morador come, gasta lenha (mais no frio) e gasta roupa todo ano; ferramentas e armas se desgastam (RF-VIDA-124c); prédios consomem madeira e pedra de manutenção; animais comem pasto ou grão. Sem o consumo, a necessidade não é atendida (RF-VIDA-210). | Implementado (Etapa C): lenha (dobro no frio, mais no inverno), roupa (ou peles), comida dos moradores, grão para o rebanho no inverno, ferramentas que se gastam |
| RF-VIDA-219a | **Perecimento:** comida estraga (grão devagar no celeiro, carne e peixe depressa, mais devagar com sal), madeira apodrece aos poucos, ferramentas enferrujam; ouro, pedra e metal não estragam. Taxas na 19.12. | Implementado (Etapa C): comida 8% ao ano com celeiro e 45% sem, madeira 3%, ferramentas 2%; Etapa E: com sal no estoque, a comida sem celeiro perde 20% em vez de 45% (gastando um pouco de sal) |
| RF-VIDA-219b | **Freio contra o "boom":** a produção por trabalhador cai à medida que o estoque se aproxima do teto (retorno decrescente, como a natalidade logística, RF-VIDA-37), o preço de um bem cai quando sobra em toda a região, e ouro em excesso perde valor (inflação leve). Teste: em 250 anos, nenhum estoque cresce sem parar, e o preenchimento médio dos estoques fica entre 30% e 80%. | Implementado (Etapa C): retorno decrescente `1 − preenchimento²`, inflação leve do ouro acima de 80% do teto, nenhum recurso acima do teto em 250 anos (teste); Etapa E: preço local pela escassez em cada assentamento (RF-VIDA-231) |
| RF-VIDA-213 | **Profissões novas ligadas à economia:** pastor (ovelha, gado, cabra), tratador de cavalos, tecelão, oleiro, moleiro, comerciante e sacerdote (RF-VIDA-179), cada uma com aparência própria. O pescador já existe. | Implementado (Etapa C): pastor, tratador de cavalos, tecelão, oleiro, moleiro, comerciante e sacerdote, cada um com aparência própria |
| RF-VIDA-214 | **Divisão do trabalho pela falta.** Todo ano o assentamento redistribui uma parte dos adultos (`LABOR_SHIFT`, 15%) para o setor com o pior atendimento, com peso extra para a vocação (RF-VIDA-221). Hoje a profissão é sorteada ao nascer e não muda; passa a poder mudar. | Implementado (Etapa C): 15% dos adultos por ano no máximo, nunca mais de 35% numa profissão; ferreiros e mineradores não saem; com tudo atendido, um pouco vai para a vocação |
| RF-VIDA-215 | **Domesticação e rebanhos** (detalha RF-VIDA-123): herbívoros da região (ovelha, gado, cabra, cavalo, camelo no deserto) podem ser domesticados a partir do fim da Idade da Pedra. Rebanhos aparecem como sprites pastando num pasto cercado perto da vila, guiados por pastores; pastam a vegetação, atraem predadores e podem pegar doença (RF-VIDA-182). | Implementado (Etapa C): ovelha, gado, cabra, cavalo ou camelo domesticados a partir do fim da Idade da Pedra (um bicho da região é capturado), cercados com os animais desenhados pastando, crescimento até o teto do pasto, predadores, praga que pula para os vizinhos e sobrepastoreio. Mapa limpo (pedido do Joab, v1.2.1): cercados de mais para o rebanho, ou sem rebanho, são desmontados aos poucos, a partir do mais longe; domesticar de novo reaproveita o cercado que restou; cercado fora da área fica colado na borda, longe da área dos vizinhos e mais perto do próprio centro (antes: o cercado ficava para sempre, mesmo sem rebanho, cada nova domesticação abria mais um e o de fora podia cair até 6 tiles além da borda, no meio dos vizinhos) |
| RF-VIDA-216 | **No mapa:** pasto cercado, curral, haras, olaria com fumaça, moinho, tear, cais de pesca. | Implementado (Etapa C): pasto cercado (no máximo 5 cercados por assentamento: 1 na aldeia a 5 na metrópole, +1 em vocação de rebanho; antes: 1 + 2 por nível), curral, haras, olaria com fumaça, tear, serraria e armazém (moinho e porto já existiam) |
| RF-VIDA-217 | **Painel de economia** do assentamento: produção e consumo por recurso, o que falta, o que sobra e a balança (19.9). | Parcial (Etapa C): o painel mostra necessidades, estabilidade, o que mais se fez e gastou no ano passado, o que sobra e a estação; as barras por recurso estão na aba Economia da janela do assentamento (Etapa I, RF-VIDA-344) |

### 19.5 Vocação do assentamento

Cada assentamento ganha uma **vocação**, sorteada com pesos tirados do lugar onde foi fundado e do povo. A vocação não proíbe nada; ela dá bônus, decide o prédio característico e puxa a divisão do trabalho.

| Vocação | Terreno que favorece | Prédio e visual | Efeito principal |
|---|---|---|---|
| Agrícola | Solo fértil, umidade, rio | Campos grandes, celeiro, moinho | Mais grão; cresce mais rápido |
| Gado | Campo aberto e úmido | Curral, pasto cercado com bois | Carne, leite, couro e tração |
| Ovelhas | Colina, clima frio ou temperado | Pasto em encosta, tecelagem | Lã e roupa; comércio de tecido |
| Cavalos (haras) | Planície aberta e seca, estepe | Haras com cercado grande | Cavalos para caravanas e cavalaria (RF-VIDA-223) |
| Pesqueira | Costa, lago grande | Cais, barcos, varais de peixe | Mais peixe; porto mais cedo |
| Mercantil | Cruzamento de estradas, porto, povo comerciante | Mercado grande, armazéns | Mais caravanas e ouro (19.6) |
| Mineira | Rocha, colina, jazida conhecida | Mina, ferraria, carrinhos | Mais minério e metal |
| Madeireira | Floresta densa | Serraria, pilhas de toras | Mais madeira; casas de madeira melhores |

| ID | Requisito | Situação |
|---|---|---|
| RF-VIDA-220 | **Vocação sorteada pelo lugar:** na fundação, cada vocação recebe um peso pelos tiles da área (fertilidade, pasto, relevo, temperatura, costa, floresta, jazidas, estradas) e pelo valor do povo (comércio pesa Mercantil, guerra pesa Cavalos); sorteio com esses pesos. Colônias têm uma leve tendência à vocação da origem (`VOCATION_INHERIT`, 25%). | Implementado (Etapa C): pesos pela amostra de tiles (fertilidade, campo aberto, colina, frio, seco, floresta, costa, jazidas, vizinhos) e pelo valor do povo; colônias herdam com 25% |
| RF-VIDA-221 | **Efeito da vocação:** +`VOCATION_BONUS` (40%) na produção da vocação; o prédio característico entra na estrutura de referência a partir de vila; a divisão do trabalho tem peso extra para ela. | Implementado (Etapa C): +40% no setor da vocação, prédio característico primeiro e na planta a partir de vila, peso extra na divisão do trabalho |
| RF-VIDA-222 | **Vocação que muda devagar:** quando a base acaba (mina esgotada, seca longa, rota de comércio perdida, rebanho dizimado), o assentamento pode trocar de vocação depois de `VOCATION_CHANGE_YEARS` (20) anos ruins. A crônica registra ("Orlu deixou as minas e passou a criar ovelhas"). | Implementado (Etapa C): 20 anos ruins (mina esgotada, colheita ruim ou solo cansado, rebanho perdido, sem porto, sem floresta, sem vizinhos) e a crônica registra a troca |
| RF-VIDA-223 | **Cavalos:** o haras cria cavalos (estoque de animais). Cavalos servem para (1) **cavalaria**, a partir do Bronze (carros de guerra) e com mais força no Ferro: soldado montado com força `CAVALRY_STRENGTH` (2,0, contra 1,2 do soldado a pé, RF-VIDA-132), um cavalo por soldado; (2) **caravanas** mais rápidas (+50%); (3) **arado e carroça**. Cavalos podem ser vendidos, o que torna o haras um alvo de cobiça (RF-VIDA-240). | Parcial (Etapa C): haras e cavalos no estoque (rebanho de cavalos ou camelos) e cavalo no arado; Etapa E: caravana com cavalo anda 50% mais rápido; Etapa F: cavalaria, com um cavalo do estoque do assentamento por soldado montado, força `CHARIOT_STRENGTH` no Bronze e `CAVALRY_STRENGTH` do Ferro em diante, e o cavalo morre com o soldado |
| RF-VIDA-224 | **Vocação visível:** ícone simples ao lado do nome no rótulo e também no painel do assentamento (decisão do Joab, 20/10/2026); camada "Vocação" na janela Mundo. | Implementado (Etapa C): ícone no rótulo e no painel; camada "Vocação" na janela Mundo |

### 19.6 Comércio vivo: caravanas, acordos e feiras

Antes da Etapa E, o comércio era só uma troca anual invisível (RF-VIDA-125). Com as caravanas, ela continua como reserva: só acontece entre dois reinos que não trocaram por caravana ou barco naquele ano.

| ID | Requisito | Situação |
|---|---|---|
| RF-VIDA-230 | **Caravanas visíveis:** um comerciante com animais de carga (burro ou cavalo; camelo no deserto) leva carga de um assentamento a outro pela estrada, no tempo real da viagem. Ao chegar, troca a carga e volta com outra. Pode ser atacada por predadores, bandidos (RF-VIDA-283) ou inimigos em guerra. | Implementado (Etapa E): o comerciante sai com burro (camelo no deserto, cavalo se houver no estoque), fardos no lombo na Idade da Pedra, carroça do Bronze ao Ferro e carroção depois; anda pela estrada no tempo da viagem, entrega, compra a carga da volta e retorna. Predadores e inimigos em guerra podem atacar; os bandidos vêm com a Etapa G (RF-VIDA-283) |
| RF-VIDA-231 | **Preço pela escassez:** cada assentamento dá valor a um bem pela falta que sente dele (atendimento da necessidade e estoque). O comerciante escolhe a rota com mais lucro dentro do alcance, preferindo parceiros com acordo. | Implementado (Etapa E): preço local = valor do bem × falta que ele faz (estoque vazio vale 2 vezes o normal, cheio 0,4), mais caro quando a necessidade ligada está mal atendida e o luxo mais caro para os ricos; a caravana vai para o destino com mais lucro dentro do alcance, descontado o custo da distância, com preferência por parceiro com acordo. O preço aparece na aba Economia |
| RF-VIDA-232 | **Acordos comerciais** entre assentamentos ou reinos: o que se troca, por quantos anos e com que frequência. Aparecem na janela Reinos. Cumprir melhora a relação; quebrar (guerra, falência) piora. | Implementado (Etapa E): depois de 2 viagens com troca dos dois lados e relação boa, os dois assentamentos firmam um acordo (o que cada um manda, a cada quantos anos, por 20 anos); aparece na janela Reinos e na aba Economia. Cada viagem do acordo melhora a relação; guerra rompe o acordo e piora a relação; acordo sem viagens caduca. A quebra por falência vem com a Etapa G |
| RF-VIDA-233 | **Estrada que evolui pelo uso:** cada passagem de caravana soma uso ao tile; estrada muito usada vira cascalho e depois pedra antes das outras. As rotas comerciais aparecem sozinhas no mapa. | Implementado (Etapa E): cada passagem soma uso ao tile; com uso suficiente nasce uma estrada de terra onde não havia, fora das cidades ela vira cascalho e, da Idade do Ferro em diante, pedra; dentro da cidade, rua muito usada ganha pedra antes das outras. O uso cai 10% ao ano sem movimento |
| RF-VIDA-234 | **Feira anual** nas cidades mercantis: atrai caravanas de longe, melhora relações e espalha técnicas (RF-VIDA-74). | Implementado (Etapa E): toda vila ou cidade mercantil com 20 moradores ou mais faz feira no verão (antes o requisito falava só em cidades; poucas cidades chegam a ser mercantis em 250 anos); barracas em volta da praça, caravanas vêm de 1,5 vez mais longe, cada chegada melhora mais a relação e passa o triplo de conhecimento |
| RF-VIDA-235 | **Barcos mercantes** entre portos que se conhecem (RF-VIDA-119), com os mesmos perigos do mar (RF-VIDA-116 a 118). | Implementado (Etapa E): quando não há caminho por terra, a caravana vai de barco mercante entre portos que se conhecem, com caixotes no convés e os mesmos perigos do mar (tempestade, deriva, predadores marinhos) |
| RF-VIDA-236 | **Moderação:** no máximo `CARAVANS_PER_SETTLEMENT` caravanas por assentamento (1 por nível, +1 se mercantil) e `CARAVANS_MAX` no mundo (24). | Implementado (Etapa E, reduzido na v1.2.2 a pedido do Joab, já que um ano passa em 6 s): 1 caravana por assentamento, 2 de cidade em diante (antes: 1 por nível), +1 se mercantil, saída a 0,3 por ano (antes: 0,8) e no máximo 10 no mundo (antes: 24), contando os barcos mercantes; rebanhos na transumância não entram na conta |

### 19.7 Guerras com motivo, sob medida

As regras de declaração, combate e paz (RF-VIDA-131 a 134) continuam. O que muda é que a guerra ganha **motivo**, e o motivo decide o objetivo e o fim.

| Motivo | Quando aparece | Objetivo | Fim |
|---|---|---|---|
| Bens (saque) | Vizinho rico num bem que falta muito (cavalos, ferro, grão na fome, ouro) | Atacar, levar parte do estoque, rebanhos ou cavalos e voltar | Curta; termina quando o saque volta para casa |
| Território | Terra fértil, pasto, jazida, porto ou estrada disputados na fronteira (RF-VIDA-98) | Conquistar o assentamento ou a área disputada | Conquista ou paz com cessão |
| Extermínio e posse | Muito raro e **só entre povos inteligentes**: relação ≤ −80 e interesse em conflito (a mesma terra, jazida, pasto ou rota), com o alvo fraco. Pode ser entre povos da mesma espécie, desde que sejam assentamentos ou reinos diferentes com interesses diferentes | Destruir o assentamento e ocupar a terra | Assentamento destruído; o vencedor funda por cima das ruínas (RF-VIDA-108) |
| Independência e guerra civil | Já existem (RF-VIDA-81, 137, 138) | — | — |

| ID | Requisito | Situação |
|---|---|---|
| RF-VIDA-240 | **Motivo de guerra** escolhido pelas condições acima, com objetivo e fim próprios. O saque não muda o dono do assentamento. | Implementado (Etapa F): saque de comida ou lenha (falta) e de cavalos, ferro ou ouro (cobiça, `COVET_WAR`), que acaba quando o bando volta com o saque; território, que acaba em conquista ou em paz com cessão; extermínio, que arrasa o lugar e funda outro nas ruínas; guerra civil. O motivo aparece no painel |
| RF-VIDA-241 | ~~**Moderação:** no máximo `WARS_MAX` guerras ao mesmo tempo no planeta; depois de uma guerra o reino fica `WAR_COOLDOWN` anos sem declarar outra.~~ **Substituído em 21/10/2026 a pedido do Joab (sem teto de guerras e sem trégua fixa de 25 anos), pelos RF-VIDA-245 a 253.** Continuam valendo o cansaço de guerra (sobe a chance de paz a cada ano e a cada morte), o extermínio raro (`EXTERMINATION_RATE`, 0,2% por ano por par elegível) e que **só povos inteligentes guerreiam**: animais da mesma espécie não entram em conflito, e entre espécies animais o que existe é a predação (seção 6). | Implementado: `PEACE_BASE`, `PEACE_PER_YEAR`, `PEACE_PER_DEATH`, `EXTERMINATION_RATE`; `WARS_PER_KINGDOMS` e `WAR_COOLDOWN` removidos. Muralhas não entram: saíram a pedido do Joab |
| RF-VIDA-242 | **Força e logística:** força = soldados × armas × (1 + cavalaria), mais muralhas na defesa (RF-VIDA-106). O exército leva comida do estoque; longe de casa ou sem comida, perde força e pode voltar. | Implementado (Etapa F): força com a parte montada; o exército come `ARMY_FOOD` por soldado por ano do celeiro de onde saiu; sem comida a força cai até `HUNGRY_ARMY`, longe de casa (`ARMY_REACH`) cai para `FAR_FROM_HOME`, e dois anos abaixo de `RETREAT_SUPPLY` ele volta. Sem muralhas (saíram a pedido do Joab) |
| RF-VIDA-243 | **Consequências visíveis:** estoque saqueado, roças queimadas, rebanhos roubados, casas destruídas (o "sem casas queimadas" de RF-VIDA-133), refugiados que fogem para vizinhos e rancor duradouro. | Implementado (Etapa F): saque de `LOOT_SHARE` do bem e `LOOT_HERD` do rebanho, `BURNED_FIELDS` roças queimadas, `RAZE_SHARE` das casas queimadas na conquista, `REFUGEE_SHARE` do povo foge para o vizinho mais perto fora do reino inimigo, rancor por `GRUDGE_YEARS` (`GRUDGE_PULL` por ano) |
| RF-VIDA-244 | **Crônica com motivo:** "Lutek atacou Votek para tomar os cavalos do haras"; "Os Tekvenses arrasaram Baka e fundaram Nova Lutek nas ruínas". | Implementado (Etapa F): toda declaração diz o motivo ("Badre atacou Nidre para tomar o ouro", "Guerra! Tadre atacou Ortek para tomar a jazida de ferro de Ortek", "Os Tekvenses arrasaram Baka e fundaram Nova Lutek nas ruínas") |
| RF-VIDA-245 | **Sem limite de guerras:** não há teto de guerras simultâneas no planeta nem tempo fixo de espera. Quantas guerras acontecem sai só da situação dos reinos. | Implementado (21/10/2026): `WARS_PER_KINGDOMS` e `WAR_COOLDOWN` removidos |
| RF-VIDA-246 | **Motivos variados:** além de saque, território, extermínio e guerra civil, há **domínio** (o forte quer vassalos ou o vizinho rico e fraco), **vingança** (rancor de guerra anterior guardado por reino, `REVENGE_WAR`, some com o tempo) e **fé** (crenças opostas, `FAITH_WAR`). Mais de um motivo pode valer ao mesmo tempo; vale o mais forte. Cada guerra registra o seu na crônica e no painel. | Implementado: `WarMotive` com 7 valores, `vengeance` por par de reinos |
| RF-VIDA-247 | **Trégua dinâmica:** depois de uma guerra a trégua vale no mínimo `TRUCE_MIN` anos (3) e só acaba quando o reino volta a querer a guerra e junta o que precisa (RF-VIDA-248). A paz também pede relação melhor que `PEACE_REL`. Não há prazo fixo. | Implementado: `TRUCE_MIN`, `PEACE_REL` |
| RF-VIDA-248 | **Preparo da guerra:** quem tem motivo não ataca na hora: abre um **plano de guerra** e passa a juntar **comida** (`PREP_FOOD_YEARS` anos do exército), **armas** (uma por soldado), **armadura** (`PREP_ARMOR` por soldado) e **ouro** (`PREP_GOLD` por soldado, para mercenários e soldo). Os ofícios acompanham (mais ferreiros, caçadores e lavradores) e a economia fica em modo de guerra. O reino só declara com `READY_LEVEL` (75%) do que precisa, e no máximo `PREP_MAX_YEARS` anos depois desiste do plano. | Implementado: `plans`, `readiness`, `makePlan`, `updatePlans`; `needed()` e `roleContext()` tratam o preparo como guerra |
| RF-VIDA-249 | **Vantagem percebida:** o reino só ataca se **achar** que leva vantagem sobre o alvo (`ADVANTAGE`, ×1,25 de força; `ADVANTAGE_RAID` ×0,9 no saque; `ADVANTAGE_EXTERMINATION` ×2). A estimativa da força do inimigo erra até `BELIEF_NOISE` (20%) e fica fixa no plano, então ele pode estar enganado e perder. | Implementado: `wantedAdvantage`, `belief` no plano |
| RF-VIDA-250 | **Só o atacante precisa estar pronto:** o alvo pode ser pego de surpresa, sem preparo nenhum; a defesa conta o que ele tem no dia. Quem é atacado e tem aliados os chama como antes. | Implementado |
| RF-VIDA-251 | **Temperamento do reino:** cada reino tem um grau de agressividade (`temper`, de −1 a +1) que sobe ou desce com a história e **volta ao normal aos poucos** (`TEMPER_FADE`). Mais belicoso: ganha motivos com mais facilidade e se dá por pronto com menos (`TEMPER_READY`), aceita menos vantagem (`TEMPER_ADVANTAGE`). Mais pacato: o contrário. | Implementado: `temperOf`, `addTemper` |
| RF-VIDA-252 | **Influência do jogador sobre os povos** (aba Civilização, grupo "Influenciar os povos"): **Provocar** (clica num reino e depois em outro: relação cai `PLAYER_TENSION`, a trégua acaba), **Amenizar** (relação sobe `PLAYER_TENSION`, a trégua vale mais `TRUCE_MIN` anos e os planos de guerra entre os dois caem), **Declarar guerra** (o primeiro clique é o atacante e o segundo o alvo; a guerra começa já, sem preparo; falha se algum já está em guerra), **Inflamar** e **Acalmar** (um clique num reino: temperamento sobe ou desce `TEMPER_STEP`). Tudo vai para a crônica como ação do jogador. O reino ainda precisa de preparo para guerrear sozinho; só "Declarar guerra" pula o preparo. | Implementado: `provoke`, `soothe`, `incite`, `sway` e as 5 ferramentas em `SurfaceMode` |
| RF-VIDA-253 | **Animação da influência**, no estilo da chuva e da temperatura do pincel: ao clicar, uma rajada de partículas sai dos assentamentos escolhidos. Provocar, Declarar guerra e Inflamar: brasas vermelhas subindo e brilho vermelho (`rage`). Amenizar e Acalmar: gotas claras caindo e brilho azul-água (`calm`). O simulador também solta espadas ou corações sobre os assentamentos. Quando só o primeiro reino foi escolhido, a dica pede o segundo clique. | Implementado: `FxKind` `rage` e `calm`, `burst` |

### 19.8 Arquitetura e ruas que acompanham a era

| Era | Casas | Ruas | Praça e defesa |
|---|---|---|---|
| Idade da Pedra | Cabana de palha e barro | Trilha de terra | Fogueira; nada de muralha |
| Idade do Bronze | Madeira e taipa, telha de barro | Terra batida com valeta | Poço; cerca de estacas na aldeia guerreira |
| Idade do Ferro | Pedra e madeira | Cascalho nas principais | Paliçada de madeira |
| Era Medieval | Pedra e enxaimel, sobrados | Pedra nas principais, terra nas laterais | Muralha de pedra com portões, castelo na capital |
| Era Industrial | Tijolo, prédios de 2 e 3 andares | Calçamento com calçada e lampiões, avenida | Fábricas com chaminé, estação |

| ID | Requisito | Situação |
|---|---|---|
| RF-VIDA-250 | **Estilo por era** conforme a tabela, para casas, ruas, praça e defesa. As casas de hoje (RF-VIDA-111) já mudam por era; esta tabela completa ruas, praça, defesa e material. | Implementado (Etapa D): casas pelo estilo da era em que foram feitas; ruas como trilha (Pedra), terra batida (Bronze), cascalho nas principais (Ferro), pedra nas principais e terra nas vielas (Medieval) e tudo calçado com lampiões (Industrial) (antes: todas as ruas viravam pedra na Era Medieval); praça com fogueira, poço ou fortaleza com bandeira; as cercas, estacas, paliçadas e muralhas foram removidas na v1.2.2 (pedido do Joab: não têm função no jogo e poluem o mapa; ver o registro de remoções em REQUISITOS.md, seção 13). Fábricas e estação ficam para a Etapa H |
| RF-VIDA-251 | **Transição gradual:** ao mudar de era, as casas são reformadas uma a uma (RF-VIDA-203), com custo e construtores, e não todas de uma vez. Por um tempo a cidade mistura estilos (centro velho, periferia nova ou o contrário). O resultado final é o mesmo de RF-VIDA-111. | Implementado (Etapa D): cada casa guarda a era do seu estilo; na era nova as casas são reformadas uma a uma, do centro para fora, com custo e mais depressa com mais construtores (`RESTYLE_RATE`); as novas já saem no estilo novo, então a cidade mistura estilos por um tempo |
| RF-VIDA-252 | **Material da região:** a casa usa o que há perto. Pedra onde há rocha, madeira na floresta, tijolo perto de rio com barro, adobe no deserto, telhado de neve no frio. Dois assentamentos da mesma era podem ter cores diferentes. | Implementado (Etapa D): material pelo entorno, sem sorteio: telhado de neve no frio, adobe no deserto, pedra perto de rocha e montanha, madeira na mata fechada, tijolo perto de rio ou costa; o resto fica com o material comum de antes. Aparece na janela do assentamento |
| RF-VIDA-253 | **Hierarquia de ruas:** avenida (cidade em diante, a única rua que pode ter 2 tiles de largura), ruas principais e vielas. O calçamento melhora por era, por uso (RF-VIDA-233) e pela riqueza. | Implementado (Etapa D): ruas principais são o tronco da rede a partir da praça (por onde passa ao menos `MAIN_STREET_SHARE` das ruas), o resto são vielas; cidades ganham avenida de 2 tiles no trecho reto mais longo de rua principal (`AVENUE_MIN`), a única rua larga, fora da contagem de blocos 2x2; calçamento por era e uma era antes no assentamento rico. Etapa E: rua muito usada pelas caravanas ganha pedra antes das outras (RF-VIDA-233) |
| RF-VIDA-254 | **Riqueza e decadência à vista:** assentamento rico tem casas melhores e mais enfeites; assentamento em crise (19.9) tem casas descuidadas e algumas abandonadas. | Implementado (Etapa D): assentamento próspero reforma mais depressa (`RICH_REFORM`) e tem canteiros de flores; em crise, casas da borda ficam vazias, com tábuas nas janelas, sem abrigar ninguém (até um terço), e voltam a ser ocupadas na melhora |

### 19.9 Caixa, falência e crise

| ID | Requisito | Situação |
|---|---|---|
| RF-VIDA-260 | **Caixa do assentamento** em ouro, no estoque próprio (RF-VIDA-212). Receitas: mercado, feira, acordos, imposto dos moradores. Despesas: manutenção dos prédios (`UPKEEP`, por tipo), soldo dos soldados e guardas, obras. O tributo à capital (`KINGDOM_TAX`, 20% da sobra) e o de vassalos viajam de verdade, numa caravana de tributo que pode ser assaltada. (Antes nesta proposta: a sobra ia direto ao reino.) | A fazer (Etapa G) |
| RF-VIDA-261 | **Falência de negócios:** mercado, oficina, haras, mina ou porto que fica `BANKRUPT_YEARS` (8) anos sem insumo ou sem comprador fecha. Os trabalhadores mudam de profissão, emigram ou viram bandidos (RF-VIDA-283). O prédio fica vazio e pode ser reaberto. | A fazer (Etapa G) |
| RF-VIDA-262 | **Crise da cidade:** caixa negativa por `CRISIS_YEARS` (5) anos seguidos. Efeitos: obras param, soldados desertam (a força cai), estabilidade cai, gente emigra, casas ficam abandonadas, o nível pode cair (RF-VIDA-174) e pode haver revolta (RF-VIDA-137). Saídas: a capital socorre mandando uma caravana com bens do estoque dela, um vizinho rico compra a dívida e o assentamento vira vassalo, ou a cidade se recupera sozinha. | A fazer (Etapa G) |
| RF-VIDA-263 | **Recuperação:** a crise termina com `CRISIS_YEARS` anos de caixa positiva. A crônica registra a queda e a volta ("Votek quebrou depois que a mina de ferro se esgotou"; "Votek se reergueu com o comércio de lã"). | A fazer (Etapa G) |
| RF-VIDA-264 | **Só com causa real:** falência e crise vêm de uma causa visível (jazida esgotada sem outra, rota perdida, guerra longa, seca, peste), nunca de sorteio puro. | A fazer (Etapa G) |

### 19.10 Eras por desenvolvimento (proposta nova)

**Problema:** hoje a era depende só de tempo e de metal. Um povo pode ter terra boa, cavalos e comércio e avançar igual a um que não tem nada, e um recurso valioso parado não faz diferença nenhuma.

**Proposta:** a era passa a depender de **marcos obrigatórios** (as condições de metal de hoje, preservadas) **mais pontos de desenvolvimento** ganhos em seis pilares. Cada assentamento avança pelo que faz de verdade.

| Pilar | Rende pontos quando o assentamento... |
|---|---|
| Sustento | Tem comida sobrando, rebanhos, roças trabalhadas, necessidades atendidas |
| Técnica | Minera, funde e forja (as condições de hoje entram aqui) |
| Construção | Completa a estrutura de referência e faz reformas |
| Comércio | Mantém acordos, caravanas, feira e porto ativos |
| Cultura | Tem templo, monumentos, festas e crenças vivas |
| Organização | Tem população, nível, estradas e reino estável |

| ID | Requisito | Situação |
|---|---|---|
| RF-VIDA-270 | **Evolução orgânica pelo trabalho e pelos materiais (reformulado em 24/10/2026):** os seis pilares (Sustento, Técnica, Construção, Comércio, Cultura e Organização) medem o desenvolvimento real do assentamento e aceleram o aprendizado (`devSpeed`), mas não travam o avanço numa barreira artificial de pontos. O progresso (`v.tech`, calculado por `organicTech`) acompanha o que o povo realmente descobriu, construiu e forjou, respeitando a sequência física dos materiais: primeiro ferramentas de pedra e madeira lascada, depois **cerâmica** (fornos) para permitir a **fundição** de metais macios (cobre, estanho ou bronze, aceitando cobre puro ou estanho quando o outro não existe por perto), depois ferraria e experiência em bronze para abrir minas de ferro e dominar a **siderurgia**, e por fim ferro, carvão e alvenaria para o **aço** e o **vapor**. | Implementado (reformulado em 24/10/2026) |
| RF-VIDA-271 | **Técnicas aprendidas por experimentação individual e ensino gradual (reformulado em 24/10/2026):** 17 técnicas encadeadas (`ceramica`, `domesticacao`, `tecelagem`, `fundicao`, `roda`, `arado`, `montaria`, `irrigacao`, `moinho`, `siderurgia`, `escrita`, `moeda`, `cavalaria`, `moinhoagua`, `aco`, `imprensa` e `vapor`). O aprendizado não é instantâneo nem coletivo de cara: moradores adultos que trabalham no ofício ligado à técnica (`t.roles`) e têm o recurso disponível experimentam conforme sua curiosidade individual (`curiosityOf(uid)`). Quando um morador descobre uma técnica (`TECH_DISCOVER_RATE`), ela fica em `v.pendingTech` enquanto ele ensina aos poucos para a aldeia (`TECH_TEACH_VILLAGE_RATE`); se esse morador morrer antes de concluir o ensino, a descoberta se perde e a crônica registra a perda (com o ensino adiantado, um aprendiz guarda parte: ver RF-VIDA-419). Além da descoberta própria, as técnicas se espalham por vizinhos do reino, acordos comerciais, caravanas e feiras. | Implementado (reformulado em 24/10/2026) |
| RF-VIDA-272 | **Recurso latente:** um recurso pode existir e até ser conhecido sem ser usado, porque falta a técnica na sequência física (cavalos e gado antes da domesticação, barro antes da cerâmica, cobre/estanho antes da fundição, ferro antes de dominar a fundição, carvão antes da siderurgia). O painel mostra "Sem uso ainda" e "Próximo passo", e o assentamento só abre mina de ferro depois da fundição e de carvão depois da siderurgia. | Implementado (reformulado em 24/10/2026) |
| RF-VIDA-273 | **Recompensa pela especialização:** a vocação rende o dobro de pontos no pilar ligado a ela (Agrícola e gado em Sustento, Mineira em Técnica, Mercantil em Comércio...). Assentamentos do mesmo reino podem estar em eras diferentes; a capital puxa os outros com atraso (RF-VIDA-74). | Implementado (Etapa H): a vocação rende o dobro de pontos no pilar dela (agrícola, gado, ovelhas e pesqueira em Sustento; mineira em Técnica; mercantil em Comércio; madeireira em Construção; cavalos em Organização); o painel marca o pilar com ×2. Assentamentos do mesmo reino aprendem técnicas da capital e dos vizinhos com atraso |
| RF-VIDA-274 | **Todo avanço aparece:** cada técnica e cada era nova trazem pelo menos uma mudança no mapa (prédio, rua, sprite, rebanho, barco) e uma linha na crônica. | Parcial (Etapa H): toda técnica e toda era nova vão para a crônica (a primeira do mundo com destaque) e a maioria muda o mapa (olaria, tear, moinho, haras, fábrica, rebanhos, carroças); roda, irrigação, escrita, imprensa e moeda mudam números, sem sprite novo, e a cavalaria espera a Etapa F |
| RF-VIDA-275 | **Decadência rara:** um assentamento que sofre colapso (extermínio quase total, crise longa, peste) pode esquecer uma técnica que ninguém mais usa. A era nunca volta, só as técnicas. Chance baixa (`DECAY_RATE`). | Implementado (Etapa H): assentamento que perdeu mais de 60% da população do pico (a partir de 20 moradores) ou com estabilidade abaixo de 12% esquece, com `DECAY_RATE` (1% por ano), uma técnica de que nenhuma outra conhecida depende; a crônica registra e a era nunca volta |
| RF-VIDA-419 | **O sábio aparece e sua perda pesa (27/10/2026):** a ficha de quem descobriu uma técnica mostra "📜 Ensinando *técnica*" com a barra do ensino. Se ele morre ou deixa a aldeia antes de terminar, a aldeia perde `TECH_LOSS_STABILITY` (0,05) de estabilidade; com o ensino já em `TECH_RESCUE_MIN` (60%) ou mais, o aprendiz mais curioso do ofício (sem sorteio: maior `curiosityOf` entre quem trabalha num dos `t.roles`, ou entre os outros adultos se não houver ninguém do ofício) guarda parte do que aprendeu e continua ensinando a partir de `TECH_RESCUE_KEEP` (30%). A crônica registra a perda ou o resgate. Os limites são padrão proposto, ajustáveis. Indicador sobre o NPC no mapa ficou para depois. | Implementado |
| RF-VIDA-420 | **Jeito para o ofício (27/10/2026):** cada pessoa tem um jeito determinístico para cada profissão (`aptitudeOf(uid, role)`, sem gastar sorteios). Na divisão do trabalho (RF-VIDA-214), quem tem mais jeito para o ofício que falta muda primeiro. A ficha mostra o ofício de mais jeito e marca as mentes curiosas (`curiosityOf` ≥ 1,4). Uma regra para quem tem muito jeito não largar o ofício foi testada e deixada de fora: as aldeias perdiam flexibilidade e passavam fome (o teste de arquitetura falhou em 2 de 5 sementes). | Implementado |
| RF-VIDA-421 | **Amostras pelas caravanas (27/10/2026):** a caravana de comércio que chega com tijolo, pano, cobre, estanho, ferro, ferramentas, armas ou armaduras feitos por quem já domina a técnica (`sampleTechs`) inspira os trabalhadores do destino: por `TECH_SAMPLE_YEARS` (10) anos, a descoberta dessa técnica por experimentação fica `TECH_SAMPLE_BOOST` (2,5) vezes mais provável. Só vale para a técnica cujos pré-requisitos o destino já tem; ainda é preciso um morador descobrir e ensinar (RF-VIDA-271). A janela do assentamento lista as amostras em "Amostras", e a crônica registra a primeira. | Implementado |

### 19.11 Ideias complementares

**Aprovadas pelo Joab em 20/10/2026: todas entram.** A coluna Etapa diz onde cada uma é feita (19.13). A segunda tabela traz ideias novas, ainda a decidir.

| ID | Ideia | Encaixa em | Etapa |
|---|---|---|---|
| RF-VIDA-280 | (Implementado na Etapa C: estabilidade de cada assentamento pelas necessidades, templo, guerra, distância e cultura da capital; instável e longe da capital pode se revoltar.) **Estabilidade ligada às necessidades:** fome, roupa e moradia ruins, impostos e guerra longa baixam a estabilidade (RF-VIDA-136), que alimenta revoltas e emigração. | 19.4, 19.9 | C |
| RF-VIDA-281 | (Implementado na Etapa B.) **Migração interna:** moradores mudam para assentamentos do mesmo povo onde há trabalho e comida; cidades prósperas atraem, cidades em crise perdem gente. | 19.3, 19.9 | B |
| RF-VIDA-282 | (Implementado na Etapa E: cada assentamento tem no máximo um luxo, pelo que há em volta: especiarias na selva, sal na costa seca, tinta na savana, vinho no clima temperado e fértil, seda na mata quente, sal em qualquer costa; vinho e tinta a partir do Bronze, seda do Ferro. Os ricos consomem luxo e ganham estabilidade; luxo vale muito e puxa caravanas e barcos. O sal conserva a comida.) **Bens de luxo regionais:** sal na costa, uva e vinho no clima temperado, especiarias em bioma raro, tinta e seda. Valem muito e puxam caravanas longas e marítimas. O sal também conserva comida (RF-VIDA-219a). | 19.6 | E |
| RF-VIDA-283 | **Bandidos:** desempregados de falências e soldados desertores viram bandos nas estradas, atacam caravanas e somem quando a cidade põe guardas ou a crise passa. | 19.6, 19.9 | G |
| RF-VIDA-284 | (Implementado na Etapa B: aqueduto da metrópole e epidemias em cidades sem saneamento.) **Saúde e saneamento:** cidade grande sem poço, aqueduto ou esgoto pega doenças com mais facilidade (liga RF-VIDA-182); a estrutura de referência da metrópole inclui saneamento. | 19.3 | B |
| RF-VIDA-285 | (Corrida do ouro, praga no rebanho e quebra de safra implementadas na Etapa C; o boom de rota nova fica para a G.) **Eventos econômicos:** corrida do ouro (jazida de ouro achada atrai gente), praga no rebanho, quebra de safra, boom de uma rota nova. Usam o sistema de eventos do mundo e as taxas da 19.15. | 19.4, 19.9 | C e G |
| RF-VIDA-286 | (Implementado na Etapa E: no passo de montanha perto de outro reino da Idade do Bronze em diante, a caravana paga 1 ouro (mais nas eras seguintes) uma vez por viagem, com tensão entre os reinos, a não ser que tenham acordo; aparece um posto de pedágio com guarita e cancela. Pontes ficam para quando houver rio atravessável no mapa.) **Pedágio e pontes:** reinos cobram passagem em pontes e passos de montanha; motivo de tensão e de acordos. | 19.6, 19.7 | E |
| RF-VIDA-287 | (Implementado na Etapa C: camadas Reinos, Vocação e Economia na janela Mundo.) **Camadas de mapa** "Economia" (riqueza e crise) e "Vocação", na janela Mundo. | 19.5, 19.9 | C |
| RF-VIDA-288 | (Implementado na Etapa D: escudo na cor do reino, forma pelo valor do povo e emblema da vocação da capital, na janela Reinos, no título da janela do assentamento, na bandeira da fortaleza e nos barcos.) **Brasão por reino** desenhado a partir da vocação da capital e do valor do povo, usado na bandeira da fortaleza e nos barcos. | 19.5 | D |
| RF-VIDA-289 | (Implementado na Etapa E: a capital pede a uma colônia o que está quase acabando nela; a colônia manda um tributo por caravana, ganha estabilidade e apaga uma recusa antiga; pedido não atendido em 3 anos é recusa, baixa a estabilidade e cada recusa aumenta em 50% a chance de independência.) **Pedidos da capital:** a capital pede às colônias o que falta a ela; atender (mandando uma caravana) melhora a estabilidade e a relação, recusar pesa na independência (RF-VIDA-81). | 19.4 | E |

**Ideias novas**, de olhar o pedido de novo depois das respostas. **Aprovadas pelo Joab em 20/10/2026.**

| ID | Ideia | Encaixa em | Etapa |
|---|---|---|---|
| RF-VIDA-290 | (Implementado na Etapa C: colheita no outono, tosquia na primavera e mais lenha no inverno; a estação aparece no painel. Etapa E: no inverno, caravanas param nas terras frias e não saem delas.) **Ano econômico com estações:** colheita no outono, estoque baixando no inverno, caravanas paradas na neve e tosquia na primavera (liga RF-VIDA-180). O estoque passa a ter um ciclo visível no ano. | 19.4 | C |
| RF-VIDA-291 | (Implementado na Etapa E: escambo na Pedra (troca só por bens de igual valor), lingotes de bronze, moeda de prata, moeda cunhada pelo reino que tem mercado na Era Medieval e papel na Industrial; cada moeda paga uma parte maior do valor em ouro; reino que cunha moeda leva 25% mais por carroça entre os seus e prefere comerciar dentro de si. A moeda aparece na janela Reinos e na aba Economia.) **Moeda por era:** escambo (Pedra), lingotes e anéis de bronze, moeda de prata (Ferro), moeda cunhada pelo reino (Medieval) e papel (Industrial). Reino que cunha moeda fortalece o comércio interno. | 19.6, 19.9 | E |
| RF-VIDA-292 | **Política do líder:** o traço do líder (RF-VIDA-72) escolhe impostos altos ou baixos, mercado aberto ou fechado, gasto com exército ou com obras; troca de líder pode mudar o rumo da cidade. | 19.9 | G |
| RF-VIDA-293 | (Implementado na Etapa E: no verão, um pastor leva metade do rebanho de ovelhas, gado ou cabras a um pasto alto a até 30 tiles e volta no outono; o rebanho cresce um pouco mais e o pasto de casa descansa. Cruzar terra de outro reino sem acordo piora a relação e vai para a crônica.) **Transumância:** pastores levam o rebanho para pastos de altitude no verão e voltam no inverno, cruzando terras de outros (motivo de acordos e de brigas). | 19.5, 19.7 | E |
| RF-VIDA-294 | (Implementado na Etapa C: solo das roças que cansa, pousio, rotação a partir da Era Medieval, erosão sem floresta e sobrepastoreio.) **Esgotamento da terra:** sobrepastoreio e roça no mesmo lugar por muito tempo baixam a fertilidade; desmatamento causa erosão. Liga a economia ao ecossistema e dá motivo para pousio, rotação e expansão. | 19.4 | C |
| RF-VIDA-295 | (Implementado na Etapa F: do 2º ano de guerra, com chance `MERCENARY_RATE` por ano, o lado com ouro contrata até `MERCENARY_MAX` adultos de um assentamento pobre ou instável de outro reino a até 120 tiles, a `MERCENARY_PRICE` de ouro cada; o ouro vai para o assentamento deles, e na paz eles ficam como moradores.) **Mercenários:** reinos ricos contratam soldados de assentamentos pobres ou em crise; em guerra longa, o ouro vira força. | 19.7, 19.9 | F |
| RF-VIDA-296 | **Dinastias e famílias:** líderes e comerciantes têm sobrenome de família; famílias ricas constroem casas melhores, e a crônica lembra as dinastias. | 19.9, 19.8 | G |
| RF-VIDA-297 | **Guildas:** em cidades grandes, artesãos da mesma profissão formam guilda, que melhora a qualidade e o preço daquele bem e pode fazer greve em crise. | 19.4 | G |

### 19.12 Parâmetros

Todos ficam em `src/sim/balance.ts` (RF-VIDA-208). Os valores são o ponto de partida e serão ajustados medindo 250 anos de simulação, como foi feito na análise de sobrevivência.

| Parâmetro | O que controla | Valor inicial |
|---|---|---|
| `STREET_GAP` | Distância mínima entre ruas diferentes | 3 tiles |
| `ROAD_COST_EXISTING` / `ROAD_COST_BESIDE` | Custo do A* sobre rua existente / ao lado de uma rua | 0,3 / 4 |
| `COLONY_RATE` | Chance anual base de mandar colonos (já existe) | 5% |
| `COLONY_MIN_FACTOR` | Fração dessa chance com a planta incompleta | 0,2 |
| `TIER_UP_COMPLETENESS` | Completude mínima para subir de nível | 70% |
| `REFORM_RATE` | Reformas por ano por construtor | 0,5 |
| `LABOR_SHIFT` | Fração dos adultos que podem mudar de setor por ano | 15% |
| `VOCATION_BONUS` | Bônus de produção da vocação | 40% |
| `VOCATION_INHERIT` | Chance de a colônia herdar a vocação da origem | 25% |
| `VOCATION_CHANGE_YEARS` | Anos ruins antes de trocar de vocação | 20 |
| `CAVALRY_STRENGTH` | Força do soldado montado | 2,0 |
| `CARAVANS_PER_SETTLEMENT` / `CARAVANS_MAX` | Caravanas por assentamento / no mundo | 1 por nível (+1 mercantil) / 24 |
| `CARAVAN_RATE` / `CARAVAN_RANGE` / `CARAVAN_SPEED` / `HORSE_SPEED` (Etapa E) | Saídas por ano (×2 mercantil, ×1,5 com mercado), alcance por terra, velocidade e o ganho do cavalo | 0,8 / 60 tiles (×1,5 rumo a feira) / 2,4 tiles por segundo / ×1,5 |
| `CARAVAN_LOAD` / `CARAVAN_KEEP` / `CARAVAN_TRIP_COST` / `GOLD_VALUE` (Etapa E) | Carga por animal, parte do teto que fica em casa, custo por tile de distância, valor do ouro | 6 / 35% / 0,05 / 5 unidades de troca |
| `AGREEMENT_TRIPS` / `AGREEMENT_YEARS` / `AGREEMENT_KEPT` / `AGREEMENT_BROKEN` (Etapa E) | Viagens antes do acordo, duração, relação por viagem cumprida e perda na quebra | 2 / 20 anos / +1 / −8 |
| `ROUTE_USE` / `GRAVEL_USE` / `STONE_USE` / `TRAFFIC_DECAY` (Etapa E) | Passagens para virar estrada, cascalho e pedra; perda anual do uso | 4 / 10 / 24 / 10% |
| `LUXURY_MAKE` / `LUXURY_USE` / `SPOIL_SALTED` (Etapa E) | Luxo feito por nível, consumo dos ricos por morador, perda da comida salgada | 0,7 / 0,03 / 20% |
| `TOLL_GOLD` / `TOLL_RANGE` / `TOLL_TENSION` (Etapa E) | Pedágio por passagem, alcance do dono do passo, tensão | 1 ouro (+50% por era) / 25 tiles / −0,5 de relação |
| `REQUEST_RATE` / `REQUEST_YEARS` / `REQUEST_STABILITY` / `REFUSAL_INDEPENDENCE` (Etapa E) | Pedido da capital por ano, prazo, estabilidade ao atender, peso de cada recusa na independência | 50% / 3 anos / +0,1 / +50% |
| `MINT_HAUL` (Etapa E) | Carroças a mais no reino que cunha moeda | ×1,25 |
| `TRANSHUMANCE_HEAD` / `TRANSHUMANCE_RANGE` / `TRANSHUMANCE_GROWTH` (Etapa E) | Rebanho mínimo, alcance do pasto alto, crescimento a mais na volta | 4 cabeças / 30 tiles / 12% |
| ~~`WARS_MAX`~~ / ~~`WAR_COOLDOWN`~~ | Removidos em 21/10/2026 (sem teto de guerras e sem trégua fixa) | — |
| `TRUCE_MIN` / `PEACE_REL` | Trégua mínima depois da guerra, relação para a paz | 3 anos / 25 |
| `REVENGE_WAR` / `FAITH_WAR` | Chance anual de guerra por vingança e por fé | 15% / 3% |
| `READY_LEVEL` / `PREP_MAX_YEARS` | Fração do preparo para declarar, anos até desistir do plano | 75% / 40 |
| `PREP_FOOD_YEARS` / `PREP_ARMOR` / `PREP_GOLD` | Comida (anos do exército), armadura e ouro por soldado exigidos | 3 / 0,5 / 3 |
| `ADVANTAGE` / `ADVANTAGE_RAID` / `ADVANTAGE_EXTERMINATION` / `BELIEF_NOISE` | Vantagem de força que o reino quer (guerra comum, saque, extermínio) e erro da estimativa | ×1,25 / ×0,9 / ×2 / 20% |
| `TEMPER_STEP` / `TEMPER_FADE` / `TEMPER_READY` / `TEMPER_ADVANTAGE` / `PLAYER_TENSION` | Passo do temperamento pelo jogador, volta ao normal por ano, efeito no preparo e na vantagem, e tensão da provocação | 0,5 / 0,03 / 0,2 / 0,3 / 25 |
| `EXTERMINATION_RATE` | Chance anual de guerra de extermínio por par elegível | 0,2% |
| `CHARIOT_STRENGTH` | Força do carro de guerra (Bronze) | 1,6 |
| `ARMY_FOOD` | Comida por soldado por ano de guerra | 1 |
| `ARMY_REACH` / `FAR_FROM_HOME` | Distância de casa a partir da qual o exército perde força, e a força que fica | 60 tiles / 0,8 |
| `HUNGRY_ARMY` / `RETREAT_SUPPLY` | Força do exército sem comida; comida abaixo da qual, dois anos seguidos, ele volta | 0,6 / 35% |
| `COVET_WAR` | Chance anual de saque por cavalos, ferro ou ouro (vezes a cobiça) | 5% |
| `LOOT_SHARE` / `LOOT_HERD` / `BURNED_FIELDS` | O que o saque leva do bem e do rebanho, e roças queimadas | 50% / 30% / 2 |
| `RAZE_SHARE` / `REFUGEE_SHARE` | Casas queimadas e povo que foge na conquista | 20% / 25% |
| `GRUDGE_YEARS` / `GRUDGE_PULL` | Anos de rancor do vencido e quanto a relação cai por ano | 60 / 1,5 |
| `MERCENARY_RATE` / `MERCENARY_MAX` / `MERCENARY_PRICE` | Chance anual de contratar, quantos, ouro por mercenário | 50% / 4 / 2 |
| `UPKEEP` | Manutenção anual por tipo de prédio | 0,2 a 2 de ouro |
| `KINGDOM_TAX` | Parte da sobra que vai ao reino | 20% |
| `BANKRUPT_YEARS` / `CRISIS_YEARS` | Anos para um negócio fechar / para a cidade entrar ou sair da crise | 8 / 5 |
| `ERA_POINTS` / `ERA_PILLARS_MIN` / `PILLAR_FLOOR` (Etapa H) | Pontos por era / pilares com mínimo / parte dos pontos que cada um precisa ter | 330, 480, 640, 800 / 3 / 8% |
| `TECH_USE_RATE` / `TECH_NEIGHBOR_RATE` / `TECH_TRADE_CHANCE` (Etapa H) | Chance anual de aprender pelo uso e com vizinhos; chance por chegada de caravana | 0,5 / 1,2 / 15% (×3 na feira) |
| `DECAY_RATE` (Etapa H) | Chance anual de esquecer uma técnica em colapso | 1% |
| `STORE_BASE[nível]` | Teto base de cada recurso por nível (aldeia, vila, cidade, metrópole) | comida 20/60/150/350; madeira e pedra 30/80/200/450; minério e metal 10/30/80/200; ouro 10/30/100/300 (antes: comida 40/120/300/700 e ouro 20/60/200/600; os celeiros ficavam quase vazios) |
| `GRANARY_CAP` / `WAREHOUSE_CAP` / `TREASURY_CAP` | Quanto o celeiro, o armazém e o tesouro somam ao teto | comida +80 / materiais +120 / ouro +150 (antes: comida +150 e ouro +300) |
| `PASTURE_PER_HEAD` | Tiles de pasto por animal no rebanho | 1,5 |
| `CONSUME_FOOD` / `CONSUME_FUEL` / `CONSUME_CLOTH` | Consumo anual por morador | 1 / 0,4 (×2 no frio) / 0,2 |
| `SPOIL_GRAIN` / `SPOIL_MEAT` / `SPOIL_WOOD` | Perda anual no estoque | 6% / 45% (20% com sal) / 2% |
| `DIMINISHING` | Expoente do retorno decrescente perto do teto | 2 (produção × (1 − preenchimento²)) |
| `PICK_RADIUS_PX` | Raio mínimo do círculo de escolha de criatura, em pixels de tela (cresce com o zoom, 0,9 px por tile) | 6 |
| `VWIN_HZ` | Atualizações por segundo da aba visível da janela do assentamento | 4 |
| `RESTYLE_RATE` | Casas trocadas pelo estilo da era nova por ano, por construtor (RF-VIDA-251) | 0,6 |
| `RICH_REFORM` | Reformas a mais num assentamento próspero (RF-VIDA-254) | 1,5× |
| `CRISIS_EMPTY_RATE` / `CRISIS_REFILL_RATE` | Casas que ficam vazias por ano na crise e que voltam a ser ocupadas na melhora | 0,5 / 1 |
| `MAIN_STREET_SHARE` | Fração da rede que passa por um tile para ele ser rua principal (RF-VIDA-253) | 12% (mínimo 6 tiles) |
| `AVENUE_MIN` | Tiles retos de rua principal para virar avenida | 4 |
| `CALIBRATION_SEEDS` / `CALIBRATION_YEARS` | Rodadas e anos da calibração Monte Carlo (19.15) | 20 / 250 |
| `CONSUME_FUEL` / `CONSUME_CLOTH` (Etapa C) | Ajustados na calibração para a Idade da Pedra se sustentar | 0,25 / 0,15 (antes: 0,4 / 0,2) |
| `LABOR_ROLE_MAX` (Etapa C) | Parte máxima dos adultos numa profissão depois da mudança de setor | 35% |
| `HAUL_HIGH` / `HAUL_LOW` / `HAUL_LOAD` / `HAUL_RANGE` (Etapa C) | Carroças dentro do reino: sobra acima de, falta abaixo de, carga e alcance | 50% / 20% / 12 / 60 tiles |
| `DOMESTICATE_RATE` / `HERD_GROWTH` / `PEN_AREA` (Etapa C) | Domesticação por ano, crescimento do rebanho, tiles de pasto de cada cercado | 0,4 / 30% / 9 |
| `HERD_PREDATION` / `HERD_PLAGUE_RATE` / `HERD_PLAGUE_SPREAD` (Etapa C) | Ataques por predador perto, praga por ano, chance de pular para o vizinho | 0,5 / 1,2% / 50% |
| `STABILITY_PULL` / `REVOLT_STABILITY` / `REVOLT_RATE` (Etapa C) | Quanto a estabilidade anda por ano, limite e taxa de revolta | 25% / 25% / 4% |
| `SOIL_WEAR` / `SOIL_RECOVER` / `SOIL_FALLOW` (Etapa C) | Desgaste do solo, recuperação, limite do pousio | 0,6% / 2% / 55% |
| `SEASON_HARVEST` / `SEASON_WOOL` / `SEASON_FUEL` (Etapa C) | Peso de cada estação (primavera a inverno) | 0,2·0,8·2,6·0,4 / 3,2·0,4·0,2·0,2 / 0,8·0,4·0,8·2 |
| `GOLD_RUSH_YEARS` / `GOLD_RUSH_WANDERERS` (Etapa C) | Duração da corrida do ouro e andarilhos a mais por ano | 12 / 0,6 |

### 19.13 Sequência de implementação

Cada etapa é um PR para a `development`, com testes e capturas de tela, e marca a coluna Situação dos requisitos que entrega. **Cada etapa entrega também a arte dos elementos que cria** (RF-VIDA-320), e a calibração da 19.15 roda antes de cada PR. Sequência combinada com o Joab em 20/10/2026 (a coluna Ordem); a tabela de etapas continua abaixo dela.

| Ordem | Etapas | Inclui as ideias | Por que nesta posição |
|---|---|---|---|
| 1 | S e A juntas | — | A base estocástica muda todos os sorteios e a calibração passa a medir tudo; as ruas são um defeito visível |
| 2 | B | 281, 284 | O crescimento controlado define onde e como o resto é construído |
| 3 | C | 280, 285, 287, 290, 294 | O estoque próprio e a vocação são a base do comércio, da guerra por bens e da falência |
| 4 | I | — | Com a economia, a janela do assentamento passa a ter o que mostrar |
| 5 | D | 288 | Arquitetura por era e material da região usam as reformas da B |
| 6 | E | 282, 286, 289, 291, 293 | Caravanas dependem do estoque próprio e das vocações |
| 7 | F | 295 | Guerras por bens e cavalaria dependem do comércio e dos cavalos |
| 8 | G | 283, 292, 296, 297 | Falência depende de receitas e despesas de comércio e guerra |
| 9 | H | — | As eras por desenvolvimento somam pontos de todos os pilares anteriores (implementada antes das etapas F e G; os pilares usam o que já existe e ganham o que elas trouxerem) |
| 10 | V | — | Acabamento visual dos elementos que já existiam; a arte dos novos vem em cada etapa |

| Etapa | O que entra | Requisitos | Critério de aceite |
|---|---|---|---|
| S | Base estocástica: biblioteca de sorteios, taxas por ano em todo o código atual, fluxos de sorteio separados, calibração Monte Carlo | RF-VIDA-300 a 311 | Mesmos resultados médios de hoje com passos de tempo diferentes (1x e 5x); relatório da calibração com as faixas-alvo da 19.15 |
| A | Corrigir as ruas em grade e em escada | RF-VIDA-190 a 196 | Zero blocos 2×2 de rua fora das praças em 250 anos (sementes 42 e 7); captura de tela de uma cidade sem ruas duplas |
| B | Parâmetros centrais, estrutura de referência, ordem de crescimento, reformas | RF-VIDA-200 a 208 | Em 250 anos, menos assentamentos e maiores do que hoje (pelo menos uma cidade), completude média ≥ 60% |
| C | Necessidades, cadeias curtas, rebanhos, vocação, profissões novas | RF-VIDA-210 a 224 | Pelo menos 4 vocações diferentes num mundo de 250 anos; rebanhos e pastos visíveis; nenhuma espécie a mais extinta do que hoje (análise de sobrevivência) |
| D | Arquitetura por era gradual, material da região, hierarquia de ruas | RF-VIDA-250 a 254 | Captura de tela de uma cidade em transição de era com estilos misturados |
| E | Caravanas, preços, acordos, feiras, barcos mercantes | RF-VIDA-230 a 236 | Caravanas visíveis nas estradas; estradas de rota comercial calçadas antes das outras |
| F | Guerras com motivo, cavalaria, logística, consequências | RF-VIDA-240 a 253 | Guerra só depois de preparo (comida, armas, armadura, ouro) e sem teto de guerras; crônica com o motivo de cada guerra |
| G | Caixa, falência e crise | RF-VIDA-260 a 264 | Pelo menos uma falência com causa registrada em 250 anos, e recuperação possível |
| I | Seleção de criaturas e janela do assentamento (as abas ganham campos a cada etapa) | RF-VIDA-330 a 349b | Selecionar e seguir uma criatura numa aldeia cheia; abrir a janela do assentamento pelo rótulo com uma criatura passando por cima; capturas de tela de cada aba |
| V | Melhorias visuais dos elementos que já existem | RF-VIDA-321, 323 a 326 | Capturas de tela antes e depois de cada elemento da tabela de 19.16, sem perder nenhum elemento existente (RNF-14) |
| H | Eras por desenvolvimento e técnicas | RF-VIDA-270 a 275 | Assentamentos com vocações diferentes chegam a eras em momentos diferentes; Era Industrial ainda perto do ano 1.300 em média |

### 19.14 Decisões do Joab

Todas respondidas em 20/10/2026.

1. **Estoque:** cada assentamento tem o seu, nada compartilhado; é isso que faz o comércio acontecer. Cada recurso tem teto, e o que está estocado precisa ser consumido (RF-VIDA-212, 218, 219). (A sugestão era manter o estoque do reino para madeira, pedra e metal.)
2. **Extermínio:** só entre povos inteligentes. Pode ser da mesma espécie quando são assentamentos ou reinos diferentes com interesses diferentes. Entre animais não há guerra: a mesma espécie não tem conflito de interesse, e entre espécies existe a predação (RF-VIDA-241).
3. **Vocação no rótulo:** ícone simples no rótulo e também no painel (RF-VIDA-224, 349).
4. **Ideias complementares:** todas entram (19.11).

### 19.15 Base de simulação estocástica

Pedido do Joab: todo evento e acontecimento é tratado como **simulação estocástica**, isto é, um sistema que evolui por acontecimentos aleatórios com probabilidades conhecidas. Uma rodada é uma história possível. Muitas rodadas com sementes diferentes mostram a distribuição do que pode acontecer, e é essa distribuição que se calibra, não uma história só.

**Como é hoje:** o código já sorteia quase tudo (39 sorteios só em `ecosystem.ts`), quase sempre como `rnd() < taxa × dt`. Isso é uma aproximação de primeira ordem: fica errada com passos grandes (velocidade 5x, simulação agregada fora da tela), as taxas ficam espalhadas pelo código, e não existe nenhuma forma de medir a distribuição dos resultados além do arquivo temporário que usei na análise de sobrevivência.

| ID | Requisito | Situação |
|---|---|---|
| RF-VIDA-300 | **Todo acontecimento tem uma taxa por ano** (λ) com nome em `src/sim/balance.ts`. A chance num passo de tempo é `1 − e^(−λ·dt)`, de modo que o resultado médio não muda com a velocidade do jogo nem com o tamanho do passo (processo de Poisson). Vale para nascimento, morte, colônia, porto, incidente, guerra, paz, falência, evento do mundo, descoberta e todo o resto. | Parcial: `chance(λ, dt)` nos acontecimentos contínuos (nascimentos, casas, roças, porto, pesca, colonos, andarilhos, minas, barcos, desembarques); os sorteios anuais (relações, incidentes, eventos) já são chances por ano |
| RF-VIDA-301 | **Taxa que depende do estado** (função de risco): `λ = λ₀ × fator₁ × fator₂ × ...`, cada fator com nome e explicação (fome, estabilidade, relação, era, vocação, cansaço de guerra). Transições suaves por curva logística em vez de limites secos onde for possível ("chance cresce perto de −40" em vez de "só abaixo de −40"). | Parcial: taxas com fatores nomeados; as curvas logísticas entram com as etapas B a H |
| RF-VIDA-302 | **Distribuição certa para cada coisa:** contagens (filhotes, mortes num grupo, produção de uma oficina) por Poisson ou binomial; quantidades (colheita, carga de caravana, tamanho de jazida) por lognormal ou gama, sempre positivas e com cauda; tempos de espera (viagem, obra, gestação) por gama; escolhas (vocação, motivo de guerra, destino da caravana, profissão) por sorteio com pesos. Tudo num módulo só, `src/sim/stochastic.ts`, testado. | Implementado (Fase 0): `src/sim/stochastic.ts` com testes; o uso cresce a cada etapa |
| RF-VIDA-303 | **Estados como cadeia de Markov:** a relação entre dois reinos (paz, tensão, guerra, trégua, aliança), a situação econômica de um assentamento (próspero, estável, em crise, falido) e a vocação mudam de estado com taxas que dependem do estado atual. Cada cadeia é documentada com a tabela de transições. | Parcial: as relações já mudam de estado; as cadeias documentadas entram nas Etapas F e G |
| RF-VIDA-304 | **Ruído com retorno à média** (processo de Ornstein-Uhlenbeck) para o que varia de ano em ano: clima do ano, produtividade da terra, preço de cada bem. Há anos bons e ruins, mas nada deriva para o infinito. Junto com os tetos (RF-VIDA-218), é o que segura a economia. | Implementado (Fase 0): clima do ano por região muda a colheita e o rebrotar da vegetação |
| RF-VIDA-305 | **Acontecimentos ligados:** seca, inverno duro e praga atingem uma região inteira de uma vez (choque regional compartilhado) e se espalham para os vizinhos com chance pela distância, em vez de cada assentamento sortear sozinho. | Parcial: clima com parte comum ao planeta e parte regional, secas na crônica e praga do rebanho que pula para os vizinhos pela distância (Etapa C); falta o contágio de pragas da lavoura |
| RF-VIDA-306 | **Determinismo por fluxos:** gerador com semente por planeta e um fluxo de sorteio separado para cada subsistema (vida animal, inteligentes, clima, economia, guerra, eventos). Acrescentar um sistema novo não muda a sequência dos outros, o que facilita reproduzir defeitos e sincronizar o coop (RNF-VIDA-06). | Implementado (Fase 0): fluxos vida, povos, política, mundo, terreno e clima |
| RF-VIDA-307 | **Fora da tela, os mesmos processos:** a simulação agregada (RNF-VIDA-05, RF-VIDA-171) usa as mesmas taxas em passos grandes, sorteando quantos eventos de cada tipo aconteceram no intervalo (Poisson com `λ·Δt`, o chamado tau-leaping). Assim o planeta não observado evolui do mesmo jeito que o observado. | Parcial: o sorteio de Poisson está pronto; a simulação agregada é da Fase 5 |
| RF-VIDA-308 | **Calibração Monte Carlo:** um comando (`npm run calibrar`) roda `CALIBRATION_SEEDS` sementes por `CALIBRATION_YEARS` anos sem tela e gera um relatório em Markdown com média, mediana e faixa de 10% a 90% de cada indicador, comparando com as faixas-alvo da tabela abaixo. Os testes automáticos conferem as faixas com poucas sementes. | Implementado (Fase 0): `npm run calibrar` gera [CALIBRACAO.md](CALIBRACAO.md) |
| RF-VIDA-309 | **Raro de verdade:** acontecimento raro (extermínio, maravilha, colapso, praga grande) tem taxa baixa **e** intervalo mínimo entre ocorrências, para não haver sequências absurdas na mesma partida. | Parcial: secas com intervalo mínimo; os outros raros entram com as suas etapas |
| RF-VIDA-310 | **Probabilidade à vista para quem testa:** no modo de depuração, o painel do assentamento mostra as taxas do momento ("colônia: 3,2% ao ano; crise: 0,4%") e o fator que mais pesa. A crônica continua dizendo a causa de cada acontecimento. | Implementado (Fase 0): `?debug` no endereço mostra as taxas no painel do assentamento |
| RF-VIDA-311 | **Faixas-alvo** da calibração (tabela abaixo). Uma mudança que tira um indicador da faixa precisa de motivo registrado no registro de decisões. | Parcial: o relatório confere as faixas que já dá para medir |

| Indicador (Terra, 250 anos) | Faixa-alvo (10% a 90% das rodadas) |
|---|---|
| Espécies extintas | 0 a 2 |
| Assentamentos vivos | 12 a 40, com pelo menos 1 cidade |
| Completude média da planta (RF-VIDA-201) | 50% a 85% |
| Preenchimento médio dos estoques | 20% a 80% (antes: 30% a 80%; com os recursos finitos da seção 19.19 o estoque vive mais vazio) (medido nos recursos que o assentamento produz além do que gasta no ano) |
| Guerras ao mesmo tempo (média no período) | até 1 a cada 6 reinos |
| Guerras de extermínio | 0 a 1 |
| Falências de assentamento | 1 a 4 |
| Assentamentos em crise ao mesmo tempo | até 10% |
| Ano da Era Industrial (simulação longa, 1.500 anos) | 1.100 a 1.500 |

### 19.16 Visual: melhorias nos elementos existentes e arte dos novos

Pedido do Joab: além das lógicas, os elementos que já existem melhoram e os novos chegam com arte própria. Tudo segue a seção 14.2 (16 bits simples, contorno escuro, 3 a 4 tons, luz de cima à esquerda), a escala de 8 pixels de arte por tile do chão e 16 pixels nos objetos, e o desenho em Canvas 2D (RNF-VIDA-07).

| ID | Requisito | Situação |
|---|---|---|
| RF-VIDA-320 | **Toda lógica tem visual.** Nenhuma mecânica desta seção é marcada Implementada sem a sua arte (sprite, animação ou ícone) e uma captura de tela no PR. | A fazer (todas as etapas) |
| RF-VIDA-321 | **Melhorias nos elementos existentes** (tabela 1 abaixo). | A fazer (Etapa V) |
| RF-VIDA-322 | **Arte dos elementos novos** (tabela 2 abaixo), entregue junto com a etapa que cria cada um. | A fazer (Etapas A a H) |
| RF-VIDA-323 | **Estado à vista sem abrir painel:** celeiro com sacos conforme o estoque, casas descuidadas e janelas tapadas na crise, mercado com barracas vazias na falência, bandeira de guerra na fortaleza, fumaça de saque, rebanho magro na seca. | A fazer (Etapa V e G) |
| RF-VIDA-324 | **Animações leves** de 2 a 3 quadros: pás do moinho, faísca da ferraria, tear, bandeira ao vento, fumaça de chaminé e de forno, roda d'água, ondas no cais, cavalos e ovelhas pastando. Só se anima o que está na tela. | A fazer (Etapa V) |
| RF-VIDA-325 | **Legível em todo zoom:** de longe, cores e ícones (vocação, guerra, crise); de perto, sprites. Camadas novas (Economia, Vocação, Rotas comerciais) na janela Mundo. | A fazer (Etapa V e C) |
| RF-VIDA-326 | **Desempenho:** sprites num atlas único, desenhados só na área visível, dentro do orçamento de quadro do 2D (RNF-VIDA-01). | A fazer (Etapa V) |

**Tabela 1: elementos que já existem e o que melhora**

| Elemento | Melhoria |
|---|---|
| Casas | Material da região (RF-VIDA-252), variação de telhado e porta, quintal com horta ou lenha, chaminé com fumaça no frio, andaime durante a reforma |
| Praça | Poço, depois fonte; barracas no dia de feira; estátua no centro da cidade |
| Fogueira | Faíscas subindo; brasas apagadas em aldeia abandonada |
| Roças | Fileiras de plantio, estação do ano (RF-VIDA-180), espantalho, feixes na colheita, pousio quando a terra cansa (RF-VIDA-294) |
| Ruas e estradas | Degraus desenhados como curva (RF-VIDA-192), cruzamentos limpos, cascalho, meio-fio, avenida com árvores, marcas de roda nas rotas comerciais |
| Porto e barcos | Cais com caixas e redes, guindaste na Era Industrial, barcos mercantes com vela listrada na cor do reino |
| Minas e jazidas | Pilha de rejeito, trilho com carrinho, lanterna na entrada da caverna |
| Prédios especiais | Ferraria com bigorna e faísca, templo com a forma da crença, mercado com toldos, quartel com estandarte, fortaleza com brasão (RF-VIDA-288) |
| Inteligentes | Ferramenta da profissão na mão, roupa por era e por material (lã, couro, linho), cavaleiro montado |
| Animais | Rebanho doméstico diferente do selvagem (cor mais clara, sino, cerca por perto) |
| Territórios e rótulos | Ícone da vocação e do estado (crise, guerra) ao lado do nome, brasão do reino |
| Ruínas | Paredes quebradas, mato crescendo aos poucos nas três etapas (RF-VIDA-108) |

**Tabela 2: elementos novos**

| Elemento | Etapa |
|---|---|
| Pasto com cerca, curral, haras, ovelhas, gado, cabras, cavalos e camelos domésticos, pastor e tratador | C |
| Olaria com forno, moinho de vento e roda d'água, tear, armazém, celeiro cheio ou vazio | C |
| Ícones de vocação e camadas Economia e Vocação | C |
| Andaime de obra, poço, fonte, avenida, muralha e portões por era, pontes e torres | B e D |
| Casas por material da região e por era, com estilos misturados na transição | D |
| Caravana (comerciante, burro, cavalo ou camelo, carroça por era), barco mercante, barracas da feira, pedágio | E |
| Cavalaria, exército em marcha com bandeira, roças queimadas, fumaça de saque, refugiados com trouxas | F |
| Casas abandonadas com tábuas, mercado fechado, bandidos com acampamento | G |
| Prédio característico de cada técnica (escrita, moeda, imprensa, vapor) | H |

### 19.17 Seleção de criaturas e informações do assentamento

Pedido do Joab em 20/10/2026: melhorar a seleção de criaturas e a forma de ver as informações de um assentamento.

**Como é hoje** (`src/client/surface/SurfaceMode.ts`):
- Passar o mouse mostra uma ficha da criatura mais perto do cursor, num raio de 6 pixels de tela (ou 0,8 tile de perto). Clicar fixa a ficha, que segue a criatura enquanto ela viver. Esc ou um clique no vazio soltam a ficha.
- Ficha da criatura: espécie, profissão ou fase da vida, assentamento, era, reino, idade e energia.
- A ficha do assentamento só aparece quando não há criatura perto do cursor. Ela mostra nome, nível, reino, povo, valor, crença, estoque do reino, o que falta para a próxima era, guerra e aliados, tudo em linhas de texto dentro da mesma ficha do tile.

**Problemas:**
- Dentro de uma aldeia há gente em todo lugar, então é difícil chegar à ficha do assentamento.
- Nada marca no mapa quem está selecionado, e não dá para escolher entre criaturas sobrepostas nem seguir uma com a câmera.
- A ficha do assentamento é curta demais para a economia, as pessoas e as construções que a seção 19 traz.

**Seleção de criaturas**

| ID | Requisito | Situação |
|---|---|---|
| RF-VIDA-330 | **Alvo claro antes do clique:** a criatura que seria escolhida ganha um contorno claro ao passar o mouse. A área de escolha é o próprio círculo desenhado ao redor do corpo da criatura (centrado meio tile acima do ponto dela, onde fica o sprite; raio `PICK_RADIUS_PX` ou 0,9 do zoom, o que for maior), e ganha a criatura mais perto do cursor. | Implementado (Etapa I): contorno branco em quem o clique escolheria; raio de `PICK_RADIUS_PX` em pixels de tela; ganha a mais perto |
| RF-VIDA-331 | **Criaturas amontoadas:** clicar de novo no mesmo ponto passa para a próxima criatura sob o cursor. Com mais de 3 criaturas ali, aparece uma lista pequena ("5 aqui: Humano, caçador · Humano, criança · Lobo...") para escolher. | Implementado (Etapa I): clicar de novo no mesmo ponto passa para a próxima; com mais de 3, lista "N aqui" com nome e profissão para escolher |
| RF-VIDA-332 | **Marcador da seleção:** um anel pulsante na cor do reino (ou branco para animais) fica sobre a criatura selecionada, visível em qualquer zoom, com uma seta na borda da tela quando ela sai da vista. | Implementado (Etapa I): anel pulsante na cor do reino (branco para animais), em qualquer zoom; seta na borda quando sai da vista |
| RF-VIDA-333 | **Seguir com a câmera:** botão "Seguir" na ficha e tecla F; a câmera acompanha a criatura até o jogador arrastar o mapa ou a criatura morrer. A morte gera um aviso ("Enka morreu de velhice aos 61 anos"). | Implementado (Etapa I): botão Seguir na ficha e tecla F; arrastar o mapa solta; a morte gera o aviso com a causa e a idade |
| RF-VIDA-334 | **Nome próprio:** inteligentes têm nome gerado no estilo do povo e sobrenome de família (liga RF-VIDA-296). Animais aparecem pela espécie, com "filhote", "adulto" ou "velho". | Implementado (Etapa I): nome próprio e sobrenome de família no som de cada povo, gerados do número da pessoa (sem mexer nos sorteios); filhos herdam a família, que viaja junto nos barcos; animais com filhote, adulto ou velho |
| RF-VIDA-335 | **Ficha completa da criatura:** nome, espécie, idade e fase da vida, energia e saúde em barras, doença se houver, profissão e **o que está fazendo agora** ("indo caçar", "voltando com peixe", "construindo uma casa", "fugindo de um lobo"), assentamento e casa (clique leva até lá), família (pais e filhos vivos), o que carrega (ferramenta, arma, carga) e uma história curta ("nasceu em Orlu, mudou para Tekva no ano 212"). Animais mostram dieta, bando ou cardume e predador por perto. | Parcial (Etapa I): nome, espécie, idade, energia e saúde em barras, profissão com ícone, o que está fazendo, assentamento (clique leva até lá), família (pai ou mãe e filhos vivos, clicáveis), o que leva e a história curta; animais com dieta, bando e predador por perto. Falta casa própria e doença individual, que a simulação ainda não guarda |
| RF-VIDA-336 | **Seleção de grupo:** arrastar com Shift desenha um retângulo; a ficha mostra o resumo do grupo (quantos de cada espécie e profissão, energia média). | Implementado (Etapa I): Shift + arrastar desenha o retângulo; a ficha resume espécies, profissões e energia média; anéis nos escolhidos |
| RF-VIDA-337 | **Selecionar a partir do painel:** clicar numa espécie na lista de população destaca todos os indivíduos dela no mapa, e cliques seguidos levam a câmera de um a outro. Na ficha do assentamento, clicar numa profissão faz o mesmo com quem tem aquela profissão (RF-VIDA-343). | Implementado (Etapa I): clicar numa espécie da população destaca todos e cliques seguidos levam a câmera de um a outro; o mesmo com as profissões da aba Pessoas |

**Informações do assentamento**

| ID | Requisito | Situação |
|---|---|---|
| RF-VIDA-340 | **Selecionar o assentamento sem disputar com as pessoas:** clicar no rótulo, na praça ou num prédio do assentamento abre a ficha dele. A ficha da criatura continua no clique sobre ela fora desses pontos. | Implementado (Etapa I): clicar no rótulo, na praça ou num prédio especial abre a janela; casas e o resto continuam escolhendo criaturas |
| RF-VIDA-341 | **Janela do assentamento**, separada da ficha do tile, fixa até ser fechada, com abas: Resumo, Economia, Pessoas, Construções, Relações e História. Só a aba visível é atualizada, no máximo 4 vezes por segundo. | Implementado (Etapa I): janela fixa à direita com as seis abas; só a aba visível é refeita, até 4 vezes por segundo (`VWIN_HZ`) |
| RF-VIDA-342 | **Resumo:** nome, nível e vocação com ícone; era e progresso por pilar (19.10); população com seta de tendência; líder com nome e traço; reino e capital; povo, valor e crença; estabilidade; situação econômica (próspero, estável, em crise, falido); completude da planta com o que falta (RF-VIDA-201). | Parcial (Etapas I e H): nível e vocação, era e progresso com o que falta (metal e pontos), população com tendência, líder com nome e idade, reino, povo, estabilidade, situação econômica e planta. Etapa H: pilares com pontos, técnicas e recursos sem uso; o traço do líder (Etapa G) chega depois |
| RF-VIDA-343 | **Pessoas:** crianças, adultos e idosos; profissões com ícone e contagem; nascimentos, mortes e as causas no último ano; quem chegou e quem saiu. Clicar numa profissão destaca essas pessoas no mapa. | Implementado (Etapa I): crianças, adultos e idosos, profissões com ícone e contagem (clique destaca), nascimentos, mortes por causa, chegadas e partidas do ano passado |
| RF-VIDA-344 | **Economia:** para cada recurso, barra de estoque e teto (RF-VIDA-218), produção e consumo por ano, saldo e preço local; caixa; acordos e caravanas em curso; destaque para o que falta e o que sobra. | Parcial (Etapa I): necessidades, barra de estoque e teto, feito, gasto e saldo do ano por recurso, falta e sobra, caixa, rebanho, solo e estação. Preço local, acordos e caravanas chegam com as Etapas E e G |
| RF-VIDA-345 | **Construções:** casas por padrão, prédios especiais, obras em andamento com porcentagem, minas e porto. Clicar num item leva a câmera até ele. | Implementado (Etapa I): casas e as com andar a mais, plantações, cercados, porto, obras em andamento com anos que faltam, prédios especiais e minas; clicar leva a câmera |
| RF-VIDA-346 | **Relações:** reino, vizinhos com a relação em barra de −100 a +100, guerras, alianças, acordos e rancores. | Implementado (Etapa I): reino e membros, os 8 reinos mais perto com a relação em barra de −100 a +100, guerra, aliança, amizade, tensão e rancor |
| RF-VIDA-347 | **História:** a crônica só desse assentamento e gráficos pequenos de população e de estoque ao longo do tempo. | Implementado (Etapa I): crônica do assentamento (pelo nome e pela área) e gráficos de população e de estoque dos últimos 120 anos |
| RF-VIDA-348 | **Destaque no mapa** enquanto a janela está aberta: área tingida, prédios contornados, minas, porto e rotas das caravanas ligadas ao assentamento. | Implementado (Etapas I e E): área tingida com borda pulsante, prédios especiais contornados, minas marcadas e as rotas das caravanas que saem ou chegam, tracejadas |
| RF-VIDA-349 | **Passar o mouse continua leve:** um balão curto com nome, nível, população, vocação e ícones de estado (guerra, crise, fome); o detalhe fica na janela. O rótulo no mapa mostra o ícone simples da vocação ao lado do nome e os ícones de estado (decisão do Joab, RF-VIDA-224). | Implementado (Etapa I): balão curto com nome, nível, população, vocação, situação e ícones de estado; o rótulo mostra a vocação e os ícones de guerra, fome e crise |
| RF-VIDA-349a | **Comparar assentamentos:** janela Assentamentos com uma tabela ordenável (população, era, vocação, riqueza, estabilidade, completude); clicar numa linha leva até o lugar. | Implementado (Etapa I): janela Assentamentos com tabela ordenável por nome, moradores, era, vocação, riqueza, estabilidade e planta; clicar numa linha leva até o lugar e abre a janela |
| RF-VIDA-349b | **Leitura fácil:** todo número com unidade, barras com cor e texto (não só cor, liga RNF-13), textos em português, nada de rolagem para o lado, Esc fecha a janela. | Implementado (Etapa I): barras sempre com o número escrito, textos em português, tabelas sem rolagem para o lado, Esc fecha primeiro a lista, depois a janela do assentamento, depois as outras |

### 19.18 Física, escolha do lugar, construções e terraformação

Pedido do Joab em 21/10/2026. Parâmetros novos em `src/sim/balance.ts` (seção "Relevo, movimento e escolha do lugar").

| ID | Requisito | Situação |
|---|---|---|
| RF-VIDA-360 | **Contornar obstáculos com relevo:** criaturas de terra não sobem desnível acima de `MAX_CLIMB` entre tiles vizinhos (descer aguenta o dobro). Ao bater em água, penhasco ou borda do habitat, a criatura vira 45°, 90° ou 135° para um lado e segue rente ao obstáculo por `DETOUR_SECONDS`, em vez de voltar e repetir o mesmo caminho. Estradas e caminhos a pé também respeitam o desnível. | Implementado |
| RF-VIDA-361 | **Jangada:** inteligente travado na beira da água por `RAFT_STUCK` s, com o destino do outro lado, corta `RAFT_TREES` árvores por perto (ou gasta `RAFT_WOOD` de madeira do estoque do assentamento) e atravessa até `RAFT_RANGE` tiles. Líder e último morador não vão. | Implementado |
| RF-VIDA-362 | **Barcos e caravanas com o mapa mudando:** barco encalhado ou parado por `REROUTE_SECONDS` refaz a rota pelo mar ou desembarca na terra mais perto; caravana cuja estrada virou água ou lava refaz o caminho ou volta para casa com a carga. | Implementado |
| RF-VIDA-363 | **Exame do lugar antes de fundar:** a espécie recusa lava ou chão em brasa por perto (`SITE_LAVA_RANGE`), área sem terra plana e firme (`SITE_MIN_AREA`, `SITE_MAX_SLOPE`), penhasco cortando a área (`SITE_MAX_RELIEF`), falta de água (`SITE_WATER_RANGE`; poço dispensa só da Idade do Ferro em diante, com solo úmido) e falta de comida (`SITE_MIN_FOOD`, atenuado com mar para pescar). Vale para o jogador, colônias, barcos de colonos, nômades e reocupação de ruínas. Lotes de casa e pasto exigem chão plano. | Implementado |
| RF-VIDA-364 | **Lava pega fogo:** a cada ano, tiles de lava queimam a mata, matam bichos e derrubam casas num raio de `LAVA_FIRE_RANGE`. | Implementado |
| RF-VIDA-365 | **Construção não sobrevive ao terreno que mudou:** depois de cometa, terremoto, vulcão e das ferramentas de terreno e clima, somem ruas, praça, roças, pastos, jazidas (e minas), casas, portos e prédios que ficaram em água, lava ou gelo, num barranco (`HOUSE_MAX_RELIEF`) ou porto sem água. Assentamento com o centro afundado se afoga. Roças, cercados e estradas são recontados, e as estradas refeitas depois. Elevar o chão de novo não traz nada de volta. | Implementado |
| RF-VIDA-366 | **Remover o que está no mapa:** ferramentas **Limpar** (árvores, pedras, cactos, ruínas, veios de minério) e **Demolir** (casas, prédios, ruas, roças, pastos). | Implementado |
| RF-VIDA-367 | **Terraformação com controle:** Aquecer e Resfriar param na **temperatura alvo** (°C) quando o limite está ligado; ferramentas novas Ajustar (sobe ou desce até o alvo), Nevar, Degelo e Lago; leitura da temperatura sob o mouse e do alcance do pincel (liga RF-SUP-15 a). Cada ação tem animação no pincel: brasas, flocos, chuva, poeira, ondas, brotos, entulho. | Implementado |
| RF-VIDA-368 | ~~**Melhor aproveitamento dos recursos:** entulho de construção derrubada volta em parte ao estoque (`SALVAGE`); o que passa do teto é vendido por ouro em vez de se perder (`SURPLUS_SALE`); estoque de assentamento abandonado vai em parte ao vizinho do reino (`ABANDON_RECOVER`); madeira, pedra e minério tirados do mapa pelo jogador vão ao assentamento mais perto (`HAUL_FROM_MAP`).~~ | Removido em 21/10/2026 a pedido do Joab: recurso não se transfere sozinho. O que passa do teto, o entulho, o estoque abandonado e o que o jogador tira do mapa se perdem; só o saque leva bens de um lugar a outro. Ver RF-VIDA-369 a 376 e o registro de remoções (REQUISITOS.md, seção 13) |

### 19.19 Recursos com peso

Pedido do Joab em 21/10/2026: os recursos existem, mas não pesam; parecem abundantes e o jogo fica monótono. A economia tem que decidir o destino dos povos (fome, decadência, migração, guerra, comércio), sem quebrar e sem fartura. Uma casa consome madeira, o povo corta árvores para isso, a árvore demora a crescer e acaba, e é preciso plantar de novo; a mesma lógica vale para pedra, minério e comida. Parâmetros em `src/sim/balance.ts` (seção "Recursos com peso"), calibrados em 20 mundos de 250 anos (`npm run calibrar`, [CALIBRACAO.md](CALIBRACAO.md)).

| ID | Requisito | Situação |
|---|---|---|
| RF-VIDA-369 | **Madeira só vem de árvore:** cada lenhador derruba árvores de verdade no mapa, da mais perto para a mais longe dentro de `WOOD_REACH` tiles (mais `REACH_PER_ERA` por era), e cada árvore dá `WOOD_PER_TREE`. A árvore cortada vira **toco**. Mata longe rende menos (`HAUL_TILES`, com carroça e cavalo). Não corta além do que cabe no armazém. Acabou a mata ao alcance, acabou a madeira; a coleta não dá mais gravetos. | Implementado |
| RF-VIDA-370 | **A mata cresce devagar:** o toco brota sozinho com chance `SPROUT_RATE` por ano perto de outra árvore (bem menos numa clareira grande, `SPROUT_FAR`) e a muda leva cerca de `TREE_YEARS` anos para virar árvore. A mata nativa também se espalha devagar (`TREE_SPREAD`), para o mundo não ficar mais verde a cada século. | Implementado |
| RF-VIDA-371 | **Replantio:** quando a mata ao alcance não dá para `FORESTRY_YEARS` anos do corte atual, o povo passa a manejar a mata (a partir da tecnologia `FORESTRY_TECH`; já de início se a crença é "a Floresta"). Cada árvore cortada custa `REPLANT_WORK` a mais de trabalho e deixa uma muda, que cresce em `REPLANT_YEARS`; os lenhadores também plantam nos tocos antigos (`PLANT_RATE`). | Implementado |
| RF-VIDA-372 | **Pedra se esgota:** cada tile tem pedra contada (`STONE_ROCK` na rocha e na montanha, `STONE_HILL` na colina, `STONE_FIELD` de pedra solta no chão comum, que rende menos, `FIELD_STONE_RATE`). A pedreira tira do que mais rende ao alcance (`STONE_REACH`) até acabar; pedregulho esvaziado some do mapa. | Implementado |
| RF-VIDA-373 | **Casas pedem conserto:** cada casa gasta `HOUSE_UPKEEP` de madeira por ano (mais com andar; casas de pedra da Era Medieval gastam `STONE_HOUSE_UPKEEP` de madeira e de pedra) e cada prédio `BUILDING_UPKEEP`. Sem material, as casas mais longe do centro ficam sem conserto: com `DECAY_YEARS` anos esvaziam, caindo aos pedaços, e com `COLLAPSE_YEARS` desabam. A falta de conserto conta como falta de lenha e puxa mais lenhadores. | Implementado |
| RF-VIDA-374 | **Comida pelo trabalho:** a coleta tira porções da vegetação ao alcance (`GATHER_RATE`, `GATHER_BITE`) e o mato rebrota com o tempo; o que o povo acha andando (`FORAGE`, `FORAGE_WILD`) cai com a lotação (`FORAGE_CROWD`). Caça dá carne ao estoque (`HUNT_FOOD`). Um lugar cheio precisa de roças, rebanho e pesca. Sem lenha no inverno frio, o povo passa frio e morre de frio (`FREEZE`). | Implementado |
| RF-VIDA-375 | **Escassez decide o destino:** na falta de comida ou lenha (`CRISIS_NEED`), mais gente vai para o trabalho que falta (`LABOR_CRISIS_SHIFT`, `LABOR_CRISIS_MAX`), e os jovens que amadurecem escolhem o ofício que falta (`CHILD_NEED`). A falta (`SCARCITY_LEVEL`) faz gente migrar para um vizinho da mesma cultura com sobra (`SCARCITY_MOVERS`); sem vizinho, depois de anos de falta, sai um êxodo para fundar outro lugar. Um reino com falta (`GREED_LEVEL`) vê as relações com o vizinho farto piorarem (`SCARCITY_TENSION`) e pode atacar para saquear (`RESOURCE_WAR`, `RAID_FORCE`). A crônica registra fome, frio, casas caindo, mata acabando e replantio. | Implementado |
| RF-VIDA-376 | **Recurso não se transfere sozinho:** o que passa do teto do armazém se perde (não vira ouro); o estoque de um assentamento abandonado se perde (ninguém herda); demolição e desabamento não devolvem material; o que o jogador tira do mapa com Limpar se perde. Só o saque na guerra, as carroças do reino e o comércio levam bens de um lugar a outro. Substitui o RF-VIDA-368. | Implementado |
| RF-VIDA-377 | **Ver os recursos:** a janela do assentamento mostra "Recursos por perto": árvores ao alcance (fração da mata do começo, cortes por ano, anos que faltam e se replanta), pedra ao alcance, de onde vem a comida e as construções sem conserto. No mapa, tocos e mudas aparecem no lugar das árvores cortadas. | Implementado |
| RF-VIDA-378 | **Casas não desabam em massa (ajuste de 21/10/2026):** a madeira que o assentamento tem é reservada para o conserto antes de qualquer obra nova (`REPAIR_RESERVE`), a mata volta mais depressa (`SPROUT_RATE` 0,1, `TREE_YEARS` 35, `REPLANT_YEARS` 18, `FORESTRY_YEARS` 60), e o conserto é mais barato e mais tolerante (`HOUSE_UPKEEP` 0,15, `BUILDING_UPKEEP` 0,25, `STONE_HOUSE_UPKEEP` 0,08, `DECAY_YEARS` 8, `COLLAPSE_YEARS` 20). Medido em simulação: casas desabadas por ano caíram de 0,53 para 0,06, sem mudar a fome nem a população. Alvo da calibração: `collapsed` entre 0 e 0,2. Altera os valores do RF-VIDA-370, 371 e 373. | Implementado |
| RF-VIDA-379 | **Região do assentamento (território):** a área de cada assentamento volta a aparecer, em qualquer zoom, **como forma orgânica** (o raio varia suavemente com o ângulo, com uma forma própria por assentamento) e **respeitando a fronteira** dos vizinhos: nunca passa da linha onde os alcances se igualam. Véu leve de perto (para a arte das casas e ruas aparecer limpa), borda cheia para a capital e tracejada para os outros. Substitui o círculo. | Implementado: `regionPath` em `SurfaceMode` |
| RF-VIDA-380 | **Mapa organizado (registro de mudanças já feitas):** terreiro limpo em volta das casas e ruas (`clearYards`), ruas mais largas, casas alinhadas na rua (`lotsFor`), sem cercas e muralhas, no máximo 5 currais e plantações por assentamento, menos ramificação de vilas e menos caravanas, soldado montado desenhado a cavalo. | Implementado |

### 19.20 Salvar o progresso no navegador

Pedido do Joab em 22/10/2026: forma simples de guardar o jogo inteiro de quem fecha a página sem querer ("dar F"). Ideia inicial dele: localStorage.

| ID | Requisito | Situação |
|---|---|---|
| RF-VIDA-381 | **Save local no IndexedDB.** Guarda nave, relógio, GUIA, sondas, espécies conhecidas e, por planeta visitado, o terreno e o ecossistema inteiro (criaturas, assentamentos, reinos, relações, guerras, economia, crônica, ruas, árvores cortadas, clima). O ecossistema é lido por reflexão, então campo novo na classe já entra no save; um teste confere que todo campo volta igual. IndexedDB e não localStorage porque o mapa de um planeta passa de 20 MB e a cota do localStorage é de ~5 MB. | Implementado |
| RF-VIDA-382 | **A simulação segue igual depois de carregar.** O estado de cada gerador de sorteios (`vida`, `povos`, `politica`, `mundo`, `clima`, `saber`, RF-VIDA-306) é salvo e restaurado: carregar e seguir dá o mesmo resultado que seguir sem ter salvo (teste). | Implementado |
| RF-VIDA-383 | **Quando salva:** a cada 20 s (com o aviso "Progresso salvo."; antes: 60 s, e um F5 dentro desse minuto perdia o que veio depois do último save, porque gravar ao fechar a aba não é confiável com um save de dezenas de MB), ao sair da superfície, ao esconder ou fechar a aba e pelo botão ou Ctrl+S. Ao abrir a página o último save é carregado; o jogador volta ao espaço ou à superfície, com a mesma câmera e velocidade. Botões **Salvar**, **Carregar** e **Mundo novo** (com confirmação) no canto da tela. | Implementado |
| RF-VIDA-384 | **Save inválido não derruba o jogo.** O save tem versão (`SAVE_VERSION`) e é validado antes de usar. Corrompido ou de outra versão: aviso, o save é guardado à parte (chave `recusado`) e começa um mundo novo. Se o navegador não deixa ler o armazenamento, o autosave fica desligado para não apagar um save que pode existir. | Implementado |

### 19.21 Ações com presença: o mundo só muda quando alguém vai lá fazer

Pedido do Joab em 25/10/2026 (proposta, nada implementado; branch `feature/acoes-presenciais`, criada a partir da `development`). Três pedidos juntos: (1) as árvores voltam um pouco mais rápido, sem exagero; (2) arbustos frutíferos como comida fácil; (3) controlar o desmatamento fazendo cada ação exigir que um NPC responsável esteja no lugar, com a ferramenta certa: para uma árvore sumir, um lenhador vai lá cortar; para um minério diminuir, um minerador vai lá minerar; alguém precisa ir pescar, colher frutos, e assim por diante.

#### 19.21.1 Como é hoje (base para a proposta)

O mundo muda por **taxa agregada**: `produce` (`src/sim/ecosystem.ts`) conta quantos moradores têm cada profissão e aplica a produção do assentamento inteiro, sem olhar onde cada um está.

| Ação | Como acontece hoje | Presença do NPC |
|---|---|---|
| Cortar árvore | `cutWood` acumula `v.chop` (lenhadores × `CUT_RATE`) e chama `fellTree` no tile da lista `treeList`, a mais perto primeiro. | Nenhuma. Os lenhadores só andam em direção a `v.fellAt` (viés de movimento); a árvore cai mesmo que ninguém tenha chegado. |
| Replantar | `cutWood` troca o toco por muda no ato; `growForests` planta nos tocos antigos (`PLANT_RATE` por lenhador) sem ninguém ir. | Nenhuma |
| Terreiro | `clearYards` remove árvore, toco e muda colados em casa, rua ou roça e dá a madeira ao estoque, sozinho, uma vez por passo. | Nenhuma |
| Minério | Cada minerador soma 0,8 por ano à `amount` da jazida (`d.amount -= take`). | Só um viés para andar até a jazida (`range` 2). |
| Pedra | `quarry` tira de `stoneTaken[t]` na lista `stoneList`. | Nenhuma |
| Coleta | `gather` sorteia tiles num raio e desbasta a vegetação (`GATHER_BITE`). | Nenhuma: o tile sorteado pode estar do outro lado do mapa do coletor. |
| Forrageio | Todo morador em tile com `veg > 0.25` ganha energia (`FORAGE`), em qualquer lugar. | Qualquer um, sem ferramenta e sem gesto. |
| Pesca | Barcos de pesca (`updateBoats`) lançam rede (`FISHING_CAST_RATE`) e ganham comida; os peixes do mar **não diminuem**. | O barco existe e navega, mas quem pesca não é um NPC identificado. |
| Roça, pasto | Agricultores e pastores entram em `worked`/`tend` por contagem. | Nenhuma |
| Obra e conserto | `buildHouse` e o desgaste de casas (`HOUSE_UPKEEP`) são instantâneos e pagos do estoque. | Nenhuma |
| Caça | `ROLE.hunter` abate herbívoro a até 3 tiles de si (`forEachNear`). | **Já presencial.** É o modelo a copiar. |

A árvore volta devagar (`TREE_YEARS` 35, `SPROUT_RATE` 0,1 com mata ao lado e 0,1 × 0,1 numa clareira, `REPLANT_YEARS` 18) e não há arbusto de fruta: a comida fácil é o "belisco" genérico em qualquer verde.

#### 19.21.2 Princípio

> **Regra da presença:** toda mudança no mapa causada por gente (árvore que cai, minério ou pedra que diminui, fruto colhido, peixe pescado, muda plantada, casa erguida) só acontece quando um NPC da profissão certa está no tile (ou ao alcance do gesto) pelo tempo que a ação leva. Sem NPC lá, nada muda. **A ferramenta não é exigida** (como no WorldBox, o NPC corta, minera e pesca de mão limpa); ela só acelera. O freio ao desmatamento é a presença, o tempo do gesto, a viagem e a demanda, não a falta de machado.

Fica **de fora** da regra o que não é ação de gente: crescimento e rebrota naturais, incêndio de lava, desastres, desgaste do tempo e as ferramentas de deus do jogador (Limpar, Demolir, Terreno, Clima, que seguem instantâneas, RF-VIDA-366).

#### 19.21.3 Requisitos

**A. Árvores voltam um pouco mais rápido**

| ID | Requisito | Situação |
|---|---|---|
| RF-VIDA-385 | **Rebrota um pouco mais rápida.** Alvo: a árvore voltar cerca de **20% mais cedo**, sem mudar o equilíbrio geral. Valores iniciais para calibrar: `TREE_YEARS` 35 → 28, `REPLANT_YEARS` 18 → 15, `SPROUT_RATE` 0,10 → 0,14, `SPROUT_FAR` 0,10 → 0,15. `TREE_SPREAD` (a mata nativa se espalhando) **não muda**, para o planeta não ficar mais verde a cada século. | Proposto |
| RF-VIDA-386 | **Calibrar com a nova regra.** Como a presença deve reduzir o corte por ano (viagem, tempo do gesto, fila), a calibração (`npm run calibrar`, 20 mundos de 250 anos) vem **depois** das ações presenciais. Metas: fração de mata de pé ao fim entre 70% e 110% da inicial; `collapsed` entre 0 e 0,2 (RF-VIDA-378); nenhuma queda de população por fome em relação à linha de base de [CALIBRACAO.md](CALIBRACAO.md). Se a mata voltar demais, o primeiro botão a girar é `SPROUT_FAR`; se de menos, `TREE_YEARS`. | Proposto |

**B. Arbustos frutíferos**

| ID | Requisito | Situação |
|---|---|---|
| RF-VIDA-387 | **Arbusto frutífero como elemento do mapa.** Novo enfeite (`Decor.Bush`, valores livres do enum: 13 e 14; o alfa do shader guarda `Decor * 16 + 15`, então o máximo é 15) em planície, floresta (borda), selva e taiga rala; densidade de cerca de 1 a cada 60 tiles de verde, em grupos pequenos, via `tileHash` para ser estável por semente. Nunca em rua, casa, roça, água, neve, gelo ou lava. | Proposto |
| RF-VIDA-388 | **Estado do arbusto:** cada arbusto guarda `frutos` (0 a `BUSH_FRUIT_MAX`, em porções de comida), num `Uint8Array` próprio do ecossistema (entra no save por reflexão). Cresce sozinho na primavera e no verão (`BUSH_GROW`), para no inverno; arbusto sem fruto é desenhado só com folhas, com fruto mostra pontos vermelhos ou roxos. Colher uma porção tira 1 de `frutos`; zerado, o arbusto **não some**, volta a dar fruto no ano seguinte. | Proposto |
| RF-VIDA-389 | **Comida fácil, mas limitada.** Cada porção vale `BUSH_FOOD` (um pouco acima do belisco de hoje) e a colheita leva `BUSH_PICK_SECONDS` por porção. Um arbusto adulto dá `BUSH_FRUIT_MAX` ≈ 4 porções por estação. Coletores acham os arbustos mais perto do assentamento primeiro, então o raio de comida fácil encolhe com a lotação, como o forrageio de hoje (`FORAGE_CROWD`). | Proposto |
| RF-VIDA-390 | **Quem come do arbusto.** (a) Coletores e crianças colhem para o estoque do assentamento; (b) qualquer morador com fome (`energia < 0,4`) fora do trabalho come na hora uma porção do arbusto em que está; (c) herbívoros comem fruto antes de pastar (fica o gancho, a implementar na etapa 5). O forrageio genérico por `veg > 0,25` (`FORAGE`) é **reduzido** a quase zero fora dos arbustos, para a fruta ser a comida fácil de verdade. | Proposto |
| RF-VIDA-391 | **Plantar arbusto (era 1 em diante).** Agricultores podem plantar arbusto num lote livre do assentamento (pomar), com o gesto de plantar do item C. Um pomar cheio sustenta parte da aldeia sem roça. Fica opcional na primeira entrega. | Proposto |
| RF-VIDA-392 | **Visual.** Sprite 16×16 em quatro variantes de cor da fruta (conforme o bioma), em dois estados (com e sem fruto). Entra no catálogo de arte (seção 14.2) e na legenda da janela do assentamento ("Frutos por perto: N arbustos, M porções"). | Proposto |

**C. Ação presencial: o motor comum**

| ID | Requisito | Situação |
|---|---|---|
| RF-VIDA-393 | **Tarefa por indivíduo.** Cada NPC adulto tem uma tarefa atual: `tipo` (cortar, plantar, minerar, tirar pedra, colher, pescar, lavrar, construir, consertar, nenhuma), `tile` alvo e `progresso` (0 a 1). Arrays do tipo `Uint8Array`, `Int32Array` e `Float32Array` ao lado de `role` e `village`; entram no save. | Proposto |
| RF-VIDA-394 | **Quadro de serviços por assentamento.** O assentamento publica *ordens* conforme a necessidade (lenha abaixo da meta, pedra, comida, mina aberta, casa sem conserto) e o NPC livre pega a ordem mais útil da sua profissão e mais perto. Substitui `treeList`/`treeNext`/`fellAt`/`stoneList`. A ordem aponta um tile concreto. | Proposto |
| RF-VIDA-395 | **Reserva de tile.** Um tile alvo tem no máximo `JOB_SLOTS` NPCs ao mesmo tempo (1 por árvore, arbusto e pedregulho; 2 a 4 por mina, conforme o nível). A reserva expira se o NPC morrer, trocar de profissão, perder a ferramenta ou passar `JOB_TIMEOUT` sem chegar; o tile volta ao quadro. | Proposto |
| RF-VIDA-396 | **Chegar, trabalhar, concluir.** O NPC anda até `JOB_REACH` do tile (usa o movimento de hoje, com contorno de relevo, RF-VIDA-360). Estando lá, `progresso` sobe com o tempo (`dt`, não por passo, para valer em qualquer velocidade do jogo) a `ritmo da profissão × fator da ferramenta`. Só ao chegar a 1 o mundo muda (árvore vira toco, `stoneTaken` sobe, `amount` da jazida cai, `frutos` cai) **e** o estoque recebe o produto. Se o estoque está cheio, o NPC **não começa** a ação (nada se desperdiça, como `cutWood` já faz). | Proposto |
| RF-VIDA-397 | **Ferramenta opcional, só acelera.** Nenhum ofício exige ferramenta. O ritmo base (`FELL_SECONDS` etc.) vale para quem trabalha sem nada; o fator `TOOL_SPEED` multiplica a velocidade e vem do que o assentamento já tem: `estoque de ferramentas > 0` (hoje dá 1,4) e o material da era (pedra 1,0, bronze 1,3, ferro 1,6, aço 2,0). **Sem inventário individual, sem desgaste e sem fila de peças.** Visual: o NPC aparece com o item da profissão na mão (machado, picareta, vara, enxada, martelo), do catálogo de itens (RF-VIDA-128a) no material da era. | Proposto |
| RF-VIDA-398 | **Ver e trocar o equipamento (futuro, fora desta entrega).** Como no WorldBox, a ficha do NPC poderá mostrar a ferramenta e a armadura e deixar o jogador trocá-las por um catálogo liberado. Por ora o equipamento é só visual (RF-VIDA-397) e o catálogo de itens (RF-VIDA-128c) segue como está. | Futuro |
| RF-VIDA-399 | **Duração dos gestos**, derivada das taxas de hoje (um ano de jogo dura `YEAR_SECONDS` = 6 s; a primeira versão deste requisito chutava 20 s para derrubar uma árvore, o que tiraria quase 4× da madeira): derrubar árvore `FELL_SECONDS` 5 (= 6 ÷ `CUT_RATE` 1,2); plantar muda `PLANT_SECONDS` 2,5; extrair uma porção de minério `MINE_SECONDS` ≈ 7,5 (= 6 ÷ 0,8 por ano de hoje); quebrar pedra `QUARRY_SECONDS` a derivar de `QUARRY_RATE`; colher uma porção de fruto `BUSH_PICK_SECONDS` ≈ 2; pescar `FISH_SECONDS` a derivar de `FISHING_CAST_RATE`. Os valores finais saem da calibração. | Implementado para derrubar e plantar |
| RF-VIDA-400 | **Transporte do produto.** O NPC carrega o produto até o estoque do assentamento (carga `CARRY_CAP` por viagem, mais com carroça e cavalo, `HAUL_*` de hoje) e só então o estoque sobe. Mata ou jazida longe rende menos porque a viagem é longa, **de verdade**, no lugar do fator `haulFactor`. | Proposto |
| RF-VIDA-401 | **Progresso visível.** Sobre o NPC trabalhando: animação do gesto (machado, picareta, rede, colheita) e uma barrinha fina de progresso; árvore sendo cortada balança. Na ficha do NPC (seleção, 19.17): "Cortando árvore em (x, y) · 60%". | Proposto |
| RF-VIDA-402 | **Tempo acelerado.** Com `yearSpan` grande (acelerar o relógio), o progresso usa `dt` real e o NPC pode "teletransportar" ao tile de trabalho dentro de um limite (`JOB_SNAP_SPEED`), para o ritmo da economia não despencar nem ficar mais lento que a vida (que já anda por `dt`). O teste de determinismo (RF-VIDA-382) continua valendo. | Proposto |

**D. Cada ação, com quem a faz**

| ID | Requisito | Situação |
|---|---|---|
| RF-VIDA-403 | **Lenhador:** derruba uma árvore de pé por vez, a mais perto não reservada dentro de `WOOD_REACH`. Deixa toco (ou muda, com manejo). Com manejo (`forestry`), outro gesto, **plantar muda** em toco antigo, é tarefa do lenhador ocioso (`PLANT_SECONDS`). Fim do plantio instantâneo de `cutWood` e do `growForests` plantando sozinho. | Proposto |
| RF-VIDA-404 | **Terreiro limpo por gente.** `clearYards` deixa de apagar sozinho: o que atrapalha uma casa ou rua nova vira ordem de **limpar terreno** para lenhadores e construtores; a obra só começa com o lote limpo. Fica uma exceção: a **fundação** de um assentamento novo limpa o lote inicial pelos fundadores (que andam até lá). | Proposto |
| RF-VIDA-405 | **Minerador:** vai à mina aberta, fica no tile (ou na entrada da caverna) e extrai uma porção por gesto; `amount` só cai quando ele conclui o gesto. Mina sem minerador parada produz zero. `JOB_SLOTS` por mina limita o rendimento: 2 + nível do assentamento. Explorar para achar jazida (`discover`) continua sendo ação presencial do minerador ou do caçador que passa. | Proposto |
| RF-VIDA-406 | **Pedreiro (minerador sem mina ou construtor):** escolhe o pedregulho ou a rocha mais perto com pedra (`stoneOf > 0`) e quebra; `stoneTaken` sobe só ao fim do gesto. | Proposto |
| RF-VIDA-407 | **Coletor:** vai ao arbusto com fruto mais perto, ou a um tile de erva comestível, e colhe. O desbaste da vegetação (`GATHER_BITE`) acontece no tile do coletor, não num sorteio. | Proposto |
| RF-VIDA-408 | **Pescador + vara/rede:** dois modos. Da costa (pier ou praia a até 2 tiles de água funda): um NPC com vara no tile da beira, `FISH_SECONDS` por peixe. Com barco: o pescador **embarca** no barco de pesca (o barco passa a carregar os NPCs reais e some se ninguém embarcou) e a rede só lança com ele a bordo. O peixe pescado **sai da população de peixes** da região (`this.population` da espécie `fish`), então pesca demais esvazia o mar. | Proposto |
| RF-VIDA-409 | **Agricultor + enxada:** preparar, plantar e colher na roça são gestos no tile da roça; a colheita só conta o que foi colhido por alguém lá. Pastor fica com o rebanho (já é perto do centro) e a tosquia e o abate são gestos junto dos animais. | Proposto |
| RF-VIDA-410 | **Obra e conserto presenciais (entram já, não ficam para o fim).** Como no WorldBox, os construtores vão até a casa e **ficam batendo nela** (martelo) até terminar. A obra tem fases visíveis no lote: marco e estacas, esqueleto, pronta (`BUILD_STAGES`). O material é separado do estoque ao começar (como o `pay` de hoje) e o que sobra de uma obra abandonada se perde (RF-VIDA-376). Até `JOB_SLOTS` (4) construtores por obra, cada um acelera. `BUILD_SECONDS` é calibrado para reproduzir **o ritmo atual** de construção com a população média de construtores, para o crescimento dos assentamentos não mudar. Obra parada por falta de material ou de construtor fica visível como canteiro. Conserto (RF-VIDA-373) é a mesma coisa: uma ordem por casa em desgaste; sem construtor indo lá, a casa continua caindo. Vale para casas, prédios, porto, mina (escoramento) e ruas novas. | Proposto |
| RF-VIDA-411 | **Caçador:** já presencial (RF-VIDA-374); só ganha a barra de progresso do abate e a lança ou o arco na mão (visual, RF-VIDA-397). | Proposto |
| RF-VIDA-412 | **Ofícios de transformação** (ferreiro, oleiro, tecelão, moleiro, comerciante, sacerdote) continuam por taxa agregada **dentro do prédio**, mas só rendem com o NPC na porta do prédio (distância até o prédio entra como na regra, sem o gesto por tile). Os prédios já têm lugar fixo (planta do assentamento, 10.3). | Proposto |

**E. Consequências em outras partes**

| ID | Requisito | Situação |
|---|---|---|
| RF-VIDA-413 | **Demanda guia o serviço.** O assentamento não manda cortar mais que o necessário: `WOOD_TARGET` (meta de lenha por morador) decide quantas ordens de corte existem ao mesmo tempo; o excedente de lenhadores planta, caça ou colhe. Isso evita que o desmatamento aconteça "porque tem lenhador ocioso". | Proposto |
| RF-VIDA-414 | **Papéis e crise (RF-VIDA-375):** a crise de lenha ou de comida continua puxando gente para a profissão que falta, mas a produção só sobe se houver árvores, minério, pedra ou alvo para eles; sem alvo o excedente fica ocioso. A ferramenta (RF-VIDA-397) continua dando vantagem a quem tem ferraria e metal. | Proposto |
| RF-VIDA-415 | **Janela do assentamento:** a aba de recursos (RF-VIDA-377) ganha "Quem está fazendo o quê" (contagem por tarefa, ociosos e esperando alvo), obras em andamento e paradas e ordens abertas no quadro. | Proposto |
| RF-VIDA-416 | **Guerra e saque:** soldado não corta nem minera; invasão mata NPCs e, com eles, as ordens que estavam com eles voltam ao quadro.  | Proposto |
| RF-VIDA-417 | **Save:** os arrays novos de tarefa, o estado dos arbustos e as obras em andamento entram no snapshot (por reflexão, RF-VIDA-381) com `SAVE_VERSION` +1, e um save antigo recebe valores padrão (nenhuma tarefa, arbustos regenerados da semente do mapa, nenhuma obra em andamento) em vez de ser recusado. Teste: salvar no meio de um gesto e carregar dá o mesmo resultado (RF-VIDA-382). | Proposto |
| RF-VIDA-418 | **Desempenho:** busca de alvo por grade espacial (já existe `buildGrid`, `forEachNear`), não varredura de todas as árvores; quadro de serviços com no máximo `JOB_BOARD_MAX` ordens por assentamento. Meta: o custo por passo não passa de 10% do atual com 20 assentamentos e 2000 NPCs (medir com a calibração). | Proposto |

#### 19.21.4 Decisões propostas (a confirmar com o Joab)

1. **Ferramenta não é exigida** (decidido pelo Joab em 25/10/2026, como no WorldBox): o NPC corta, minera e pesca sem nada, e a ferramenta só acelera. Por isso saíram o parque de ferramentas, o desgaste e o `START_TOOLS`. Equipamento visível e troca pela ficha ficam para depois (RF-VIDA-398).
2. **Peixe diminui de verdade**, só da população local e com piso sustentável (RF-VIDA-408). Recomendado.
3. **Obra presencial entra já** (decidido pelo Joab em 25/10/2026, RF-VIDA-410), com `BUILD_SECONDS` calibrado para manter o ritmo de crescimento de hoje.
4. **Pomar plantado por agricultores** (RF-VIDA-391) entra junto dos arbustos, com a tecnologia de agricultura.
5. As ferramentas de deus do jogador seguem instantâneas e sem custo (RF-VIDA-366).

#### 19.21.5 Parâmetros

Novos em `src/sim/balance.ts`, seção "Ações com presença" (valores acima são palpites para a primeira calibração): `BUSH_FRUIT_MAX`, `BUSH_GROW`, `BUSH_FOOD`, `BUSH_PICK_SECONDS`, `JOB_SLOTS`, `JOB_TIMEOUT`, `JOB_REACH`, `JOB_SNAP_SPEED`, `JOB_BOARD_MAX`, `FELL_SECONDS`, `PLANT_SECONDS`, `MINE_SECONDS`, `QUARRY_SECONDS`, `FISH_SECONDS`, `BUILD_SECONDS`, `BUILD_STAGES`, `CARRY_CAP`, `TOOL_SPEED`, `WOOD_TARGET`. Alterados: `TREE_YEARS`, `REPLANT_YEARS`, `SPROUT_RATE`, `SPROUT_FAR`, `FORAGE`. Aposentados quando o quadro de serviços entrar: `CUT_RATE`, `GATHER_RATE`, `HAUL_TILES` (a viagem real substitui o fator).

#### 19.21.6 Sequência de implementação

Cada etapa fecha com `npm test` e uma rodada de `npm run calibrar`, e não deixa o jogo pior do que a anterior.

| Etapa | Entrega | Requisitos |
|---|---|---|
| 1 | **Motor de tarefa** sem mudar o balanço: arrays por NPC, quadro de serviços, reserva de tile, progresso por `dt`, save, chave por ofício e teste de invariante ("nada muda no mapa sem tarefa concluída"). Só o corte de árvore usa, com `CUT_RATE` convertido para segundos por gesto. | 393 a 396, 402, 417, 418 |
| 2 | **Árvore presencial:** corte, plantio e limpeza de terreno por gente, corte seletivo, fator de ferramenta opcional e equipamento visual. | 397, 403, 404 |
| 3 | **Obra e conserto presenciais:** construtores batendo na casa, fases da obra, canteiro parado, calibrado para o ritmo de hoje. | 410 |
| 4 | **Rebrota mais rápida** e primeira calibração com a presença ligada. | 385, 386 |
| 5 | **Mina e pedra presenciais**, com transporte do produto. | 399, 400, 405, 406 |
| 6 | **Arbustos frutíferos e pomar:** elemento, estado, arte, coleta, fim do belisco genérico. | 387 a 392, 407 |
| 7 | **Pesca sustentável**, roça e pastoreio presenciais. | 408, 409 |
| 8 | **Ofícios de prédio, demanda por meta, janela do assentamento e acabamento visual.** | 401, 411 a 416 |

#### 19.21.7 Riscos

- **Economia travar:** hoje a produção é "grátis" de deslocamento. Trazer a viagem real vai baixar o rendimento de todos os povos de uma vez; por isso o motor entra na etapa 1 sem mudar o balanço e cada ofício é convertido com calibração própria.
- **Obra presencial muda o ritmo de crescimento:** construtor longe, sem material ou morto para a casa; `BUILD_SECONDS` precisa ser calibrado contra o crescimento medido em [CALIBRACAO.md](CALIBRACAO.md), e a aldeia de 2 pessoas tem que conseguir erguer o primeiro abrigo antes do primeiro inverno.
- **Sem a trava da ferramenta,** o desmatamento depende de presença, tempo de gesto, viagem, corte seletivo e `WOOD_TARGET`; se a calibração mostrar mata acabando, o primeiro ajuste é `FELL_SECONDS`, não uma exigência nova.
- **Muitos NPCs em poucos tiles:** reserva e `JOB_SLOTS` evitam fila infinita numa árvore, mas lenhadores sem ordem ficam ociosos; `WOOD_TARGET` os redireciona.
- **Determinismo e save:** o quadro de serviços precisa iterar em ordem estável (sem `Set`/`Map` de ordem de inserção variável) para o teste de RF-VIDA-382 passar.

---

## 20. Comunidade, assentamentos e relações (RF-AS)

> Pedido do Joab em 30/10/2026: "ainda não gosto do visual e progressão dos assentamentos, preciso que eles façam as coisas de forma mais inteligente e fluida". O plano completo (diagnóstico, princípios e metas) está no documento [Plano novo: comunidade, assentamentos e relações](https://claude.ai/artifact/FH44FCN2N3m9SBwMVPjYvj). Depois o Joab pediu todas as fases. **Situação: fases 0 a 6 implementadas** (branch `claude/project-thread-21kgi1`). Todas as constantes novas ficam em `src/sim/balance.ts`, nos blocos "Fase 1" a "Fase 5", e os pesos da jornada em `DAY_W` (`src/ai/tuning.ts`).

**Princípios**

1. **Cada coisa no mapa tem um motivo.** Lugar novo nasce de batedores que avaliam o sítio; rua nasce do passo; casa nasce de família; muralha segue as casas.
2. **Degrau é função, não só gente.** Um lugar só é vila, cidade ou metrópole quando tem as funções do degrau (celeiro, ferraria, mercado, templo, capital ou mercado regional).
3. **Gente faz, gente leva.** No lugar que está na tela nada entra no estoque sem alguém carregar; o modo agregado, fora da tela, produz o mesmo por pessoa.
4. **Relações nascem de convivência.** Afinidade, lealdade, reino e cultura vêm de casamentos, trocas, ajudas, rivalidades e distância, não de sorteio.
5. **Todo porquê na ficha.** A pessoa mostra a tarefa, o motivo e as alternativas que perderam.

### 20.1 Fase 0: medir antes de mudar

- **Indicadores novos** em `src/sim/calibrate.ts`: reinos, fração de lugares pequenos e de uma família só, lugares de vida curta, colônias, sítios, fusões, quedas de degrau, densidade e árvores no núcleo, roças perto das casas, fração com tarefa e parada, passos na rua, casamentos entre lugares, cobertura de cidade de referência, anexações, povos novos, ajudas e rivalidades. `settlementForm` mede a forma de um lugar.
- **Metas** em `LONG_TARGETS`, conferidas pela calibragem longa (`npm run calibrar:longa`, [CALIBRACAO-LONGA.md](CALIBRACAO-LONGA.md)).
- **Captura de telas** por degrau, de perto e de longe: `node tools/capture-settlements.mjs [url] [anos] [pasta]` com `npm run dev` aberto. Usa o atalho `?debug` (`window.debugEarth`) e o Playwright instalado na máquina.

### 20.2 Fase 1: nascimento e espaçamento

| Requisito | Descrição |
|---|---|
| RF-AS-01 | Família sem lugar melhor conhecido tenta sítio, colônia ou refúgio; só funda sozinha longe de tudo (`LONE_FOUND_DIST`). |
| RF-AS-02 | Sítio rural: uma casa e uma roça a 6 a 15 tiles do núcleo, ligada por trilha; sítios que juntam gente viram aldeia. |
| RF-AS-03 | Colônia com motivo: só de quem tem gente de sobra (`COLONY_SOURCE_POP`), com intervalo (`COLONY_COOLDOWN`); batedores visitam sítios e a colônia parte com enxoval visível. |
| RF-AS-04 | Nota do sítio (`siteValue`): água, terra boa, mata, pedra, plano, costa, ruína, defesa, rota, motivo e distância ideal da origem. |
| RF-AS-05 | Espaçamento pela hierarquia: 14 tiles de uma aldeia, 22 de uma vila, 30 de uma cidade. |
| RF-AS-06 | Fusão: aldeia encostada no núcleo de uma cidade do mesmo reino vira bairro. |
| RF-AS-08 | Abandono com destino: lugar minúsculo e em falta se muda inteiro, e a crônica diz para onde. |

### 20.3 Fase 2: degraus por funções e forma

| Requisito | Descrição |
|---|---|
| RF-AS-10 | Pegada orgânica: a área do lugar é a das casas com folga, não um círculo fixo. |
| RF-AS-11 e 12 | Casa no melhor lote pelo valor do solo (distância da praça, vizinhos, água, frente de rua); núcleo denso. |
| RF-AS-16 | Roças e cercados num anel em volta das casas, que anda para fora quando o núcleo cresce. |
| RF-AS-17 | Casa por família; casa vazia por `IDLE_HOUSE_YEARS` começa a cair. |
| RF-AS-18 | Muralha que segue a pegada: paliçada na vila, pedra na cidade, com portões nas ruas. |
| Degraus | Acampamento (tendas, menos de `CAMP_POP`), aldeia, vila, cidade e metrópole por `TIER_POPULATION_NEW` e funções (`tierAllowed`, `missingFunctions`); cai abaixo de `TIER_DOWN_SHARE` por `TIER_DOWN_YEARS`. A janela do lugar mostra o que falta. O porte econômico (`scale`) continua pelos limiares antigos (`SCALE_POPULATION`). |

### 20.4 Fase 3: jornadas e produção por entrega

| Requisito | Descrição |
|---|---|
| RF-AS-20 e 21 | Quadro de tarefas do lugar (trabalho, colheita, carga, obra, água, baldes, milícia) com prioridade e vagas. |
| RF-AS-22 e 25 | A pessoa escolhe a próxima jornada pelo quadro e pelas necessidades (fome, descanso, convívio, fé), com o ofício pesando muito e a urgência abrindo para todos (`chooseDay`, `src/ai/decisions/day.ts`). Tarefa cheia não é escolhida. |
| RF-AS-23 e 24 | Produção só por entrega: o que é colhido vai ao pátio e alguém leva ao celeiro com a carga na mão (`CARRY_LOAD`, carroça da vila em diante). Na virada do ano o pátio vai ao celeiro. |
| RF-AS-26 | Caminho por custo: rua e trilha baratas, roça e mato caros, casa evitada. |
| RF-AS-27 | Gesto no lugar da tarefa, com ferramenta e carga visíveis. |
| RF-AS-28 e 29 | Eventos que juntam gente: colheita coletiva, festa, enterro, alarme (milícia e abrigo), curiosos na caravana. |
| RF-AS-30 | Ficha com o porquê: tarefa, motivo e as duas alternativas que perderam. |
| RF-AS-31 | Nível de detalhe: só os lugares na tela (e o da pessoa aberta) rodam as jornadas; os outros ficam no modo agregado, que produz quase o mesmo por pessoa (teste de 60 anos, diferença menor que 5%). |

### 20.5 Fase 4: ruas pelo uso

| Requisito | Descrição |
|---|---|
| RF-AS-13 | O passo gasta o chão (`STEP_WEAR`; no modo agregado, o tráfego anual de casa à praça e de roça ao celeiro). Desgaste acima de `TRAIL_WEAR` vira trilha, acima de `ROAD_WEAR` vira rua; sem uso por `ROAD_FORGET_YEARS` some. Trilha nunca fecha bloco 2×2 de rua. |
| RF-AS-14 | Calçamento acompanha a era nas ruas que o uso abriu. |

### 20.6 Fase 5: relações entre lugares

| Requisito | Descrição |
|---|---|
| RF-AS-40 | Casamento entre lugares vizinhos quando não há par em casa. |
| RF-AS-41 | Memória de origem: quem se muda guarda o laço com o lugar de onde veio. |
| RF-AS-42 | Visitas visíveis de parentes, mascates e peregrinos. |
| RF-AS-43 | Afinidade entre pares de lugares, de −100 a 100, de parentes, trocas, fé, povo, rivalidade, rancor, ajuda e festas. |
| RF-AS-44 | Cidade de referência de cada aldeia e vila, por distância, tamanho e afinidade. |
| RF-AS-45 | Ajuda na fome e dívida: quem ajuda ganha afinidade e cobra depois; quem recusa perde. |
| RF-AS-46 | Rivalidade por mata, pasto ou jazida comum. |
| RF-AS-47 | Casamento de líderes e festas com convidados aproximam os reinos. |
| RF-AS-48 | Degrau político: livre, chefia, reino (cidade capital e 3 leais) e império (`polityOf`). |
| RF-AS-49 e 50 | Lealdade por afinidade, comércio, proteção, distância, carga e cultura; lugar desleal muda de lado ou se revolta (substitui a independência só por distância). |
| RF-AS-51 | Capital que se move para a cidade bem maior por muitos anos. |
| RF-AS-52 | Deriva cultural de lugares isolados até um povo novo. |
| RF-AS-53 | A diplomacia puxa a relação entre reinos para a média das afinidades entre os lugares deles. |

### 20.7 Fase 6: visual

Tendas no acampamento, muralhas e portões, trilhas de desejo meio apagadas, cargas na mão (cesto, feixe, pedra, minério, balde), gesto com ferramenta, caravanas de visita e de colonos, nome do degrau e do degrau político no rótulo e na janela, aba de relações (cidade de referência, lealdade, dívidas e afinidades) e a linha da jornada na ficha (🧭).

### 20.8 Resultado medido e metas fora

Ver [CALIBRACAO-LONGA.md](CALIBRACAO-LONGA.md) (3 sementes, 1000 anos). Pontos que ficaram fora da meta estão listados lá, com o que mexer.

---

## 21. Bioma e sociedade

> 31/10/2026. O bioma em volta de cada lugar decide o que a terra dá, quando dá, quanto do que se guarda estraga, que bicho vira rebanho e como o povo vive. O código: a tabela `BIOME_YIELD` e o modo de vida em `src/sim/biomeYield.ts`, a parte `eco/economy/biome.ts` do `Ecosystem`, a domesticação em `src/sim/species.ts` (`meetsDiamond`, `herdFormsOf`) e os números em `src/sim/balance.ts`, seção "Bioma e modo de vida".

### 21.1 Como o bioma entra na economia

- **Média da área.** Uma vez por ano, cada lugar refaz a média da tabela sobre o território (`Village.area`, `areaYield`, um tile a cada dois, sem sorteio). A mata cortada vira planície e passa a render como ela, então o desmatamento muda a média com o tempo.
- **Roça.** A colheita multiplica pela roça média da área; com irrigação, pela roça irrigada (o oásis no deserto, o arrozal no pântano). Cada tile ainda leva a estação de crescimento pela temperatura (`growingSeason`: plena acima de 9 °C, quase nada abaixo de −7 °C), o que encurta a roça na tundra e na taiga desmatada.
- **Rebanho, pesca e lenha.** O leite, a carne e a lã de cada cabeça multiplicam pelo pasto médio; cada peixe da rede, pela pesca da beira; cada árvore derrubada, pela lenha da mata (a média só conta os tiles com mata).
- **Estações.** A colheita, a coleta e a lenha do inverno seguem uma amplitude que cresce com a latitude (0,8 no equador a 1,6 no polo, até 1,25) e com o bioma. Com amplitude 1 vale o vetor de base (`SEASON_HARVEST`, `SEASON_FUEL`), que é o que acontece perto da latitude 0,25; mais perto do polo a safra se concentra no outono e o inverno queima mais lenha. O ano soma o mesmo: muda a época.
- **Perecimento.** A comida guardada estraga pela média do bioma (o frio e o seco conservam; nenhum bioma estraga mais que a base) e, no inverno abaixo de 0 °C, o celeiro congela (`FROZEN_SPOIL`). É o motivo de armazenar no frio.
- **Escala.** 1 é a terra comum, onde vive quase todo o povo da Terra do jogo (mata e campo do clima quente ou temperado): o bioma redistribui a comida em vez de cortá-la.

### 21.2 O que cada bioma dá

| Bioma | Roça (irrigada) | Pasto | Pesca | Estação | Perecimento | Lenha | Cultivo | Modo de vida típico |
|---|---|---|---|---|---|---|---|---|
| Planície | 1,45 (1,6) | 1,35 | 1 | 1 | 1 | 0,7 | trigo | Sedentário; intensivo com técnica e gente apertada (a melhor roça e o melhor pasto) |
| Savana | 1,15 (1,3) | 1,25 | 0,9 | 1 | 1 | 0,8 | sorgo e milhete | Sedentário, de pasto e roça; intensivo com irrigação |
| Floresta temperada | 1,05 (1,15) | 1 | 1 | 1 | 1 | 1,25 | cevada | Sedentário, de lenha farta; a roça melhora com o desmatamento |
| Floresta tropical | 1 (1,1) | 0,95 | 1,1 | 0,8 | 1 | 1,1 | mandioca | Sedentário, a terra comum |
| Pântano | 0,95 (1,4) | 0,85 | 1,25 | 0,8 | 1 | 0,9 | arroz | Sedentário de pesca; irrigado, vira arrozal |
| Praia | 0,7 (0,85) | 0,75 | 1,25 | 0,8 | 1 | 0,6 | coco e mandioca | Sedentário de pesca; o porto adensa a costa |
| Taiga | 0,6 (0,65) | 0,7 | 1,15 | 1,15 | 0,75 | 1,15 | centeio | Sedentário de lenha e pesca, com roça curta pelo frio |
| Manguezal | 0,45 (0,65) | 0,4 | 1,45 | 0,8 | 1 | 0,8 | arroz | Pesca; nômade quando a roça da área não basta |
| Rocha | 0,4 (0,45) | 0,7 | 0,9 | 1,1 | 0,85 | 0,7 | centeio | Pedreira e minas; no limite entre nômade e sedentário |
| Montanha | 0,25 (0,35) | 0,6 | 0,85 | 1,15 | 0,7 | 0,9 | batata nos terraços | Minas e cabras; pouca roça; defende quem mora no alto |
| Tundra | 0,2 (0,2) | 0,75 | 1,25 | 1,25 | 0,55 | 0,5 | — | Nômade de caça e pesca, estação curta, guarda o que tem |
| Deserto | 0,15 (1) | 0,55 | 0,85 | 0,8 | 0,75 | 0,4 | tâmara | Nômade de pasto (camelo, cabra); só o oásis irrigado planta |
| Penhasco | 0,2 (0,25) | 0,45 | 0,9 | 1 | 0,85 | 0,6 | — | Pouca roça; quase sempre é a borda de uma área maior |
| Solo estéril | 0,05 (0,5) | 0,25 | 0,75 | 0,9 | 0,85 | 0,4 | — | Nômade |
| Geleira, gelo, mar e lava | 0 | 0 a 0,1 | 0,5 a 1,2 | 1 a 1,25 | 0,4 a 1 | 0 | — | — |

A roça da tabela ainda é cortada pela estação de crescimento de cada tile, e a coluna "modo de vida típico" é o que `lifewayFor` costuma dar com a roça do bioma; quem decide de fato é a média da área, a técnica e a densidade.

### 21.3 Modo de vida (`Village.lifeway`)

| Modo | Quando (`lifewayFor`, com histerese) | O que muda |
|---|---|---|
| Nômade | Roça da área abaixo de 0,4 (`NOMAD_FARM`) e menos de 4,5 moradores por 100 tiles do território (`NOMAD_DENSITY`) | Não planta: as roças que tinha voltam a ser campo. Quando a vegetação da área cai abaixo de 45% do que ela aguenta (`NOMAD_FORAGE`), a coleta esgotada entra na falta (`scarcity`) e as famílias mudam o acampamento pelo caminho de sempre (migração, êxodo e última leva). Capta 1,5 vez mais longe |
| Sedentário | O resto | Roças, rebanho e pesca como sempre |
| Intensivo | Arado, irrigação ou moinho, roça da área a partir de 0,7 e 5 ou mais moradores por 100 tiles | Cada roça leva 1,5 vez mais braços (`INTENSIVE_HANDS`) e rende 15% mais (`INTENSIVE_YIELD`). Capta 0,8 do alcance |

O lugar nasce sedentário e o modo é refeito uma vez por ano; a mudança vai para a crônica. `lifewayOf(v)` e `catchmentOf(v)` são os getters para a nota do sítio. Saves antigos carregam todos os lugares como sedentários.

### 21.4 Técnica, rebanho, comércio e guerra

- **Boserup.** A fome puxa a descoberta das técnicas que intensificam (domesticação, arado, irrigação, moinho e moinho d'água): a taxa multiplica por 1 + 2 × (1 − parte dos moradores que comeu bem). Só a fome extrema (menos de 15% comendo bem) trava. As outras técnicas continuam paradas com o atendimento de comida abaixo de 0,4.
- **Trava local.** Aprender com o vizinho ou com os mercadores pede a condição material do próprio lugar. A era e a experiência de forja contam as peças do lugar; o comércio traz peças (cada ferramenta, arma ou armadura de metal que chega conta meia peça do metal de quem a forjou). Ver a tabela 9.2.
- **Domesticação (Diamond).** Só vira rebanho quem come capim, tem porte de curral (25 a 1.200 kg), fica adulto em até 4 anos, vive em manada de 6 ou mais, não entra em pânico com facilidade e não é bravo. Na Terra: o bisão vira gado, a cabra-montesa cabra ou carneiro, o camelo e a lhama camelo, o cavalo selvagem das estepes cavalo; a zebra, o elefante, o cervo, o javali e a rena ficam de fora. O lugar só domestica o que vive na sua região (o território mais 20 tiles), e o tipo do rebanho é o que a fauna local dá: a vocação e o clima preferem, mas não inventam o bicho.
- **Preço por utilidade.** O minério que o lugar não sabe fundir, o carvão sem siderurgia, o barro sem cerâmica e a lã sem tear valem 40% do preço; o bronze perde para o ferro depois da siderurgia, e o carvão vale mais com o vapor.
- **Defesa e densidade.** Quem luta no próprio território vale mais no alto e no acidentado (até +50% na serra). O porto abriga 3 + era moradores, e a costa com porto fica mais densa.
- **Vocação.** A amostra do lugar para a vocação conta só as jazidas que o reino conhece.
