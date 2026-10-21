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
/** Chance por ano de largar uma roça que nenhum agricultor trabalha (volta a ser campo). */
export const FIELD_FALLOW_RATE = 0.5;
/** Agricultores que cada roça do mapa comporta: são no máximo 5 roças, então cada uma é um lote grande. */
export const FIELD_HANDS = 3;
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
export const COLONY_RATE = 0.03;
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
/**
 * Nível mínimo para mandar colonos, e só quando o assentamento não tem mais lote, reforma nem rua para crescer
 * (antes: qualquer nível, a partir de COLONY_MIN_POP moradores, mesmo com espaço; o povo se espalhava em aldeias pequenas).
 */
export const COLONY_MIN_TIER = 1;
/** Completude mínima da planta para subir de nível. */
export const TIER_UP_COMPLETENESS = 0.7;
/** Reformas por ano por construtor (casa que melhora de padrão). */
export const REFORM_RATE = 0.5;
/** Anos que uma obra (reforma ou construção) fica com andaime. */
export const WORK_YEARS = 2;
/** Casas reformadas para o estilo da era nova por ano por construtor (transição gradual, RF-VIDA-251). */
export const RESTYLE_RATE = 0.6;
/** Reformas a mais num assentamento próspero (RF-VIDA-254). */
export const RICH_REFORM = 1.5;
/** Casas que ficam vazias por ano num assentamento em crise, e que voltam a ser ocupadas na melhora (RF-VIDA-254). */
export const CRISIS_EMPTY_RATE = 0.5;
export const CRISIS_REFILL_RATE = 1;
/** Fração das ruas por onde passa o ramo de uma rua principal (RF-VIDA-253). */
export const MAIN_STREET_SHARE = 0.12;
/** Tiles retos de rua principal para virar avenida (cidade em diante). */
export const AVENUE_MIN = 4;
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

// Economia local: estoque próprio, tetos, consumo e perecimento (seção 19.4) ------

/** Teto base de cada grupo de recurso por nível (aldeia, vila, cidade, metrópole). */
export const STORE_BASE = {
  food: [20, 60, 150, 350],
  material: [30, 80, 200, 450],
  ore: [10, 30, 80, 200],
  goods: [10, 30, 80, 200],
  /** Bens de luxo (RF-VIDA-282): pouco, mas valioso. */
  luxury: [6, 15, 40, 90],
  gold: [10, 30, 100, 300],
};
/** Quanto cada construção soma ao teto: celeiro (comida), armazém (materiais), mercado como tesouro (ouro), cada mina (minério). */
export const GRANARY_CAP = 80;
export const WAREHOUSE_CAP = 120;
export const TREASURY_CAP = 150;
export const MINE_STORE_CAP = 40;
/** Porções de comida de reserva que cada morador deveria ter guardadas (um ano). */
export const CONSUME_FOOD = 1;
/** Lenha por morador por ano (o dobro no frio) e roupa por morador por ano. */
export const CONSUME_FUEL = 0.25;
export const CONSUME_CLOTH = 0.15;
/** Temperatura (K) abaixo da qual o lugar é frio e gasta o dobro de lenha. */
export const COLD_K = 280;
/** Perda anual no estoque: grão no celeiro, comida sem celeiro (carne e peixe), madeira. */
export const SPOIL_GRAIN = 0.06;
export const SPOIL_MEAT = 0.45;
export const SPOIL_WOOD = 0.02;
/** Expoente do retorno decrescente perto do teto: produção × (1 − preenchimento^DIMINISHING). */
export const DIMINISHING = 2;
/** Ouro acima desta parte do teto perde valor (inflação leve), a esta taxa por ano. */
export const GOLD_INFLATION_FILL = 0.8;
export const GOLD_INFLATION = 0.05;
/** Estoque de um assentamento acima desta parte do teto vai de carroça para um vizinho do mesmo reino abaixo de HAUL_LOW. */
export const HAUL_HIGH = 0.5;
export const HAUL_LOW = 0.2;
/** Carga de uma carroça por recurso e alcance, em tiles. */
export const HAUL_LOAD = 12;
export const HAUL_RANGE = 60;

