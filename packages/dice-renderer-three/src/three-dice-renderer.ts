import type {
  DiceRenderer,
  RenderDieState,
  RendererViewport,
} from '@creepiest-space/dice-renderer';
import { PCFSoftShadowMap, WebGLRenderer } from 'three';

import { ThreeDiceMeshFactory, type ThreeDiceMesh } from './mesh-factory.js';
import { ThreeCamera, ThreeScene } from './scene.js';
import { applyInterpolatedTransform } from './transform.js';

export interface ThreeDiceRendererOptions {
  readonly material?: 'plastic' | 'matte';
  readonly antialias?: boolean;
  readonly observeResize?: boolean;
}

interface RenderEntry {
  readonly resource: ThreeDiceMesh;
  state: RenderDieState;
}

function copyState(state: RenderDieState): RenderDieState {
  return {
    id: state.id,
    geometryId: state.geometryId,
    previous: {
      position: { ...state.previous.position },
      quaternion: { ...state.previous.quaternion },
    },
    current: {
      position: { ...state.current.position },
      quaternion: { ...state.current.quaternion },
    },
  };
}

export class ThreeDiceRenderer implements DiceRenderer {
  readonly #container: HTMLElement;
  readonly #options: ThreeDiceRendererOptions;
  readonly #meshFactory = new ThreeDiceMeshFactory();
  readonly #entries = new Map<string, RenderEntry>();
  #scene: ThreeScene | undefined;
  #camera: ThreeCamera | undefined;
  #renderer: WebGLRenderer | undefined;
  #resizeObserver: ResizeObserver | undefined;
  #destroyed = false;

  constructor(container: HTMLElement, options: ThreeDiceRendererOptions = {}) {
    this.#container = container;
    this.#options = options;
  }

  initialize(): void {
    this.#assertAlive();
    if (this.#renderer !== undefined) return;
    const scene = new ThreeScene();
    const camera = new ThreeCamera();
    const renderer = new WebGLRenderer({
      antialias: this.#options.antialias ?? true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;
    this.#container.append(renderer.domElement);
    this.#scene = scene;
    this.#camera = camera;
    this.#renderer = renderer;
    this.#resizeToContainer();

    if ((this.#options.observeResize ?? true) && typeof ResizeObserver !== 'undefined') {
      this.#resizeObserver = new ResizeObserver(() => this.#resizeToContainer());
      this.#resizeObserver.observe(this.#container);
    }
  }

  createDie(state: RenderDieState): void {
    this.#assertInitialized();
    if (this.#entries.has(state.id))
      throw new Error(`A render die with id "${state.id}" already exists`);
    if (state.geometryId !== 'd6') throw new Error(`Unsupported geometry: ${state.geometryId}`);
    const resource = this.#meshFactory.createD6(this.#options.material ?? 'plastic');
    const ownedState = copyState(state);
    applyInterpolatedTransform(resource.mesh, ownedState, 1);
    this.#scene?.value.add(resource.mesh);
    this.#entries.set(state.id, { resource, state: ownedState });
  }

  updateDie(state: RenderDieState): void {
    this.#assertInitialized();
    const entry = this.#entries.get(state.id);
    if (entry === undefined) throw new Error(`Unknown render die: ${state.id}`);
    if (state.geometryId !== entry.state.geometryId) {
      throw new Error('A die geometry cannot be changed after creation');
    }
    entry.state = copyState(state);
  }

  removeDie(id: string): void {
    this.#assertAlive();
    const entry = this.#entries.get(id);
    if (entry === undefined) return;
    this.#scene?.value.remove(entry.resource.mesh);
    entry.resource.dispose();
    this.#entries.delete(id);
  }

  render(alpha: number): void {
    this.#assertInitialized();
    for (const entry of this.#entries.values()) {
      applyInterpolatedTransform(entry.resource.mesh, entry.state, alpha);
    }
    this.#renderer?.render(this.#scene!.value, this.#camera!.value);
  }

  resize(viewport: RendererViewport): void {
    this.#assertInitialized();
    if (![viewport.width, viewport.height, viewport.pixelRatio].every(Number.isFinite)) {
      throw new RangeError('Viewport values must be finite');
    }
    if (viewport.width <= 0 || viewport.height <= 0 || viewport.pixelRatio <= 0) {
      throw new RangeError('Viewport values must be positive');
    }
    this.#camera?.resize(viewport.width, viewport.height);
    this.#renderer?.setPixelRatio(viewport.pixelRatio);
    this.#renderer?.setSize(viewport.width, viewport.height, false);
  }

  clear(): void {
    this.#assertAlive();
    for (const id of this.#entries.keys()) this.removeDie(id);
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.clear();
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = undefined;
    const canvas = this.#renderer?.domElement;
    this.#renderer?.dispose();
    this.#renderer?.forceContextLoss();
    if (canvas?.parentElement === this.#container) canvas.remove();
    this.#scene?.dispose();
    this.#scene = undefined;
    this.#camera = undefined;
    this.#renderer = undefined;
    this.#destroyed = true;
  }

  #resizeToContainer(): void {
    const bounds = this.#container.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    this.resize({
      width: bounds.width,
      height: bounds.height,
      pixelRatio: Math.min(globalThis.devicePixelRatio || 1, 2),
    });
  }

  #assertAlive(): void {
    if (this.#destroyed) throw new Error('Renderer has been destroyed');
  }

  #assertInitialized(): void {
    this.#assertAlive();
    if (this.#renderer === undefined) throw new Error('Renderer has not been initialized');
  }
}
