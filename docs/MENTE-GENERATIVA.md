# Mente generativa: do sobrevivente ao povo

Documento técnico · 19/11/2026

A proposta "Mente generativa: do sobrevivente ao povo" troca a lista de comportamentos escrita à mão por uma pessoa com corpo, olhos, necessidades e memória, que gera o que pensa em fazer. Este documento diz o que já está no código, onde, como rodar e o que ficou de fora.

O modelo novo entra **atrás de uma opção**. Sem ela, o mundo é o de sempre: a impressão digital (`fingerprint.calib.ts`) não mudou.

## Como abrir e medir

| O quê | Como |
| --- | --- |
| No jogo | `/?mente=generativa&debug` num planeta novo: 60 pessoas espalhadas, só com o instinto, nenhuma vila. Um save feito assim continua generativo ao carregar; um save antigo continua como era |
| Num teste ou script | `seedPlanet(params, seed, undefined, { espalhados: 40 })` ou `createEngine(map, { seed, species, generativa: 40 })` |
| Sonda por semente | `npx vitest run --config vitest.calib.config.ts src/sim/generativa/sonda.calib.ts --reporter=default` (variáveis `SEEDS=42,7,3 ANOS=300 GENTE=40`). Mostra a população ano a ano, as causas de morte, o que as pessoas fazem e sentem, o retrato dos agrupamentos e as primeiras vezes |
| Testes | `npx vitest run src/sim/generativa src/sim/observador src/client/surface/debugMente.test.ts` |

## O que a pessoa tem

Tudo fica em `src/sim/generativa`.

| Parte | Arquivo | O que é |
| --- | --- | --- |
| Corpo | `tipos.ts` (`VERBOS`, `VERBO`) | 23 verbos atômicos: andar, olhar, pegar, largar, carregar, comer, beber, dormir, descansar, abrigar, cavar, cortar, bater, fugir, seguir, falar, mostrar, dar, pedir, empilhar, acender, cuidar, acasalar. Cada verbo declara só o tempo, o esforço e o gesto |
| Olhos | `fisica.ts` (`genTagsDoTile`, `genTagsDaCoisa`, `genTagsDaPessoa`), `mente.ts` (`genPerceber`) | Tags com intensidade em tudo: o tile (comível, água, madeira, galho, sombra, pedra, alto), os montes postos por gente (guardado, abrigo, fogo, quente, planta, meu, de outro), as pessoas (parente, filho, bebê, par, estranho, carrega comida, armado, forte, ferido, com fome, seguido por muitos, dormindo), os bichos (carne, perigoso, fugidio). Vê mais longe no alto, menos no mato fechado e à noite |
| Necessidades | `mente.ts` (`genSentir`, `genUrgencias`) | 13: fome, sede, sono, cansaço, frio, calor, dor, medo, solidão, tédio, apego, respeito, sentido. Cada uma sobe e desce pelo que acontece com o corpo; os traços mudam o peso |
| Memória | `crencas.ts` | Crenças esparsas (verbo, tag) → efeito esperado em cada necessidade, com confiança e origem (instinto, vivido, visto, ouvido, herdado, de quem e quando). Lugares lembrados. Atos à espera de resultado |

O **instinto** (`INSTINTO` em `crencas.ts`) é o que todo mundo tem ao nascer: comer o comível, beber água, dormir, descansar, fugir do perigoso, ficar perto de gente, acasalar com um par, cuidar do filho, carregar o bebê, pedir ao parente, e o custo de bater nos seus. Todo o resto é aprendido.

## Gerar e pontuar (`genPensar`)

1. **Perceber**: uma lista de perceptos (onde está, a mão, os melhores tiles à vista, montes, gente, bichos, carcaça, lugares lembrados, dois rumos desconhecidos).
2. **Gerar**: cada verbo que cabe fisicamente em cada percepto (`genCabe`) é uma opção. O que cabe é só o que o corpo consegue; o que vale a pena é a crença que diz.
3. **Benefício esperado**: a soma, por necessidade, de urgência × alívio que a crença promete, limitado ao que dói agora, mais o que as lentes acrescentam com o contexto, mais o que a pessoa espera conseguir **depois** (até três passos, pelo que ela aprendeu que cada ato deixa na mão ou à vista).
4. **Corte**: as K melhores pelo benefício (8 perto da tela, 5 longe) viram Behaviors do IAUS. As outras ficam só para o debug.
5. **Considerações geradas** (uma barra cada no debug): benefício, confiança (crença fraca vale menos; o curioso desconta menos), custo (distância, tempo, colo e gravidez), risco (perigo em volta do alvo, pesado pelo medo e pela coragem), variar (o `TimeSinceThisContext` do IAUS) e jeito (o traço que pesa no verbo).
6. **O IAUS escolhe**: `CerebroGen` estende o `Brain` e só troca a lista de decisões. Multiplicação, compensação, foco e sorteio entre as melhores são os de sempre.

