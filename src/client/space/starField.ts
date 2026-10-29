import * as THREE from 'three';
import { bvToTemperature, temperatureToRgb } from '../../core/astro';
import { AU_PER_PC } from '../../core/units';
import { loadChunk } from '../../universe/loader';
import { selectNodes, type IndexedManifest, type ManifestNode } from '../../universe/manifest';

/** Estrela do catálogo em coordenadas de mundo (UA, double). */
export interface CatalogStar {
  id: number;
  pos: THREE.Vector3;
  absmag: number;
  ci: number;
}

interface LoadedChunk {
  node: ManifestNode;
  data: Float32Array;
  points: THREE.Points;
  centerAu: THREE.Vector3;
}

const vertexShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  attribute float absmag;
  attribute vec3 starColor;
  uniform float uPixelRatio;
  uniform float uMagLimit;
  uniform float uFadeNearPc;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float dpc = max(length(mv.xyz) / ${AU_PER_PC.toFixed(3)}, 1e-9);
    float m = absmag + 5.0 * (log(dpc) / log(10.0)) - 5.0;
    float flux = pow(10.0, -0.4 * (m - uMagLimit));
    float size = clamp(1.2 + 1.6 * sqrt(flux), 1.0, 22.0);
    vAlpha = clamp(flux * 0.9, 0.0, 1.0) * smoothstep(uFadeNearPc * 0.3, uFadeNearPc, dpc);
    vColor = starColor;
    gl_PointSize = vAlpha < 0.004 ? 0.0 : size * uPixelRatio;
    gl_Position = projectionMatrix * mv;
    #include <logdepthbuf_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    #include <logdepthbuf_fragment>
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(p, p);
    if (r2 > 1.0) discard;
    float core = exp(-r2 * 6.0);
    float halo = exp(-r2 * 2.0) * 0.35;
    gl_FragColor = vec4(vColor * (core + halo) * vAlpha, 1.0);
  }
