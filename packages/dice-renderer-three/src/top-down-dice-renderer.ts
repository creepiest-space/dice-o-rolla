import { getDieGeometry, getRegisteredDieTypes } from '@dice-o-rolla/dice-geometry';
import type {
  DiceRenderer,
  RenderDieState,
  RendererTheme,
  RendererViewport,
  VisualPresetDescriptor,
} from '@dice-o-rolla/dice-renderer';
import {
  AmbientLight,
  DirectionalLight,
  Mesh,
  PCFShadowMap,
  PlaneGeometry,
  Scene,
  ShadowMaterial,
  WebGLRenderer,
} from 'three';

import { DEFAULT_THREE_THEME, ThreeDiceMeshFactory, type ThreeDiceMesh } from './mesh-factory.js';
import { TopDownCamera, type TopDownCameraOptions } from './top-down-camera.js';
import { applyInterpolatedTransform } from './transform.js';
import {
  fitViewportToLimits,
  resolveViewportLimits,
  validateViewport,
  type ViewportLimitOptions,
  type ViewportLimits,
} from './viewport-limits.js';

export interface TopDownDiceRendererOptions
  extends Partial<RendererTheme>, ViewportLimitOptions, TopDownCameraOptions {
  readonly antialias?: boolean;
  readonly observeResize?: boolean;
}

interface RenderEntry {
  resource: ThreeDiceMesh;
  state: RenderDieState;
}

export class TopDownDiceRenderer implements DiceRenderer {
  readonly #container: HTMLElement;
  readonly #options: TopDownDiceRendererOptions;
  readonly #meshFactory = new ThreeDiceMeshFactory();
  readonly #entries = new Map<string, RenderEntry>();
  readonly #presets = new Map<string, VisualPresetDescriptor>();
  readonly #pendingPresetRemovals = new Set<string>();
  readonly #viewportLimits: ViewportLimits;
  readonly #trayWidth: number;
  readonly #trayDepth: number;
  #theme: RendererTheme;
  #scene: Scene | undefined;
  #camera: TopDownCamera | undefined;
  #renderer: WebGLRenderer | undefined;
  #floorGeometry: PlaneGeometry | undefined;
  #floorMaterial: ShadowMaterial | undefined;
  #keyLight: DirectionalLight | undefined;
  #resizeObserver: ResizeObserver | undefined;
  #destroyed = false;

  constructor(container: HTMLElement, options: TopDownDiceRendererOptions = {}) {
    this.#container = container;
    this.#options = options;
    this.#viewportLimits = resolveViewportLimits(options);
    this.#trayWidth = options.trayWidth ?? 10;
    this.#trayDepth = options.trayDepth ?? 10;
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

    const scene = new Scene();
    const camera = new TopDownCamera(this.#options);
    const floorGeometry = new PlaneGeometry(this.#trayWidth, this.#trayDepth);
    const floorMaterial = new ShadowMaterial({ color: 0x11131a, opacity: 0.16 });
    const floor = new Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.02;
    floor.receiveShadow = true;

    const ambientLight = new AmbientLight(0xffffff, 1.45);
    const keyLight = new DirectionalLight(0xffffff, 3.4);
    keyLight.position.set(5, 12, 4);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    const shadowExtent = Math.max(this.#trayWidth, this.#trayDepth) * 0.6;
    keyLight.shadow.camera.left = -shadowExtent;
    keyLight.shadow.camera.right = shadowExtent;
    keyLight.shadow.camera.top = shadowExtent;
    keyLight.shadow.camera.bottom = -shadowExtent;
    scene.add(floor, ambientLight, keyLight);

    const renderer = new WebGLRenderer({
      antialias: this.#options.antialias ?? true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFShadowMap;
    this.#container.append(renderer.domElement);

    this.#scene = scene;
    this.#camera = camera;
    this.#renderer = renderer;
    this.#floorGeometry = floorGeometry;
    this.#floorMaterial = floorMaterial;
    this.#keyLight = keyLight;
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
    if (this.#entries.has(state.id)) {
      throw new Error(`A render die with id "${state.id}" already exists`);
    }
    const resource = this.#createResource(state);
    const ownedState = copyState(state);
    applyInterpolatedTransform(resource.mesh, ownedState, 1);
    this.#scene?.add(resource.mesh);
    this.#entries.set(state.id, { resource, state: ownedState });
  }

  updateDie(state: RenderDieState): void {
    this.#assertInitialized();
    const entry = this.#entries.get(state.id);
    if (entry === undefined) throw new Error(`Unknown render die: ${state.id}`);
    if (entry.state.geometryId !== state.geometryId) {
      throw new Error('A die geometry cannot be changed after creation');
    }
    if (state.presetId !== entry.state.presetId || state.scale !== entry.state.scale) {
      throw new Error('A die visual preset cannot be changed after creation');
    }
    if (!haveEqualFaceLabels(entry.state.faceLabels, state.faceLabels)) {
      throw new Error('Die face labels cannot be changed after creation');
    }
    entry.state = copyState(state);
  }

  removeDie(id: string): void {
    this.#assertAlive();
    const entry = this.#entries.get(id);
    if (entry === undefined) return;
    this.#scene?.remove(entry.resource.mesh);
    entry.resource.dispose();
    this.#entries.delete(id);
    this.#releasePendingPreset(entry.state.presetId);
  }

  render(alpha: number): void {
    this.#assertInitialized();
    for (const entry of this.#entries.values()) {
      applyInterpolatedTransform(entry.resource.mesh, entry.state, alpha);
    }
    this.#renderer?.render(this.#scene!, this.#camera!.value);
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
      this.#scene?.remove(entry.resource.mesh);
      entry.resource.dispose();
      entry.resource = replacement;
      this.#scene?.add(replacement.mesh);
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
    this.#keyLight?.dispose();
    this.#floorGeometry?.dispose();
    this.#floorMaterial?.dispose();

    const canvas = this.#renderer?.domElement;
    this.#renderer?.dispose();
    this.#renderer?.forceContextLoss();
    if (canvas?.parentElement === this.#container) canvas.remove();
    this.#scene?.clear();
    this.#scene = undefined;
    this.#camera = undefined;
    this.#renderer = undefined;
    this.#floorGeometry = undefined;
    this.#floorMaterial = undefined;
    this.#keyLight = undefined;
    this.#resizeObserver = undefined;
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
    if (this.#scene === undefined || this.#camera === undefined || this.#renderer === undefined) {
      throw new Error('Renderer has not been initialized');
    }
  }
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

function haveEqualFaceLabels(
  left: RenderDieState['faceLabels'],
  right: RenderDieState['faceLabels'],
): boolean {
  if (left === right) return true;
  if (left === undefined || right === undefined) return false;
  const leftEntries = Object.entries(left);
  return (
    leftEntries.length === Object.keys(right).length &&
    leftEntries.every(([face, label]) => right[Number(face)] === label)
  );
}