O novo distrai: o que a pessoa nunca fez vale um pouco contra o tédio. É por aí que alguém satisfeito experimenta. O desconhecido vale uma fração do melhor que ela sabe fazer com uma coisa que não está à vista (`GEN.esperanca`): quem não acha par, água ou comida acaba saindo, sem regra de migrar.

## O efeito fica no mundo (`genEfeito`)

Nenhum efeito está num comportamento. Alguns exemplos do que a física faz:

- Comer do tile tira o que havia para comer ali, e o mato leva 18 anos para rebrotar. Comer fruta da mão às vezes deixa uma semente.
- Largar o que se tem na mão cria (ou aumenta) um **monte** no tile. O que o monte oferece sai do que ele tem: galhos, pedras e troncos bastantes cobrem alguém (abrigo); comida num monte é comida guardada, que estraga; a fruta que apodrece em terra boa deixa semente; semente na terra vira planta em 2 anos.
- Pedra batida em pedra, com pedra na mão, solta uma lasca. Com lasca, cortar uma árvore dá tronco e galhos, e cortar uma carcaça dá mais carne.
- Bater num bicho pode matá-lo (mais com lasca e com gente junto); bater numa pessoa a fere, faz ela largar o que carrega e azeda o laço, também com quem viu.
- Acasalar exige que o outro também queira. A gravidez dura 0,75 ano, gasta mais energia e deixa a mãe mais lenta. O bebê não anda, mama de quem cuida (a energia sai de quem cuida) e pode ser levado no colo. O filho nasce onde a mãe está, em qualquer lugar.
- Bicho bravo ao lado de quem está sozinho e sem fogo pode morder.
- Ao pé de algumas árvores há um tronco caído, que só pode ser levado uma vez. **Quem segura um tronco boia**: entra na água, anda por ela devagar e sai em qualquer terra onde dê pé (`genFlutua`). De mãos vazias a água continua sendo parede. Na água não dá para largar o tronco nem dá-lo a ninguém.
- Dar a quem mete medo, e ele aceitar, acalma quem deu, e o desafeto cede dos dois lados. Bater em quem se gosta dói em quem bate, na medida do laço: é o que faz um presente aceito proteger quem deu.
- Os galhos de um monte apodrecem devagar (3% ao ano). O abrigo que ninguém mantém vai sumindo; pedra e tronco ficam, como ruína.
- Estar onde já se viveu bem é um fato do contexto (`lugarMeu`), e o que se tem na mão também (`mao:tronco`). É deles que pode nascer o gosto de ficar e de voltar, ou a travessia.

Não há nenhum limiar social. Os únicos limiares são do corpo (tantos galhos cobrem uma pessoa).

## Aprender (`genFim` e `crencas.ts`)

- **Viver**: depois do ato, a pessoa compara o que sentia antes e depois e corrige a crença (regra delta repartida pelas tags do alvo; a confiança sobe com a repetição). Uma surpresa grande fica marcada na linha do tempo.
- **Resultado que chega depois** (`lembrarAto`, `creditar`, `vencer`): quem mexeu numa coisa e nada veio na hora guarda o ato. Se depois essa coisa render (comer do monte onde largou comida, dormir no monte onde empilhou galhos, comer a planta onde largou semente, receber de quem ajudou), o ato antigo leva o crédito. Se nada vier em 6 anos, a aposta se perde e a crença encolhe. É assim que largar comida vira guardar e largar semente vira plantar, sem ninguém escrever "guardar" ou "plantar".
- **Ver**: os dois mais perto e acordados aprendem um pouco do que viram (`GEN.visto`).
- **Ouvir**: falar passa uma crença, uma lente ou um hábito que o outro não tem, com ruído, pesado pelo laço (`contar`).
- **Herdar**: o filho começa com metade das crenças e lentes dos pais, menos certas (`herdar`).

## Hábitos e lentes

- **Hábito** (`encadear`): quando um ato que não rende por si, mas deixa algo na mão ou à vista, é seguido de um que rende, o par (ou o trio) conta um ponto. Com três, vira uma opção só, com efeito próprio, executada passo a passo. Se falha, perde força e some. O nome que aparece é montado dos verbos e tags.
- **Lente** (`contextualizar`): a surpresa de cada verbo é separada por "havia tal tag por perto ou não". Quando os dois lados têm amostras e a diferença é maior que o ruído, nasce uma lente: condição (a tag), verbo e efeito, sem nome. Quando a diferença some, a lente some. Lentes ouvidas e herdadas sem conta própria enfraquecem com o tempo.

## O nome não manda

