/**
 * A fusão entre o espaço e o mapa: as contas que ligam a altitude da nave ao zoom da superfície. Quem conduz os dois modos
 * vivos ao mesmo tempo é o `main.ts`; os dois lados, `SpaceMode` e `SurfaceMode`.
 */

/** Campo de visão vertical da câmera do espaço, em graus. */
export const CAMERA_FOV = 70;
/** Quanto dura a fusão. */
export const FUSION_MS = 600;
/** Abaixo desta altitude, em raios, a nave que desce a prumo pousa sozinha. */
export const LAND_ALTITUDE = 0.05;
/** Cosseno do ângulo máximo entre o nariz e o prumo para pousar sozinha (20°). */
export const LAND_PLUMB_COS = Math.cos((20 * Math.PI) / 180);
/** Altitude máxima, em raios, ao subir pelo zoom: 3,9 raios do centro é menos que os 4 da órbita (`ORBIT_DISTANCE`). */
export const LIFT_CEILING = 2.9;

/** Um ponto do mapa (como em `tileDirection`) e a altitude da nave sobre ele, em raios. */
export interface Landing {
  u: number;
  v: number;
  altitude: number;
}

/** Pixels por radiano no centro da tela, com a câmera do espaço. */
function pixelsPerRadian(screenHeight: number): number {
  return screenHeight / (2 * Math.tan((CAMERA_FOV * Math.PI) / 360));
}

/**
 * Pixels por tile que a câmera vê a prumo no centro da tela: um tile tem π / linhas radianos de arco, e a `altitude` raios
 * de distância esse arco vale `arco / altitude` radianos de visão.
 */
export function zoomAtAltitude(altitude: number, screenHeight: number, mapHeight: number): number {
  return (pixelsPerRadian(screenHeight) * Math.PI) / (mapHeight * altitude);
}

/** O contrário de `zoomAtAltitude`, sem passar do teto da órbita. */
export function altitudeAtZoom(zoom: number, screenHeight: number, mapHeight: number): number {
  return Math.min(LIFT_CEILING, (pixelsPerRadian(screenHeight) * Math.PI) / (mapHeight * zoom));
}

/** A nave pousa sozinha? `plumb` é o cosseno entre o nariz e o centro do planeta. Só quem acelera: parada, ela pode olhar. */
export function wantsLanding(altitude: number, plumb: number): boolean {
  return altitude < LAND_ALTITUDE && plumb > LAND_PLUMB_COS;
}
