/** Unidades astronômicas usadas pelo jogo. A cena 3D trabalha em UA. */
export const AU_PER_PC = 206264.806;
export const KM_PER_AU = 149597870.7;
export const C_AU_PER_S = 299792.458 / KM_PER_AU;
export const EARTH_RADIUS_KM = 6371;

export const pcToAu = (pc: number): number => pc * AU_PER_PC;
export const auToPc = (au: number): number => au / AU_PER_PC;
