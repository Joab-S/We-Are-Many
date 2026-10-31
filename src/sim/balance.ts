/**
 * Parâmetros da vida e das civilizações num lugar só (REQUISITOS-VIDA.md,
 * RF-VIDA-208 e seção 19.12). Taxas são por ano de jogo (λ); a chance num
 * passo sai de `chance(λ, dt)` em `stochastic.ts`. Mudar um valor aqui muda
 * o jogo inteiro: rode `npm run calibrar` depois.
 */

// Assentamentos ---------------------------------------------------------------

/** Casas novas por ano quando a população passa da capacidade (antes: 40% por segundo). */
export const HOUSE_RATE = 3;
/** Passo de quem anda a pé (fração de `Species.speed`, em tiles por segundo): calmo o bastante para ler a cena no x1. */
export const WALK_PACE = 0.6;
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
/**
 * Evolução dos povos, etapa 1: cada roça desenhada representa mais terra conforme o lugar cresce
 * (FIELD_HANDS × (1 + FIELD_HANDS_TIER × nível) agricultores por roça), já que o mapa continua com no máximo 5.
 * Antes o teto era fixo e um assentamento não passava de 40 a 60 moradores.
 */
export const FIELD_HANDS_TIER = 1;
/** Rendimento de cada agricultor por era (Pedra … Industrial): ferramentas, rotação, adubo e máquinas. Antes era o mesmo em todas. */
export const ERA_YIELD = [1, 1.2, 1.45, 1.75, 2.4];
/**
 * Natalidade dos inteligentes pela fome (etapas 1 e 2): com menos de BIRTH_FED_MIN dos moradores comendo bem quase não
 * nascem filhos; a partir de BIRTH_FED_FULL nascem todos. Antes a fome só tirava até metade dos nascimentos e o povo
 * crescia até morrer de fome. Conta quem comeu, não o celeiro (o atendimento de comida mistura os dois e fica perto de 0,6
 * mesmo com todos comendo).
 */
export const BIRTH_FED_MIN = 0.9;
export const BIRTH_FED_FULL = 1;
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
/**
 * Migração por nota (evolução dos povos, etapa 2): chance por ano de cada família pensar em se mudar,
 * multiplicada por 1 + MOVE_LACK × falta. Ela compara a nota de onde mora (mais o apego MOVE_STAY)
 * com a dos lugares do seu povo a até MOVE_RANGE + MOVE_RANGE_ERA × era tiles, descontando 1 ponto a
 * cada MOVE_DIST tiles e MOVE_FOREIGN (outro povo) ou MOVE_OTHER_KINGDOM (outro reino do mesmo povo).
 * MOVE_TEMPER espalha o sorteio: menor, todos escolhem o melhor; maior, decisões mais variadas.
 */
export const MOVE_THINK = 0.06;
export const MOVE_LACK = 4;
export const MOVE_STAY = 0.35;
export const MOVE_RANGE = 50;
export const MOVE_RANGE_ERA = 15;
export const MOVE_DIST = 120;
export const MOVE_FOREIGN = 0.6;
export const MOVE_OTHER_KINGDOM = 0.15;
export const MOVE_TEMPER = 0.25;
/** No êxodo (anos de falta), parte das famílias que sai para o melhor lugar conhecido ao alcance; sem nenhum, funda outro lugar. */
export const EXODUS_SHARE = 0.35;
/** Pesos da nota de um lugar: comida, lenha, casa sobrando, tamanho (log da população), nível, estabilidade e guerra (a pressão, abaixo). */
export const MOVE_FOOD = 1.5;
export const MOVE_FUEL = 0.5;
export const MOVE_ROOM = 0.4;
export const MOVE_CITY_PULL = 0.25;
export const MOVE_TIER_PULL = 0.1;
export const MOVE_STABLE = 0.3;
export const MOVE_WAR = 0.4;

// ---- Quando sair e fissão (agente 3B, proposta de assentamentos 3.2 e 3.3) ----

/**
 * Pressão social: (pop/DUNBAR)² / (1 + instituições). O tamanho pesa ao quadrado; as instituições somam
 * INST_ORG × o nível do pilar organização (0 a 1), INST_TIER por degrau (aldeia 0 ... metrópole 3),
 * INST_TEMPLE com templo, INST_POLITY pelo degrau político do reino, INST_WRITING com escrita, INST_COIN com
 * moeda e até INST_CIRCUM pela circunscrição (sem para onde ir, o lugar se organiza). Uma aldeia da Pedra
 * pesa 1 perto de 160 moradores; uma cidade com templo, escrita e reino, perto de 380.
 */
