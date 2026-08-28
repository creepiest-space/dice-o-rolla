/// <reference lib="dom" />

import { cryptoRandomSource } from '@creepiest-space/dice-core';
import {
  RapierPhysics,
  type RapierPhysicsWorldOptions,
} from '@creepiest-space/dice-physics-rapier';
import {
  ThreeDiceRenderer,
  type ThreeDiceRendererOptions,
} from '@creepiest-space/dice-renderer-three';

import { initializeOwnedDiceEngine } from './composition.js';
import type { DiceEngine } from './dice-engine.js';
import type { DiceEngineOptions } from './types.js';

export interface DefaultDiceEngineOptions {
  readonly container: HTMLElement;
  readonly physics?: RapierPhysicsWorldOptions;
  readonly renderer?: ThreeDiceRendererOptions;
  readonly engine?: Omit<DiceEngineOptions, 'physics' | 'renderer'>;
}

export async function createDefaultDiceEngine(
  options: DefaultDiceEngineOptions,
): Promise<DiceEngine> {
  const physics = await RapierPhysics.create(options.physics);
  return initializeOwnedDiceEngine(
    physics,
    () => new ThreeDiceRenderer(options.container, options.renderer),
    {
      ...options.engine,
      random: options.engine?.random ?? cryptoRandomSource,
    },
  );
}
