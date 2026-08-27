import { describe, expect, test } from 'bun:test';

import { SeededRandomSource } from '@creepiest-space/dice-core';
import { D6_DEFINITION, resolveFace } from '@creepiest-space/dice-geometry';
import { RapierPhysics } from '@creepiest-space/dice-physics-rapier';

import { DiceEngine } from '../src/index.js';
import { FakeRenderer, FakeScheduler } from './fakes.js';

describe('DiceEngine with Rapier', () => {
  test('completes the headless 1d6 vertical slice from physical orientation', async () => {
    const physics = await RapierPhysics.create();
    const renderer = new FakeRenderer();
    const scheduler = new FakeScheduler();
    const engine = new DiceEngine({
      physics,
      renderer,
      scheduler,
      now: () => scheduler.now,
      random: new SeededRandomSource(2026),
    });
    await engine.initialize();

    const resultPromise = engine.roll('1d6');
    scheduler.flush(1_000 / 60, 1_200);
    const result = await resultPromise;
    const renderedState = renderer.dice.get(result.dice[0]!.id);

    expect(result.dice).toHaveLength(1);
    expect([1, 2, 3, 4, 5, 6]).toContain(result.total);
    expect(renderedState).toBeDefined();
    expect(resolveFace(D6_DEFINITION, renderedState!.current.quaternion)).toBe(result.total);

    engine.destroy();
  });
});