export const DUNBAR = 150;
export const INST_ORG = 1;
export const INST_TIER = 1;
export const INST_TEMPLE = 0.5;
export const INST_POLITY = { livre: 0, chefia: 0.3, reino: 1, império: 1.5 } as const;
export const INST_WRITING = 0.5;
export const INST_COIN = 0.5;
export const INST_CIRCUM = 1;
/** Anos de circunscrição para o efeito cheio nas instituições (e na guerra por terra). */
export const CIRCUM_FULL = 20;
/**
 * Circunscrição (Carneiro): com CIRCUM_NOTE anos seguidos o lugar vira notícia; cada ano rende até
 * CIRCUM_ORG_POINTS pontos no pilar organização (sem para onde ir, o lugar se organiza). O reino com um
 * lugar circunscrito, mais forte que o vizinho em LAND_WAR_FORCE vezes e com a relação abaixo de
 * LAND_WAR_REL, planeja guerra por terra com chance LAND_WAR_CIRCUM por ano (vezes o aperto, de 0 a 1).
 */
export const CIRCUM_NOTE = 5;
export const CIRCUM_ORG_POINTS = 1;
export const LAND_WAR_CIRCUM = 0.15;
export const LAND_WAR_FORCE = 1;
export const LAND_WAR_REL = 30;
/**
 * Reus: quem domina e saqueia é quem tem fartura e força, não quem passa fome. A fartura do próprio reino
 * (0 a 1) vezes a vantagem de força (de 1× a 3×, de 0 a 1) soma REUS_LOOT à chance de saque e REUS_DOMINION à de domínio.
 */
export const REUS_LOOT = 0.04;
export const REUS_DOMINION = 0.06;
/** Estabilidade: a pressão acima de PRESSURE_CALM tira PRESSURE_STABILITY por ponto, até PRESSURE_STABILITY_MAX. */
export const PRESSURE_CALM = 0.6;
export const PRESSURE_STABILITY = 0.15;
export const PRESSURE_STABILITY_MAX = 0.25;
/**
 * Nota do lugar (`placeScore`): a pressão de lá, vezes MOVE_PRESSURE, sai da nota. O prêmio de tamanho
 * (MOVE_CITY_PULL e MOVE_TIER_PULL) cresce com o log da população; a pressão, com o quadrado, então a cidade
 * atrai até encher para as instituições que tem, e não sem fim.
 */
export const MOVE_PRESSURE = 0.5;
/**
 * Fissão por pressão: com a pressão acima de PRESSURE_SCOUT os batedores procuram sítios e as famílias podem
 * escolher fundar (src/ai/decisions/move.ts); a pressão acima dele também faz mais famílias pensarem em sair
 * (MOVE_PRESS_THINK por ponto, por ano, somado a MOVE_THINK). Acima de PRESSURE_FISSION, sem sítio nenhum, o
 * lugar está circunscrito. A colônia se organiza quando FISSION_CORE famílias escolhem fundar no mesmo ano (o
 * núcleo: na partida, as mais dispostas completam o grupo) e leva até FISSION_SHARE do povo (no mínimo COLONY_GROUP_MAX).
 */
export const PRESSURE_SCOUT = 0.7;
export const PRESSURE_FISSION = 1;
/**
 * Pressão da terra (`landPressure`): com menos de HUNGER_LEVEL comendo bem e sem lote para mais roça ao
 * alcance, LAND_PRESSURE × a fome soma à pressão social na fissão (a colônia sai atrás de terra).
 */
export const LAND_PRESSURE = 4;
export const MOVE_PRESS_THINK = 0.4;
export const FISSION_CORE = 2;
export const FISSION_SHARE = 0.3;
/** Peso a mais, na vontade de ir com a colônia, das famílias que escolheram fundar. */
export const FISSION_KEEN = 2;
/** Êxodo (agente 3B): a partir de quantos moradores o lugar em falta manda colônia atrás de terra antes de buscar refúgio. */
export const FAMINE_COLONY_POP = 60;
/** Grupo mínimo (pessoas, famílias inteiras) para uma família de um lugar em falta partir sozinha para longe (`colonizeByLand`). */
export const LONE_GROUP_MIN = 6;
/**
 * Quem anda sozinho (`loner`, andarilho ou solto pelo jogador) não funda vila de uma pessoa: procura outros
 * solitários do povo a até LONER_SEEK tiles e só funda com LONER_GROUP_MIN juntos (a até LONER_MEET tiles do
 * guia, o de menor uid). Num lugar bom, o grupo funda com LONER_FOUND_RATE por ano (RF-VIDA-300; antes, 25% a
 * cada decisão).
 */
export const LONER_GROUP_MIN = 3;
export const LONER_SEEK = 40;
export const LONER_MEET = 4;
export const LONER_FOUND_RATE = 4;
/** Epidemias por ano numa cidade grande sem saneamento, por 100 moradores (RF-VIDA-284). */
export const EPIDEMIC_RATE = 0.02;
/** Parte dos moradores que uma epidemia atinge. */
export const EPIDEMIC_SHARE = 0.06;
/**
 * Peso da chance de colonos quando o lugar está lotado (`crowded`: sem lote nem reforma). Antes havia também
 * COLONY_PRESSURE_ROOM (com espaço), COLONY_MIN_POP, COLONY_MIN_TIER e COLONY_MIN_FACTOR, que ninguém lia mais.
 */
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
/** Parte dos moradores comendo bem a partir da qual um lugar menor manda comida para o maior do mesmo reino (etapa 2). */
export const SUPPLY_FED = 0.95;

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
/**
 * Pasto que cada cabeça do rebanho come por ano em volta dos currais (Plano 2), em tiles de erva:
 * o mesmo pasto dos herbívoros selvagens. Pasto rapado (por eles ou pelos selvagens) segura o crescimento.
 */
