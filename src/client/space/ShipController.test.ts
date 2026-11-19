import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { adaptiveMaxSpeed, DEFAULT_TUNING } from '../../core/flight';
import type { Input } from '../input';
import { DESCENT_FLOOR, turnWithPlanet, type Body } from './bodies';
import type { QuadSphere } from './planet/QuadSphere';
import { ShipController, type FlightKeys, type FlightWorld } from './ShipController';

const RADIUS = 0.004;
const NO_KEYS: FlightKeys = { thrust: false, brake: false, left: false, right: false, up: false, down: false, rollLeft: false, rollRight: false, turbo: false };
const input = { locked: false, mouseDx: 0, mouseDy: 0, wheel: 0 } as unknown as Input;

const planet = (quad: boolean): Body => ({
  name: 'Planeta',
  kind: 'rocky',
  pos: new THREE.Vector3(),
  radius: RADIUS,
  object: new THREE.Group(),
  quad: quad ? ({} as QuadSphere) : undefined,
});
const worldOf = (body: Body): FlightWorld => ({ bodies: () => [body], nearbyStars: () => [] });

/** Nave a `radii` raios do centro, sobre +Y, com o nariz em `nose`. */
function shipAt(radii: number, nose = new THREE.Vector3(0, -1, 0), up = new THREE.Vector3(1, 0, 0)) {
  const pos = new THREE.Vector3(0, radii * RADIUS, 0);
  const quat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(), nose, up));
  return { pos, quat, ship: new ShipController(pos, quat) };
}
const fly = (ship: ShipController, world: FlightWorld, seconds: number, keys = NO_KEYS) => {
  for (let t = 0; t < seconds; t += 1 / 30) ship.update(1 / 30, keys, input, null, false, world);
};
const altitude = (pos: THREE.Vector3) => pos.length() / RADIUS - 1;

describe('o teto da descida', () => {
  it('com o quadtree, a nave desce até o piso e não passa; sem ele, para em 1,6 raio', () => {
    for (const [quad, floor] of [[true, DESCENT_FLOOR], [false, 1.6]] as const) {
      const { pos, ship } = shipAt(2);
      let lowest = Infinity;
      const world = worldOf(planet(quad));
      for (let t = 0; t < 40; t += 1 / 30) {
        ship.update(1 / 30, { ...NO_KEYS, thrust: true }, input, null, false, world);
        lowest = Math.min(lowest, pos.length() / RADIUS);
      }
      expect(lowest).toBeGreaterThanOrEqual(floor - 1e-9);
      expect(lowest).toBeLessThan(floor + 0.01);
    }
  });

  it('o teto é 0,4 da altitude: quanto mais baixo, mais devagar, até o piso de velocidade', () => {
    const { gain, minSpeed } = DEFAULT_TUNING;
    for (const alt of [1, 0.5, 0.1, 0.05]) expect(adaptiveMaxSpeed(alt * RADIUS)).toBeCloseTo(gain * alt * RADIUS, 12);
    // Na nave, de frente para o chão.
    const { ship } = shipAt(1.1);
    ship.update(1 / 30, NO_KEYS, input, null, false, worldOf(planet(true)));
    expect(ship.maxSpeed).toBeCloseTo(gain * 0.1 * RADIUS, 10);
    expect(adaptiveMaxSpeed(1e-7)).toBe(minSpeed);
  });

  it('saindo do chão, a nave anda mais depressa do que chegando', () => {
    const down = shipAt(1.1);
    down.ship.update(1 / 30, NO_KEYS, input, null, false, worldOf(planet(true)));
    const up = shipAt(1.1, new THREE.Vector3(0, 1, 0));
    up.ship.update(1 / 30, NO_KEYS, input, null, false, worldOf(planet(true)));
    expect(up.ship.maxSpeed).toBeGreaterThan(down.ship.maxSpeed * 2);
  });
});

