// CMA-ES (Covariance Matrix Adaptation Evolution Strategy, Hansen): a estratégia evolutiva que aprende sozinha o
// tamanho do passo e a forma da nuvem de candidatos (quais parâmetros andam juntos). Segue "The CMA Evolution
// Strategy: A Tutorial" (Hansen, 2016), com pesos positivos e decomposição da covariância a cada geração (o
// número de parâmetros aqui é pequeno, até umas dezenas).
//
// Uso: const es = new CMAES({ mean, sigma, seed }); a cada geração, const xs = es.ask(); avaliar; es.tell(xs, notas).
// Menor nota é melhor. Não sabe de limites: quem chama repara o candidato (ver tune.mjs).

/** Gerador determinístico (mulberry32) e normal pela transformação de Box-Muller. */
export function rng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let spare = null;
  next.normal = () => {
    if (spare !== null) {
      const s = spare;
      spare = null;
      return s;
    }
    let u = 0;
    while (u === 0) u = next();
    const v = next();
    const r = Math.sqrt(-2 * Math.log(u));
    spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  };
  return next;
}

/** Autovalores e autovetores de uma matriz simétrica (Jacobi cíclico). Colunas de `vectors` são os autovetores. */
export function eigenSymmetric(m) {
  const n = m.length;
  const a = m.map((row) => row.slice());
  const v = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i][j] * a[i][j];
    if (off < 1e-22) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-300) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = a[k][p];
          const akq = a[k][q];
          a[k][p] = c * akp - s * akq;
          a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p][k];
          const aqk = a[q][k];
          a[p][k] = c * apk - s * aqk;
          a[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k][p];
          const vkq = v[k][q];
          v[k][p] = c * vkp - s * vkq;
          v[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }
  return { values: a.map((row, i) => row[i]), vectors: v };
}

export class CMAES {
  /**
   * @param {{ mean: number[], sigma: number, seed?: number, lambda?: number }} o
   * `mean` é o ponto de partida; `sigma` o passo inicial (na escala dos parâmetros); `lambda` o tamanho da
   * geração (sem ele, 4 + 3·ln n, o padrão do tutorial).
   */
  constructor(o) {
    const n = (this.n = o.mean.length);
    this.mean = o.mean.slice();
    this.sigma = o.sigma;
    this.rand = rng(o.seed ?? 1);
    const lambda = (this.lambda = o.lambda ?? 4 + Math.floor(3 * Math.log(n)));
    const mu = (this.mu = Math.floor(lambda / 2));
    const w = Array.from({ length: mu }, (_, i) => Math.log(mu + 0.5) - Math.log(i + 1));
    const sw = w.reduce((s, x) => s + x, 0);
    this.weights = w.map((x) => x / sw);
    this.mueff = 1 / this.weights.reduce((s, x) => s + x * x, 0);
    const me = this.mueff;
    this.cc = (4 + me / n) / (n + 4 + (2 * me) / n);
    this.cs = (me + 2) / (n + me + 5);
    this.c1 = 2 / ((n + 1.3) ** 2 + me);
    this.cmu = Math.min(1 - this.c1, (2 * (me - 2 + 1 / me)) / ((n + 2) ** 2 + me));
    this.damps = 1 + 2 * Math.max(0, Math.sqrt((me - 1) / (n + 1)) - 1) + this.cs;
    this.chiN = Math.sqrt(n) * (1 - 1 / (4 * n) + 1 / (21 * n * n));
    this.pc = new Array(n).fill(0);
    this.ps = new Array(n).fill(0);
    this.C = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
    this.B = this.C.map((r) => r.slice());
    this.D = new Array(n).fill(1);
    this.invsqrtC = this.C.map((r) => r.slice());
    this.generation = 0;
    this.evaluations = 0;
  }

  /** Candidatos da geração: média + sigma · B · D · z, com z normal. */
  ask() {
    const { n, B, D } = this;
    const out = [];
    for (let k = 0; k < this.lambda; k++) {
      const z = Array.from({ length: n }, () => this.rand.normal());
      const y = new Array(n).fill(0);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) y[i] += B[i][j] * D[j] * z[j];
      out.push(this.mean.map((m, i) => m + this.sigma * y[i]));
    }
    return out;
  }

  /** Atualiza média, caminhos de evolução, covariância e passo com os candidatos e as notas (menor é melhor). */
  tell(xs, fs) {
    const { n, mu, weights, sigma, cs, cc, c1, cmu, mueff } = this;
    this.generation++;
    this.evaluations += xs.length;
    const order = fs.map((f, i) => [f, i]).sort((p, q) => p[0] - q[0]).map((p) => p[1]);
    const old = this.mean.slice();
    const mean = new Array(n).fill(0);
    for (let k = 0; k < mu; k++) for (let i = 0; i < n; i++) mean[i] += weights[k] * xs[order[k]][i];
    this.mean = mean;
    const y = mean.map((m, i) => (m - old[i]) / sigma);
    // Caminho do passo (conjugado): invsqrtC · y.
    const cy = new Array(n).fill(0);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) cy[i] += this.invsqrtC[i][j] * y[j];
    const a = Math.sqrt(cs * (2 - cs) * mueff);
    for (let i = 0; i < n; i++) this.ps[i] = (1 - cs) * this.ps[i] + a * cy[i];
    const psn = Math.hypot(...this.ps);
    const hsig = psn / Math.sqrt(1 - (1 - cs) ** ((2 * this.evaluations) / this.lambda)) / this.chiN < 1.4 + 2 / (n + 1) ? 1 : 0;
    const b = Math.sqrt(cc * (2 - cc) * mueff);
    for (let i = 0; i < n; i++) this.pc[i] = (1 - cc) * this.pc[i] + hsig * b * y[i];
    // Covariância: posto 1 (caminho) mais posto mu (os melhores da geração).
    const steps = order.slice(0, mu).map((k) => xs[k].map((x, i) => (x - old[i]) / sigma));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= i; j++) {
        let rmu = 0;
        for (let k = 0; k < mu; k++) rmu += weights[k] * steps[k][i] * steps[k][j];
        const r1 = this.pc[i] * this.pc[j] + (1 - hsig) * cc * (2 - cc) * this.C[i][j];
        const v = (1 - c1 - cmu) * this.C[i][j] + c1 * r1 + cmu * rmu;
        this.C[i][j] = v;
        this.C[j][i] = v;
      }
    }
    this.sigma *= Math.exp((cs / this.damps) * (psn / this.chiN - 1));
    const { values, vectors } = eigenSymmetric(this.C);
    this.B = vectors;
    this.D = values.map((v) => Math.sqrt(Math.max(v, 1e-20)));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        let s = 0;
        for (let k = 0; k < n; k++) s += (vectors[i][k] * vectors[j][k]) / this.D[k];
        this.invsqrtC[i][j] = s;
      }
    }
  }
}