export const HERD_GRAZE = 0.6;
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
/**
 * Fogo natural (Plano 2): no auge do verão, células de mata densa são sorteadas e pegam fogo por raio
 * com esta chance vezes a secura ao cubo (secura 1 = solo seco em ano de seca). No máximo
 * WILDFIRE_MAX focos por ano no planeta; o fogo anda WILDFIRE_STEPS passos com o vento.
 */
export const WILDFIRE_RATE = 0.2;
export const WILDFIRE_MAX = 3;
export const WILDFIRE_STEPS = 5;

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
export const SPROUT_RATE = 0.1;
export const SPROUT_FAR = 0.1;
/** Anos de uma muda até virar árvore adulta: a que brotou sozinha e a plantada e cuidada. */
export const TREE_YEARS = 35;
export const REPLANT_YEARS = 18;
/**
 * Manejo da mata: a partir desta era (ou desde o começo, se o povo cultua a Floresta) o
 * assentamento passa a replantar quando a mata ao alcance dá para menos de FORESTRY_YEARS
 * anos de corte. Replantar custa REPLANT_WORK do trabalho de cortar uma árvore; cada lenhador
 * planta PLANT_RATE mudas por ano nos tocos antigos.
 */
export const FORESTRY_TECH = 0;
export const FORESTRY_YEARS = 90;
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
/**
 * Antes (21/10): 0,3 por casa e 0,4 por prédio, 5 anos até a casa esvaziar e 12 até desabar, árvore
 * em 50 anos (28 plantada): casa nova e conserto brigavam pela mesma madeira e alguns lugares não
 * se sustentavam. Agora o conserto é mais leve, dá mais tempo, a mata volta mais depressa e a obra
 * nova só começa com o conserto do ano garantido (REPAIR_RESERVE anos de conserto guardados).
 * Depois (22/10, vilas caindo antes de a mata voltar): a árvore plantada leva REPLANT_YEARS e a
 * muda sozinha TREE_YEARS, então a casa agora aguenta DECAY_YEARS/COLLAPSE_YEARS sem conserto
 * (12 e 32 anos, antes 8 e 20) e o manejo da mata começa sem exigir era (FORESTRY_TECH 0), com
 * 90 anos de antecedência (FORESTRY_YEARS), em vez de só depois de a mata ao alcance acabar.
 */
export const HOUSE_UPKEEP = 0.15;
export const REPAIR_RESERVE = 1;
export const BUILDING_UPKEEP = 0.25;
export const STONE_HOUSE_UPKEEP = 0.08;
/** Anos sem conserto até a casa ficar vazia (caindo aos pedaços) e até desabar. */
export const DECAY_YEARS = 12;
export const COLLAPSE_YEARS = 32;
/** Energia por segundo que perde quem passa o inverno frio sem lenha (vezes a falta). */
export const FREEZE = 0.03;

/** Mortes de fome num ano a partir das quais a crônica fala de fome. */
export const FAMINE_DEATHS = 2;
/**
 * Falta (mais famílias pensam em se mudar; anos seguidos levam ao êxodo): lenha abaixo de SCARCITY_LEVEL de atendimento,
 * ou menos de HUNGER_LEVEL dos moradores comendo bem (antes, o celeiro vazio contava como falta mesmo com todos comendo).
 */
export const SCARCITY_LEVEL = 0.55;
export const HUNGER_LEVEL = 0.85;
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

/** Trégua mínima entre dois reinos depois de uma paz; depois dela, só a prontidão (READY_LEVEL) segura uma guerra nova. */
export const TRUCE_MIN = 3;
/** Chance anual de guerra de extermínio por par que cumpre as condições (relação ≤ EXTERMINATION_RELATION, interesse em conflito, alvo fraco). */
export const EXTERMINATION_RATE = 0.002;
export const EXTERMINATION_RELATION = -80;
/** Cansaço de guerra: chance de paz por ano (base, mais por ano de guerra e por morto). */
export const PEACE_BASE = 0.03;
export const PEACE_PER_YEAR = 0.004;
export const PEACE_PER_DEATH = 1 / 150;
/** Chance anual de uma guerra de saque por cavalos, ferro ou ouro (vezes a cobiça), para um reino mais forte em relação ruim. */
export const COVET_WAR = 0.05;
/** Chance anual de guerra por vingança (rancor de quem perdeu) e por fé (povo devoto contra crença diferente, vezes a intolerância). */
export const REVENGE_WAR = 0.15;
export const FAITH_WAR = 0.03;

