import type { PlanetParams } from '../procgen/surface';

/** Título da seção dos outros planetas em docs/CALIBRACAO-LONGA.md. */
export const OTHER_PLANETS = '## Outros planetas';

/**
 * A leitura das tabelas, escrita à mão: a calibração a repete no relatório, e quem mudar o equilíbrio reescreve.
 * Duas sementes é pouco para número fino; o que vale aqui é o que quebra de vez.
 */
export const WHAT_BREAKS: readonly string[] = [
  '**Frio: a roça não existe.** Roça e irrigação rendem perto de zero, e a comida sai da pesca e da coleta. O povo quase some, com a fome muito acima da meta.',
  '**Seco: quase ninguém chega a fundar.** Só existe o lugar semeado, ninguém funda outro e no fim não há morador. É o caso mais quebrado dos três.',
  '**Oceano quente: aguenta, pequeno.** É o único que termina com gente, em poucos lugares e sem cidade, com muito êxodo e fome acima da meta. A terra é pouca, mas cada lugar rende bem.',
  '**As metas de tamanho não escalam.** A mediana e o maior assentamento continuam com a régua da Terra, e nenhum planeta chega perto: B1 escala contagens, não o tamanho de um lugar.',
];

/**
 * Os planetas tipo da calibração curta (`npm run calibrar:planetas`): do mesmo tamanho, para a diferença ser só de
 * clima e de água. Cada um põe à prova uma coisa que a Terra dá de graça: mata para a lenha, estações para a roça, costa
 * para a pesca.
 */
export const TYPE_PLANETS: { params: PlanetParams; tests: string }[] = [
  {
    tests: 'roça e lenha no frio',
    params: { id: 'tipo-frio', name: 'Frio', radiusEarth: 0.5, temperatureK: 250, water: 0.45, life: 0.5, axialTilt: 0.45, dayHours: 22, periodYears: 1.6, gravity: 0.7 },
  },
  {
    tests: 'água, lenha e pesca no seco',
    params: { id: 'tipo-seco', name: 'Seco', radiusEarth: 0.5, temperatureK: 295, water: 0.12, life: 0.5, axialTilt: 0.2, dayHours: 30, periodYears: 0.9, gravity: 0.7 },
  },
  {
    tests: 'terra pouca e calor sem estações',
    params: { id: 'tipo-oceano', name: 'Oceano quente', radiusEarth: 0.5, temperatureK: 315, water: 0.9, life: 0.7, axialTilt: 0.05, dayHours: 18, periodYears: 0.7, gravity: 0.7 },
  },
];
