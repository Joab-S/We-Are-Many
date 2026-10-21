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

// Relevo, movimento e escolha do lugar (pedido do Joab em 21/10/2026, seção 19.18) ----------

/**
 * Diferença de altitude máxima entre dois tiles vizinhos que um bicho de terra
 * ou uma pessoa sobe ou desce a pé. O relevo natural fica abaixo de ~0,1; acima
 * disso é penhasco (terremoto, montanha erguida pelo jogador) e é preciso contornar.
 */
export const MAX_CLIMB = 0.12;
/** Segundos que a criatura segue contornando o obstáculo antes de voltar a mirar o destino. */
export const DETOUR_SECONDS = 1.6;
/** Segundos travada na beira da água, com destino do outro lado, até um inteligente pensar em fazer uma jangada. */
export const RAFT_STUCK = 3;
/** Raio (tiles) em que ele procura árvores para cortar, vegetação mínima de uma árvore e quantas árvores a jangada gasta. */
export const RAFT_TREE_RANGE = 5;
export const RAFT_TREE_VEG = 0.45;
export const RAFT_TREES = 3;
/** Madeira do estoque que a jangada gasta quando a pessoa é de um assentamento (no lugar das árvores, se der). */
export const RAFT_WOOD = 4;
/** Travessia máxima de jangada, em tiles de água, e velocidade (tiles por segundo). */
export const RAFT_RANGE = 30;
export const RAFT_SPEED = 0.9;
/** Segundos que um barco ou caravana fica parado tentando seguir antes de refazer a rota. */
export const REROUTE_SECONDS = 2.5;

/** Raio (tiles) avaliado antes de fundar um assentamento: área útil, relevo, água, comida e perigo. */
export const SITE_RADIUS = 8;
/** Parte mínima da terra da área de fundação que precisa ser plana e segura para construir (e ao menos 30% da área tem de ser terra). */
export const SITE_MIN_AREA = 0.6;
/** Desnível máximo entre vizinhos num lote de casa (2x2) e no centro do assentamento. */
export const SITE_MAX_SLOPE = 0.07;
/** Diferença máxima entre o ponto mais alto e o mais baixo da área de fundação (vila sobre penhasco). */
export const SITE_MAX_RELIEF = 0.3;
/** Até onde precisa haver água doce ou mar (tiles); da Idade do Ferro em diante, poços dispensam se o solo é úmido. */
export const SITE_WATER_RANGE = 12;
export const SITE_WELL_MOISTURE = 0.4;
/** Vegetação média mínima por perto (comida da coleta, caça e roças), a não ser que haja mar para pescar. */
export const SITE_MIN_FOOD = 0.22;
/** Distância mínima (tiles) de lava ou de chão quente demais: lava por perto pega fogo nas redondezas. */
export const SITE_LAVA_RANGE = 10;

/** Lava ainda quente queima o que estiver em volta: alcance (tiles) e chance por ano de cada tile de lava acender o vizinho. */
export const LAVA_FIRE_RANGE = 2;
export const LAVA_FIRE_RATE = 0.6;

// Construções e terreno (seção 19.18) -----------------------------------------------------

/** Desnível máximo dentro de uma casa (2x2) antes de ela desabar num barranco (terremoto, terreno erguido). */
export const HOUSE_MAX_RELIEF = 0.2;

// Recursos com peso (pedido do Joab em 21/10/2026, seção 19.19) ------------------------------
// Nada aparece no estoque sem trabalho: a madeira sai de árvores cortadas no mapa, a pedra de
// rocha e pedras soltas que acabam, a comida da coleta, da caça, das roças, do rebanho e da pesca.
// O que não cabe no estoque se perde, e só o saque leva bens de um lugar para outro sem troca.

/**
 * Energia por segundo que um morador tira sozinho do mato em volta (frutas, raízes), sem gastar
 * o mapa, e a de quem vive na beira da água (mariscos). Antes: 0,06 × (1 + era/2) e 0,05, mais que
 * o gasto do corpo (0,045): ninguém dependia do estoque e a comida não pesava.
 */
