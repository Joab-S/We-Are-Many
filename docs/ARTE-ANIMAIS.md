# Padrão dos animais

Todo bicho é desenhado de lado, virado para a direita, sem contorno, no mesmo tamanho de pixel da pessoa (16x18). Os bichos de cada família saem de um molde comum.

## O que todos têm em comum

- **Tons:** `D` é o dorso, mais escuro; `A` é a cor base; `a` é a sombra embaixo e nas patas do fundo; `B` é a garganta, a barriga e a ponta do rabo, mais claros; `K` são os cascos, as patas, as pontas das orelhas e os detalhes escuros. O contraste entre `D`, `A` e `a` é suave.
- **Olho:** 1 pixel `E`, na lateral da cabeça, logo atrás do focinho e uma linha abaixo da orelha. Nunca fica no meio da testa nem encostado na borda de cima.
- **Nariz:** 1 pixel escuro na ponta do focinho, na linha abaixo do olho.
- **Patas:** 1 pixel de largura, as quatro separadas. As de perto ficam na cor `A` e as do fundo em `a`, uma coluna atrás. Bichos pesados usam 2 pixels.
- **Rabo:** sai da anca, afina na ponta e tem o dorso escuro e a ponta clara.
- **Altura:** o cavalo, o camelo e a lhama passam um pouco da pessoa; o lobo e o cervo ficam na altura do peito; o coelho e a galinha, na do joelho.

## Moldes

| Família | Bichos | Molde |
|---|---|---|
| Caçadores de 4 patas | lobo, raposa, hiena, onça, leão | Corpo comprido de 4 a 5 linhas, costas retas ou caindo para trás (hiena), patas com 5 linhas, cabeça de 4x4 erguida na frente, orelha em ponta, focinho de 2 a 3 pixels. Felinos têm o focinho curto e o rabo fino; o leão tem a juba em volta da cabeça e do pescoço, e um tufo no fim do rabo |
| Cascos de pescoço alto | cervo, rena, íbex, cabra, lhama, camelo | Corpo de 4 linhas, pescoço de 2 a 3 colunas subindo da frente do peito, cabeça de 3 a 4 colunas, garganta clara, patas com 4 a 6 linhas, rabo curto. Os chifres e a corcova mudam; o resto é o mesmo |
| Cascos de cavalo e gado | cavalo, burro, zebra, vaca, bisão, ovelha | Corpo de 5 a 6 linhas, com anca e cernelha um pouco mais altas que o meio das costas e a barriga caindo no meio. Pescoço inclinado (cavalo) ou curto e na altura do ombro (gado). Crina escura no cavalo; listras na zebra; manchas, chifres curtos e úbere na vaca; juba escura na frente do bisão; lã com cachos na ovelha |
| Pesados | urso, javali, elefante, mamute | Corpo arredondado e alto, patas de 2 pixels, cabeça baixa e para a frente. Corcova nos ombros do urso, cerdas no dorso do javali, orelha grande e tromba no elefante, pelo comprido e presas curvas no mamute |
| Pequenos e aves | coelho, macaco, galinha, abutre, pinguim | Cabeça grande para o corpo, olho bem visível |
| Rasteiros | crocodilo, tartaruga, cobra, sapo, besouro, caranguejo | Baixos e compridos. O crocodilo tem um terço de cabeça, um terço de corpo e um terço de rabo, que afina até a ponta, com as patas curtas e abertas |
| Água | baleia, piranha, tartaruga marinha, lula | Corpo em forma de torpedo, dorso escuro e barriga clara. A baleia tem a cabeça grossa na frente, a cauda em forquilha atrás, a nadadeira peitoral embaixo e as pregas na garganta |

## Ao desenhar um bicho novo

1. Escolha a família e copie o molde de um parente.
2. Mude só o que é da espécie: chifre, corcova, juba, orelha, manchas e cores.
3. Confira ao lado da pessoa e de um parente na mesma prancha: tamanho, linha das costas, altura das patas e posição do olho.
4. Coloque o desenho em `ANIMAL_ART` (`src/client/surface/animalArt.ts`), com as letras acima na paleta própria. As animações saem sozinhas do desenho.

## Animações

Os quadros são gerados a partir do desenho parado, em `animalArt.ts`:

- **Parado:** o corpo desce 1 pixel e volta (respira); as patas ficam.
- **Andando:** 4 quadros em trote. A pata de trás de perto vai junto com a da frente do fundo, e o outro par depois. Aves alternam os dois pés. Quando a detecção automática das patas erra (bichos pesados), `LEGS` diz as colunas de cada pata.
- **Comendo:** a cabeça desce e o pescoço dobra, em 2 quadros.
- **Nadando e rastejando:** a cauda (água) ou a metade de trás (cobra) sobe e desce.
- **Dano e morte:** pisca em vermelho, fica preto e vira uma elipse preta deitada, do comprimento do corpo. Nunca de patas para cima.
- **Carcaça:** é o que sobra de um bicho morto, não um bicho. Não toma dano, não morre e não anda.

## No jogo

- Os nomes dos quadros são `an:bicho:n:quadro` (Terra) e `an:bicho:x:quadro` (alienígena). No alienígena, o corpo (`A`, `D`, `a`, `B`) vira as marcas da cor da espécie.
- A escala é a da pessoa: um pixel do desenho vale um pixel da pessoa (`HUMAN_H / 18`). O tamanho de cada bicho está no próprio desenho.
- Dentro do cercado, o rebanho fica em 55% do tamanho, para caber no desenho do cercado.
