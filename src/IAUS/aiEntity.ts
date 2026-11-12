// aiEntity.ts — AI Entity, Entity Tags, World Object Types e o contrato com o mundo do jogo.
//
// Todo personagem com Brain tem um AiEntity. Objetos sobre os quais os agentes
// raciocinam (fogueira, moeda, ponto de patrulha) também têm. O AiEntity guarda
// o World Object Type (o que a coisa É) e as tags (fatos sobre ela).

import { Vec2 } from './math';

/** Tags são booleanas e esparsas: a entidade só guarda as que tem. */
export type EntityTag = string;

/** Algumas tags comuns. Projetos acrescentam as suas livremente. */
export const Tags = {
  Landmark: 'Landmark', // sempre entra na lista de vizinhos, a qualquer distância
  Invisible: 'Invisible',
  Dead: 'Dead',
  Incapacitated: 'Incapacitated',
  Hostile: 'Hostile',
  Villager: 'Villager',
  Healable: 'Healable',
} as const;

/** O que a entidade é. Projetos acrescentam os seus. */
export type WorldObjectType = string;

/**
 * Tag Sets por World Object Type: as tags com que cada tipo "nasce".
 * Equivale às Tag Sets atribuídas aos WOTs na ferramenta de dados.
 */
export class WorldObjectTypeRegistry {
  private static readonly bornWith = new Map<WorldObjectType, EntityTag[]>();

  static define(type: WorldObjectType, tags: EntityTag[]): void {
    WorldObjectTypeRegistry.bornWith.set(type, [...tags]);
  }
  static tagsFor(type: WorldObjectType): EntityTag[] {
    return WorldObjectTypeRegistry.bornWith.get(type) ?? [];
  }
  static clear(): void {
    WorldObjectTypeRegistry.bornWith.clear();
  }
}

/** Conjunto esparso de tags ativas, com expiração opcional (tags temporárias). */
export class EntityTagSet {
  /** tag → instante em que expira (Infinity = permanente). */
  private readonly tags = new Map<EntityTag, number>();

  add(tag: EntityTag, expiresAt = Infinity): void {
    this.tags.set(tag, expiresAt);
  }
  remove(tag: EntityTag): void {
    this.tags.delete(tag);
  }
  has(tag: EntityTag, now = 0): boolean {
    const exp = this.tags.get(tag);
    return exp !== undefined && exp > now;
  }
  /** Remove as tags vencidas. */
  purge(now: number): void {
    for (const [tag, exp] of this.tags) if (exp <= now) this.tags.delete(tag);
  }
  list(): EntityTag[] {
    return [...this.tags.keys()];
  }
  /** Tags com o instante em que expiram (para salvar, mostrar e desenhar o cérebro). */
  entries(): [EntityTag, number][] {
    return [...this.tags.entries()];
  }
  get size(): number {
    return this.tags.size;
  }
}

/**
 * Crenças: as tags que uma entidade PERCEBE nas outras (Tagging System). Diferente de `tags`, que são os
 * fatos da própria entidade (o que ela é, ou o que outros marcaram nela), uma crença mora na cabeça de
 * quem observa: "acho que Ana é padeira", "aquele cervo é meu alvo de caça". Duas pessoas podem crer em
 * coisas diferentes sobre a mesma terceira, e uma crença pode estar errada ou vencida.
 */
export class BeliefSet {
  /** id do alvo → tags percebidas nele. */
  private readonly about = new Map<number, EntityTagSet>();

  /** Passa a crer que `targetId` tem `tag` (até `expiresAt`). */
  perceive(targetId: number, tag: EntityTag, expiresAt = Infinity): void {
    let set = this.about.get(targetId);
    if (!set) this.about.set(targetId, (set = new EntityTagSet()));
    set.add(tag, expiresAt);
  }
  /** Deixa de crer (a tag sai só da cabeça de quem observa). */
  forget(targetId: number, tag?: EntityTag): void {
    if (tag === undefined) {
      this.about.delete(targetId);
      return;
    }
    const set = this.about.get(targetId);
    if (!set) return;
    set.remove(tag);
    if (!set.size) this.about.delete(targetId);
  }
  believes(targetId: number, tag: EntityTag, now = 0): boolean {
    return this.about.get(targetId)?.has(tag, now) ?? false;
  }
  /** Ids de quem a entidade crê ter `tag` (ex.: "quem eu conheço que é lenhador"). */
  whoHas(tag: EntityTag, now = 0): number[] {
    const out: number[] = [];
    for (const [id, set] of this.about) if (set.has(tag, now)) out.push(id);
    return out;
  }
  tagsOf(targetId: number): EntityTag[] {
    return this.about.get(targetId)?.list() ?? [];
  }
  /** Remove as crenças vencidas. */
  purge(now: number): void {
    for (const [id, set] of this.about) {
      set.purge(now);
      if (!set.size) this.about.delete(id);
    }
  }
  /** Tudo o que a entidade crê, por alvo. */
  entries(): [number, EntityTag[]][] {
    return [...this.about.entries()].map(([id, set]) => [id, set.list()]);
  }
  get size(): number {
    return this.about.size;
  }
}

