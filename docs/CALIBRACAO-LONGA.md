# Calibração longa: evolução dos povos

> Gerado por `npm run calibrar:longa` em 3 rodadas paralelas (SEMENTES=1, PRIMEIRA=0, 1 e 2), 1000 anos, Terra do jogo (1024×512), 6 aldeias semeadas, depois da calibração conjunta das ondas 3A, 3B e 3C (agente 4B). "Antes das ondas" é a média da calibragem anterior a elas (3 sementes, a mesma rodada); "Ondas, sem calibrar" é o mundo integrado logo depois da mescla, antes desta calibração.

| Indicador | Sementes 0 · 1 · 2 | Média | Antes das ondas | Ondas, sem calibrar | Meta | Situação |
|---|---|---|---|---|---|---|
| Moradores no fim | 2785 · 5456 · 4347 | 4196 | 3704 | 456,33 |  |  |
| Moradores: fim ÷ 60% da rodada | 1,87 · 1,68 · 2,02 | 1,86 | 1,81 | 1,08 | 1 a 3 | dentro |
| Assentamentos vivos | 34 · 24 · 38 | 32 | 115,33 | 20,33 | 40 a 90 | **fora** |
| Assentamentos fundados na rodada | 115 · 139 · 136 | 130 | 376,67 | 35,67 | 60 a 110 | **fora** |
| Êxodos por falta | 1146 · 1451 · 1361 | 1319,33 | 4336,33 | 1084 |  |  |
| Mediana de moradores por assentamento | 33 · 233 · 76 | 114 | 22,67 | 17,33 | 50 a 99999 | dentro |
| Maior assentamento (moradores) | 574 · 681 · 360 | 538,33 | 139,67 | 57,33 | 400 a 99999 | dentro |
| Cidades | 7 · 14 · 9 | 10 | 0,33 | 0 |  |  |
| Metrópoles (400 ou mais) | 0 · 2 · 0 | 0,67 | 0 | 0 | 1 a 4 | **fora** |
| Parte do povo em cidades e metrópoles | 0,58 · 0,97 · 0,48 | 0,68 | 0 | 0 | 0,20 a 0,60 | **fora** |
| Reinos | 19 · 15 · 22 | 18,67 | 44,33 | 12 |  |  |
| Reinos com 3 ou mais assentamentos | 4 · 2 · 4 | 3,33 | 15 | 1,33 |  |  |
| Mortes de fome por ano, por 100 moradores | 0,82 · 0,36 · 0,45 | 0,54 | 0,71 | 2,36 | 0 a 0,50 | **fora** |
| Atendimento médio de comida | 0,69 · 0,86 · 0,75 | 0,77 | 0,73 | 0,67 |  |  |
| Maior era (0 = Pedra, 1 = Bronze...) | 4,99 · 4,99 · 4,99 | 4,99 | 4,66 | 2,86 |  |  |
| Migrantes por ano | 46,72 · 83,78 · 50,92 | 60,47 | 96,09 | 12,03 |  |  |
| Famílias que se mudaram por ano | 24,61 · 46,57 · 27,89 | 33,02 | 47,99 | 5,95 |  |  |
| Comida do campo para lugares maiores do reino, por ano | 8,79 · 12,42 · 15,07 | 12,09 | 42,74 | 1,23 |  |  |
| Guerras declaradas | 121 · 179 · 176 | 158,67 | 521,33 | 17,33 |  |  |
| Exércitos que voltaram sem comida | 60 · 87 · 107 | 84,67 | 305,33 | 7,67 |  |  |
| Parte das fundações por pressão, social ou da terra (contra as por fome) | 0,06 · 0,11 · 0,10 | 0,09 |  | 0 |  |  |
| Fundações pela pressão da terra | 0 · 0 · 0 | 0 |  | 0 |  |  |
| Fundações por fome | 90 · 105 · 96 | 97 |  | 29 |  |  |
| Fissões por pressão | 5 · 12 · 10 | 9 |  | 0 |  |  |
| Tamanho médio da origem na fissão (alvo 100 a 300) | 516,20 · 391,17 · 343,40 | 416,92 |  | 0 |  |  |
| Lugares que ficaram circunscritos (sem terra livre para a fissão) | 19 · 40 · 10 | 23 |  | 0 |  |  |
| Guerras por terra de reinos circunscritos | 13 · 28 · 7 | 16 |  | 0 |  |  |

Outros indicadores da mesma rodada, pelo diagnóstico (`src/sim/diagnostico.calib.ts`): lugares que morreram antes de 50 anos 0,36 · 0,37 · 0,39 (meta até 0,15), lugares com menos de 15 moradores 0,24 · 0,21 · 0,18 (meta até 0,20), fundações de uma família sozinha 0,05 · 0,05 · 0,06 (meta até 0,15).

