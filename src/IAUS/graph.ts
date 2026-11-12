// graph.ts — O cérebro como grafo (para desenhar a "esfera de pensamentos").
//
// Um Brain vira nós e arestas, só com dados (sobrevive a JSON e a postMessage):
//   cérebro ── pacote ── comportamento ── consideração ── entrada
//                              └── tipo de comportamento
//   cérebro ── tag (o que ele é) · cérebro ── crença (o que ele vê nos outros)
// Cada nó de comportamento leva a última nota e se está ativo agora, para a tela acender o que pensa.
// `sphereLayout` dá uma posição 3D determinística: cada pacote vira um aglomerado na superfície de uma
// esfera (pontos de Fibonacci), e os comportamentos do pacote se espalham em volta do centro dele.

import type { Brain } from './brain';
import type { Behavior } from './behavior';

export type BrainNodeKind = 'brain' | 'pack' | 'behavior' | 'consideration' | 'input' | 'type' | 'tag' | 'belief';

export interface BrainNode {
  id: string;
  kind: BrainNodeKind;
  label: string;
  /** Pacote a que o nó pertence (o aglomerado na esfera); vazio para os nós compartilhados. */
  group: string;
  /** Última nota (0 a 1+) do comportamento, da consideração ou do pacote (a melhor dos seus). */
  score?: number;
  /** O comportamento que o agente executa agora (e o caminho até ele). */
  active?: boolean;
  /** Peso do comportamento. */
  weight?: number;
}

export interface BrainEdge {
  from: string;
  to: string;
  kind: 'has' | 'considers' | 'reads' | 'runs' | 'is' | 'believes';
}

export interface BrainGraph {
  owner: { id: number; name: string };
  nodes: BrainNode[];
  edges: BrainEdge[];
}

const bid = (b: Behavior) => `b:${b.id}`;