export interface AiEntityInit {
  id: number;
  name: string;
  type: WorldObjectType;
  team?: number;
  position?: Vec2;
  stats?: Record<string, number>;
  tags?: EntityTag[];
}

/**
 * Representação da entidade para a IA. A camada do jogo mantém posição e
 * stats atualizados (ou substitui estes campos por getters ligados ao motor).
 */
export class AiEntity {
  readonly id: number;
  name: string;
  readonly type: WorldObjectType;
  team: number;
  position: Vec2;
  /** Stats numéricos arbitrários: health, maxHealth, ammo, gold, threat… */
  readonly stats = new Map<string, number>();
  readonly tags = new EntityTagSet();
  /** O que esta entidade percebe nas outras (Tagging System: tags vistas nos outros). */
  readonly beliefs = new BeliefSet();

  constructor(init: AiEntityInit) {
    this.id = init.id;
    this.name = init.name;
    this.type = init.type;
    this.team = init.team ?? 0;
    this.position = init.position ? { ...init.position } : { x: 0, y: 0 };
    for (const t of WorldObjectTypeRegistry.tagsFor(init.type)) this.tags.add(t);
    for (const t of init.tags ?? []) this.tags.add(t);
    for (const [k, v] of Object.entries(init.stats ?? {})) this.stats.set(k, v);
  }

  stat(name: string, fallback = 0): number {
    return this.stats.get(name) ?? fallback;
  }
  setStat(name: string, value: number): void {
    this.stats.set(name, value);
  }
  /** Vida normalizada 0..1 (usa os stats "health" e "maxHealth"). */
  healthRatio(): number {
    const max = this.stat('maxHealth', 1);
    return max > 0 ? Math.max(0, Math.min(1, this.stat('health', max) / max)) : 0;
  }
  isAlive(now = 0): boolean {
    return !this.tags.has(Tags.Dead, now) && this.stat('health', 1) > 0;
  }
  // ---- Tagging System: dar e tirar tags de si, dos outros, e perceber tags nos outros ----

  /** Dá uma tag a si mesmo ("eu sou ferreiro"). */
  tagSelf(tag: EntityTag, expiresAt = Infinity): void {
    this.tags.add(tag, expiresAt);
  }
  untagSelf(tag: EntityTag): void {
    this.tags.remove(tag);
  }
  /** Marca uma tag em outra entidade, visível a todos ("alvo de caça", "procurado"). */
  mark(other: AiEntity, tag: EntityTag, expiresAt = Infinity): void {
    other.tags.add(tag, expiresAt);
  }
  unmark(other: AiEntity, tag: EntityTag): void {
    other.tags.remove(tag);
  }
  /** Percebe uma tag em outra entidade: passa a crer nela, sem mudar a outra ("ela é padeira"). */
  perceive(other: AiEntity, tag: EntityTag, expiresAt = Infinity): void {
    this.beliefs.perceive(other.id, tag, expiresAt);
  }
  /** A outra tem a tag de fato ou esta entidade crê que tem. */
  seesTag(other: AiEntity, tag: EntityTag, now = 0): boolean {
    return other.tags.has(tag, now) || this.beliefs.believes(other.id, tag, now);
  }

  isEnemyOf(other: AiEntity): boolean {
    return this.team !== 0 && other.team !== 0 && this.team !== other.team;
  }
  isAllyOf(other: AiEntity): boolean {
    return this.team !== 0 && this.team === other.team && this.id !== other.id;
  }
}

/**
 * O que a IA precisa do mundo do jogo. Implemente isto no seu motor
 * (Phaser, Babylon, Three, servidor etc.).
 */
export interface World {
  /** Tempo atual em segundos. */
  now(): number;
  /** Todas as entidades que a IA pode conhecer. */
  entities(): Iterable<AiEntity>;
  /** Busca por id (pode retornar undefined se a entidade sumiu). */
  getEntity(id: number): AiEntity | undefined;
}

/** Mundo simples em memória, útil para testes e protótipos. */
export class SimpleWorld implements World {
  time = 0;
  private readonly map = new Map<number, AiEntity>();

  now(): number {
    return this.time;
  }
  add(e: AiEntity): AiEntity {
    this.map.set(e.id, e);
    return e;
  }
  remove(id: number): void {
    this.map.delete(id);
  }
  entities(): Iterable<AiEntity> {
    return this.map.values();
  }
  getEntity(id: number): AiEntity | undefined {
    return this.map.get(id);
  }
}
