import type { DiceEngine } from '@dice-o-rolla/dice-engine';
import {
  createDefaultDiceEngine,
  type DefaultDiceEngineOptions,
} from '@dice-o-rolla/dice-engine/browser';
import {
  TopDownDiceRenderer,
  type ThreeFaceMaterialProvider,
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
const topDownOptions = {
  materialProvider: () => materialProvider,
} satisfies TopDownDiceRendererOptions;
const topDownRenderer = new TopDownDiceRenderer(container, topDownOptions);
void engine;
void topDownRenderer;
