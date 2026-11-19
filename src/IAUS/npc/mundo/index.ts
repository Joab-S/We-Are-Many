/**
 * O mundo agregado (o Ecosystem): as decisões que acontecem uma vez por ano, como pacotes do IAUS
 * pontuados pelo `Decisor` (ver decisor.ts), e os pesos delas (ajustes.ts).
 */
export * from './decisor';
export * from './oficio';
export * from './lider';
export * from './mudanca';
export * from './vidaSocial';

import { OFICIO_DO_ANO } from './oficio';
import { LIDER_DO_LUGAR } from './lider';
import { MUDANCA_DO_ANO } from './mudanca';

/** Os pacotes do mundo agregado, para a lista de comportamentos e o grafo. */
export const PACOTES_DO_MUNDO = [OFICIO_DO_ANO, LIDER_DO_LUGAR, MUDANCA_DO_ANO];
