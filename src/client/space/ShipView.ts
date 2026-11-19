import * as THREE from 'three';
import { TURBO } from '../../core/shipControl';
import type { GameRenderer } from '../renderer';
import { getGlowTexture } from './bodies';
import { disposeObject } from './dispose';
import type { ShipController } from './ShipController';

const BASE_FOV = 70;
const STREAKS = 220;
const ENGINE_COLOR = 0x66aaff;
const TURBO_COLOR = new THREE.Color(0xc8f0ff);

/**
 * A nave vista de fora, numa cena à parte desenhada por cima do mundo:
 * modelo low-poly, brilho do motor, riscos de poeira que dão noção de
 * velocidade e a luz da estrela local. Também abre o campo de visão da
 * câmera com a velocidade e dá a ela um pouco da inclinação da nave.
 */
export class ShipView {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(60, 1, 0.01, 100);
  /** Inclinação da câmera do mundo (rad), acompanhando a nave nas curvas. */
  cameraRoll = 0;
  private readonly ship = new THREE.Group();
  private readonly engineGlow: THREE.Sprite;
  private readonly light = new THREE.DirectionalLight(0xffffff, 2.2);
  private readonly streaks: THREE.LineSegments;
  private readonly streakSeeds: Float32Array;
  private bank = 0;
  // Rascunho reaproveitado a cada quadro.
  private readonly local = new THREE.Vector3();
  private readonly inverse = new THREE.Quaternion();

