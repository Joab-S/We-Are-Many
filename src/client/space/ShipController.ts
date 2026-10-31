import * as THREE from 'three';
import { adaptiveMaxSpeed, directionalDistance } from '../../core/flight';
import { stepSpeedFactor, THROTTLE, Turbo, TURBO } from '../../core/shipControl';
import { starVisualRadius } from '../../nav/systemGen';
import type { Input } from '../input';
import type { Body } from './bodies';
import type { TargetView } from './GuideHud';
import type { CatalogStar } from './starField';

const MOUSE_SENSITIVITY = 0.0022;
/** Velocidade de curva com A/D, em rad/s. */
const TURN_RATE = 1.25;
/** Quão rápido a direção do movimento acompanha o nariz da nave (deriva nas curvas). */
const GRIP = 2.2;
/** Quantas das estrelas mais próximas seguram a velocidade. */
const SPEED_STARS = 12;

const k = (on: boolean): number => (on ? 1 : 0);

/** Teclas de voo seguradas neste quadro. */
export interface FlightKeys {
  thrust: boolean;
  brake: boolean;
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  rollLeft: boolean;
  rollRight: boolean;
  turbo: boolean;
}

/** O que está em volta da nave: obstáculos para o teto de velocidade e para a colisão. */
export interface FlightWorld {
  /** Corpos sólidos por perto (estrela local, planetas, cometas e pontos de interesse sólidos). */
  bodies(): readonly Body[];
  /** Estrelas do catálogo mais próximas, da mais perto para a mais longe. */
  nearbyStars(): readonly CatalogStar[];
}

/**
 * Pilotagem da nave sobre core/shipControl.ts: acelerador com arrancada,
 * freio e deslize, turbo, curva com inércia e deriva, mira suavizada do
 * mouse, piloto automático (vira para o alvo e só acelera alinhado),
 * velocidade adaptativa pela distância aos obstáculos (seção 3.5) e
 * distância mínima dos corpos (RF-NAV-05). Mexe na posição e na rotação
 * da nave do GameState; o desenho fica com ShipView.
 */
export class ShipController {
  /** Velocidade atual, em UA/s. */
  readonly velocity = new THREE.Vector3();
  /** Potência do motor (roda do mouse), de 0,1 a 1. */
  throttle = 1;
  /** Fração do teto de velocidade pedida pelo piloto (-0,3..1). */
  speedFactor = 0;
  readonly turbo = new Turbo();
  /** Entrada e saída suaves do turbo (0..1). */
  turboBlend = 0;
  /** Velocidade angular atual da curva com A/D (rad/s). */
  turnRate = 0;
  /** Subida (+1) ou descida (-1), suavizada. */
  climb = 0;
  /** Teto de velocidade do último passo, com o turbo (UA/s). */
  maxSpeed = 0;
  /** Giro do mouse aplicado no último passo (rad/s), para a inclinação da nave. */
  yawRate = 0;
  pitchRate = 0;
  /** Rolagem com Q/E no último passo (-1, 0 ou 1). */
  roll = 0;
  /** Rotação do mouse ainda não aplicada, suavizada ao longo de alguns frames. */
  private pendingYaw = 0;
  private pendingPitch = 0;

  // Objetos de rascunho reaproveitados a cada quadro (sem lixo para o coletor).
  private readonly dir = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private readonly moveDir = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();
  private readonly rel = new THREE.Vector3();
  private readonly zero = new THREE.Vector3();
  private readonly aim = new THREE.Quaternion();
  private readonly turn = new THREE.Quaternion();
  private readonly euler = new THREE.Euler();
  private readonly look = new THREE.Matrix4();

  constructor(
    private readonly pos: THREE.Vector3,
    private readonly quat: THREE.Quaternion,
  ) {}

  /** O piloto assumiu: apertou agora uma tecla de manobra (`manualHit`) ou arrastou o mouse com força. */
  takesOver(manualHit: boolean, input: Input): boolean {
    return manualHit || (input.locked && Math.abs(input.mouseDx) + Math.abs(input.mouseDy) > 40);
  }

