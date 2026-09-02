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
