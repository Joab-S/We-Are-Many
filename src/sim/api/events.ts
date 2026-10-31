import type { Polity } from '../community';
import type { Village, WarMotive } from '../eco/types';

/**
 * Acontecimentos do motor como fila de eventos de domínio (padrão Event
 * Queue, Game Programming Patterns). O motor só anota (`eco.emit`) nos
 * pontos únicos onde a coisa acontece (fundar, abandonar, mudar de nível,
 * guerra...); quem quer saber (avisos, janelas, um futuro mapa de
 * influência) drena a fila no seu tempo (`eco.drainEvents`), sem que o motor
 * saiba quem ouve. É a saída do protocolo motor -> cliente; a entrada são os
 * comandos (`commands.ts`).
 *
 * Cada evento é dado puro, serializável em JSON (vai por `postMessage` quando
 * o motor for para um Worker): só números, textos curtos e ids, nenhuma
 * referência a objeto. Os assentamentos vão pelo id (o índice em
 * `eco.villages`, que nunca é reaproveitado), os reinos pelo id da capital e
 * as espécies pelo índice em `eco.species`; -1 quer dizer "nenhum". Todo
 * evento leva o ano do mundo (`year`, com fração) em que aconteceu.
 *
 * Emitir não sorteia nada nem muda o estado da simulação: só lê e empurra na
 * fila. A impressão digital (`src/sim/fingerprint.calib.ts`) confere isso.
 *
 * Este módulo não importa nada de `src/client` nem do three.js.
 */

/** Como o lugar nasceu (o mesmo `foundedBy` do assentamento). */
export type FoundHow = NonNullable<Village['foundedBy']>;

/** Por que a família se mudou: busca de vida melhor, última leva de um lugar que acaba, refúgio na falta. */
export type MigrateCause = 'move' | 'lastWave' | 'refuge';

/** Desastres e catástrofes: os eventos do mundo (cometa, terremoto...) e os do próprio mundo vivo (raio, epidemia, lugar tragado). */
export type DisasterKind = 'comet' | 'quake' | 'volcano' | 'island' | 'fire' | 'drought' | 'plague' | 'wildfire' | 'epidemic' | 'engulfed';