**Validação em sementes que nenhum ajuste viu** (9 a 14, 1000 anos, pelo ajuste automático): moradores 3524 (de 2298 a 4989), fim ÷ 60% 1,46, vivos 35, fundados 110, mediana 71, maior 393, metrópoles 0,5, parte do povo em cidades 0,56, fome 0,64, maior era 4,81 e fissões 5,8 por rodada (todas as sementes com pelo menos uma).

## Leitura

### O que derrubava o mundo integrado (ablação)

Rodadas de 500 anos nas sementes 0, 1 e 2 com o diagnóstico, desligando uma mudança de cada vez sobre o mundo integrado:

| Ablação (500 anos, média de 3 sementes) | Moradores | Vivos | Fundados | Fome | Maior era |
|---|---|---|---|---|---|
| Mundo integrado, como estava | 390 | 17 | 21 | 2,35 | 2,25 |
| Nota mínima do sítio 0 (3A) | 1103 | 44 | 83 | 1,60 | 2,83 |
| Colônia antes do refúgio para todo lugar (`FAMINE_COLONY_POP` 0, 3B) | 952 | 29 | 50 | 1,28 | 3,74 |
| `migrate` antes da economia, como antes da 3B | 539 | 21 | 25 | 2,26 | 2,98 |
| Nascente a partir de umidade 0,4 (3A) | 436 | 21 | 30 | 2,59 | 2,25 |
| Sem perecimento pelo bioma (3C) | 353 | 19 | 29 | 2,90 | 2,12 |
| Sem a trava local da era (3C) | 341 | 17 | 25 | 2,59 | 2,11 |
| Todo lugar sedentário, sem nômade nem intensivo (3C) | 301 | 16 | 19 | 3,32 | 2,35 |

- **Quem derrubava eram a 3A e a 3B juntas.** A nota mínima do sítio (4,2 para a colônia e 5 para a família sozinha) barrava 86% das escolhas de sítio: a melhor nota vista ficava em 3,9 na mediana. A 3B tinha posto o refúgio antes da colônia para o lugar com menos de 60 moradores. Com as duas, o lugar médio em falta despejava 35% das famílias no vizinho, que lotava e entrava em falta também, e a fome e a falta de lenha rodavam entre os mesmos lugares.
- **A 3C não derrubava.** Sem a trava local, sem o perecimento pelo bioma ou sem o modo de vida, o mundo fica igual ou pior: o intensivo segura mais gente, e o perecimento pelo bioma só tira perda. A ordem da migração depois da economia ficou dentro do ruído das sementes.
- **A era parada na Idade do Bronze era sintoma.** O lugar mais adiantado passava de 100 a 350 anos em "juntar madeira e pedra para erguer uma Ferraria", porque a lenha nunca sobrava (abaixo).

### Onde morria gente de fome

- **Em lugares velhos e médios, não nos novos nem nos nômades.** Uns 80% das mortes de fome eram em lugares com 100 anos ou mais, e dois terços em lugares de 20 a 80 moradores, sedentários ou intensivos, na mata tropical e no pântano. Os nômades davam 1 a 2% e os lugares com menos de 25 anos, uns 4%. Primavera e outono matavam o dobro do verão e do inverno.
- **A lenha puxava a fome.** O rastro dos lugares que mais encolheram mostrou a lenha em zero quase sempre, com 800 a 2900 árvores ao alcance. No corte presencial o lenhador anda até a árvore no passo de gente (uns 4 tiles por ano de ação), e cada um derrubava 0,3 árvore por ano. A crise de lenha levava até 60% dos adultos para a mata, inclusive agricultores com o celeiro vazio, e a fome vinha no ano seguinte. 80% dos êxodos eram por lenha: o lugar com comida farta mandava embora um terço do povo de três em três anos, e a fissão por pressão nunca tinha vez.

### O que mudou

