// example.ts — Demonstração completa: uma vila com guarda, maga, aldeões e orcs.
//
// Mostra: Behavior Packs, Ability Packs (mesmo "porquê", "o quês" diferentes),
// todos os Context Types usados na prática, Instant × Continuous (momento),
// cooldowns por behavior e por alvo (histórico), Imap para mirar um fireball,
// seleção por melhor score ou sorteio ponderado e o relatório de depuração.
//
// Rodar: npx tsc && node dist/example.js

import {
  AiDatabase,
  AiEntity,
  Abilities,
  Brain,
  BrainLibrary,
  ContextInfo,
  ContextType,
  CurveType,
  DurationType,
  ImapManager,
  In,
  InputParameter,
  PlayAnimationType,
  SeededRng,
  SelectionMode,
  SimpleWorld,
  Tags,
  distance,
  loadDatabase,
} from './index';

const R = InputParameter.RangeMax;
const V = InputParameter.Value;

// ---------------------------------------------------------------------------
// 1) Abilities (o "o quê" das Behavior-Ability Pairs)
// ---------------------------------------------------------------------------

function damage(target: AiEntity, amount: number): void {
  const hp = Math.max(0, target.stat('health') - amount);
  target.setStat('health', hp);
  if (hp <= 0) target.tags.add(Tags.Dead);
}

const log: string[] = [];
let world: SimpleWorld;

Abilities.register({
  id: 'swordStrike',
  name: 'Golpe de espada',
  perform: (ctx: ContextInfo) => {
    if (ctx.target && distance(ctx.owner.position, ctx.target.position) <= 2.2) damage(ctx.target, 14);
    return true; // instantâneo
  },
});
Abilities.register({
  id: 'clubSmash',
  name: 'Porretada',
  perform: (ctx: ContextInfo) => {
    if (ctx.target && distance(ctx.owner.position, ctx.target.position) <= 2.2) damage(ctx.target, 9);
    return true;
  },
});
Abilities.register({
  id: 'drinkPotion',
  name: 'Beber poção',
  perform: (ctx: ContextInfo) => {
    const o = ctx.owner;
    o.setStat('potions', o.stat('potions') - 1);
    o.setStat('health', Math.min(o.stat('maxHealth'), o.stat('health') + 40));
    return true;
  },
});
Abilities.register({
  id: 'fireball',
  name: 'Bola de fogo',
  perform: (ctx: ContextInfo) => {
    // LocationTarget: o ponto exato é calculado na execução, pelo Imap.
    const layer = ctx.brain.imap!.layer('orcs');
    const best = layer.findBest(ctx.owner.position, 12);
    if (!best) return true;
    ctx.location = best.pos;
    for (const e of world.entities()) {
      if (e.team === 2 && e.isAlive() && distance(e.position, best.pos) <= 3) damage(e, 20);
    }
    log.push(`   🔥 fireball em (${best.pos.x.toFixed(1)}, ${best.pos.y.toFixed(1)})`);
    return true;
  },
});

PlayAnimationType.onAnimation = (ctx, anim) =>
  log.push(`   👋 ${ctx.owner.name}: ${anim} → ${ctx.target?.name ?? '-'}`);

// ---------------------------------------------------------------------------
// 2) Banco de dados (normalmente um JSON exportado da ferramenta de dados)
// ---------------------------------------------------------------------------

