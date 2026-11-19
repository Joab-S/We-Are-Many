import * as THREE from 'three';

/**
 * Origem flutuante (RNF-05): a câmera fica sempre na origem da cena e o
 * mundo é transladado em torno dela. As posições do mundo ficam em UA, em
 * double, do lado da CPU; para a GPU (float32) só vai a diferença até a
 * nave, que é pequena perto do que aparece na tela.
 *
 * Cada objeto ancorado guarda a referência viva da sua posição no mundo:
 * planetas e cometas que orbitam mexem na própria posição e não precisam
 * avisar. O campo de estrelas (StarField) e as sondas (ProbeControl) fazem
 * a mesma conta por conta própria.
 */
export class FloatingOrigin {
  /** Ponto do mundo que está na origem da cena neste quadro: a nave. */
  readonly origin = new THREE.Vector3();
  private readonly objects: THREE.Object3D[] = [];
  private readonly positions: THREE.Vector3[] = [];
  private readonly roll = new THREE.Quaternion();
  private static readonly FORWARD_AXIS = new THREE.Vector3(0, 0, 1);

  /** Prende o objeto a uma posição do mundo (a referência é lida a cada quadro). */
  anchor(object: THREE.Object3D, worldPos: THREE.Vector3): void {
    const i = this.objects.indexOf(object);
    if (i >= 0) this.positions[i] = worldPos;
    else {
      this.objects.push(object);
      this.positions.push(worldPos);
    }
  }

  release(object: THREE.Object3D): void {
    const i = this.objects.indexOf(object);
    if (i < 0) return;
    // Troca com o último: a ordem não importa.
    const last = this.objects.length - 1;
    this.objects[i] = this.objects[last];
    this.positions[i] = this.positions[last];
    this.objects.pop();
    this.positions.pop();
  }

  get anchored(): number {
    return this.objects.length;
  }

  /**
   * Põe a nave na origem: a câmera fica em (0, 0, 0), orientada como a nave
   * e inclinada `roll` rad, e os objetos ancorados vão para `pos - ship`.
   */
  update(ship: THREE.Vector3, shipQuat: THREE.Quaternion, roll: number, camera: THREE.Camera): void {
    this.origin.copy(ship);
    camera.quaternion.copy(shipQuat).multiply(this.roll.setFromAxisAngle(FloatingOrigin.FORWARD_AXIS, roll));
    camera.position.set(0, 0, 0);
    camera.updateMatrixWorld();
    for (let i = 0; i < this.objects.length; i++) this.objects[i].position.subVectors(this.positions[i], ship);
  }

  /** Posição na cena de um ponto do mundo, neste quadro. */
  toLocal(world: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    return out.subVectors(world, this.origin);
  }

  clear(): void {
    this.objects.length = 0;
    this.positions.length = 0;
  }
}
