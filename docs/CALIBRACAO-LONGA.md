# Calibração longa: evolução dos povos

> Gerado por `npm run calibrar:longa` em 3 rodadas paralelas (SEMENTES=1, PRIMEIRA=0, 1 e 2), 1000 anos, Terra do jogo (1024×512), 6 aldeias semeadas, com o plano novo dos assentamentos (REQUISITOS-VIDA.md, seção 20). A coluna "Antes" é a média da calibragem anterior (3 sementes), com os degraus antigos (cidade 60, metrópole 140).

| Indicador | Sementes 0 · 1 · 2 | Média | Antes | Meta | Situação |
|---|---|---|---|---|---|
| Moradores no fim | 1810 · 3668 · 5634 | 3704,00 | 5391 |  |  |
| Moradores: fim ÷ 60% da rodada | 2,05 · 1,89 · 1,48 | 1,81 | 0,94 | 1 a 3 | dentro |
| Assentamentos vivos | 72 · 125 · 149 | 115,33 | 130,33 | 40 a 90 | **fora** |
| Assentamentos fundados na rodada | 194 · 431 · 505 | 376,67 | 232 | 60 a 110 | **fora** |
| Êxodos por falta | 2487 · 4136 · 6386 | 4336,33 | 219 |  |  |
| Mediana de moradores por assentamento | 22 · 19 · 27 | 22,67 | 32,33 | 50 a 99999 | **fora** |
| Maior assentamento (moradores) | 75 · 146 · 198 | 139,67 | 181 | 400 a 99999 | **fora** |
| Cidades | 0 · 0 · 1 | 0,33 | 29 |  |  |
| Metrópoles (400 ou mais) | 0 · 0 · 0 | 0,00 | 3,67 | 1 a 4 | **fora** |
| Parte do povo em cidades e metrópoles | 0 · 0 · 0,01 | 0,00 | 0,39 | 0,20 a 0,60 | **fora** |
| Reinos | 31 · 54 · 48 | 44,33 | 61,67 |  |  |
| Reinos com 3 ou mais assentamentos | 8 · 14 · 23 | 15,00 | 16,33 |  |  |
| Mortes de fome por ano, por 100 moradores | 0,98 · 0,67 · 0,49 | 0,71 | 0,39 | 0 a 0,50 | **fora** |
| Atendimento médio de comida | 0,71 · 0,75 · 0,73 | 0,73 | 0,81 |  |  |
| Maior era (0 = Pedra, 1 = Bronze...) | 3,99 · 4,99 · 4,99 | 4,66 | 4,99 |  |  |
| Migrantes por ano | 25,96 · 87 · 175,31 | 96,09 | 37,05 |  |  |
| Famílias que se mudaram por ano | 12,22 · 42,90 · 88,84 | 47,99 | 23,55 |  |  |
| Comida do campo para lugares maiores do reino, por ano | 6,60 · 45,68 · 75,95 | 42,74 | 71,09 |  |  |
| Guerras declaradas | 138 · 552 · 874 | 521,33 | 1169,33 |  |  |
| Exércitos que voltaram sem comida | 75 · 323 · 518 | 305,33 | 504,33 |  |  |

## Leitura e o que falta ajustar

- **Degraus novos são mais exigentes.** Cidade pede 120 moradores com mercado e templo, metrópole pede 400 e capital ou mercado regional. Por isso as cidades e metrópoles caíram para quase zero: o maior lugar fica entre 75 e 198 moradores. Com os degraus antigos, os mesmos lugares contariam como cidades (60) e metrópoles (140).
- **Mais fome e mais êxodos.** As mortes de fome subiram de 0,39 para 0,71 por 100 moradores por ano. Os êxodos por falta subiram de 219 para cerca de 4300 por rodada. Lugares pequenos em falta se mudam inteiros (RF-AS-08), e os sítios rurais e colônias fundam mais (377 contra 232). O resultado é um povo que circula muito e não se concentra.
- **Variância alta entre sementes.** A semente 0 terminou com 1810 moradores e não passou da Era Medieval; as outras duas chegaram à Industrial.
- **Próximos ajustes sugeridos**, todos em `src/sim/balance.ts`:
  - Baixar o êxodo de lugares em falta: `LAST_WAVE_POP` e a fome que dispara a mudança.
  - Segurar fundações: `FARMSTEAD_RATE`, `FARMSTEAD_FREE_POP` e `COLONY_COOLDOWN`.
  - Revisar `TIER_POPULATION_NEW` (por exemplo 30, 90, 250) se a meta de cidades e metrópoles valer com a economia atual.
  - Olhar `AID_HUNGER` e `YARD_RESERVE_FOOD` para a fome.
