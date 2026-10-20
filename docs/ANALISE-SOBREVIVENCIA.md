# Análise da sobrevivência das espécies

Como a vida funcionava na superfície, o que dava errado e o que mudou. As medições são da Terra
no tamanho do jogo (1024×512), semente 42, 200 anos de simulação sem o jogador mexer.

## Como funcionava

- **Energia:** cada criatura gasta energia todo segundo (metabolismo do tipo) e morre com energia zero
  (fome) ou passando da idade máxima (velhice). Fora da faixa de temperatura da espécie gasta mais
  (frio ou calor).
- **Comida:**
  - Herbívoros comem a vegetação do tile.
  - Predadores comem herbívoros, mais um pouco de "bichos pequenos" no mato.
  - Tubarões comem peixes.
  - Peixes ganhavam energia só por estar na água, sem limite nenhum.
  - Inteligentes comem do verde e da água, do peixe dos barcos, e caçadores abatem herbívoros.
- **Nascimento:** com energia acima de 0,65, sorteio por segundo e um parceiro adulto a até 8 tiles.
  A única trava era um teto fixo por espécie: chegando nele, ninguém nascia.
- **Movimento:** passeio aleatório (cada decisão numa direção nova). Herbívoros olhavam 3 pontos
  a 4 tiles em busca de pasto; predadores corriam atrás de presa a até 20 tiles.

## O que dava errado

| Problema | Efeito medido (antes) |
|---|---|
| Bichos espalhados um a um pelo mapa e passeio aleatório: quase nunca achavam parceiro a 8 tiles. | Lobo: **0 nascimentos** em 200 anos. Tubarão, baleia: 0. Urso: 13. Raposa: 17. |
| Tetos muito baixos para quem não é peixe (pasto dividido por todas as espécies do tipo). | Predadores com teto de 62 no mapa inteiro, anfíbios com 96, baleia com 35. |
| Peixe sem limite de comida e com nascimento rápido. | Peixe colado no teto o tempo todo (2.125 de 2.125), voltando ao teto logo depois de qualquer queda. |
| Ninguém fugia do frio ou do calor. | Peixes, bisões e camelos morrendo de frio fora da faixa. |
| Herbívoros com fome olhavam pouco e perto demais. | Bisão: 846 mortes de fome; camelo: 719. |
| Anfíbios comendo pouco na água. | Tartaruga e pinguim morrendo de fome mais do que nascendo. |
| Agricultores não produziam comida; plantações só na Idade do Bronze (perto do ano 175). | Aldeias sem roça por mais de um século. |
| **Resultado** | **8 de 14 espécies extintas** (lobo, tubarão, urso, raposa, tartaruga, caranguejo, pinguim, baleia), quase todas antes do ano 60. |

## O que mudou

1. **Natalidade controlada (logística):**
   - A chance de ter filhote cai conforme a espécie se aproxima do teto (perto dele, 8% do normal).
   - Uma espécie rara (abaixo de 20% do teto) tem mais filhotes (2,2 vezes), para conseguir voltar.
2. **Procurar parceiro:**
   - O adulto bem alimentado vai atrás do adulto da mesma espécie mais perto (24 tiles, ou 48 quando a espécie está rara).
   - Bichos acham o parceiro a até 12 tiles; inteligentes continuam no mesmo assentamento.
3. **Bandos:**
   - No começo do mundo, bichos nascem em bandos, cardumes e matilhas, em vez de soltos um a um.
   - Toda espécie começa com pelo menos alguns indivíduos.
4. **Passeio com rumo:** sem destino, o bicho segue mais ou menos na mesma direção e explora o mapa, em vez de rodar no lugar.
5. **Fugir do clima ruim:** na beirada ou fora da faixa de temperatura, todo bicho anda para um lugar melhor.
6. **Buscar comida antes de morrer de fome:**
   - Herbívoros com fome olham 10 pontos, mais longe quanto mais fome têm, e preferem pasto perto.
   - Predadores com fome procuram presa a até 36 tiles e, sem presa à vista, vão para onde é mais verde (onde a caça pasta).
   - Qualquer predador pesca o peixe que passa na beira d'água.
   - Urso e raposa são onívoros: comem frutos e raízes quando a caça some.
   - Tubarões com fome procuram peixe mais longe.
   - Anfíbios comem algas e bichinhos na água.
   - Inteligentes:
     - Com fome e sem comida no celeiro, qualquer adulto caça.
     - Sozinhos, procuram onde há verde ou água.
     - Lavouras trabalhadas enchem o celeiro.
     - As roças começam no fim da Idade da Pedra.
7. **Mar com limite:**
   - O peixe come plâncton, que alimenta bem um peixe sozinho e mal um cardume apertado.
   - A população fica abaixo do teto e sobe e desce com tubarões, pesca e clima.
8. **Tetos revistos:** o peixe precisa de mais mar; bichos de terra, predadores, tubarões e anfíbios ganham mais espaço; o teto mínimo de qualquer espécie subiu de 20 para 30.
9. **Andarilhos:**
   - De vez em quando um adulto do mesmo povo chega a um assentamento e se junta a ele.
   - A chance por ano é de 35% com até 3 moradores, 15% com menos de 10, 5% com menos de 30 e 1% acima disso.

Morrer de fome continua possível quando não há saída (seca, inverno longo, sem caça), e uma espécie
ainda pode sumir, só que bem mais raramente.

## Resultado (depois)

| | Antes | Depois |
|---|---|---|
| Espécies extintas em 200 anos (semente 42) | 8 de 14 | 1 (lobo, no ano 172) |
| Espécies extintas em 200 anos (semente 7) | não medido | 0 |
| Peixe | colado no teto (2.125/2.125) | oscila em torno de 75% do teto (820–880 de 1.144) |
| Lobo: nascimentos | 0 | 795 |
| Urso: nascimentos | 13 | 1.382 |
| Bisão: mortes de fome | 846 | 1.139 (pasto disputado perto do teto, que é o que controla a população) |
| Plantações | a partir do ano ~175 | a partir do ano ~30 |