/**
 * Preparo para a guerra: quem tem motivo não declara na hora, junta primeiro comida (PREP_FOOD_YEARS anos
 * de exército), armas (uma por soldado), armaduras (PREP_ARMOR por soldado) e ouro (PREP_GOLD por era) até a
 * prontidão chegar a READY_LEVEL e a força passar a do alvo (como ele a vê, com erro de BELIEF_NOISE) pela
 * vantagem do motivo. Desiste depois de PREP_MAX_YEARS ou quando a tensão passa (relação acima de PEACE_REL).
 */
export const READY_LEVEL = 0.75;
export const ADVANTAGE = 1.25;
export const ADVANTAGE_RAID = 0.9;
export const ADVANTAGE_EXTERMINATION = 2;
export const PREP_FOOD_YEARS = 3;
export const PREP_ARMOR = 0.5;
export const PREP_GOLD = 3;
export const PREP_MAX_YEARS = 40;
export const PEACE_REL = 25;
export const BELIEF_NOISE = 0.2;
/** Agressividade de um reino (-1 passivo a 1 agressivo): cada intervenção do jogador soma TEMPER_STEP e some TEMPER_FADE por ano; muda a chance de ter motivo (vezes 1 + agressividade) e o preparo exigido (TEMPER_READY, TEMPER_ADVANTAGE por unidade). */
export const TEMPER_STEP = 0.5;
export const TEMPER_FADE = 0.03;
export const TEMPER_READY = 0.2;
export const TEMPER_ADVANTAGE = 0.3;
/** Tensão que o jogador soma ou tira da relação entre dois reinos. */
export const PLAYER_TENSION = 25;

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

// ---- Ações com presença (REQUISITOS-VIDA.md, seção 19.21) ----

/**
 * Chave por ofício: com a presença ligada, o mundo só muda quando um NPC do ofício está no tile
 * pelo tempo do gesto; desligada, vale a taxa agregada de antes (comparação na calibração).
 */
export const PRESENCE_WOOD = true;
/** Distância (tiles) a que o NPC precisa estar do alvo para o gesto contar. */
export const JOB_REACH = 1.6;
/**
 * Segundos do gesto de derrubar uma árvore sem ferramenta e com a mata na porta. A taxa de antes dava 5 s (um ano ÷ CUT_RATE);
 * com a presença sobra tempo andando e esperando lugar no armazém, então o gesto é mais curto para a lenha por ano ficar a mesma.
 */
export const FELL_SECONDS = 3.1;
/** Segundos para plantar uma muda num toco, e quantas mudas cada árvore cortada deixa a plantar (o PLANT_RATE de antes ÷ CUT_RATE). */
export const PLANT_SECONDS = 2.5;
export const PLANT_PER_FELL = PLANT_RATE / CUT_RATE;
/** Ferramenta não é exigida; o assentamento com ferramentas em estoque trabalha mais rápido (TOOL_SPEED, o 1,4 de antes). */
export const TOOL_SPEED = 1.4;
/** Segundos andando sem chegar ao alvo antes de largar a ordem, e anos que o tile fica fora do quadro de serviços. */
export const JOB_TIMEOUT = 40;
export const JOB_BLOCK_YEARS = 5;
/** Quantas árvores livres da lista o lenhador compara para escolher a mais perto de si. */
export const JOB_CHOICES = 8;

/** Obra presencial: chave, alcance (tiles até o centro da casa), construtores por obra e trabalho de um construtor por ano de obra (1 = o tempo de andaime de antes). */
export const PRESENCE_BUILD = true;
export const BUILD_REACH = 2.4;
export const JOB_SLOTS_BUILD = 4;
export const BUILD_LABOR = 1;

// ---- Plano novo dos assentamentos (REQUISITOS-VIDA.md, seção 20, RF-AS) ----

/** Fase 1, nascimento: menor distância (tiles) entre um lugar novo e uma aldeia, vila, cidade ou metrópole (RF-AS-05). */
export const SPACING = [14, 22, 30, 30];
/** Colônia organizada (RF-AS-03): moradores mínimos da origem, pessoas no grupo e anos de batedores antes de partir. */
export const COLONY_SOURCE_POP = 40;
/** Anos entre duas colônias do mesmo lugar: a origem precisa se refazer antes de mandar outro grupo. */
export const COLONY_COOLDOWN = 25;
export const COLONY_GROUP_MIN = 12;
export const COLONY_GROUP_MAX = 30;
export const COLONY_SCOUT_YEARS = 1;
/** Sítios candidatos que os batedores visitam e alcance da busca (tiles além do espaçamento). */
export const COLONY_SCOUTS = 3;
export const COLONY_REACH = 40;
/** Nota do sítio (RF-AS-04): pesos de cada fator. */
export const SITE_W_WATER = 1.2;
export const SITE_W_FERTILE = 1.5;
export const SITE_W_FOREST = 0.5;
export const SITE_W_ROCK = 0.4;
export const SITE_W_FLAT = 0.8;
export const SITE_W_COAST = 1;
export const SITE_W_RUIN = 1.2;
export const SITE_W_DEFENSE = 0.3;
export const SITE_W_ROUTE = 0.4;
export const SITE_W_MOTIVE = 1.5;
/** Distância ideal da origem (tiles) e quanto a nota cai por tile fora dela. */
export const SITE_IDEAL_DIST = 30;
export const SITE_DIST_COST = 0.03;

