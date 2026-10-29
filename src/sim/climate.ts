/**
 * Clima vivo (Plano 2): vento por faixa de latitude. Alísios de leste perto do equador, ventos de
 * oeste nas latitudes médias e de leste perto dos polos, todos puxando um pouco para o equador
 * (como na circulação de Hadley e Ferrel). Linha 0 do mapa é o polo norte.
 */
export function windAt(y: number, height: number): { x: number; y: number } {
  const lat = (y / Math.max(1, height - 1)) * 2 - 1;
  const a = Math.abs(lat);
  const toEquator = lat < 0 ? 1 : -1;
  if (a < 0.33) return { x: -1, y: 0.3 * toEquator };
  if (a < 0.66) return { x: 1, y: -0.25 * toEquator };
  return { x: -0.8, y: 0.3 * toEquator };
}
