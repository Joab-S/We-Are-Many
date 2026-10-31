import { seedFor } from '../core/rng';
import { KM_PER_AU } from '../core/units';

/**
 * Dados dos planetas e a escala visual dos sistemas, sem three.js: valem
 * para o cliente (bodies.ts desenha a partir deles) e para a lógica do GUIA
 * e da geração de sistemas. As distâncias e os tamanhos dentro do sistema
 * são comprimidos (REQUISITOS.md, seção 3.5); os dados reais ficam no
 * painel de informações.
 */

/** Raio visual do Sol em UA (10x o real, para ficar legível). */
export const SUN_VISUAL_RADIUS = (696000 / KM_PER_AU) * 10;

/** Distância orbital comprimida: a 1 UA reais corresponde 0,3 UA na cena. */
export const compressOrbit = (aAu: number): number => 0.3 * Math.pow(aAu, 0.6);

export type PlanetKind = 'rocky' | 'gas' | 'ice';

export interface PlanetData {
  id: string;
  name: string;
  kind: PlanetKind;
  aAu: number;
  periodYears: number;
  radiusKm: number;
  temperatureK: number;
  water: number;
  life: number;
  color: number;
  rings?: boolean;
  atmosphere?: number;
}

export const SOL_PLANETS: PlanetData[] = [
  { id: 'sol-1', name: 'Mercúrio', kind: 'rocky', aAu: 0.387, periodYears: 0.241, radiusKm: 2440, temperatureK: 440, water: 0, life: 0, color: 0x9a8f86 },
  { id: 'sol-2', name: 'Vênus', kind: 'rocky', aAu: 0.723, periodYears: 0.615, radiusKm: 6052, temperatureK: 737, water: 0, life: 0, color: 0xe0c58a, atmosphere: 0xf3d9a0 },
  { id: 'sol-3', name: 'Terra', kind: 'rocky', aAu: 1, periodYears: 1, radiusKm: 6371, temperatureK: 288, water: 0.71, life: 0.85, color: 0x4f7fc9, atmosphere: 0x7fb0ff },
  { id: 'sol-4', name: 'Marte', kind: 'rocky', aAu: 1.524, periodYears: 1.881, radiusKm: 3390, temperatureK: 210, water: 0.04, life: 0, color: 0xc1663b, atmosphere: 0xe0a080 },
  { id: 'sol-5', name: 'Júpiter', kind: 'gas', aAu: 5.203, periodYears: 11.86, radiusKm: 69911, temperatureK: 165, water: 0, life: 0, color: 0xd2b48c },
  { id: 'sol-6', name: 'Saturno', kind: 'gas', aAu: 9.537, periodYears: 29.46, radiusKm: 58232, temperatureK: 134, water: 0, life: 0, color: 0xe3cf98, rings: true },
  { id: 'sol-7', name: 'Urano', kind: 'ice', aAu: 19.19, periodYears: 84.0, radiusKm: 25362, temperatureK: 76, water: 0, life: 0, color: 0x9fd8e0 },
  { id: 'sol-8', name: 'Netuno', kind: 'ice', aAu: 30.07, periodYears: 164.8, radiusKm: 24622, temperatureK: 72, water: 0, life: 0, color: 0x4a6fd6 },
];

/**
 * Posição do planeta no instante `t` (s de jogo), relativa à estrela, em UA
 * de cena. Escreve em `out` (um THREE.Vector3 serve) e o devolve.
 */
export function planetOffset<T extends { x: number; y: number; z: number }>(p: PlanetData, t: number, out: T): T {
  const r = compressOrbit(p.aAu);
  const phase = (seedFor(p.id) % 1000) / 1000 * Math.PI * 2;
  // Uma volta da Terra leva 20 minutos de jogo.
  const angle = phase + (t / (p.periodYears * 1200)) * Math.PI * 2;
  out.x = Math.cos(angle) * r;
  out.y = Math.sin(angle) * r;
  out.z = 0;
  return out;
}