// ---- Onde assentar (onda 3, frente 3A): captação no alcance real, água graduada, penalidades graduais e campo de notas ----

/**
 * Captação (RF-AS-04): o lugar novo é avaliado no alcance de quem vai morar nele, não só no disco de SITE_RADIUS.
 * O raio parte do território que o lugar terá com SITE_CATCH_POP moradores (`radius`) e soma o alcance da coleta
 * (GATHER_REACH vezes o fator do modo de vida), do corte (WOOD_REACH) e da pedreira (STONE_REACH), como no trabalho
 * (`reachOf`). SITE_CATCH_POP é também a gente que divide a captação na distribuição livre ideal (IFD).
 */
export const SITE_CATCH_POP = 25;
/** Modo de vida pela era (`catchRadius`, até haver `Village.lifeway`): coletores da Pedra vão mais longe atrás de comida. */
export const SITE_LIFEWAY_GATHER = [1.4, 1.15, 1, 1, 1, 1];
/** Decaimento da captação: cada célula pesa 1/(1 + d/SITE_DECAY), com d em tiles até o centro dela. */
export const SITE_DECAY = 12;
/** Árvores de pé e rocha (fração da área da captação) que já valem mata e pedreira cheias. */
export const SITE_WOOD_FULL = 0.25;
export const SITE_ROCK_FULL = 0.08;
/** Pesca: quanto a fração de água (mar ou lago) na captação soma à comida (a terra conta só a vegetação). */
export const SITE_FISH_FOOD = 0.35;
/** Jazida conhecida pelo reino e útil na era (`wanted`): peso na nota, até a soma dos decaimentos chegar a 1. */
export const SITE_W_ORE = 0.6;
/** Peso da pedra e do minério por era (Pedra, Bronze, Ferro, Medieval...): a técnica muda o que vale ter por perto. */
export const SITE_ERA_ROCK = [0.5, 1, 1.3, 1.5, 1.5, 1.5];
export const SITE_ERA_ORE = [0.4, 1, 1.2, 1.2, 1.3, 1.3];
/**
 * Clima: quanto vale estar a até SITE_CLIMATE_EASY K do meio da faixa de temperatura da espécie; o valor cai a zero
 * em mais SITE_CLIMATE_SPAN K (a faixa de quem vive é larga, a de quem prospera, não). Fora da faixa, com folga de
 * SITE_TEMP_MARGIN K, ninguém funda.
 */
export const SITE_W_CLIMATE = 0.8;
export const SITE_CLIMATE_EASY = 8;
export const SITE_CLIMATE_SPAN = 15;
export const SITE_TEMP_MARGIN = 0;
/** Vegetação mínima no centro, igual em todas as entradas (antes ia de 0 a 0,3); com poço sobre água no subsolo, nenhuma. */
export const SITE_CENTER_GREEN = 0.2;
/**
 * Água graduada: corpo d'água com SITE_SEA_SIZE tiles ou mais é mar, salgado (dá peixe e porto, não mata a sede).
 * Água doce é lago a até SITE_WATER_RANGE, nascente e córrego no solo encharcado (SITE_SPRING_MOISTURE: o mapa não
 * tem rios) ou, da Idade do Ferro em diante, poço sobre água no subsolo (SITE_WELL_MOISTURE).
 */
export const SITE_SEA_SIZE = 600;
export const SITE_SPRING_MOISTURE = 0.6;
/** Nota da água doce (0 a 1): lago a até 3 tiles e na borda do alcance, nascente (no limiar e no solo mais úmido) e poço. */
export const SITE_WATER_LAKE_NEAR = 1;
export const SITE_WATER_LAKE_FAR = 0.4;
export const SITE_WATER_SPRING = [0.5, 0.8];
export const SITE_WATER_WELL = 0.5;
/** Penalidades graduais: sobreposição da captação com a dos lugares vivos (0 a 1) e distância da capital do reino (como no Civ IV). */
export const SITE_W_OVERLAP = 1.2;
export const SITE_CAPITAL_FREE = 45;
export const SITE_CAPITAL_COST = 0.02;
/** Melhor de N: candidatos que entram na nota e quantos dos melhores passam, em ordem, pelo exame da área (`siteProblem`). */
export const SITE_CANDIDATES = 24;
export const SITE_VETO_K = 4;
/**
 * Nota mínima para uma colônia ou colonos de barco fundarem: abaixo dela ninguém vai (fundação ruim morre cedo).
 * Uma família sozinha (`colonizeByLand`), sem ninguém por perto para ajudar, pede mais.
 */
