/** Formato gerado por tools/pipeline/build_hyg_chunks.py. */
export interface ManifestNode {
  /** Id do nó: "r" para a raiz, seguido de um dígito de octante por nível. */
  id: string;
  /** Centro do cubo, em parsecs. */
  c: [number, number, number];
  /** Meia-aresta do cubo, em parsecs. */
  h: number;
  /** Número de estrelas no chunk. */
  n: number;
  /** Magnitude absoluta da estrela mais brilhante do chunk. */
  b: number;
  /** Ids dos filhos. */
  k: string[];
}

export interface Manifest {
  version: number;
  source: string;
  units: string;
  stride: number;
  stars: number;
  nodes: ManifestNode[];
}

export interface IndexedManifest {
  manifest: Manifest;
  byId: Map<string, ManifestNode>;
  root: ManifestNode;
}

export function indexManifest(manifest: Manifest): IndexedManifest {
  const byId = new Map(manifest.nodes.map((n) => [n.id, n]));
  const root = byId.get('r');
  if (!root) throw new Error('manifest sem nó raiz');
  return { manifest, byId, root };
}

/** Distância (pc) de um ponto até o cubo do nó; zero se estiver dentro. */
export function distanceToNode(node: ManifestNode, p: readonly [number, number, number]): number {
  let sq = 0;
  for (let i = 0; i < 3; i++) {
    const d = Math.abs(p[i] - node.c[i]) - node.h;
    if (d > 0) sq += d * d;
  }
  return Math.sqrt(sq);
}

/**
 * Escolhe os chunks que devem estar carregados para um observador em `p` (pc).
 * Um filho é carregado quando o observador está a menos de `factor` vezes a
 * meia-aresta dele. Assim, de longe, só os nós rasos (estrelas brilhantes)
 * ficam na memória; de perto, os nós profundos completam as estrelas fracas.
 */
export function selectNodes(index: IndexedManifest, p: readonly [number, number, number], factor = 2): Set<string> {
  const out = new Set<string>();
  const stack: ManifestNode[] = [index.root];
  while (stack.length) {
    const node = stack.pop()!;
    out.add(node.id);
    for (const id of node.k) {
      const child = index.byId.get(id);
      if (child && distanceToNode(child, p) < child.h * factor) stack.push(child);
    }
  }
  return out;
}
