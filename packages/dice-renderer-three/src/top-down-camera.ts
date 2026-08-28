import { PerspectiveCamera } from 'three';

export interface TopDownCameraOptions {
  readonly trayWidth?: number;
  readonly trayDepth?: number;
  readonly cameraFieldOfViewDegrees?: number;
  readonly cameraPadding?: number;
}

const DEFAULT_TRAY_SIZE = 10;
const DEFAULT_FIELD_OF_VIEW_DEGREES = 38;
const DEFAULT_PADDING = 1.5;

export class TopDownCamera {
  readonly value: PerspectiveCamera;
  readonly #trayWidth: number;
  readonly #trayDepth: number;
  readonly #fieldOfViewDegrees: number;
  readonly #padding: number;

  constructor(options: TopDownCameraOptions = {}) {
    this.#trayWidth = positiveFinite(options.trayWidth ?? DEFAULT_TRAY_SIZE, 'trayWidth');
    this.#trayDepth = positiveFinite(options.trayDepth ?? DEFAULT_TRAY_SIZE, 'trayDepth');
    this.#fieldOfViewDegrees = options.cameraFieldOfViewDegrees ?? DEFAULT_FIELD_OF_VIEW_DEGREES;
    if (
      !Number.isFinite(this.#fieldOfViewDegrees) ||
      this.#fieldOfViewDegrees <= 0 ||
      this.#fieldOfViewDegrees >= 180
    ) {
      throw new RangeError('cameraFieldOfViewDegrees must be finite and between 0 and 180');
    }
    this.#padding = positiveFinite(options.cameraPadding ?? DEFAULT_PADDING, 'cameraPadding');
    if (this.#padding < 1) throw new RangeError('cameraPadding must be at least 1');

    this.value = new PerspectiveCamera(this.#fieldOfViewDegrees, 1, 0.1, 100);
    this.value.up.set(0, 0, -1);
  }

  resize(width: number, height: number): void {
    positiveFinite(width, 'width');
    positiveFinite(height, 'height');
    const aspect = width / height;
    const visibleHeight = Math.max(this.#trayDepth, this.#trayWidth / aspect) * this.#padding;
    const cameraHeight = visibleHeight / (2 * Math.tan((this.#fieldOfViewDegrees * Math.PI) / 360));

    this.value.position.set(0, cameraHeight, 0);
    this.value.lookAt(0, 0, 0);
    this.value.aspect = aspect;
    this.value.updateProjectionMatrix();
  }
}

function positiveFinite(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number`);
  }
  return value;
}
