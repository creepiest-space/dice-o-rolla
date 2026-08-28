import type { PhysicsWorld } from '@dice-o-rolla/dice-physics';
import type { DiceRenderer } from '@dice-o-rolla/dice-renderer';

import { DiceEngine } from './dice-engine.js';
import type { DiceEngineOptions } from './types.js';

export async function initializeOwnedDiceEngine(
  physics: PhysicsWorld,
  createRenderer: () => DiceRenderer,
  options: Omit<DiceEngineOptions, 'physics' | 'renderer'>,
): Promise<DiceEngine> {
  let renderer: DiceRenderer | undefined;
  try {
    renderer = createRenderer();
    const engine = new DiceEngine({ ...options, physics, renderer });
    await engine.initialize();
    return engine;
  } catch (error) {
    const cleanupErrors: unknown[] = [];
    try {
      renderer?.destroy();
    } catch (cleanupError) {
      cleanupErrors.push(cleanupError);
    }
    try {
      physics.destroy();
    } catch (cleanupError) {
      cleanupErrors.push(cleanupError);
    }
    if (cleanupErrors.length > 0) {
      throw new AggregateError([error, ...cleanupErrors], 'Dice engine initialization failed', {
        cause: error,
      });
    }
    throw error;
  }
}