const db: AiDatabase = {
  worldObjectTypes: [
    { type: 'HumanGuard', tags: [] },
    { type: 'HumanMage', tags: [] },
    { type: 'Villager', tags: [Tags.Villager] },
    { type: 'Orc', tags: [Tags.Hostile] },
  ],
  behaviors: [
    {
      id: 1,
      name: 'Vagar',
      behaviorType: 'Wander',
      contextType: ContextType.StandAlone,
      duration: DurationType.Continuous,
      weight: 1,
      params: { radius: 4, speed: 1.5, stopDistance: 0.3 },
      considerations: [
        { name: 'base', input: In.Constant, curve: { type: CurveType.Linear }, params: { values: { [V]: 0.35 } } },
        // Nenhum inimigo a até 15 m → 1; muitos → 0.
        {
          name: 'semInimigos',
          input: In.EnemyCountNear,
          curve: { type: CurveType.Linear, m: -1, b: 1 },
          params: { values: { [V]: 15, [R]: 1 } },
        },
      ],
    },
    {
      id: 2,
      name: 'Acenar',
      behaviorType: 'PlayAnimation',
      contextType: ContextType.SingleTarget,
      duration: DurationType.Instant,
      weight: 2,
      targetTypes: ['Villager'],
      params: { animation: 'acena' },
      considerations: [
        { name: 'perto', input: In.DistanceToTarget, curve: { type: CurveType.Polynomial, m: -1, k: 2, b: 1 }, params: { values: { [R]: 10 } } },
        // Cooldown POR ALVO: não acenar de novo para o mesmo aldeão por 30 s.
        { name: 'cooldownAlvo', input: In.TimeSinceThisContext, curve: { type: CurveType.Logistic, m: 20, c: 0.9 }, params: { values: { [R]: 30 } } },
        // Cooldown geral curto: no máximo um aceno a cada ~5 s.
        { name: 'cooldown', input: In.TimeSinceThisBehavior, curve: { type: CurveType.Logistic, m: 15, c: 0.6 }, params: { values: { [R]: 8 } } },
        { name: 'calmo', input: In.EnemyCountNear, curve: { type: CurveType.Linear, m: -1, b: 1 }, params: { values: { [V]: 15, [R]: 1 } } },
      ],
    },
    {
      id: 3,
      name: 'Aproximar do inimigo',
      behaviorType: 'MoveToTarget',
      contextType: ContextType.SingleTarget,
      duration: DurationType.Continuous,
      weight: 3,
      params: { speed: 3, stopDistance: 1.8 },
      considerations: [
        { name: 'inimigo', input: In.TargetIsEnemy, curve: { type: CurveType.Linear } },
        { name: 'vivo', input: In.TargetIsAlive, curve: { type: CurveType.Linear } },
        // Quanto mais perto, mais atraente (até 25 m).
        { name: 'distancia', input: In.DistanceToTarget, curve: { type: CurveType.Linear, m: -0.8, b: 1 }, params: { values: { [R]: 25 } } },
        // Mas se já está a menos de ~2 m, não precisa andar (a curva cai a 0).
        { name: 'foraDoAlcance', input: In.DistanceToTarget, curve: { type: CurveType.Logistic, m: 40, c: 0.22 }, params: { values: { [R]: 10 } } },
        { name: 'coragem', input: In.MyHealth, curve: { type: CurveType.Logistic, m: 12, c: 0.3 } },
      ],
    },
    {
      id: 4,
      name: 'Ataque corpo a corpo',
      behaviorType: 'Ability',
      contextType: ContextType.SingleTarget,
      duration: DurationType.Instant,
      weight: 3,
      considerations: [
        { name: 'inimigo', input: In.TargetIsEnemy, curve: { type: CurveType.Linear } },
        { name: 'vivo', input: In.TargetIsAlive, curve: { type: CurveType.Linear } },
        { name: 'noAlcance', input: In.DistanceToTarget, curve: { type: CurveType.Logistic, m: -40, c: 0.22 }, params: { values: { [R]: 10 } } },
        // "Acabe com ele!": alvo com pouca vida vale mais (utilidade marginal crescente).
        { name: 'alvoFraco', input: In.TargetHealth, curve: { type: CurveType.Polynomial, m: -0.5, k: 2, b: 1 } },
        { name: 'cadencia', input: In.TimeSinceThisBehavior, curve: { type: CurveType.Logistic, m: 20, c: 0.5 }, params: { values: { [R]: 1.6 } } },
      ],
    },
    {
      id: 5,
      name: 'Fugir',
      behaviorType: 'FleeFromTarget',
      contextType: ContextType.SingleTarget,
      duration: DurationType.Continuous,
      weight: 4,
      params: { speed: 4 },
      considerations: [
        { name: 'inimigo', input: In.TargetIsEnemy, curve: { type: CurveType.Linear } },
        { name: 'vivo', input: In.TargetIsAlive, curve: { type: CurveType.Linear } },
        { name: 'perto', input: In.DistanceToTarget, curve: { type: CurveType.Linear, m: -1, b: 1 }, params: { values: { [R]: 12 } } },
        { name: 'medo', input: In.MyHealth, curve: { type: CurveType.Logistic, m: -18, c: 0.25 } },
        { name: 'semPocao', input: In.MyStat, curve: { type: CurveType.Linear, m: -1, b: 1 }, params: { stat: 'potions', values: { [R]: 1 } } },
      ],
    },
    {
      id: 6,
      name: 'Curar-se',
      behaviorType: 'Ability',
      contextType: ContextType.Self,
      duration: DurationType.Instant,
      weight: 5,
      considerations: [
        { name: 'ferido', input: In.MyHealth, curve: { type: CurveType.Logistic, m: -15, c: 0.4 } },
        { name: 'temPocao', input: In.MyStat, curve: { type: CurveType.Linear }, params: { stat: 'potions', values: { [R]: 1 } } },
        { name: 'cooldown', input: In.TimeSinceThisBehavior, curve: { type: CurveType.Logistic, m: 20, c: 0.5 }, params: { values: { [R]: 6 } } },
      ],
    },
    {
      id: 7,
      name: 'Bola de fogo',
      behaviorType: 'Ability',
      contextType: ContextType.LocationTarget,
      duration: DurationType.Instant,
      weight: 3.5,
      considerations: [
        // Densidade de orcs no melhor ponto a até 12 m (Imap).
        { name: 'aglomerado', input: In.ImapBestInRange, curve: { type: CurveType.Logistic, m: 12, c: 0.4 }, params: { layer: 'orcs', values: { [V]: 12 } } },
        { name: 'haInimigos', input: In.EnemyCountNear, curve: { type: CurveType.Logistic, m: 12, c: 0.4 }, params: { values: { [V]: 14, [R]: 3 } } },
        { name: 'recarga', input: In.TimeSinceThisBehavior, curve: { type: CurveType.Logistic, m: 20, c: 0.5 }, params: { values: { [R]: 6 } } },
      ],
    },
  ],
  behaviorPacks: [
    { id: 100, name: 'Ambiente', behaviorIds: [1] },
    { id: 101, name: 'Social', behaviorIds: [2] },
    { id: 102, name: 'Combate corpo a corpo', behaviorIds: [3, 5] },
    { id: 103, name: 'Combate agressivo', behaviorIds: [3] }, // orcs não fogem
  ],
  abilityPacks: [
    { id: 200, name: 'Guarda', pairs: [{ behaviorId: 4, abilityId: 'swordStrike' }, { behaviorId: 6, abilityId: 'drinkPotion' }] },
    { id: 201, name: 'Orc', pairs: [{ behaviorId: 4, abilityId: 'clubSmash' }] },
    { id: 202, name: 'Maga', pairs: [{ behaviorId: 7, abilityId: 'fireball' }, { behaviorId: 6, abilityId: 'drinkPotion' }] },
  ],
  brains: [
    { id: 1, name: 'Guarda', behaviorPackIds: [100, 101, 102], abilityPackIds: [200] },
    { id: 2, name: 'Orc', behaviorPackIds: [100, 103], abilityPackIds: [201] },
    { id: 3, name: 'Maga', behaviorPackIds: [100, 101, 102], abilityPackIds: [202] },
  ],
};

