# Padrão da natureza

Árvores, arbustos, pedras e veios seguem o mesmo padrão dos bichos e das pessoas (`docs/ARTE-ANIMAIS.md`): sem contorno, 4 a 5 tons por material, luz vinda de cima à esquerda e o mesmo tamanho de pixel da pessoa (18 linhas em 1,5 tile, ou 12 pixels por tile). Os desenhos ficam em `src/client/surface/natureArt.ts`.

## Tons

- **Copa:** `O` é a sombra mais funda, `D` a sombra, `A` a base, `L` a luz e `H` o brilho.
- **Casca:** `T` clara, `t` base e `U` escura. A bétula tem a casca branca com marcas escuras.
- **Pedra:** `h` é o brilho da borda de cima, `R` o topo, `G` a frente, `g` a sombra e `n` a junta entre os blocos.
- **Veio de minério:** `1`, `2` e `3` são as marcas da cor do minério (escura, base e clara), trocadas pela cor de cada minério na hora de desenhar.

## Moldes

| Família | Desenhos | Molde |
|---|---|---|
| Folha larga | carvalho, árvore copada, bétula, árvore no outono, árvore da selva | Copa feita de tufos redondos. Cada tufo tem uma borda de luz em cima à esquerda, uma de sombra embaixo à direita e a base bem escura; o tufo da frente faz sombra no de trás. Borda da copa um pouco recortada, com pontinhas de folha. Tronco de 2 a 3 pixels, claro à esquerda |
| Coníferas | pinheiro, pinheiro baixo, pinheiro com neve | Camadas em saia, a de baixo mais larga e com a borda recortada. Lado esquerdo claro e direito escuro; a camada de cima faz sombra na de baixo. A neve fica em cima de cada camada |
| Secas e quentes | acácia, palmeira, árvore seca, cactos | A acácia tem a copa achatada sobre galhos abertos; a palmeira, tronco curvo e folhas em arco; o cacto, uma faixa clara à esquerda e pontos de espinho |
| Arbustos | arbusto, arbusto alto, moita, de frutinhas, florido, seco, capim | O mesmo molde da copa, em tufos menores e com a sombra mais fina. Frutas e flores são pontos de 1 pixel com um tom mais escuro embaixo |
| Pedras | pedra, pedras empilhadas, rochedo, seixos, veio | Blocos arredondados empilhados, o topo claro com brilho na borda e a junta escura entre um bloco e outro |

## Tamanho

A árvore tem de 2 a 3 tiles de altura, um pouco mais que a pessoa. Por isso a árvore da frente cobre parte da de trás, e quem passa atrás dela fica escondido.

## No jogo

- **De perto** (zoom de 8 pixels por tile em diante), a natureza vira sprite e entra na mesma ordem de profundidade das pessoas e dos bichos: quem está mais ao fundo é desenhado antes e fica coberto.
- **De longe**, o mesmo desenho é pintado no chão, reduzido, sem a ordem de profundidade (mais leve).
- **Variedade:** o enfeite do tile (`Decor`) diz a família, e um sorteio fixo por tile escolhe o desenho. No outono parte das árvores de folha larga fica laranja, e no inverno e na tundra os pinheiros têm neve. Capim, arbustos e seixos aparecem por sorteio nos tiles sem enfeite, só para enfeitar (a simulação não os vê).
- **Árvore meio transparente:** só quando a câmera segue alguém escondido atrás dela e o zoom está alto (14 em diante). A árvore fica em xadrez e quem é seguido aparece por cima.

## Ao desenhar um novo

1. Escolha a família e parta do desenho de um parente, com os mesmos tons.
2. Confira ao lado da pessoa: a árvore passa da cabeça, o arbusto fica na altura do joelho ou da cintura.
3. Coloque o desenho em `NATURE_ART` e, se for de um enfeite do mapa, a escolha em `natureAt`.
