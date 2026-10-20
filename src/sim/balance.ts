/**
 * Parâmetros da vida e das civilizações num lugar só (REQUISITOS-VIDA.md,
 * RF-VIDA-208 e seção 19.12). Taxas são por ano de jogo (λ); a chance num
 * passo sai de `chance(λ, dt)` em `stochastic.ts`. Mudar um valor aqui muda
 * o jogo inteiro: rode `npm run calibrar` depois.
 */

// Assentamentos ---------------------------------------------------------------

/** Casas novas por ano quando a população passa da capacidade (antes: 40% por segundo). */
export const HOUSE_RATE = 3;
/** Parte das obras que vira construção especial, quando há uma disponível. */
export const SPECIAL_BUILDING_SHARE = 0.35;
/** Roças novas por ano enquanto faltam roças (antes: 30% por segundo). */
export const FIELD_RATE = 2;
/** Porções de comida por ano que cada roça trabalhada produz em ano normal. */
export const FIELD_YIELD = 3;
/** Chegada de andarilhos por ano, pelo tamanho do assentamento (até 3, até 9, até 29, 30 ou mais). */
export const WANDERER_RATE = [0.35, 0.15, 0.05, 0.01];
/** Porto construído por ano, quando o assentamento pode (antes: 8% por segundo). */
export const PORT_RATE = 0.5;
/** Saídas de barco de pesca por ano (antes: 15% por segundo). */
export const FISH_TRIP_RATE = 0.9;
/** Expedições de exploração por mar por ano (dobra em povos curiosos). */
export const EXPLORE_RATE = 0.012;
/** Envio de colonos por ano num assentamento cheio, mais 25% por era. */
export const COLONY_RATE = 0.05;
/** Busca por jazidas por ano (antes: 5% por segundo). */
export const SURVEY_RATE = 0.3;
/** Minas abertas por ano, quando há mineradores e jazida conhecida (antes: 10% por segundo). */
export const MINE_RATE = 0.6;
/** Desembarques de tropas por ano numa guerra naval (antes: 6% por segundo). */
export const NAVAL_LANDING_RATE = 0.36;

// Clima do ano (RF-VIDA-304 e 305) ----------------------------------------------

/** Regiões do clima do ano: colunas × linhas do mapa. */
export const CLIMATE_REGIONS = [8, 4];
/** Força de volta ao normal por ano (Ornstein-Uhlenbeck). */
export const CLIMATE_THETA = 0.6;
/** Desvio do clima do ano no longo prazo. */
export const CLIMATE_SIGMA = 0.35;
/** Parte do clima do ano que é comum ao planeta inteiro (o resto é da região). */
export const CLIMATE_SHARED = 0.4;
/** Quanto a colheita e o rebrotar da vegetação seguem o clima do ano. */
export const HARVEST_SENSITIVITY = 0.6;
/** Clima do ano abaixo deste valor é seca (cerca de 2,3 desvios: perto de 1% das regiões por ano). */
export const DROUGHT_LEVEL = -0.8;
/** Anos mínimos entre duas notícias de seca na mesma região. */
export const DROUGHT_COOLDOWN = 30;

// Ruas e estradas (seção 19.2) --------------------------------------------------

/** Distância mínima entre ruas diferentes, em tiles. */
export const STREET_GAP = 3;
/** Custo da busca de caminho por tile: terreno, rua existente, ao lado de uma rua, longe do traçado-guia. */
export const ROAD_COST_GROUND = 1;
export const ROAD_COST_EXISTING = 0.3;
export const ROAD_COST_BESIDE = 4;
export const ROAD_COST_GUIDE = 0.25;
/** Ruas bloco a bloco (RF-VIDA-207): tiles de rua de um assentamento novo, tiles de cada trecho aberto e trechos por ano quando faltam lotes. */
export const STREET_START = 10;
export const STREET_BLOCK = 6;
export const STREET_BLOCK_RATE = 3;
/** Estrada entre assentamentos só do mesmo reino, até esta distância (tiles), e quando os dois já têm este tanto de moradores. */
export const ROAD_LINK_RANGE = 40;
export const ROAD_LINK_POP = 15;
/** Limite de tiles visitados por busca de estrada. */
export const ROAD_SEARCH_MAX = 60000;

// Calibração (RF-VIDA-308) ----------------------------------------------------

export const CALIBRATION_SEEDS = 20;
export const CALIBRATION_YEARS = 250;

// Barcos ------------------------------------------------------------------------

/** Passageiros perdidos por ano num barco à deriva (antes: 8% por segundo). */
export const ADRIFT_LOSS_RATE = 0.48;
/** Lances de rede por ano de um barco de pesca (antes: 50% por segundo). */
export const FISHING_CAST_RATE = 3;

// Crescimento controlado (seção 19.3) ------------------------------------------

/** Fração da chance de colonos quando a planta está incompleta (completa = 1). */
export const COLONY_MIN_FACTOR = 0.2;
/** Moradores a partir dos quais um assentamento pensa em mandar colonos mesmo com lote livre. */
export const COLONY_MIN_POP = 40;
/** Completude mínima da planta para subir de nível. */
export const TIER_UP_COMPLETENESS = 0.7;
/** Reformas por ano por construtor (casa que melhora de padrão). */
export const REFORM_RATE = 0.5;
/** Anos que uma obra (reforma ou construção) fica com andaime. */
export const WORK_YEARS = 2;
/** Pessoas a mais que cada andar extra de uma casa abriga. */
export const LEVEL_HOUSING = 2;
/** Crescimento das ruas por ano quando os lotes acabam (1 = ruas do nível seguinte, metade da área). */
export const STREET_GROW_RATE = 0.25;
/** Mudanças de moradores por ano de um assentamento apertado para um vizinho do mesmo povo (RF-VIDA-281). */
export const MIGRATION_RATE = 0.4;
/** Epidemias por ano numa cidade grande sem saneamento, por 100 moradores (RF-VIDA-284). */
export const EPIDEMIC_RATE = 0.02;
/** Parte dos moradores que uma epidemia atinge. */
export const EPIDEMIC_SHARE = 0.06;
/** Peso da chance de colonos quando ainda há espaço (lote, reforma ou rua para crescer) e quando não há. */
export const COLONY_PRESSURE_ROOM = 0.2;
export const COLONY_PRESSURE_CROWDED = 2;
