# Calibração da vida

> Gerado por `npm run calibrar` (RF-VIDA-308). 20 sementes, 250 anos, Terra com raio 0,40 (1 é a Terra do jogo, 1024×512), 6 aldeias semeadas.
> As faixas-alvo estão no [REQUISITOS-VIDA.md, seção 19.15](REQUISITOS-VIDA.md#1915-base-de-simulação-estocástica). Indicadores ainda sem faixa aparecem só com os números.

| Indicador | Média | Mediana | 10% a 90% | Faixa-alvo | Situação |
|---|---|---|---|---|---|
| Espécies extintas | 1 | 1 | 0 a 2 | 0 a 2 | dentro |
| Assentamentos vivos | 33,10 | 33 | 29 a 36 | 12 a 40 | dentro |
| Cidades | 0,70 | 1 | 0 a 2 | 1 a 99 | **fora** |
| Maior assentamento (moradores) | 30,85 | 26 | 23 a 40 |  |  |
| Reinos | 12,30 | 12 | 10 a 15 |  |  |
| Guerras ao mesmo tempo (média) | 0,69 | 0,74 | 0,38 a 0,98 | 0 a 3 | dentro |
| Maior era (0 = Pedra, 1 = Bronze...) | 0,98 | 1,00 | 0,89 a 1,03 |  |  |
| Blocos 2x2 de rua fora das praças | 0,10 | 0 | 0 a 0 | 0 a 0 | dentro |
| Secas na crônica | 16,95 | 18 | 11 a 23 |  |  |
| Casas longe de rua | 0 | 0 | 0 a 0 | 0 a 0 | dentro |

**Leitura (etapas S e A):** extinções, assentamentos, guerras, ruas e casas estão dentro das faixas. Cidades ficam abaixo da faixa (0,7 por mundo): o povo se espalha em muitas aldeias e vilas. É o que a Etapa B (crescimento controlado) corrige.