  constructor() {
    this.engineGlow = this.build();
    this.streakSeeds = new Float32Array(STREAKS * 3);
    for (let i = 0; i < this.streakSeeds.length; i++) this.streakSeeds[i] = Math.random() * 2 - 1;
    this.streaks = new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(STREAKS * 6), 3)),
      new THREE.LineBasicMaterial({ color: 0x9fc4ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.streaks.frustumCulled = false;
    this.scene.add(this.streaks);
    this.scene.add(this.ship, this.light, new THREE.AmbientLight(0x8899bb, 0.6));
  }

  private build(): THREE.Sprite {
    const hull = new THREE.MeshStandardMaterial({ color: 0xc9d3e6, flatShading: true, metalness: 0.3, roughness: 0.5 });
    const accent = new THREE.MeshStandardMaterial({ color: 0x3d7bff, flatShading: true, emissive: 0x0a2a80 });
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.1, 6), hull);
    body.rotation.x = -Math.PI / 2;
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.04, 0.38), hull);
    wing.position.set(0, -0.02, 0.22);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.26, 0.3), accent);
    fin.position.set(0, 0.13, 0.32);
    const tipL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.4), accent);
    tipL.position.set(-0.65, -0.02, 0.22);
    const tipR = tipL.clone();
    tipR.position.x = 0.65;
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: getGlowTexture(), color: ENGINE_COLOR, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }),
    );
    glow.position.set(0, 0, 0.6);
    this.ship.add(body, wing, fin, tipL, tipR, glow);
    this.ship.position.set(0, -0.7, -3.4);
    this.ship.scale.setScalar(0.6);
    return glow;
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Inclinação, deslocamento e efeitos visuais da nave e da câmera do mundo. */
  animate(dt: number, ctrl: ShipController, shipQuat: THREE.Quaternion, worldCamera: THREE.PerspectiveCamera): void {
    const turning = ctrl.turnRate + ctrl.yawRate * 0.6;
    const ease = 1 - Math.exp(-5 * dt);
    const blend = ctrl.turboBlend;
    // A nave inclina para dentro da curva e escorrega um pouco para fora na tela.
    this.bank = THREE.MathUtils.lerp(this.bank, THREE.MathUtils.clamp(turning * 0.55, -0.85, 0.85) + ctrl.roll * 0.35, ease);
    const nose = THREE.MathUtils.clamp(ctrl.climb * 0.25 + ctrl.pitchRate * 0.08, -0.4, 0.4);
    this.ship.rotation.x = THREE.MathUtils.lerp(this.ship.rotation.x, nose, ease);
    this.ship.rotation.y = THREE.MathUtils.lerp(this.ship.rotation.y, turning * 0.18, ease);
    this.ship.rotation.z = this.bank;
    const ratio = ctrl.velocity.length() / Math.max(ctrl.maxSpeed / (1 + (TURBO.multiplier - 1) * blend), 1e-12);
    const shake = blend * 0.015;
    this.ship.position.set(
      -turning * 0.25 + (Math.random() - 0.5) * shake,
      -0.7 - ctrl.climb * 0.12 + (Math.random() - 0.5) * shake,
      -3.4 + ctrl.speedFactor * 0.25 - blend * 0.35,
    );

    // Motor: mais forte acelerando e azul-claro no turbo.
    const glowMat = this.engineGlow.material;
    this.engineGlow.scale.setScalar(0.25 + Math.max(ctrl.speedFactor, 0) * 0.5 + blend * 0.9);
    glowMat.opacity = 0.35 + Math.max(ctrl.speedFactor, 0) * 0.5 + blend * 0.3;
    glowMat.color.setHex(ENGINE_COLOR).lerp(TURBO_COLOR, blend);

    // Câmera: campo de visão abre com a velocidade e acompanha um pouco a inclinação.
    const fov = BASE_FOV + Math.min(ratio, 1) * 6 + blend * 14;
    if (Math.abs(worldCamera.fov - fov) > 0.01) {
      worldCamera.fov = fov;
      worldCamera.updateProjectionMatrix();
    }
    this.cameraRoll = this.bank * 0.12;

    this.updateStreaks(dt, Math.min(ratio, 1.5) + blend, ctrl.velocity, shipQuat);
  }

  /** Riscos de poeira passando pela nave: dão noção de velocidade em qualquer escala. */
  private updateStreaks(dt: number, intensity: number, velocity: THREE.Vector3, shipQuat: THREE.Quaternion): void {
    const local = this.local.copy(velocity).applyQuaternion(this.inverse.copy(shipQuat).invert());
    const speedNow = local.length();
    const pos = this.streaks.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const dir = speedNow > 0 ? local.divideScalar(speedNow) : local.set(0, 0, -1);
    const flow = (2 + intensity * 26) * dt;
    const len = 0.05 + intensity * 0.9;
    const seeds = this.streakSeeds;
    for (let i = 0; i < STREAKS; i++) {
      const o = i * 3;
      seeds[o] -= dir.x * flow * 0.1;
      seeds[o + 1] -= dir.y * flow * 0.1;
      seeds[o + 2] -= dir.z * flow * 0.1;
      for (let a = 0; a < 3; a++) {
        if (seeds[o + a] < -1) seeds[o + a] += 2;
        else if (seeds[o + a] > 1) seeds[o + a] -= 2;
      }
      const x = seeds[o] * 6;
      const y = seeds[o + 1] * 4;
      const z = seeds[o + 2] * 10 - 6;
      arr[i * 6] = x;
      arr[i * 6 + 1] = y;
      arr[i * 6 + 2] = z;
      arr[i * 6 + 3] = x + dir.x * len;
      arr[i * 6 + 4] = y + dir.y * len;
      arr[i * 6 + 5] = z + dir.z * len;
    }
    pos.needsUpdate = true;
    (this.streaks.material as THREE.LineBasicMaterial).opacity = Math.min(0.55, Math.max(0, intensity - 0.15) * 0.4);
  }

  /** A luz da nave vem da estrela local (`starLocal`, posição na cena), vista no referencial da nave. */
  lightFrom(starLocal: THREE.Vector3, shipQuat: THREE.Quaternion): void {
    this.light.position.copy(starLocal).normalize().applyQuaternion(this.inverse.copy(shipQuat).invert());
  }

  render(renderer: GameRenderer): void {
    renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    disposeObject(this.scene);
  }
}
