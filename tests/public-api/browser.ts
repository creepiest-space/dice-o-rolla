import type { DiceEngine } from '@dice-o-rolla/dice-engine';
import {
  createDefaultDiceEngine,
  type DefaultDiceEngineOptions,
} from '@dice-o-rolla/dice-engine/browser';
import {
  ThreeDiceRenderer,
  TopDownDiceRenderer,
  type ThreeFaceMaterialProvider,
  type ThreeDiceRendererOptions,
  type ThreeRendererOptions,
  type TopDownDiceRendererOptions,
} from '@dice-o-rolla/dice-renderer-three';

declare const container: HTMLElement;
declare const materialProvider: ThreeFaceMaterialProvider;

const options = {
  container,
  engine: {
    limits: { maxLogicalDice: 20 },
    collisionEvents: { enabled: true, maxEventsPerFrame: 16 },
  },
  renderer: { antialias: true, observeResize: true },
  physics: { gravity: { x: 0, y: -9.81, z: 0 } },
} satisfies DefaultDiceEngineOptions;

const engine: Promise<DiceEngine> = createDefaultDiceEngine(options);
const sharedRendererOptions = {
  antialias: true,
  observeResize: true,
  maxPixelRatio: 2,
  materialProvider: () => materialProvider,
} satisfies ThreeRendererOptions;
const threeOptions: ThreeDiceRendererOptions = sharedRendererOptions;
const topDownOptions: TopDownDiceRendererOptions = sharedRendererOptions;
const threeRenderer = new ThreeDiceRenderer(container, threeOptions);
const topDownRenderer = new TopDownDiceRenderer(container, {
  ...topDownOptions,
  cameraPadding: 1.5,
});
void engine;
void threeRenderer;
void topDownRenderer;

// Optional asset schemas and the renderer surface channel are public contracts.
import {
  DiceAssetRegistry,
  type DiceSurfaceUnwrap,
  type DiceSkinSetDefinition,
} from '@dice-o-rolla/dice-assets';
import { D6_DEFINITION } from '@dice-o-rolla/dice-geometry';
import { validateSurfaceUvs, type SurfaceUvMap } from '@dice-o-rolla/dice-renderer-three';
declare const unwrap: DiceSurfaceUnwrap;
const surfaceUvs: SurfaceUvMap = unwrap.faces;
const skinSet: DiceSkinSetDefinition = { id: 'example', skins: { d6: 'example-d6' } };
const assetRegistry = new DiceAssetRegistry();
assetRegistry.skinSets.register(skinSet);
validateSurfaceUvs(D6_DEFINITION, surfaceUvs);
declare const provider: ThreeFaceMaterialProvider;
const optionalUvs: SurfaceUvMap | undefined = provider.getSurfaceUvs?.(D6_DEFINITION);
void optionalUvs;