/** Monta o grafo do cérebro agora. Não muda o cérebro. */
export function brainGraph(brain: Brain): BrainGraph {
  const nodes = new Map<string, BrainNode>();
  const edges: BrainEdge[] = [];
  const add = (n: BrainNode) => {
    if (!nodes.has(n.id)) nodes.set(n.id, n);
    return nodes.get(n.id)!;
  };
  const root = add({ id: 'brain', kind: 'brain', label: brain.owner.name, group: '' });
  const current = brain.currentDecision?.context.behavior.id;
  const scored = new Map<string, { name: string; score: number }[]>();
  for (const d of brain.lastScored) {
    const k = bid(d.context.behavior);
    if (!scored.has(k) && d.breakdown.length) scored.set(k, d.breakdown);
  }
  const packs = [
    ...brain.behaviorPacks.map((p) => ({ id: `p:${p.id}`, name: p.name, behaviors: [...p.behaviors] })),
    ...brain.abilityPacks.map((p) => ({ id: `a:${p.id}`, name: p.name, behaviors: p.pairs.map((x) => x.behavior) })),
  ];
  for (const p of packs) {
    const pn = add({ id: p.id, kind: 'pack', label: p.name, group: p.name, score: 0 });
    edges.push({ from: root.id, to: pn.id, kind: 'has' });
    for (const b of p.behaviors) {
      const score = brain.lastBehaviorScore.get(b.id);
      const active = b.id === current;
      const bn = add({ id: bid(b), kind: 'behavior', label: b.name, group: p.name, score, active, weight: b.weight });
      if (active) pn.active = root.active = true;
      if (score !== undefined) pn.score = Math.max(pn.score ?? 0, score);
      edges.push({ from: pn.id, to: bn.id, kind: 'has' });
      const tn = add({ id: `t:${b.behaviorType}`, kind: 'type', label: b.behaviorType, group: '' });
      if (active) tn.active = true;
      edges.push({ from: bn.id, to: tn.id, kind: 'runs' });
      const parts = scored.get(bn.id);
      b.considerations.forEach((c, k) => {
        const cn = add({ id: `${bn.id}:c${k}`, kind: 'consideration', label: c.name, group: p.name, score: parts?.[k]?.score, active });
        edges.push({ from: bn.id, to: cn.id, kind: 'considers' });
        const inn = add({ id: `i:${c.input}`, kind: 'input', label: c.input, group: '' });
        edges.push({ from: cn.id, to: inn.id, kind: 'reads' });
      });
    }
  }
  const now = brain.world.now();
  for (const [tag, exp] of brain.owner.tags.entries()) {
    if (exp <= now) continue;
    const tn = add({ id: `tag:${tag}`, kind: 'tag', label: tag, group: '' });
    edges.push({ from: root.id, to: tn.id, kind: 'is' });
  }
  for (const [target, tags] of brain.owner.beliefs.entries()) {
    for (const tag of tags) {
      const n = add({ id: `belief:${target}:${tag}`, kind: 'belief', label: `${tag} (#${target})`, group: '' });
      edges.push({ from: root.id, to: n.id, kind: 'believes' });
    }
  }
  return { owner: { id: brain.owner.id, name: brain.owner.name }, nodes: [...nodes.values()], edges };
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Ponto k de n na esfera unitária (espiral de Fibonacci: bem espalhados, sem sorteio). */
export function fibonacciPoint(k: number, n: number): Vec3 {
  const y = n <= 1 ? 0 : 1 - (2 * (k + 0.5)) / n;
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const a = k * Math.PI * (3 - Math.sqrt(5));
  return { x: Math.cos(a) * r, y, z: Math.sin(a) * r };
}

/**
 * Posição 3D de cada nó, de raio `radius`: o cérebro no centro, cada pacote num ponto da esfera, os
 * comportamentos e as considerações do pacote em volta dele (aglomerados), e os nós compartilhados
 * (entradas, tipos, tags e crenças) numa casca interna. Determinístico: o mesmo grafo dá a mesma esfera.
 */
export function sphereLayout(g: BrainGraph, radius = 1): Map<string, Vec3> {
  const pos = new Map<string, Vec3>();
  pos.set('brain', { x: 0, y: 0, z: 0 });
  const packs = g.nodes.filter((n) => n.kind === 'pack');
  const center = new Map<string, Vec3>();
  packs.forEach((p, k) => {
    const c = fibonacciPoint(k, packs.length);
    center.set(p.group, c);
    pos.set(p.id, { x: c.x * radius * 0.75, y: c.y * radius * 0.75, z: c.z * radius * 0.75 });
  });
  const byGroup = new Map<string, BrainNode[]>();
  const shared: BrainNode[] = [];
  for (const n of g.nodes) {
    if (n.kind === 'brain' || n.kind === 'pack') continue;
    if (n.group && center.has(n.group)) {
      const list = byGroup.get(n.group) ?? [];
      list.push(n);
      byGroup.set(n.group, list);
    } else shared.push(n);
  }
  const spread = packs.length > 1 ? Math.min(0.6, 1.8 / Math.sqrt(packs.length)) : 0.8;
  for (const [group, list] of byGroup) {
    const c = center.get(group)!;
    list.forEach((n, k) => {
      const o = fibonacciPoint(k, list.length);
      const x = c.x + o.x * spread * 0.5;
      const y = c.y + o.y * spread * 0.5;
      const z = c.z + o.z * spread * 0.5;
      const len = Math.hypot(x, y, z) || 1;
      const r = n.kind === 'consideration' ? radius * 1.08 : radius;
      pos.set(n.id, { x: (x / len) * r, y: (y / len) * r, z: (z / len) * r });
    });
  }
  shared.forEach((n, k) => {
    const o = fibonacciPoint(k, shared.length);
    pos.set(n.id, { x: o.x * radius * 0.4, y: o.y * radius * 0.4, z: o.z * radius * 0.4 });
  });
  return pos;
}