| Garantia | Onde |
| --- | --- |
| Mão única | `src/sim/observador` (nomes, retrato, pessoa) só lê o mundo. `fronteira.test.ts` falha se algum arquivo da simulação o importar (foi provado com três formas de import) |
| Ligado ou desligado dá o mesmo mundo | `mundo.test.ts` roda a mesma semente com todas as leituras do observador a cada ano e sem nenhuma, e exige a mesma impressão (`impressaoGen`: o mundo mais tudo o que as pessoas sabem) |
| Nenhum agrupamento guardado | `MundoGen` (em `tipos.ts`) guarda pessoas, coisas e o mato colhido. O `retrato` agrupa pela proximidade a cada leitura, fora do mundo. `fronteira.test.ts` confere que o estado não tem campo de categoria |
| Nada trava | Lentes e hábitos somem quando deixam de render; apostas vencem; nenhum estado marca fase |
| Nome só na tela | `nomeDoAto`, `nomeDaLente`, `nomeDoHabito` montam o texto do conteúdo na hora de mostrar |

No mundo generativo, o que fundava vila por regra está desligado: `populate` não semeia aldeias, o evento "povo nômade" traz gente (sem aldeia), a ferramenta de introduzir solta pessoas, e quem não mora num lugar não passa pela regra de `loner` nem pela taxa de nascimento de `decide.ts`.

O painel não usa nenhuma palavra de categoria, como recomendado na proposta.

## Debug (com `?debug`)

| Onde | O que mostra |
| --- | --- |
| Ficha da pessoa | O que faz agora, por que (as necessidades que o ato atende e de onde veio a crença), as outras ideias, o que sente, quantas coisas sabe, lentes e hábitos |
| Painel F3, aba **Mente** | As opções geradas agora com a nota e uma barra por consideração e por necessidade, lentes e encadeamento à parte, as cortadas esmaecidas e quanto faltou para as outras; necessidades com a urgência; lentes e hábitos com origem e data; linha do tempo do esperado contra o real, com as surpresas; a tabela de crenças com origem; o que percebe; os lugares de que lembra. Botões: avançar 1 pensamento, guardar para comparar duas pessoas lado a lado, exportar em JSON (a pessoa ou todos) |
| Painel F3, aba **Coletivo** | O mundo numa linha; os agrupamentos de agora com as medidas (quanto se movem, noites no mesmo lugar, quantos seguem a mesma pessoa, quanto deram e quanto disso foi para a mesma pessoa ou para fora, quanto tomaram e bateram, desafetos com gente de fora e entre si, travessias de água, quantos têm lasca na mão, abrigos, fogos, comida guardada e plantas em volta, lentes e hábitos mais comuns); as primeiras vezes vistas; o que se sabe, e a difusão de cada crença ou lente (quem tem, quando aprendeu, de quem, a primeira pessoa marcada) |
| No mundo, com a aba Coletivo aberta | O contorno de cada agrupamento de agora com quantos são, uma seta de quem segue para quem é seguido, a trilha de cada pessoa nos últimos anos e, escolhida uma crença ou lente, um ponto em quem a tem (anel na primeira pessoa, cor pela origem) |
| No mundo | Com uma pessoa fixada: o raio de percepção, um ponto em cada coisa percebida (com as tags, de perto) e a linha até o alvo na cor da necessidade atendida |

Tudo passa pela fachada (`engine.debug.mente`, `coletivo`, `difusao`, `mapa`, `exportarMentes`), como dado puro.

## Longe da tela

O mesmo modelo roda em qualquer distância. Longe (fora da vista da câmera, ou sem câmera, como nos testes) ele é mais grosso em três coisas:

- **Pensa mais devagar.** Um pensamento vale por 2,5 s: as ideias que sobraram dele, e que ainda cabem, são feitas em ordem, sem perceber nem gerar de novo (`fila` em `genPensar`). Só o mato é conferido outra vez, porque é o que mais muda em poucos segundos. Na sonda, a fila poupou pouco mais da metade dos pensamentos.
- **Percebe mais grosso.** O terreno é olhado de dois em dois tiles, e entram no máximo 3 pessoas além dos seus.
- **Leva menos opções ao IAUS.** 5 em vez de 8.

Nada do mundo de vilas roda no mundo generativo, perto ou longe: não há Decisor anual, fundação, colônia, reino, guerra, caravana nem barco. `mundo.test.ts` roda 20 anos (8 com a câmera em cima de alguém e 12 sem) e exige que nenhum evento desses seja emitido.

## O que a sonda mostrou

Três sementes (42, 7 e 3), 40 pessoas no começo, 200 anos, na Terra dos testes, sem câmera (tudo no detalhe de longe):

| Semente | Pessoas no ano 100 | Pessoas no ano 200 | Montes que abrigam | Plantas de semente largada | ms por passo |
| --- | --- | --- | --- | --- | --- |
| 42 | 62 | 49 | 2 | 27 | 6,6 |
| 7 | 102 | 125 | 0 | 38 | 8,8 |
| 3 | 94 | 94 | 0 | 34 | 8,3 |