export const FORAGE = 0.02;
export const SHORE_FORAGE = 0.01;
/** Um bando pequeno ainda vive do mato: o forrageio de cada um é FORAGE_WILD ÷ (1 + moradores ÷ FORAGE_CROWD), nunca abaixo de FORAGE. */
export const FORAGE_WILD = 0.06;
export const FORAGE_CROWD = 3;
/** Porções por ano que um coletor traz quando acha o que colher, e quanto cada porção tira da vegetação do tile. */
export const GATHER_RATE = 2.4;
export const GATHER_BITE = 0.06;
/** Vegetação mínima de um tile para dar coleta; num tile de árvore a coleta para antes de derrubar a mata. */
export const GATHER_MIN = 0.3;
export const GATHER_TREE_FLOOR = 0.52;
/** Alcance da coleta além da borda do assentamento, em tiles. */
export const GATHER_REACH = 10;
/** Porções de carne que cada animal caçado põe no estoque, e a energia que o caçador ganha comendo na hora. */
export const HUNT_FOOD = 2;
export const HUNT_EAT = 0.15;

/** Madeira de uma árvore cortada. */
export const WOOD_PER_TREE = 2;
/** Árvores que um lenhador derruba por ano com a mata logo na borda do assentamento. */
export const CUT_RATE = 1.2;
/** Alcance do corte e da pedreira além da borda (tiles), +REACH_PER_ERA por era (estradas, carroças). */
export const WOOD_REACH = 12;
export const STONE_REACH = 18;
export const REACH_PER_ERA = 0.25;
/** Distância além da borda que corta pela metade o que um trabalhador traz; carroças por era e cavalos alongam. */
export const HAUL_TILES = 10;
export const CART_PER_ERA = 0.3;
export const HORSE_HAUL = 0.5;
/**
 * A mata fechada avança devagar: acima de TREE_BAND de vegetação o rebrotar natural anda a esta
 * fração do ritmo do capim (antes: o mesmo ritmo, e o planeta ganhava 60% de árvores em 250 anos).
 */
export const TREE_BAND = 0.4;
export const TREE_SPREAD = 0.25;
/** Vegetação máxima de um tile com toco ou muda (capim em volta) e a de uma árvore adulta de volta. */
export const FELLED_VEG_MAX = 0.45;
/** Chance por ano de um toco brotar sozinho com árvore adulta ao lado, e o fator longe da mata (clareira grande). */
export const SPROUT_RATE = 0.06;
export const SPROUT_FAR = 0.1;
/** Anos de uma muda até virar árvore adulta: a que brotou sozinha e a plantada e cuidada. */
export const TREE_YEARS = 50;
export const REPLANT_YEARS = 28;
/**
 * Manejo da mata: a partir desta era (ou desde o começo, se o povo cultua a Floresta) o
 * assentamento passa a replantar quando a mata ao alcance dá para menos de FORESTRY_YEARS
 * anos de corte. Replantar custa REPLANT_WORK do trabalho de cortar uma árvore; cada lenhador
 * planta PLANT_RATE mudas por ano nos tocos antigos.
 */
export const FORESTRY_TECH = 0.5;
export const FORESTRY_YEARS = 40;
export const REPLANT_WORK = 0.25;
export const PLANT_RATE = 1;

/** Pedra de cada tile: rocha e montanha, colina e chão comum (pedras soltas); o chão comum rende menos por trabalho. */
export const STONE_ROCK = 40;
export const STONE_HILL = 15;
export const STONE_FIELD = 1;
export const FIELD_STONE_RATE = 0.3;
/** Pedra por ano de cada minerador sem mina na rocha (construtores tiram metade). */
export const QUARRY_RATE = 1;

/**
 * Conserto das casas (uma casa consome madeira): madeira por ano por casa (mais por andar) e
 * por prédio; da Era Medieval, casa de pedra gasta pouca madeira e um pouco de pedra.
 */
export const HOUSE_UPKEEP = 0.3;
export const BUILDING_UPKEEP = 0.4;
export const STONE_HOUSE_UPKEEP = 0.12;
/** Anos sem conserto até a casa ficar vazia (caindo aos pedaços) e até desabar. */
export const DECAY_YEARS = 5;
export const COLLAPSE_YEARS = 12;
/** Energia por segundo que perde quem passa o inverno frio sem lenha (vezes a falta). */
export const FREEZE = 0.03;