// ---------------------------------------------------------------------------
// 3) Mundo e agentes
// ---------------------------------------------------------------------------

BrainLibrary.clear();
loadDatabase(db);

world = new SimpleWorld();
const imap = new ImapManager(60, 60, 1, { x: -30, y: -30 });
const rng = new SeededRng(42);

let nextId = 1;
const make = (name: string, type: string, team: number, x: number, y: number, hp: number, potions = 0) =>
  world.add(
    new AiEntity({ id: nextId++, name, type, team, position: { x, y }, stats: { health: hp, maxHealth: hp, potions } }),
  );

const guard = make('Guarda', 'HumanGuard', 1, 0, 0, 100, 2);
const mage = make('Maga', 'HumanMage', 1, -3, 1, 60, 1);
make('Ana (aldeã)', 'Villager', 1, 3, 2, 30);
make('Beto (aldeão)', 'Villager', 1, -2, -3, 30);

const brains: Brain[] = [
  Brain.fromSeed(1, guard, world, { rng, imap, debug: true }),
  // A maga varia: sorteio ponderado entre decisões até 20% abaixo da melhor.
  Brain.fromSeed(3, mage, world, {
    rng,
    imap,
    debug: true,
    selection: { mode: SelectionMode.WeightedRandomTop, withinFractionOfBest: 0.8 },
  }),
];

for (const b of brains) {
  b.onDecisionChanged = (br, _from, to) =>
    log.push(`t=${world.time.toFixed(2).padStart(5)}  ${br.owner.name.padEnd(8)} → ${to.describe()} (${to.score.toFixed(2)})`);
}

/** Orcs chegam aos 6 s. */
function spawnOrcs(): void {
  const orcs = [make('Orc 1', 'Orc', 2, 16, 10, 40), make('Orc 2', 'Orc', 2, 17, 11, 40), make('Orc 3', 'Orc', 2, 15, 12, 40)];
  for (const o of orcs) {
    const b = Brain.fromSeed(2, o, world, { rng, imap, maxNeighborDistance: 40 });
    b.onDecisionChanged = (br, _f, to) =>
      log.push(`t=${world.time.toFixed(2).padStart(5)}  ${br.owner.name.padEnd(8)} → ${to.describe()} (${to.score.toFixed(2)})`);
    brains.push(b);
  }
}

// ---------------------------------------------------------------------------
// 4) Laço do jogo
// ---------------------------------------------------------------------------

const dt = 0.1;
let printedReport = false;
for (let step = 0; step <= 300; step++) {
  world.time = step * dt;
  if (Math.abs(world.time - 6) < 1e-9) {
    spawnOrcs();
    log.push('--- orcs chegaram ---');
    brains.forEach((b) => b.interrupt()); // evento externo: todos repensam
  }

  // Imap: reconstrói a camada de presença de orcs a cada frame.
  const orcLayer = imap.layer('orcs');
  orcLayer.clear();
  for (const e of world.entities()) if (e.team === 2 && e.isAlive()) orcLayer.stamp(e.position, 4, 1);

  for (const b of brains) b.update(dt);

  if (!printedReport && world.time >= 9) {
    printedReport = true;
    log.push('--- relatório de depuração do Guarda (t=9s) ---');
    log.push(brains[0].debugReport(6));
    log.push('---');
  }
  // Remove mortos do mundo.
  for (const e of [...world.entities()]) if (!e.isAlive()) {
    log.push(`t=${world.time.toFixed(2).padStart(5)}  ☠ ${e.name} morreu`);
    world.remove(e.id);
  }
}

console.log(log.join('\n'));
console.log(
  `\nFim: Guarda ${guard.stat('health')} HP, Maga ${mage.stat('health')} HP, orcs vivos: ${
    [...world.entities()].filter((e) => e.team === 2).length
  }`,
);