- A população não explode nem some. A maioria morre de velhice; a fome mata de 17 a 28 pessoas em 200 anos.
- Sem ninguém escrever, apareceram em tempos variados: um lugar onde alguém viveu bem muitas vezes (anos 7 a 12), alguém dando algo a alguém (anos 12 a 23), planta nascida de semente largada (ano 18, na 42), alguém tomando algo da mão de outro (anos 18 a 36), alguém carregando um tronco (anos 6 a 31), uma árvore derrubada com lasca (ano 32, na 42) e **uma travessia de água agarrado a um tronco** (na semente 3).
- Os abrigos agora são poucos, porque os galhos apodrecem: sem manutenção, o monte deixa de cobrir.
- Não apareceu chefia nem tributo: ninguém seguia ninguém na hora da leitura, e do que as pessoas deram por último, no máximo um terço foi para a mesma pessoa.
- Nenhuma vila surge por regra (`eco.villages` fica vazio).

Esses números são observação, não meta: nenhum teste exige um resultado com nome.

**Desempenho.** O mundo sem gente custa de 4 a 6 ms por passo nessa Terra. Com 49 a 125 pessoas no detalhe de longe o passo ficou entre 6,6 e 8,8 ms, ou cerca de 0,03 ms por pessoa por passo. Antes da fila eram de 0,04 a 0,06 ms. Perto da tela cada pessoa pensa a cada ato e custa mais (um pensamento custa perto de 0,3 ms).

## O que ficou de fora

A proposta tem nove fases. No **mundo generativo** as nove estão cobertas pelo modelo. O que não foi feito é apagar o mundo de vilas, que continua sendo o padrão do jogo.

| Fase | Situação |
| --- | --- |
| 1. Ver antes de mudar | Parcial. O debug novo foi feito para a mente generativa. A mente de hoje continua com a ficha que já tinha |
| 2. Física de tags e verbos | Feita |
| 3. Gerador e instinto | Feito. Vale para todos no mundo generativo. O pacote 45 (andarilho) é do PR #57, que não está na `development`: nada foi trocado nele |
| 4. Aprender | Feito: experiência, imitação, conversa e herança |
| 5. Nascer fora da vila e começar sem vilas | Feito, atrás da opção |
| 6. Hábitos e lentes | Feito. As lentes ainda são poucas (menos de uma por pessoa) e algumas são coincidência de poucas amostras, que o tempo desfaz |
| 7. Bandos, migração e assentamento sem estado de vila | Feito no mundo generativo: não há estado de vila nem de bando. Há montes, abrigos que apodrecem sem manutenção, comida guardada, plantas e lugares onde se viveu bem. Os agrupamentos, as trilhas e quem segue quem só existem no observador |
| 8. Longe da tela | Feito no mundo generativo: o mesmo modelo, mais grosso, e nenhuma regra de fundação, colônia ou reino roda nele |
| 9. Estruturas grandes | A física está feita e testada (dar, pedir, tomar, bater, apaziguar, seguir, "seguido por muitos", tronco que boia), e o retrato tem as medidas. Do que podia surgir, a sonda viu travessia, tomar e derrubar árvore com lasca. **Não viu chefia nem tributo** em 200 anos com 50 a 125 pessoas |

**O mundo de vilas não foi apagado.** As fases 7 e 8 pedem, no fim, desmontar a máquina de vila (celeiro, casas, ofícios, os pacotes 35 a 44) e tirar o Decisor anual, `founding.ts`, `colonies.ts` e `polity.ts`. Isso só faz sentido de uma vez (a vila sem as regras fica parada), e hoje significaria trocar um jogo com cidades, reinos, guerra e comércio por um em que, depois de 200 anos, há algumas dezenas de pessoas, plantas e um ou outro abrigo. A própria proposta condiciona a saída das regras a o modelo novo cobrir o que elas faziam, e ele ainda não cobre. Apagar também derruba a maior parte dos 700 testes, a calibração e as janelas de assentamento e de reinos. Fica como decisão de produto, a tomar quando o mundo generativo produzir estruturas grandes.

Outras limitações conhecidas:

- O ciclo de estações não entra na comida: o ano dura 6 s e uma refeição leva mais que isso, então a estação não chegaria a ser sentida. Quem empurra para longe é o mato colhido.
- Os cérebros não vão no save (como os da aldeia): ao carregar, cada pessoa recomeça o ato em que estava. O que ela sabe vai no save.
- O sexo sai do uid (o motor não guarda um), e o pai só é conhecido na hora do nascimento.
- `src/core/boundary.test.ts` (a catraca das leituras do cliente) já falha na `development` (346 linhas contra 341) antes desta mudança. O PR #57 corrige isso.