export const SITE_MIN_VALUE = 4.2;
export const SITE_MIN_SOLO = 5;
/** Campo de notas (mapa de influência): anos de uma volta completa pelas células e células sujas refeitas por passo, além da fatia da volta. */
export const SITE_FIELD_YEARS = 2;
export const SITE_DIRTY_PER_STEP = 8;
/** Desembarque: raio (tiles) em volta da praia onde os colonos procuram o melhor lugar antes de desistir. */
export const SITE_LANDING_REACH = 8;
/** Sítio rural (RF-AS-02): distância do núcleo e sítios por assentamento (FARMSTEAD_FAMILIES e FARMSTEAD_RATE não eram lidos e saíram). */
export const FARMSTEAD_MIN = 6;
export const FARMSTEAD_MAX = 15;
export const FARMSTEADS_MAX = 6;
/** Sítio que se emancipa: moradores e distância mínima do núcleo. */
export const FARMSTEAD_FREE_POP = 25;
export const FARMSTEAD_FREE_DIST = 12;
/** Família sozinha só funda longe de qualquer lugar conhecido (RF-AS-01). */
export const LONE_FOUND_DIST = 40;
/** Lugar pequeno e em falta: com até tantos moradores, a última leva se muda (RF-AS-08). */
export const LAST_WAVE_POP = 4;

/**
 * Fase 2, degraus (RF-AS seção 4): moradores mínimos de aldeia, vila, cidade e metrópole. Abaixo de
 * CAMP_POP, sem casa de verdade, a aldeia ainda é um acampamento de tendas.
 */
/** Limiares do porte econômico (`scale`): os antigos degraus por população, que regem produção, estoque e comércio. */
export const SCALE_POPULATION = [0, 25, 60, 140];
export const TIER_POPULATION_NEW = [0, 40, 120, 400];
export const CAMP_POP = 10;
/** Descida de nível: fração do limiar e anos seguidos abaixo dela (ou sem as funções do nível). */
export const TIER_DOWN_SHARE = 0.7;
export const TIER_DOWN_YEARS = 20;
/** Metrópole sem ser capital: precisa ser a cidade de referência de pelo menos tantos lugares. */
export const METROPOLIS_MARKET = 5;
/** Pegada (RF-AS-10): raio mínimo e folga em volta das casas; alcance da busca de lote além da pegada. */
export const FOOTPRINT_MIN = 4;
export const FOOTPRINT_PAD = 2;
export const LOT_REACH = 4;
/** Valor do solo (RF-AS-11): custo por tile de distância, bônus por vizinho construído, por água e por frente de rua. */
export const LAND_DIST = 1;
export const LAND_CLUSTER = 0.6;
export const LAND_WATER = 1.5;
export const LAND_FRONT = 1.2;
/** Núcleo denso (RF-AS-12): parte da pegada onde as casas podem encostar umas nas outras. */
export const CORE_SHARE = 0.55;
/** Caminho de acesso de uma casa nova até a rede (tiles). */
export const ACCESS_REACH = 10;
/** Roças (RF-AS-16): distância da borda das casas e teto de roças no mapa. */
export const FIELD_RING = 6;
export const FIELDS_MAX = 24;
/** Casa sem família (RF-AS-17): anos até ficar vazia e começar a cair. */
export const IDLE_HOUSE_YEARS = 10;
/** Muralha (RF-AS-18): folga além das casas do núcleo, anos entre revisões e custo por tile (madeira na paliçada, pedra na muralha). */
export const WALL_PAD = 1.5;
export const WALL_REVIEW_YEARS = 15;
export const WALL_WOOD = 0.6;
export const WALL_STONE = 0.8;

/**
 * Fase 3, jornadas (RF-AS-20 a 31): segundos de gesto por tarefa, quanto cada necessidade sobe por
 * segundo e a partir de quanto ela vira prioridade.
 */
export const TASK_SECONDS = 1.6;
/** Carga de uma pessoa por viagem ao celeiro, e o multiplicador da carroça da vila em diante (RF-AS-24). */
export const CARRY_LOAD = 3;
export const CART_LOAD = 3;
/** Reserva por morador que as famílias buscam direto no pátio quando o celeiro fica abaixo dela (comida e lenha). */
export const YARD_RESERVE_FOOD = 1;
export const YARD_RESERVE_WOOD = 0.5;
export const NEED_REST = 0.08;
export const NEED_SOCIAL = 0.05;
export const NEED_FAITH = 0.03;
export const NEED_URGENT = 0.75;
/** Folga do modo agregado: só os assentamentos a até tantos tiles da tela rodam as jornadas. */
export const JOURNEY_MARGIN = 20;
/** Festa da colheita: duração (fração do ano) no fim do outono. */
export const FESTIVAL_SPAN = 0.06;
/** Comida mínima (atendimento) para ter festa; enterro e alarme (fração do ano) e a distância em que o inimigo à vista toca o alarme. */
export const FESTIVAL_FED = 0.7;
export const FUNERAL_SPAN = 0.08;
export const ALARM_SPAN = 0.25;
export const ALARM_DIST = 12;
/** Curiosos na praça quando chega uma caravana (fração do ano). */
export const CURIOUS_SPAN = 0.08;