| Mudança | Tipo | Por quê |
|---|---|---|
| A nascente conta como água do lugar (`Village.wet`) | defeito | O exame da área aceitava fundar na nascente, mas o lugar fundado nela passava sede e não tirava barro. |
| `FAMINE_COLONY_POP` 60 para 30 | número | O lugar médio em falta manda colônia antes do refúgio; 30 é o menor que manda colônia pela fome. A nota mínima do sítio já segura a colônia para lugar ruim. |
| `SITE_SPRING_MOISTURE` 0,6 para 0,5 | número | Sem rios no mapa, a nascente faz as vezes do córrego: o veto por falta de água doce caiu de um quarto para uns 14% da terra verde e habitável. |
| Comida antes da lenha (`FUEL_SPARES_FOOD` 0,9) | defeito | Na falta de lenha, quem cuida da comida só vai para a mata com a comida garantida. Fome de 0,89 para 0,58 e povo de 2000 para 2900 na longa. |
| `WOOD_PER_TREE` 2 para 4 | número | A árvore do mapa vale um bosque, como a roça vale um lote grande. Êxodos pela metade, mediana de 24 para 50 e parte do povo em cidades de 0,10 para 0,58 em 500 anos. |
| `SITE_MIN_FISSION` 3,4 | número | O grupo da fissão é grande e leva enxoval, então aguenta um sítio pior que a colônia pequena. Com a régua de 4,2, 273 de 394 anos de lugar com pressão ficavam sem sítio; com 3,4, 27 fissões nas três sementes. |

Caminho na longa de 1000 anos (média das três sementes): ondas sem calibrar 456 moradores; com a colônia antes do refúgio e a nascente em 0,5, 2059; com a comida antes da lenha, 2925; com a madeira por árvore e a régua da fissão, 4196.

### Ajuste automático

- **Sensibilidade** (`tools/tune/conjunta-sensibilidade.json`, 300 anos, sementes 0 a 2, dez constantes no mínimo e no máximo): pesam `LAST_WAVE_POP`, `SITE_MIN_VALUE`, `FUEL_SPARES_FOOD` e `FAMINE_COLONY_POP`, e todas já estavam no lado bom (`FAMINE_COLONY_POP` 20 dá o mesmo que 30). `MOVE_CITY_PULL`, `SITE_MIN_SOLO`, `SITE_MIN_FISSION`, `WOOD_PER_TREE`, `MOVE_PRESSURE` e `COLONY_COOLDOWN` mudam a distância às metas menos que o ruído de três sementes.
- **CMA-ES** (`tools/tune/conjunta.json`, 5 constantes, 300 anos, 6 gerações, sementes 0 a 8): em 300 anos puxou a nota mínima para 3,7 e a madeira para 3. Na validação em 1000 anos nas sementes 9 a 14, os valores de agora ganharam (distância 1,60 contra 2,55 do centro final e 2,76 do melhor visto). A nota mínima mais baixa dá mais povo cedo, mas 183 a 201 fundações em 1000 anos e lugares menores. Ficaram os valores de agora.

### O que ainda está fora da meta e por quê

- **Vivos (32, meta 40 a 90) e lugares que morrem cedo (0,37, meta até 0,15).** As fundações por fome ainda são quase todas (97 de 130), e boa parte delas morre antes dos 50 anos, perdendo gente para as cidades, que atraem pelo tamanho. Por isso também a parte do povo em cidades passou um pouco da meta (0,68) e os fundados ficaram acima de 110 em duas sementes.
- **A lenha ainda manda quase todo êxodo** (90% dos êxodos da rodada final). Com a madeira em dobro o lugar cresce, mas continua mandando gente embora por lenha, não por comida.
- **Fome em 0,54** (meta até 0,50; antes das ondas 0,71). A semente 0 fica em 0,82; nas sementes de validação, 0,64.
- **Metrópoles (0,67, meta 1 a 4).** O maior lugar passa de 400 em duas das três sementes, mas o degrau de metrópole pede também capital ou mercado regional.
- **A fissão acontece, mas a circunscrição domina.** De 889 a 2889 anos de lugar com pressão para os batedores por semente, 56% a 75% ficam sem sítio, e 10 a 40 lugares ficam circunscritos (guerra por terra e instituições, como a 3B pede). O lugar de origem da fissão tem 417 moradores em média, acima do alvo de 100 a 300.

### Próximos ajustes

- **Lenha do lugar grande.** O êxodo por lenha é o próximo gargalo: lenha por pessoa que cai com a era (forno comum, carvão), lenhador que acampa perto da mata em vez de andar de casa, ou êxodo por lenha só no clima frio.
- **Fase longa do ajuste automático em 1000 anos** para os fundados, os vivos e a parte do povo em cidades (as metas de contagem não valem ao mesmo tempo em 300 e em 1000 anos, então a fase curta não as segura). Candidatas: `SITE_MIN_VALUE` entre 4,2 e 4,6, `MOVE_CITY_PULL`, `COLONY_COOLDOWN` e a nova `SITE_MIN_FISSION`.
- **Fundação por fome que morre cedo:** olhar o enxoval e a nota do sítio da colônia da fome, que sai de lugar em falta.
