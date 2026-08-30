import type { DiceEngine } from '@dice-o-rolla/dice-engine';
import {
  createDefaultDiceEngine,
  type DefaultDiceEngineOptions,
} from '@dice-o-rolla/dice-engine/browser';

declare const container: HTMLElement;

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
void engine;
