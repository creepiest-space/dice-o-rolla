import { describe, expect, test } from 'bun:test';

import { SeededRandomSource } from '@creepiest-space/dice-core';
import { getDieGeometry, resolveFace } from '@creepiest-space/dice-geometry';
import { RapierPhysics } from '@creepiest-space/dice-physics-rapier';

import { DiceEngine } from '../src/index.js';
import { FakeRenderer, FakeScheduler } from './fakes.js';

describe('DiceEngine with Rapier', () => {
  test('completes every standard headless roll from its physical orientation', async () => {
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

    const cases = [
      ['d4', 4],
      ['d6', 6],
      ['d8', 8],
      ['d10', 10],
      ['d12', 12],
      ['d20', 20],
    ] as const;
    const renderedValues = new Map<string, number>();
    engine.on('roll:complete', (completed) => {
      const die = completed.dice[0];
      const renderedState = die === undefined ? undefined : renderer.dice.get(die.id);
      if (die === undefined || renderedState === undefined) return;
      renderedValues.set(
        completed.id,
        resolveFace(getDieGeometry(die.type), renderedState.current.quaternion),
      );
    });
    const resultPromises = cases.map(([type]) => engine.roll(`1${type}`));
    scheduler.flush(1_000 / 60, 7_200);
    const results = await Promise.all(resultPromises);

    results.forEach((result, index) => {
      const expected = cases[index];
      if (expected === undefined) throw new Error(`Missing case for result ${index}`);
      const [, sides] = expected;
      expect(result.dice).toHaveLength(1);
      expect(result.total).toBeWithin(1, sides + 1);
      expect(renderedValues.get(result.id)).toBe(result.total);
    });

    engine.destroy();
  });

  test('settles twenty d6 bodies without timing out', async () => {
    const physics = await RapierPhysics.create();
    const renderer = new FakeRenderer();
    const scheduler = new FakeScheduler();
    const engine = new DiceEngine({
      physics,
      renderer,
      scheduler,
      now: () => scheduler.now,
      random: new SeededRandomSource(99),
    });
    await engine.initialize();

    const resultPromise = engine.roll('20d6');
    scheduler.flush(1_000 / 60, 1_200);
    const result = await resultPromise;

    expect(result.dice).toHaveLength(20);
    expect(result.dice.every((die) => die.value >= 1 && die.value <= 6)).toBeTrue();
    expect(scheduler.now).toBeLessThan(10_000);
    engine.destroy();
  });
});
