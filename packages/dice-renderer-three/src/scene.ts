import {
  AmbientLight,
  Color,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
} from 'three';

export class ThreeScene {
  readonly value = new Scene();
  readonly #floorGeometry = new PlaneGeometry(20, 20);
  readonly #floorMaterial = new MeshStandardMaterial({ color: 0x20242b, roughness: 0.9 });
  readonly #lighting: ThreeLighting;

  constructor() {
    this.value.background = new Color(0x101318);
    const floor = new Mesh(this.#floorGeometry, this.#floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.value.add(floor);
    this.#lighting = new ThreeLighting(this.value);
  }

  dispose(): void {
    this.#lighting.dispose(this.value);
    this.#floorGeometry.dispose();
    this.#floorMaterial.dispose();
    this.value.clear();
  }
}

export class ThreeCamera {
  readonly value = new PerspectiveCamera(42, 1, 0.1, 100);

  constructor() {
    this.value.position.set(7, 8, 9);
    this.value.lookAt(0, 0.8, 0);
  }

  resize(width: number, height: number): void {
    this.value.aspect = width / height;
    this.value.updateProjectionMatrix();
  }
}

export class ThreeLighting {
  readonly #ambient = new AmbientLight(0xffffff, 1.25);
  readonly #key = new DirectionalLight(0xffffff, 3.25);

  constructor(scene: Scene) {
    this.#key.position.set(5, 10, 6);
    this.#key.castShadow = true;
    this.#key.shadow.mapSize.set(1024, 1024);
    scene.add(this.#ambient, this.#key);
  }

  dispose(scene: Scene): void {
    scene.remove(this.#ambient, this.#key);
    this.#key.dispose();
  }
}