/** Mortes de fome num ano a partir das quais a crônica fala de fome. */
export const FAMINE_DEATHS = 2;
/** Atendimento abaixo do qual o assentamento vê gente partir em busca de comida, lenha ou casa (migração), e quantos por ano no máximo. */
export const SCARCITY_LEVEL = 0.55;
export const SCARCITY_MOVERS = 3;
/**
 * Cobiça: reino com um assentamento abaixo de GREED_LEVEL de comida ou madeira, ao lado de um
 * vizinho que tem de sobra, perde relação com ele por ano (vezes a falta), e o reino mais forte
 * com fome parte para a guerra (chance por ano, vezes a falta e a fartura do outro).
 */
export const GREED_LEVEL = 0.7;
export const SCARCITY_TENSION = 4;
export const RESOURCE_WAR = 0.12;
/** Soldados (pela força das armas) que bastam para uma guerra de saque; a de conquista pede 4. */
export const RAID_FORCE = 2;

/**
 * Trabalho na falta: com comida ou lenha abaixo de CRISIS_NEED, a parte dos adultos que muda de
 * profissão por ano (até soldados e mineradores) e o teto de gente numa profissão; quem vira
 * adulto vai para o que mais falta quando o atendimento está abaixo de CHILD_NEED.
 */
export const CRISIS_NEED = 0.65;
export const LABOR_CRISIS_SHIFT = 0.4;
export const LABOR_CRISIS_MAX = 0.6;
export const CHILD_NEED = 0.65;
/** Atendimento abaixo do qual até soldados e guardas largam as armas para buscar comida ou lenha. */
export const SEVERE_NEED = 0.4;

// Guerras com motivo (seção 19.7, Etapa F).

/** No máximo uma guerra ao mesmo tempo para cada WARS_PER_KINGDOMS reinos do planeta, no mínimo uma (WARS_MAX). */
export const WARS_PER_KINGDOMS = 6;
/** Anos que um reino passa sem declarar guerra depois de sair de uma. */
export const WAR_COOLDOWN = 25;
/** Chance anual de guerra de extermínio por par que cumpre as condições (relação ≤ EXTERMINATION_RELATION, interesse em conflito, alvo fraco). */
export const EXTERMINATION_RATE = 0.002;
export const EXTERMINATION_RELATION = -80;
/** Cansaço de guerra: chance de paz por ano (base, mais por ano de guerra e por morto). */
export const PEACE_BASE = 0.03;
export const PEACE_PER_YEAR = 0.004;
export const PEACE_PER_DEATH = 1 / 150;
/** Chance anual de uma guerra de saque por cavalos, ferro ou ouro (vezes a cobiça), para um reino mais forte em relação ruim. */
export const COVET_WAR = 0.05;

/** Força do soldado montado (RF-VIDA-223): carro de guerra no Bronze e cavalaria do Ferro em diante; um cavalo por soldado. */
export const CHARIOT_STRENGTH = 1.6;
export const CAVALRY_STRENGTH = 2.0;
/** Logística: comida por soldado por ano de guerra, tirada do celeiro de casa; longe de casa (tiles) o exército perde força. */
export const ARMY_FOOD = 1;
export const ARMY_REACH = 60;
export const FAR_FROM_HOME = 0.8;
/** Força do exército sem comida nenhuma (com metade, metade do caminho até 1); dois anos seguidos abaixo de RETREAT_SUPPLY e ele volta. */
export const HUNGRY_ARMY = 0.6;
export const RETREAT_SUPPLY = 0.35;

/** Saque: parte do bem cobiçado e do rebanho que o bando leva, e roças queimadas na passagem. */
export const LOOT_SHARE = 0.5;
export const LOOT_HERD = 0.3;
export const BURNED_FIELDS = 2;
/** Anos que o bando leva no máximo para voltar com o saque antes de a guerra acabar sem ele. */
export const LOOT_RETURN_YEARS = 3;
/** Conquista: parte das casas queimadas e dos moradores que fogem para os vizinhos. */
export const RAZE_SHARE = 0.2;
export const REFUGEE_SHARE = 0.25;
/** Rancor: anos em que o povo vencido perde relação com o vencedor, e quanto por ano. */
export const GRUDGE_YEARS = 60;
export const GRUDGE_PULL = 1.5;

/** Mercenários (RF-VIDA-295): chance por ano de guerra (do 2º ano), quantos no máximo e o ouro que cada um custa. */
export const MERCENARY_RATE = 0.5;
export const MERCENARY_MAX = 4;
export const MERCENARY_PRICE = 2;
