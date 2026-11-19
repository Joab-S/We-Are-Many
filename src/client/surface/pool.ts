/**
 * Object Pool de partículas (Game Programming Patterns), em arrays densos
 * (uma coluna por campo): nascer é escrever no fim, morrer é trazer a última
 * para o lugar da que morreu (swap-remove). Nada é criado nem descartado
 * enquanto a animação roda, e a capacidade é fixa.
 */
export class ParticlePool {
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly age: Float32Array;
  readonly life: Float32Array;
  readonly size: Float32Array;
  /** Tipo de partícula (o significado é de quem usa a piscina). */
  readonly kind: Uint8Array;
  /** Cor (r, g, b). */
  readonly rgb: Uint8Array;
  private n = 0;

  constructor(readonly capacity: number) {
    this.x = new Float32Array(capacity);
    this.y = new Float32Array(capacity);
    this.vx = new Float32Array(capacity);
    this.vy = new Float32Array(capacity);
    this.age = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.size = new Float32Array(capacity);
    this.kind = new Uint8Array(capacity);
    this.rgb = new Uint8Array(capacity * 3);
  }

  /** Partículas vivas: os índices 0 a count - 1. */
  get count(): number {
    return this.n;
  }

  get full(): boolean {
    return this.n >= this.capacity;
  }

  /** Solta uma partícula; devolve o índice, ou -1 com a piscina cheia. */
  spawn(x: number, y: number, vx: number, vy: number, age: number, life: number, kind = 0, size = 0, r = 0, g = 0, b = 0): number {
    if (this.n >= this.capacity) return -1;
    const k = this.n++;
    this.x[k] = x;
    this.y[k] = y;
    this.vx[k] = vx;
    this.vy[k] = vy;
    this.age[k] = age;
    this.life[k] = life;
    this.kind[k] = kind;
    this.size[k] = size;
    this.rgb[k * 3] = r;
    this.rgb[k * 3 + 1] = g;
    this.rgb[k * 3 + 2] = b;
    return k;
  }

  /** Tira a partícula `k`: a última vem para o lugar dela. */
  remove(k: number): void {
    const last = --this.n;
    if (k === last) return;
    this.x[k] = this.x[last];
    this.y[k] = this.y[last];
    this.vx[k] = this.vx[last];
    this.vy[k] = this.vy[last];
    this.age[k] = this.age[last];
    this.life[k] = this.life[last];
    this.kind[k] = this.kind[last];
    this.size[k] = this.size[last];
    this.rgb.copyWithin(k * 3, last * 3, last * 3 + 3);
  }

  /** Envelhece e move todas por `dt` segundos; as que passam da vida saem. */
  step(dt: number): void {
    // De trás para a frente: a que vem do fim já foi atualizada neste passo.
    for (let k = this.n - 1; k >= 0; k--) {
      this.age[k] += dt;
      this.x[k] += this.vx[k] * dt;
      this.y[k] += this.vy[k] * dt;
      if (this.age[k] >= this.life[k]) this.remove(k);
    }
  }

  clear(): void {
    this.n = 0;
  }
}
