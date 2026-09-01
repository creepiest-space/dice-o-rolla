import { describe, expect, test } from 'bun:test';

import { SeededRandomSource } from '@dice-o-rolla/dice-core';
import { getDieGeometry, resolveFace } from '@dice-o-rolla/dice-geometry';
import { RapierPhysics } from '@dice-o-rolla/dice-physics-rapier';

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

  test('captures and replays a serializable twenty-die Rapier trace', async () => {
    const physics = await RapierPhysics.create();
    const renderer = new FakeRenderer();
    const scheduler = new FakeScheduler();
    const engine = new DiceEngine({ physics, renderer, scheduler, now: () => scheduler.now });
    await engine.initialize();

    const trace = await engine.simulate('20d6', { seed: 2026, captureFrames: true });
    const serialized = JSON.stringify(trace);
    expect(trace.frames.length).toBeGreaterThan(1);
    expect(JSON.parse(serialized)).toEqual(trace);
    expect(trace.result.dice).toHaveLength(20);
    expect(trace.result.dice.every((die) => die.value >= 1 && die.value <= 6)).toBeTrue();
    expect(trace.result.total).toBe(trace.result.dice.reduce((total, die) => total + die.value, 0));
    expect(trace.frames.at(-1)?.dice).toHaveLength(20);
    expect(trace.durationSeconds).toBeLessThan(10);

    const replay = engine.replay(trace);
    scheduler.flush(1_000 / 60, 1_200);
    await replay;
    expect(renderer.renderAlphas.at(-1)).toBe(1);
    expect(renderer.dice.size).toBe(20);
    engine.destroy();
  });

  test('keeps a decimated fifty-die trace within the default memory envelope', async () => {
    const physics = await RapierPhysics.create();
    const renderer = new FakeRenderer();
    const scheduler = new FakeScheduler();
    const engine = new DiceEngine({ physics, renderer, scheduler, now: () => scheduler.now });
    await engine.initialize();

    const trace = await engine.simulate('50d6', {
      seed: 2050,
      captureFrames: true,
      frameIntervalSteps: 4,
    });

    expect(trace.result.dice).toHaveLength(50);
    expect(trace.frameIntervalSteps).toBe(4);
    expect(trace.frames.length).toBeLessThanOrEqual(1_200);
    expect(trace.frames.length * trace.dice.length).toBeLessThanOrEqual(60_000);
    expect(trace.events.length).toBeLessThanOrEqual(20_000);
    expect(trace.frames.at(-1)?.elapsedSeconds).toBe(trace.durationSeconds);
    expect(trace.durationSeconds).toBeLessThan(10);
    engine.destroy();
  });
});