  /**
   * Um passo de voo. Com `autopilot` (a vista do alvo), a nave vira e
   * acelera sozinha; senão segue as teclas e o mouse.
   */
  update(dt: number, keys: FlightKeys, input: Input, autopilot: TargetView | null, cruise: boolean, world: FlightWorld): void {
    const q = this.quat;
    this.yawRate = 0;
    this.pitchRate = 0;
    this.roll = 0;
    if (autopilot) {
      // Vira suavemente para o alvo e só acelera quando está alinhado.
      const dir = this.dir.copy(autopilot.pos).sub(this.pos).normalize();
      const up = this.up.set(0, 1, 0).applyQuaternion(q);
      this.aim.setFromRotationMatrix(this.look.lookAt(this.zero, dir, up));
      q.slerp(this.aim, 1 - Math.exp(-2.4 * dt)).normalize();
      this.pendingYaw = 0;
      this.pendingPitch = 0;
      this.turnRate = THREE.MathUtils.lerp(this.turnRate, 0, 1 - Math.exp(-4 * dt));
      const aligned = this.forward.set(0, 0, -1).applyQuaternion(q).dot(dir);
      this.speedFactor = stepSpeedFactor(this.speedFactor, aligned > 0.92 ? 1 : this.speedFactor > 0.15 ? -1 : 0, dt);
    } else {
      // Mira com o mouse, suavizada para o movimento não ficar duro.
      if (input.locked) {
        this.pendingYaw += -input.mouseDx * MOUSE_SENSITIVITY;
        this.pendingPitch += -input.mouseDy * MOUSE_SENSITIVITY;
      }
      const aim = 1 - Math.exp(-14 * dt);
      const yawStep = this.pendingYaw * aim;
      const pitchStep = this.pendingPitch * aim;
      this.pendingYaw -= yawStep;
      this.pendingPitch -= pitchStep;
      this.yawRate = yawStep / Math.max(dt, 1e-3);
      this.pitchRate = pitchStep / Math.max(dt, 1e-3);

      // A/D fazem a curva com inércia: a curva entra e sai suavemente.
      const steer = k(keys.left) - k(keys.right);
      this.turnRate = THREE.MathUtils.lerp(this.turnRate, steer * TURN_RATE, 1 - Math.exp(-4 * dt));
      this.roll = k(keys.rollLeft) - k(keys.rollRight);
      q.multiply(this.turn.setFromEuler(this.euler.set(pitchStep, yawStep + this.turnRate * dt, this.roll * 1.4 * dt, 'YXZ')));
      q.normalize();
      // Acelerador com arrancada, freio e deslize (ou velocidade mantida no cruzeiro).
      this.speedFactor = stepSpeedFactor(this.speedFactor, (k(keys.thrust) - k(keys.brake)) as -1 | 0 | 1, dt, THROTTLE, cruise);
    }
    if (input.wheel) this.throttle = THREE.MathUtils.clamp(this.throttle - input.wheel * 0.1, 0.1, 1);

    // Tab no lugar de Ctrl: Ctrl+W fecha a aba do navegador e não pode ser bloqueado.
    this.turbo.step(keys.turbo && this.speedFactor > 0.05, dt);
    this.turboBlend = THREE.MathUtils.lerp(this.turboBlend, this.turbo.active ? 1 : 0, 1 - Math.exp(-(this.turbo.active ? 3 : 1.5) * dt));
    // O ganho do turbo entra e sai em rampa, sem tranco.
    const turboMul = 1 + (TURBO.multiplier - 1) * this.turboBlend;

    const forward = this.forward.set(0, 0, -1).applyQuaternion(q);
    const moveDir = this.speedFactor < 0 ? this.moveDir.copy(forward).negate() : forward;
    const maxSpeed = adaptiveMaxSpeed(this.speedDistance(moveDir, world, autopilot)) * turboMul;
    this.maxSpeed = maxSpeed;
    this.climb = THREE.MathUtils.lerp(this.climb, autopilot ? 0 : k(keys.up) - k(keys.down), 1 - Math.exp(-5 * dt));
    const up = this.up.set(0, 1, 0).applyQuaternion(q);
    const desired = this.desired
      .copy(forward)
      .multiplyScalar(this.speedFactor * maxSpeed * this.throttle)
      .addScaledVector(up, this.climb * 0.5 * maxSpeed * this.throttle);
    // O vetor velocidade segue o nariz com atraso: nas curvas a nave desliza um pouco.
    this.velocity.lerp(desired, 1 - Math.exp(-GRIP * dt));
    // O teto cai imediatamente ao se aproximar de algo, para a nave nunca atravessar um planeta.
    if (this.velocity.length() > maxSpeed) this.velocity.setLength(maxSpeed);
    this.pos.addScaledVector(this.velocity, dt);
    this.collide(world.bodies());
  }

  /** Distância mínima: a nave nunca entra numa estrela ou planeta (RF-NAV-05). */
  private collide(bodies: readonly Body[]): void {
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      const minDist = b.radius * (b.kind === 'star' ? 2 : 1.6);
      const offset = this.rel.copy(this.pos).sub(b.pos);
      const d = offset.length();
      if (d < minDist) {
        const n = offset.divideScalar(d || 1);
        this.pos.copy(b.pos).addScaledVector(n, minDist);
        const inward = this.velocity.dot(n);
        if (inward < 0) this.velocity.addScaledVector(n, -inward);
        this.speedFactor *= 0.5;
      }
    }
  }

  /**
   * Distância que define o teto de velocidade: os obstáculos à frente contam
   * inteiros e os de trás contam bem menos (seção 3.5). Com piloto
   * automático, o próprio alvo é um obstáculo, para a nave chegar freando.
   */
  private speedDistance(dir: THREE.Vector3, world: FlightWorld, autopilot: TargetView | null): number {
    let best = Infinity;
    // Cometas, destroços e sinais são minúsculos: não seguram a nave (a colisão continua valendo).
    const bodies = world.bodies();
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      if (b.kind !== 'comet' && b.radius > 1e-3) best = Math.min(best, this.obstacle(b.pos, b.radius, dir));
    }
    const stars = world.nearbyStars();
    for (let i = 0; i < Math.min(SPEED_STARS, stars.length); i++) best = Math.min(best, this.obstacle(stars[i].pos, starVisualRadius(stars[i]), dir));
    // O piso de meia distância de chegada evita o "rastejar" exponencial no fim.
    if (autopilot) best = Math.min(best, Math.max(autopilot.dist - autopilot.arrive, autopilot.arrive * 0.5));
    return best;
  }

  private obstacle(pos: THREE.Vector3, radius: number, dir: THREE.Vector3): number {
    const rel = this.rel.subVectors(pos, this.pos);
    const len = rel.length();
    const cos = len > 0 ? rel.dot(dir) / len : 1;
    return directionalDistance(Math.max(len - radius, 0), cos);
  }

  /** Aponta a nave para `target`, parada (atalhos de salto). */
  lookAt(target: THREE.Vector3): void {
    this.up.set(0, 0, 1);
    this.quat.setFromRotationMatrix(this.look.lookAt(this.pos, target, this.up));
    this.velocity.set(0, 0, 0);
    this.speedFactor = 0;
    this.pendingYaw = 0;
    this.pendingPitch = 0;
  }

  /** Chegada do piloto automático: a nave quase para. */
  halt(): void {
    this.speedFactor = 0;
    this.velocity.multiplyScalar(0.05);
  }
}