describe('o nivelamento', () => {
  /** Quanto o "cima" da nave se afasta do céu, olhando para o horizonte. */
  const tilt = (pos: THREE.Vector3, quat: THREE.Quaternion) => new THREE.Vector3(0, 1, 0).applyQuaternion(quat).angleTo(pos.clone().normalize());
  const rolled = (radii: number) => {
    const roll = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 1.2);
    const s = shipAt(radii, new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0));
    s.quat.multiply(roll);
    return s;
  };

  it('perto do chão, a rolagem some aos poucos', () => {
    const { pos, quat, ship } = rolled(1.3);
    const start = tilt(pos, quat);
    const world = worldOf(planet(true));
    fly(ship, world, 0.5);
    const middle = tilt(pos, quat);
    expect(middle).toBeLessThan(start);
    expect(middle).toBeGreaterThan(0.1);
    fly(ship, world, 5);
    expect(tilt(pos, quat)).toBeLessThan(0.01);
  });

  it('acima de meio raio de altitude, ou sem quadtree, a nave fica como está', () => {
    const high = rolled(1.6);
    const start = high.quat.clone();
    fly(high.ship, worldOf(planet(true)), 2);
    expect(high.quat.angleTo(start)).toBeLessThan(1e-9);
    const soft = rolled(1.7);
    fly(soft.ship, worldOf(planet(false)), 2);
    expect(altitude(soft.pos)).toBeGreaterThan(0.5);
    expect(tilt(soft.pos, soft.quat)).toBeGreaterThan(1);
  });

  it('só desfaz a rolagem: a mira fica onde o piloto a pôs, mesmo apontando para o chão', () => {
    const nose = new THREE.Vector3(0.6, -0.8, 0).normalize();
    const { quat, ship } = shipAt(1.2, nose, new THREE.Vector3(0, 0, 1));
    fly(ship, worldOf(planet(true)), 3);
    expect(new THREE.Vector3(0, 0, -1).applyQuaternion(quat).distanceTo(nose)).toBeLessThan(1e-6);
    // E o "cima" foi para o lado do céu.
    expect(new THREE.Vector3(0, 1, 0).applyQuaternion(quat).y).toBeGreaterThan(0.5);
  });

  it('rolar de propósito leva a melhor, e olhar a prumo não quebra a conta', () => {
    const { quat, ship } = rolled(1.3);
    const before = quat.clone();
    fly(ship, worldOf(planet(true)), 0.5, { ...NO_KEYS, rollLeft: true });
    expect(quat.angleTo(before)).toBeCloseTo(0.5 * 1.4, 0);
    const plumb = shipAt(1.3);
    fly(plumb.ship, worldOf(planet(true)), 1);
    expect(Number.isFinite(plumb.quat.x + plumb.quat.y + plumb.quat.z + plumb.quat.w)).toBe(true);
  });
});

describe('andar com o planeta', () => {
  it('a nave fica sobre o mesmo ponto e a mesma orientação em relação ao chão', () => {
    const surface = new THREE.Object3D();
    surface.rotation.order = 'XZY';
    surface.rotation.set(Math.PI / 2, 0.7, 0.41);
    const point = new THREE.Vector3(0.3, 0.5, 0.2).normalize();
    const offset = point.clone().applyEuler(surface.rotation).multiplyScalar(1.1);
    const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2, 0.3, 0.4));
    const before = new THREE.Quaternion().setFromEuler(surface.rotation).invert().multiply(quat);

    const delta = 1.3;
    turnWithPlanet(surface, delta, offset, quat);
    surface.rotation.y += delta;

    expect(offset.clone().sub(point.clone().applyEuler(surface.rotation).multiplyScalar(1.1)).length()).toBeLessThan(1e-9);
    const after = new THREE.Quaternion().setFromEuler(surface.rotation).invert().multiply(quat);
    expect(after.angleTo(before)).toBeLessThan(1e-6);
  });

  it('o polo não sai do lugar', () => {
    const surface = new THREE.Object3D();
    surface.rotation.order = 'XZY';
    surface.rotation.set(Math.PI / 2, 0.7, 0.41);
    const pole = new THREE.Vector3(0, 1, 0).applyEuler(surface.rotation);
    const offset = pole.clone();
    turnWithPlanet(surface, 2, offset);
    expect(offset.distanceTo(pole)).toBeLessThan(1e-9);
  });
});