/** Fase 4, ruas por uso (RF-AS-13): desgaste para virar trilha e rua, decaimento por ano e anos sem uso até sumir. */
export const TRAIL_WEAR = 40;
export const ROAD_WEAR = 160;
export const WEAR_FADE = 0.75;
export const WEAR_IDLE = 8;
export const ROAD_FORGET_YEARS = 30;
/** Desgaste de um segundo de passos de uma pessoa no modo completo (o tráfego anual do agregado vem de HOME_TRIPS e FIELD_TRIPS). */
export const STEP_WEAR = 3;
/** Viagens de cada casa até a praça e de cada roça até o celeiro por ano (tráfego do modo agregado). */
export const HOME_TRIPS = 12;
export const FIELD_TRIPS = 8;

/** Fase 5, relações (RF-AS-40 a 53). */
export const AFFINITY_RANGE = 60;
export const AFFINITY_FADE = 0.06;
export const AFFINITY_KIN = 0.8;
export const AFFINITY_TRADE = 3;
export const AFFINITY_PEOPLE = 1;
export const AFFINITY_FAITH = 0.8;
export const AFFINITY_RIVAL = 4;
export const AFFINITY_GRUDGE = 3;
export const AFFINITY_AID = 12;
export const AFFINITY_REFUSE = 10;
export const AFFINITY_FEAST = 4;
/** Casamento entre lugares: visitantes por ano e alcance. */
export const VISITORS = 4;
export const VISIT_RANGE = 40;
/** Chance por ano de um lugar mandar visita, e de um solteiro sem par em casa casar num vizinho (RF-AS-40 e 42). */
export const VISIT_RATE = 0.25;
export const MARRY_ACROSS = 0.25;
/** Atendimento de comida abaixo do qual o lugar pede ajuda (RF-AS-45). */
export const AID_HUNGER = 0.55;
/** Distância (tiles) em que dois rebanhos disputam o mesmo pasto (RF-AS-46). */
export const RIVAL_PASTURE = 18;
/** Lealdade de um lugar livre a si mesmo (outro centro precisa atrair mais que isso, mais a margem) e chance anual de revolta com lealdade baixa. */
export const LOYALTY_FREE = 0.45;
export const SECEDE_RATE = 0.1;
/** Cidade de referência: alcance e custo da distância. */
export const MARKET_RANGE = 50;
/** Ajuda: parte do excedente que vai para quem pede e anos para cobrar a dívida. */
export const AID_SHARE = 0.3;
export const DEBT_YEARS = 25;
/** Rivalidade por recurso: chance por ano de incidente quando os territórios se sobrepõem. */
export const RIVALRY_RATE = 0.15;
/** Lealdade: margem e anos para mudar de lado; limiar e anos para a revolta. */
export const LOYALTY_MARGIN = 0.15;
export const LOYALTY_YEARS = 10;
export const LOYALTY_REVOLT = 0.2;
/** Capital que se move: quanto maior a outra cidade precisa ser, por quantos anos. */
export const CAPITAL_MOVE_SHARE = 1.5;
export const CAPITAL_MOVE_YEARS = 30;
/** Deriva cultural: por ano quando isolado, de volta por ano quando convive, e o limiar de um povo novo. */
export const DRIFT_RATE = 1;
export const DRIFT_BACK = 1.5;
export const DRIFT_LIMIT = 150;
/** Território de trabalho (RF-AS-10): raio base, quanto cresce com a raiz da população e o teto (antes: raio fixo por nível, 8 a 25). */
export const TERRITORY_BASE = 5;
export const TERRITORY_GROWTH = 1.7;
export const TERRITORY_MAX = 34;
/** Quanto a relação entre reinos anda por ano rumo à média das afinidades (RF-AS-53). */
export const AFFINITY_PULL = 0.1;

// Bioma e modo de vida (agente 3C: src/sim/biomeYield.ts, REQUISITOS-VIDA.md "Bioma e sociedade") -----------------

/**
 * Estação de crescimento da roça pela temperatura média do tile (K): abaixo de GROW_COLD_K rende só GROW_MIN,
 * acima de GROW_WARM_K o ano inteiro serve. É o que deixa a tundra e a taiga desmatada com a roça curta.
 */
export const GROW_COLD_K = 266;
export const GROW_WARM_K = 282;
export const GROW_MIN = 0.1;
/**
 * Amplitude das estações (colheita, coleta e lenha do inverno) pela latitude: SEASON_AMP_EQUATOR no equador e
 * SEASON_AMP_POLE no polo, vezes o `seasonAmp` do bioma, até SEASON_AMP_MAX (acima disso a primavera ficaria
 * negativa). Com 1, a estação é a dos vetores SEASON_* (antes, igual no planeta inteiro), e é o que vale perto da
 * latitude 0,25, onde vive quase todo o povo da Terra do jogo: com o trópico bem mais plano (0,4 no equador), a
 * calibração curta perdia gente e era (a economia foi calibrada com a colheita concentrada no outono).
 */
