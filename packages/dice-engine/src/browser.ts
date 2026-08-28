/// <reference lib="dom" />

import { cryptoRandomSource } from '@dice-o-rolla/dice-core';
import { RapierPhysics, type RapierPhysicsWorldOptions } from '@dice-o-rolla/dice-physics-rapier';
import {
  ThreeDiceRenderer,
  type ThreeDiceRendererOptions,
} from '@dice-o-rolla/dice-renderer-three';

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
