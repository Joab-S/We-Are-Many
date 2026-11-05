import { seasonStrength, type PlanetParams } from '../../procgen/surface';
import { SEASONS } from '../../sim/needs';

/** O que a tela mostra no lugar do nome da estação, num planeta sem elas. */
export const NO_SEASONS = 'sem estações';
/** Abaixo disto a estação não se nota: o nome não diria nada. */
const SEASON_MIN = 0.15;

/** Nome da estação no planeta, ou NO_SEASONS (eixo quase em pé, ou quase sem luz). */
export function seasonLabel(season: number, params: PlanetParams): string {
  return seasonStrength(params) < SEASON_MIN ? NO_SEASONS : SEASONS[season];
}

/**
 * O ano de jogo é uma volta do planeta em torno da estrela: \`Ano 12\` na Terra, e nos outros também quantos anos da
 * Terra isso dá. O relógio do jogo não muda (\`yearSpan\` é o mesmo em todo planeta); muda o nome.
 */
export function yearLabel(year: number, params: PlanetParams): string {
  const whole = Math.floor(year);
  const period = params.periodYears ?? 1;
  if (Math.abs(period - 1) < 0.01) return `Ano ${whole}`;
  return `Ano ${whole} · ≈${Math.round(whole * period)} da Terra`;
}