`;

/**
 * Campo de estrelas do catálogo, transmitido em chunks conforme a posição da
 * nave (REQUISITOS.md, seção 3.4). Cada chunk é um THREE.Points com posições
 * relativas ao centro do nó; a translação até a câmera é calculada em double
 * na CPU (origem flutuante).
 */
export class StarField {
  readonly group = new THREE.Group();
  private readonly material: THREE.ShaderMaterial;
  private readonly chunks = new Map<string, LoadedChunk>();
  private readonly pending = new Set<string>();
  private lastSelect = 0;
  private disposed = false;

  constructor(private readonly index: IndexedManifest) {
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uPixelRatio: { value: 1 },
        uMagLimit: { value: 6.8 },
        uFadeNearPc: { value: 0.001 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
  }

  get loadedCount(): number {
    return this.chunks.size;
  }

  get starCount(): number {
    let n = 0;
    for (const c of this.chunks.values()) n += c.node.n;
    return n;
  }

  /** Atualiza quais chunks ficam carregados e reposiciona os já carregados. */
  update(shipAu: THREE.Vector3, now: number, pixelRatio: number): void {
    this.material.uniforms.uPixelRatio.value = pixelRatio;
    if (now - this.lastSelect > 250) {
      this.lastSelect = now;
      const p: [number, number, number] = [shipAu.x / AU_PER_PC, shipAu.y / AU_PER_PC, shipAu.z / AU_PER_PC];
      const wanted = selectNodes(this.index, p);
      for (const [id, chunk] of this.chunks) {
        if (!wanted.has(id)) this.unload(id, chunk);
      }
      for (const id of wanted) {
        if (!this.chunks.has(id) && !this.pending.has(id)) void this.load(id);
      }
    }
    for (const c of this.chunks.values()) c.points.position.subVectors(c.centerAu, shipAu);
  }

  /** Estrela do catálogo mais próxima do ponto, entre os chunks carregados. */
  nearest(shipAu: THREE.Vector3, skipId?: number): (CatalogStar & { distAu: number }) | null {
    let best: (CatalogStar & { distAu: number }) | null = null;
    let bestSq = Infinity;
    const tmp = new THREE.Vector3();
    for (const c of this.chunks.values()) {
      const d = c.data;
      const cx = c.centerAu.x;
      const cy = c.centerAu.y;
      const cz = c.centerAu.z;
      for (let i = 0; i < d.length; i += 6) {
        const dx = cx + d[i] * AU_PER_PC - shipAu.x;
        const dy = cy + d[i + 1] * AU_PER_PC - shipAu.y;
        const dz = cz + d[i + 2] * AU_PER_PC - shipAu.z;
        const sq = dx * dx + dy * dy + dz * dz;
        if (sq < bestSq && d[i + 5] !== skipId) {
          bestSq = sq;
          tmp.set(dx, dy, dz).add(shipAu);
          best = { id: d[i + 5], pos: tmp.clone(), absmag: d[i + 3], ci: d[i + 4], distAu: Math.sqrt(sq) };
        }
      }
    }
    return best;
  }

  /**
   * As `k` estrelas carregadas mais próximas, da mais perto para a mais
   * longe, numa única passada pelos chunks (usado pelo radar e pelo GUIA).
   */
  nearby(shipAu: THREE.Vector3, k: number, skipId?: number, maxAu = Infinity): (CatalogStar & { distAu: number })[] {
    const ids: number[] = [];
    const sqs: number[] = [];
    const where: [Float32Array, number, THREE.Vector3][] = [];
    let worst = maxAu === Infinity ? Infinity : maxAu * maxAu;
    for (const c of this.chunks.values()) {
      const d = c.data;
      const cx = c.centerAu.x - shipAu.x;
      const cy = c.centerAu.y - shipAu.y;
      const cz = c.centerAu.z - shipAu.z;
      for (let i = 0; i < d.length; i += 6) {
        const dx = cx + d[i] * AU_PER_PC;
        const dy = cy + d[i + 1] * AU_PER_PC;
        const dz = cz + d[i + 2] * AU_PER_PC;
        const sq = dx * dx + dy * dy + dz * dz;
        if (sq >= worst || d[i + 5] === skipId) continue;
        // Inserção ordenada numa lista curta.
        let j = sqs.length;
        while (j > 0 && sqs[j - 1] > sq) j--;
        sqs.splice(j, 0, sq);
        ids.splice(j, 0, d[i + 5]);
        where.splice(j, 0, [d, i, c.centerAu]);
        if (sqs.length > k) {
          sqs.pop();
          ids.pop();
          where.pop();
        }
        if (sqs.length === k) worst = sqs[k - 1];
      }
    }
    return where.map(([d, i, center], n) => ({
      id: ids[n],
      pos: new THREE.Vector3(d[i], d[i + 1], d[i + 2]).multiplyScalar(AU_PER_PC).add(center),
      absmag: d[i + 3],
      ci: d[i + 4],
      distAu: Math.sqrt(sqs[n]),
    }));
  }

  /** Estrelas carregadas que têm nome próprio no catálogo, para a busca do GUIA. */
  named(names: Map<number, string>): CatalogStar[] {
    const out: CatalogStar[] = [];
    for (const c of this.chunks.values()) {
      const d = c.data;
      for (let i = 0; i < d.length; i += 6) {
        if (!names.has(d[i + 5])) continue;
        const pos = new THREE.Vector3(d[i], d[i + 1], d[i + 2]).multiplyScalar(AU_PER_PC).add(c.centerAu);
        out.push({ id: d[i + 5], pos, absmag: d[i + 3], ci: d[i + 4] });
      }
    }
    return out;
  }

  /** Procura uma estrela pelo id entre os chunks carregados. */
  find(id: number): CatalogStar | null {
    for (const c of this.chunks.values()) {
      const d = c.data;
      for (let i = 0; i < d.length; i += 6) {
        if (d[i + 5] === id) {
          const pos = new THREE.Vector3(d[i], d[i + 1], d[i + 2]).multiplyScalar(AU_PER_PC).add(c.centerAu);
          return { id, pos, absmag: d[i + 3], ci: d[i + 4] };
        }
      }
    }
    return null;
  }

  private async load(id: string): Promise<void> {
    const node = this.index.byId.get(id);
    if (!node) return;
    this.pending.add(id);
    try {
      const data = await loadChunk(this.index.manifest.version, id);
      if (this.disposed) return;
      const count = data.length / 6;
      const positions = new Float32Array(count * 3);
      const absmag = new Float32Array(count);
      const colors = new Float32Array(count * 3);
      for (let s = 0; s < count; s++) {
        const o = s * 6;
        positions[s * 3] = data[o];
        positions[s * 3 + 1] = data[o + 1];
        positions[s * 3 + 2] = data[o + 2];
        absmag[s] = data[o + 3];
        const [r, g, b] = temperatureToRgb(bvToTemperature(data[o + 4]));
        colors[s * 3] = r;
        colors[s * 3 + 1] = g;
        colors[s * 3 + 2] = b;
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('absmag', new THREE.BufferAttribute(absmag, 1));
      geometry.setAttribute('starColor', new THREE.BufferAttribute(colors, 3));
      const points = new THREE.Points(geometry, this.material);
      points.scale.setScalar(AU_PER_PC);
      // O shader não move as posições, então a esfera do chunk vale para o descarte
      // por frustum: chunks atrás da nave ou fora do campo de visão nem são desenhados.
      geometry.computeBoundingSphere();
      const centerAu = new THREE.Vector3(...node.c).multiplyScalar(AU_PER_PC);
      this.chunks.set(id, { node, data, points, centerAu });
      this.group.add(points);
    } catch (err) {
      console.warn(err);
    } finally {
      this.pending.delete(id);
    }
  }

  private unload(id: string, chunk: LoadedChunk): void {
    this.group.remove(chunk.points);
    chunk.points.geometry.dispose();
    this.chunks.delete(id);
  }

  dispose(): void {
    this.disposed = true;
    for (const [id, c] of this.chunks) this.unload(id, c);
    this.material.dispose();
  }
}