export const SEASON_AMP_EQUATOR = 0.8;
export const SEASON_AMP_POLE = 1.6;
export const SEASON_AMP_MAX = 1.25;
/** Relevo para a defesa: altura do centro acima de RELIEF_LOW (normalizada por RELIEF_HIGH_SPAN) e desvio da altura na área (RELIEF_RUGGED vale 1). */
export const RELIEF_LOW = 0.15;
export const RELIEF_HIGH_SPAN = 0.4;
export const RELIEF_RUGGED = 0.12;
/** Comida guardada no inverno gelado (abaixo de 0 °C) estraga menos: o perecimento multiplica por isto. */
export const FROZEN_SPOIL = 0.4;
/**
 * Modo de vida (`lifewayFor`): nômade com a roça da área abaixo de NOMAD_FARM e menos de NOMAD_DENSITY moradores por
 * 100 tiles do território; intensivo com arado, irrigação ou moinho, roça a partir de INTENSIVE_FARM e densidade a
 * partir de INTENSIVE_DENSITY. As margens seguram o modo de agora (sair dele pede passar o limiar mais a margem).
 */
export const NOMAD_FARM = 0.4;
export const NOMAD_DENSITY = 4.5;
export const INTENSIVE_FARM = 0.7;
export const INTENSIVE_DENSITY = 5;
export const LIFEWAY_MARGIN = 0.08;
export const LIFEWAY_DENSITY_MARGIN = 0.5;
/** Captação relativa pelo modo de vida (`lifewayReach`, para a nota do sítio): o nômade anda mais, o intensivo trabalha perto. */
export const NOMAD_REACH = 1.5;
export const INTENSIVE_REACH = 0.8;
/** O intensivo põe mais braços em cada roça (FIELD_HANDS × (1 + INTENSIVE_HANDS)) e tira mais dela (adubo, rotação, canteiros). */
export const INTENSIVE_HANDS = 0.5;
export const INTENSIVE_YIELD = 1.15;
/** Coleta esgotada para o nômade: vegetação da área abaixo desta parte do que ela aguenta conta como falta (a família pensa em mudar o acampamento). */
export const NOMAD_FORAGE = 0.45;
/**
 * Boserup (`needPull`): a fome puxa a descoberta das técnicas que intensificam a lavoura e o rebanho (BOSERUP_TECHS), que
 * multiplica por 1 + BOSERUP_K × (1 − parte dos moradores que comeu bem); só a fome extrema (menos de BOSERUP_STARVING
 * comendo bem) trava. As outras técnicas param com o atendimento de comida abaixo de DISCOVER_FED, como antes.
 */
export const BOSERUP_TECHS: readonly string[] = ['domesticacao', 'arado', 'irrigacao', 'moinho', 'moinhoagua'];
export const BOSERUP_K = 2;
export const BOSERUP_STARVING = 0.15;
export const DISCOVER_FED = 0.4;
/** Peças que o comércio traz (`tradedPieces`): cada ferramenta, arma ou armadura de metal recebida conta esta parte de uma peça forjada no lugar. */
export const TRADED_PIECES = 0.5;
/**
 * Domesticação pelos critérios de Diamond (`meetsDiamond`, species.ts): pastador de DOMESTIC_MASS kg, adulto em até
 * DOMESTIC_MATURITY anos, manada de DOMESTIC_HERD ou mais e medo até DOMESTIC_FEAR. Bicho de outro planeta a partir de
 * DOMESTIC_BIG kg vira gado; menor, cabra.
 */
export const DOMESTIC_MASS: readonly [number, number] = [25, 1200];
export const DOMESTIC_MATURITY = 4;
export const DOMESTIC_HERD = 6;
export const DOMESTIC_FEAR = 0.8;
export const DOMESTIC_BIG = 250;
/** Região onde o lugar procura bicho para domesticar: o território mais estes tiles (antes, a domesticação valia com qualquer herbívoro vivo no planeta). */
export const DOMESTIC_REACH = 20;
/**
 * Rebanho que se espalha pelos vizinhos (`herdNeighbor`): o parceiro (reino ou acordo) a até HERD_SHARE_RANGE tiles com
 * HERD_SHARE_MIN cabeças ou mais cede HERD_SHARE_HEAD a quem não tem o bicho selvagem por perto. Com 60 tiles, 8 e 3, a calibragem
 * curta (20 sementes, planeta pequeno) tinha menos gente, menos era e menos vocações diferentes.
 */
export const HERD_SHARE_RANGE = 90;
export const HERD_SHARE_MIN = 5;
export const HERD_SHARE_HEAD = 2;
/**
 * Preço por utilidade (`usefulness`, trade.ts): o bem que a técnica do lugar ainda não usa vale USELESS_GOOD do preço;
 * o cobre e o estanho, depois da siderurgia, BRONZE_AFTER_IRON; o carvão, com o vapor, STEAM_COAL.
 */
export const USELESS_GOOD = 0.4;
export const BRONZE_AFTER_IRON = 0.8;
export const STEAM_COAL = 1.5;
/** Defesa pelo relevo (`homeGround`): quem luta no próprio território vale 1 + DEFENSE_RELIEF × relevo (0 plano, 1 serra). */
export const DEFENSE_RELIEF = 0.5;
/** Densidade na costa: o porto abriga PORT_HOUSING + era moradores (cais, armazéns e casas de pescadores; antes, nenhum). */
export const PORT_HOUSING = 3;
