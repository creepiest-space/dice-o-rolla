import { describe, expect, test } from 'bun:test';

import { SeededRandomSource } from '@dice-o-rolla/dice-core';
import { RapierPhysics } from '@dice-o-rolla/dice-physics-rapier';

import { DiceEngine, RollTimeoutError } from '../src/index.js';
import { FakeRenderer, FakeScheduler } from './fakes.js';

const RELIABLE_LOAD_CASES: number[] = [20, 50];

describe('DiceEngine load profile', () => {
  test.each(RELIABLE_LOAD_CASES)(
    '%i d6 bodies settle within the default timeout',
    async (count) => {
      const physics = await RapierPhysics.create();
      const renderer = new FakeRenderer();
      const scheduler = new FakeScheduler();
      const engine = new DiceEngine({
        physics,
        renderer,
        scheduler,
        now: () => scheduler.now,
        random: new SeededRandomSource(10_000 + count),
      });
      await engine.initialize();

      const outcome = engine.roll(`${count}d6`).catch((error: unknown): Error => toError(error));
      scheduler.flush(1_000 / 60, 1_200);
      const result = await outcome;

      try {
        expect(result).not.toBeInstanceOf(Error);
        if (result instanceof Error) throw result;
        expect(result.dice).toHaveLength(count);
        expect(scheduler.now).toBeLessThan(10_000);
      } finally {
        engine.destroy();
      }
    },
  );

  test('100 d6 bodies complete or terminate at the hard timeout', async () => {
    const physics = await RapierPhysics.create();
    const renderer = new FakeRenderer();
    const scheduler = new FakeScheduler();
    const engine = new DiceEngine({
      physics,
      renderer,
      scheduler,
      now: () => scheduler.now,
      random: new SeededRandomSource(10_100),
      limits: { maxLogicalDice: 100, maxPhysicalDice: 100 },
    });
    await engine.initialize();

    const outcome = engine.roll('100d6').catch((error: unknown): Error => toError(error));
    scheduler.flush(1_000 / 60, 1_200);
    const result = await outcome;

    try {
      if (result instanceof Error) {
        expect(result).toBeInstanceOf(RollTimeoutError);
      } else {
        expect(result.dice).toHaveLength(100);
      }
      expect(scheduler.now).toBeLessThan(10_050);
    } finally {
      engine.destroy();
    }
  });
});

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}
