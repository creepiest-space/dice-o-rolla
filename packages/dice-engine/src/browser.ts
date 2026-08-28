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

import { DiceEngine } from './dice-engine.js';
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
  const renderer = new ThreeDiceRenderer(options.container, options.renderer);
  const engine = new DiceEngine({
    ...options.engine,
    random: options.engine?.random ?? cryptoRandomSource,
    physics,
    renderer,
  });

  try {
    await engine.initialize();
    return engine;
  } catch (error) {
    engine.destroy();
    throw error;
  }
}
