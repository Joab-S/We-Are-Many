/**
 * O começo do mundo generativo: pessoas espalhadas, algumas sozinhas e alguns pares, todas só com o instinto.
 * Nenhuma vila, nenhum celeiro, nenhuma casa. O que vier depois (se vier) sai do que elas fizerem.
 */
import type { Ecosystem } from '../ecosystem';
import { isLand } from '../eco/tiles';

/**
 * Liga o modelo generativo no mundo e solta `quantos` inteligentes em terra onde dá para viver (verde e com água
 * por perto, quando há). Usa um gerador próprio, para não mexer nos sorteios do mundo. Devolve quantos couberam.
 */
export function semearEspalhados(eco: Ecosystem, seed: number, quantos = 40): number {
  eco.genLigar();
  const map = eco.map;
  const s = eco.species.findIndex((sp) => sp.kind === 'sapient');
  if (s < 0) return 0;
  const sp = eco.species[s];
  let a = (seed * 2246822519 + 374761393) >>> 0;
  const rnd = () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296);
  const aguaPerto = (x: number, y: number): boolean => {
    for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
      const t = eco.tileAt(x + dx, y + dy);
      if (t >= 0 && isLand(map, t) && eco.nearWater(t)) return true;
    }
    return false;
  };
  // Espalhadas por regiões: em cada uma, uns poucos a uma caminhada de distância uns dos outros (uns sozinhos, outros
  // em par). Longe o bastante para ninguém começar junto de todos; perto o bastante para alguém acabar achando alguém.
  let postos = 0;
  for (let t = 0; t < 20000 && postos < quantos; t++) {
    const rx = Math.floor(rnd() * map.width);
    const ry = Math.floor(map.height * (0.25 + 0.5 * rnd()));
    // Depois de muitas tentativas, vale a terra que houver (planeta seco).
    const exigente = t < 12000;
    const centro = ry * map.width + rx;
    if (!isLand(map, centro) || !eco.habitable(s, centro) || (exigente && (map.vegetation[centro] < 0.3 || !aguaPerto(rx, ry)))) continue;
    const naRegiao = 5 + Math.floor(rnd() * 7);
    for (let k = 0, n = 0; k < 60 && n < naRegiao && postos < quantos; k++) {
      const ang = rnd() * Math.PI * 2;
      const r = 3 + rnd() * 16;
      const x = rx + Math.round(Math.cos(ang) * r);
      const y = ry + Math.round(Math.sin(ang) * r);
      const i = eco.tileAt(x, y);
      if (i < 0 || !isLand(map, i) || !eco.habitable(s, i) || (exigente && map.vegetation[i] < 0.25)) continue;
      // Uns sozinhos, outros em par (uids seguidos: um de cada sexo).
      const par = rnd() < 0.4 && postos + 1 < quantos ? 2 : 1;
      for (let q = 0; q < par; q++) {
        const j = eco.spawn(s, x + 0.5 + q * 0.6, y + 0.5, -1, sp.maturity + rnd() * 12);
        if (j >= 0) {
          postos++;
          n++;
          eco.genDe(j);
        }
      }
    }
  }
  return postos;
}
