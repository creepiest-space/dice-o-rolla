import { getDieGeometry, getRegisteredDieTypes } from '@dice-o-rolla/dice-geometry';
import type {
  DiceRenderer,
  RenderDieState,
  RendererTheme,
  RendererViewport,
  VisualPresetDescriptor,
} from '@dice-o-rolla/dice-renderer';
import { PCFShadowMap, WebGLRenderer } from 'three';

import {
  DEFAULT_THREE_THEME,
  ThreeDiceMeshFactory,
  type ThreeDiceMesh,
  type ThreeFaceMaterialProvider,
} from './mesh-factory.js';
import { ThreeCamera, ThreeScene } from './scene.js';
import { applyInterpolatedTransform } from './transform.js';
import {
  fitViewportToLimits,
  resolveViewportLimits,
  validateViewport,
  type ViewportLimits,
} from './viewport-limits.js';

export interface ThreeDiceRendererOptions extends Partial<RendererTheme> {
  readonly antialias?: boolean;
  readonly observeResize?: boolean;
  readonly maxPixelRatio?: number;
  readonly maxViewportDimension?: number;
  readonly maxFramebufferPixels?: number;
  readonly materialProvider?:
    | ThreeFaceMaterialProvider
    | ((renderer: WebGLRenderer) => ThreeFaceMaterialProvider);
}

interface RenderEntry {
  resource: ThreeDiceMesh;
  state: RenderDieState;
}

function copyState(state: RenderDieState): RenderDieState {
  return {
    id: state.id,
    presetId: state.presetId,
    geometryId: state.geometryId,
    scale: state.scale,
    ...(state.faceLabels === undefined ? {} : { faceLabels: { ...state.faceLabels } }),
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
  #meshFactory: ThreeDiceMeshFactory;
  readonly #entries = new Map<string, RenderEntry>();
  readonly #presets = new Map<string, VisualPresetDescriptor>();
  readonly #pendingPresetRemovals = new Set<string>();
  readonly #viewportLimits: ViewportLimits;
  #theme: RendererTheme;
  #scene: ThreeScene | undefined;
  #camera: ThreeCamera | undefined;
  #renderer: WebGLRenderer | undefined;
  #resizeObserver: ResizeObserver | undefined;
  #destroyed = false;

  constructor(container: HTMLElement, options: ThreeDiceRendererOptions = {}) {
    this.#container = container;
    this.#options = options;
    this.#meshFactory = new ThreeDiceMeshFactory(
      typeof options.materialProvider === 'function' ? undefined : options.materialProvider,
    );
    this.#viewportLimits = resolveViewportLimits(options);
    this.#theme = {
      material: options.material ?? DEFAULT_THREE_THEME.material,
      bodyColor: options.bodyColor ?? DEFAULT_THREE_THEME.bodyColor,
      labelColor: options.labelColor ?? DEFAULT_THREE_THEME.labelColor,
      roughness: options.roughness ?? DEFAULT_THREE_THEME.roughness,
      metalness: options.metalness ?? DEFAULT_THREE_THEME.metalness,
    };
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
    if (typeof this.#options.materialProvider === 'function') {
      this.#meshFactory = new ThreeDiceMeshFactory(this.#options.materialProvider(renderer));
    }
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFShadowMap;
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

  registerPreset(preset: VisualPresetDescriptor): void {
    this.#assertAlive();
    this.#pendingPresetRemovals.delete(preset.id);
    this.#presets.set(preset.id, preset);
  }

  unregisterPreset(id: string): void {
    this.#assertAlive();
    if ([...this.#entries.values()].some((entry) => entry.state.presetId === id)) {
      this.#pendingPresetRemovals.add(id);
      return;
    }
    this.#presets.delete(id);
  }

  createDie(state: RenderDieState): void {
    this.#assertInitialized();
    if (this.#entries.has(state.id))
      throw new Error(`A render die with id "${state.id}" already exists`);
    const resource = this.#createResource(state);
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
    if (state.presetId !== entry.state.presetId || state.scale !== entry.state.scale) {
      throw new Error('A die visual preset cannot be changed after creation');
    }
    if (!haveEqualFaceLabels(state.faceLabels, entry.state.faceLabels)) {
      throw new Error('Die face labels cannot be changed after creation');
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
    this.#releasePendingPreset(entry.state.presetId);
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
    validateViewport(viewport, this.#viewportLimits);
    this.#camera?.resize(viewport.width, viewport.height);
    this.#renderer?.setPixelRatio(viewport.pixelRatio);
    this.#renderer?.setSize(viewport.width, viewport.height, false);
  }

  setTheme(theme: RendererTheme): void {
    this.#assertAlive();
    this.#theme = { ...theme };
    for (const entry of this.#entries.values()) {
      const replacement = this.#createResource(entry.state);
      applyInterpolatedTransform(replacement.mesh, entry.state, 1);
      this.#scene?.value.remove(entry.resource.mesh);
      entry.resource.dispose();
      entry.resource = replacement;
      this.#scene?.value.add(replacement.mesh);
    }
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
    this.#presets.clear();
    this.#pendingPresetRemovals.clear();
    this.#destroyed = true;
  }

  #resizeToContainer(): void {
    const bounds = this.#container.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    this.resize(
      fitViewportToLimits(
        {
          width: bounds.width,
          height: bounds.height,
          pixelRatio: globalThis.devicePixelRatio || 1,
        },
        this.#viewportLimits,
      ),
    );
  }

  #createResource(state: RenderDieState): ThreeDiceMesh {
    const preset = this.#presets.get(state.presetId);
    if (preset === undefined) throw new Error(`Unknown visual preset: ${state.presetId}`);
    if (preset.geometryId !== state.geometryId || (preset.scale ?? 1) !== state.scale) {
      throw new Error(`Render state does not match visual preset "${state.presetId}"`);
    }
    const type = getRegisteredDieTypes().find((registered) => registered === state.geometryId);
    if (type === undefined) throw new Error(`Unsupported geometry: ${state.geometryId}`);
    return this.#meshFactory.create(
      getDieGeometry(type),
      this.#theme,
      state.scale,
      state.faceLabels,
      preset,
    );
  }

  #releasePendingPreset(presetId: string): void {
    if (!this.#pendingPresetRemovals.has(presetId)) return;
    if ([...this.#entries.values()].some((entry) => entry.state.presetId === presetId)) return;
    this.#pendingPresetRemovals.delete(presetId);
    this.#presets.delete(presetId);
  }

  #assertAlive(): void {
    if (this.#destroyed) throw new Error('Renderer has been destroyed');
  }

  #assertInitialized(): void {
    this.#assertAlive();
    if (this.#renderer === undefined) throw new Error('Renderer has not been initialized');
  }
}

function haveEqualFaceLabels(
  left: Readonly<Record<number, string | number>> | undefined,
  right: Readonly<Record<number, string | number>> | undefined,
): boolean {
  if (left === right) return true;
  if (left === undefined || right === undefined) return false;
  const leftEntries = Object.entries(left);
  const rightEntries = Object.entries(right);
  return (
    leftEntries.length === rightEntries.length &&
    leftEntries.every(([face, label]) => right[Number(face)] === label)
  );
}