// Trabalho, vocação e estabilidade (seção 19.5 e RF-VIDA-280) ----------------------

/** Fração dos adultos que podem mudar de setor por ano (RF-VIDA-214). */
export const LABOR_SHIFT = 0.15;
/** Parte máxima dos adultos numa mesma profissão depois da mudança de setor. */
export const LABOR_ROLE_MAX = 0.35;
/** Bônus de produção da vocação (RF-VIDA-221). */
export const VOCATION_BONUS = 0.4;
/** Chance de uma colônia herdar a vocação da origem (RF-VIDA-220). */
export const VOCATION_INHERIT = 0.25;
/** Anos ruins seguidos antes de trocar de vocação (RF-VIDA-222). */
export const VOCATION_CHANGE_YEARS = 20;
/** Quanto a estabilidade anda por ano rumo ao valor que as condições pedem. */
export const STABILITY_PULL = 0.25;
/** Estabilidade abaixo da qual um assentamento que não é capital pode se revoltar, e a taxa da revolta. */
export const REVOLT_STABILITY = 0.25;
export const REVOLT_RATE = 0.04;

// Rebanhos (RF-VIDA-215) ---------------------------------------------------------

/** Domesticação por ano, a partir do fim da Idade da Pedra, com herbívoros por perto. */
export const DOMESTICATE_RATE = 0.4;
/** Tiles de pasto por animal; cada cercado pasta a área dele e a volta (PEN_AREA tiles). */
export const PASTURE_PER_HEAD = 1.5;
/** (antes: 9; com no máximo 5 cercados, cada um pasta uma área maior.) */
export const PEN_AREA = 14;
/** Crescimento do rebanho por ano (logístico até o teto do pasto). */
export const HERD_GROWTH = 0.3;
/** Cercados novos por ano quando o rebanho encosta no teto. */
export const PEN_RATE = 0.8;
/** Ataques de predador por ano para cada predador perto do pasto. */
export const HERD_PREDATION = 0.5;
/** Praga no rebanho por ano, e chance de pular para cada rebanho vizinho a até HERD_PLAGUE_RANGE tiles. */
export const HERD_PLAGUE_RATE = 0.012;
export const HERD_PLAGUE_SPREAD = 0.5;
export const HERD_PLAGUE_RANGE = 45;

// Eventos econômicos e terra (RF-VIDA-285 e 294) -------------------------------------

/** Anos de corrida do ouro depois que uma jazida de ouro é achada (mais andarilhos chegando). */
export const GOLD_RUSH_YEARS = 12;
export const GOLD_RUSH_WANDERERS = 0.6;
/** Colheita abaixo desta fração do normal é quebra de safra na crônica. */
export const CROP_FAILURE = 0.55;
/** Desgaste do solo por ano com todas as roças trabalhadas, e recuperação por ano em pousio. */
export const SOIL_WEAR = 0.006;
export const SOIL_RECOVER = 0.02;
/** Solo mínimo: abaixo disso o assentamento deixa roças em pousio. */
export const SOIL_FALLOW = 0.55;

// Ano econômico com estações (RF-VIDA-290) --------------------------------------------

/** Peso da colheita, da tosquia e da lenha em cada estação (primavera, verão, outono, inverno); a média de cada linha é 1. */
export const SEASON_HARVEST = [0.2, 0.8, 2.6, 0.4];
export const SEASON_WOOL = [3.2, 0.4, 0.2, 0.2];
export const SEASON_FUEL = [0.8, 0.4, 0.8, 2];

// Comércio vivo (seção 19.6, RF-VIDA-230 a 236) ---------------------------------------

/**
 * Caravanas por assentamento: uma, mais uma na cidade e na metrópole, +1 se mercantil (antes: uma por nível);
 * e no mundo todo (RF-VIDA-236) (antes: 24; menos mercadores no mapa, pedido do Joab).
 */