export type EngineEvent =
  /** Assentamento novo: `from` é o lugar de onde vieram os fundadores (-1 sem origem: bando, nômades, o jogador). */
  | { kind: 'found'; year: number; village: number; from: number; how: FoundHow; x: number; y: number }
  /**
   * Colônia: `depart` quando o grupo sai (por terra o lugar novo já existe em `to`; pelo mar `to` é -1) e
   * `arrive` quando chega (desembarque dos colonos, ou o enxoval do grupo por terra). `to` -1 na chegada: se perderam.
   */
  | { kind: 'colony'; year: number; phase: 'depart' | 'arrive'; from: number; to: number; people: number; by: 'land' | 'sea' }
  /** Sítio rural aberto pelo lugar (a casa fica em x, y). */
  | { kind: 'farmstead'; year: number; village: number; x: number; y: number }
  /** Uma família (`family`, o sobrenome; -1 o lugar inteiro) que se mudou de um lugar para outro. */
  | { kind: 'migrate'; year: number; family: number; from: number; to: number; people: number; cause: MigrateCause }
  /**
   * Fissão (agente 3B): o lugar `from`, com `population` moradores e a pressão social `pressure`, cresceu demais
   * para as instituições que tem e se dividiu; `people` partiram e fundaram `to`. Vem junto com o `colony` da partida.
   */
  | { kind: 'fission'; year: number; from: number; to: number; people: number; population: number; pressure: number }
  /**
   * Circunscrição (agente 3B, Carneiro): o lugar passou `years` anos com pressão acima do limiar e sem sítio
   * livre para a fissão. Daí vêm a guerra por terra e as instituições.
   */
  | { kind: 'circumscribed'; year: number; village: number; pressure: number; years: number }
  /** Êxodo: o lugar passou anos em falta e parte do povo sai sem lugar melhor conhecido. */
  | { kind: 'exodus'; year: number; village: number; lack: 'comida' | 'lenha' }
  /** O lugar ficou vazio; `to` é para onde foram os últimos moradores (-1 sem destino). */
  | { kind: 'abandon'; year: number; village: number; to: number }
  /** Fusão: `village` virou bairro de `into`. */
  | { kind: 'merge'; year: number; village: number; into: number }
  /** Degrau do assentamento (0 aldeia, 1 vila, 2 cidade...) depois da mudança. */
  | { kind: 'tierUp'; year: number; village: number; tier: number }
  | { kind: 'tierDown'; year: number; village: number; tier: number }
  /** Degrau político de um centro (livre, chefia, reino, império), com quantos lugares ele tem. */
  | { kind: 'polity'; year: number; village: number; polity: Polity; was: Polity; places: number }
  /** O lugar entrou numa era nova; `first` quando ninguém no mundo tinha chegado nela. */
  | { kind: 'era'; year: number; village: number; era: number; first: boolean }
  /** Técnica aprendida (ou esquecida, com `lost`); `first` na primeira vez no mundo. O id é o de `progress.ts`. */
  | { kind: 'tech'; year: number; village: number; tech: string; first: boolean; lost: boolean }
  /** Guerra entre reinos (ids das capitais): `a` ataca o lugar `target` de `b`. */
  | { kind: 'warStart'; year: number; a: number; b: number; target: number; motive: WarMotive; naval: boolean }
  | { kind: 'warEnd'; year: number; a: number; b: number; target: number; motive: WarMotive; years: number }
  /** O reino `winner` tomou o lugar `village` do reino `loser`; `razed` quando arrasou em vez de tomar. */
  | { kind: 'conquest'; year: number; winner: number; loser: number; village: number; razed: boolean }
  /** Revolta contra o reino `against`: por instabilidade (falta) ou por lealdade no chão. */
  | { kind: 'revolt'; year: number; village: number; against: number; cause: 'stability' | 'loyalty' }
  /** O lugar virou capital de um reino novo saído do reino `from` (revolta, lealdade ou sucessão). */
  | { kind: 'independence'; year: number; village: number; from: number }
  /** Troca de reino em paz, por atração (lealdade): `from` -1 quando o lugar era livre. */
  | { kind: 'annex'; year: number; village: number; from: number; to: number }
  /** Desastre num ponto (tile x, linha y); `village` é o lugar atingido, se houver. */
  | { kind: 'disaster'; year: number; what: DisasterKind; x: number; y: number; village: number }
  /** A espécie (índice em `eco.species`) sumiu do planeta. */
  | { kind: 'extinction'; year: number; species: number };

export type EngineEventKind = EngineEvent['kind'];

/** O evento de um tipo (para quem ouve um tipo só). */
export type EventOf<K extends EngineEventKind> = Extract<EngineEvent, { kind: K }>;

/**
 * Limite de segurança da fila: se ninguém drena (testes, calibração, um planeta fora da tela), os mais
 * antigos saem e a fila não cresce sem fim. Um ano movimentado dá algumas dezenas de eventos.
 */
export const EVENT_QUEUE_LIMIT = 2048;

/** Ids dos assentamentos envolvidos num evento (para quem acompanha um lugar, como a janela do assentamento). */
export function eventVillages(e: EngineEvent): number[] {
  switch (e.kind) {
    case 'found':
      return e.from >= 0 ? [e.village, e.from] : [e.village];
    case 'colony':
    case 'migrate':
    case 'fission':
      return [e.from, e.to].filter((id) => id >= 0);
    case 'abandon':
      return e.to >= 0 ? [e.village, e.to] : [e.village];
    case 'merge':
      return [e.village, e.into];
    case 'warStart':
    case 'warEnd':
      return [e.a, e.b, e.target];
    case 'conquest':
      return [e.village, e.winner, e.loser];
    case 'revolt':
      return [e.village, e.against];
    case 'independence':
      return [e.village, e.from];
    case 'annex':
      return [e.village, e.to, e.from].filter((id) => id >= 0);
    case 'disaster':
      return e.village >= 0 ? [e.village] : [];
    case 'extinction':
      return [];
    default:
      return [e.village];
  }
}