export const CARAVANS_PER_TIER = 1;
export const CARAVANS_MAX = 10;
/** Saídas de caravana por ano em cada assentamento que pode mandar (×2 mercantil, ×1,5 com mercado). */
export const CARAVAN_RATE = 0.3;
/** Alcance de uma caravana por terra, em tiles (×1,5 rumo a uma feira). */
export const CARAVAN_RANGE = 60;
/** Velocidade a pé com burro ou camelo, em tiles por segundo; cavalo vai 50% mais rápido (RF-VIDA-223). */
export const CARAVAN_SPEED = 2.4;
export const HORSE_SPEED = 1.5;
/** Carga de cada animal e quantos animais por nível. */
export const CARAVAN_LOAD = 6;
/** Parte do teto que o assentamento guarda para si antes de vender. */
export const CARAVAN_KEEP = 0.35;
/** Custo da viagem por tile de distância, em unidades de troca (a caravana só sai se o lucro passar disso). */
export const CARAVAN_TRIP_COST = 0.05;
/** Quanto vale um ouro em unidades de troca. */
export const GOLD_VALUE = 5;
/** Preferência por parceiro com acordo, por feira e por comércio dentro de um reino que cunha moeda. */
export const AGREEMENT_PREFERENCE = 1.3;
export const FAIR_PREFERENCE = 1.5;
export const MINT_PREFERENCE = 1.2;
/** Relação que cada viagem entre reinos soma (×2 se um dos povos valoriza o comércio). */
export const CARAVAN_RELATION = 1.5;
/** Conhecimento que passa por viagem: fração da diferença de era (RF-VIDA-74), ×3 na feira. */
export const TRADE_TEACH = 0.01;
/** Ataques por ano de cada predador a até 3 tiles da caravana, e chance de inimigos em guerra a roubarem em cada tile perto deles. */
export const CARAVAN_PREDATOR = 1.5;
export const CARAVAN_RAID = 0.15;

/** Acordo comercial (RF-VIDA-232): viagens de ida e volta antes de firmar, relação mínima, duração e quebra. */
export const AGREEMENT_TRIPS = 2;
export const AGREEMENT_RELATION = 0;
export const AGREEMENT_YEARS = 20;
export const AGREEMENT_KEPT = 1;
export const AGREEMENT_BROKEN = 8;

/** Estrada pelo uso (RF-VIDA-233): passagens para virar estrada, cascalho e pedra; perda anual do uso. */
export const ROUTE_USE = 4;
export const GRAVEL_USE = 10;
export const STONE_USE = 24;
export const TRAFFIC_DECAY = 0.1;

/** Feira anual nas vilas e cidades mercantis (RF-VIDA-234): relação a mais por caravana que chega. */
export const FAIR_RELATION = 2;

/** Barcos mercantes entre portos que se conhecem (RF-VIDA-235): carga por barco. */
export const TRADE_BOAT_LOAD = 14;

/** Bens de luxo (RF-VIDA-282): produção por nível, teto, consumo dos ricos e o sal que conserva a comida. */
export const LUXURY_MAKE = 0.7;
export const LUXURY_USE = 0.03;
export const LUXURY_STABILITY = 0.05;
export const SPOIL_SALTED = 0.2;
export const SALT_USE = 0.02;

/** Pedágio (RF-VIDA-286): ouro por passagem num passo de montanha de outro reino, alcance do dono e a tensão que causa. */
export const TOLL_GOLD = 1;
export const TOLL_RANGE = 25;
export const TOLL_TENSION = 0.5;

/** Pedidos da capital (RF-VIDA-289): chance por ano, prazo, carga e efeito de atender ou recusar. */
export const REQUEST_RATE = 0.5;
export const REQUEST_YEARS = 3;
export const REQUEST_LOAD = 10;
export const REQUEST_STABILITY = 0.1;
export const REFUSAL_INDEPENDENCE = 0.5;

/** Moeda cunhada (RF-VIDA-291): carroças a mais dentro do reino. */
export const MINT_HAUL = 1.25;

/** Transumância (RF-VIDA-293): rebanho mínimo, alcance do pasto alto, velocidade, ganho do rebanho e briga ao cruzar terra alheia. */
export const TRANSHUMANCE_HEAD = 4;
export const TRANSHUMANCE_RANGE = 30;
export const FLOCK_SPEED = 1.2;
export const TRANSHUMANCE_GROWTH = 0.12;
export const TRANSHUMANCE_TENSION = 1;
