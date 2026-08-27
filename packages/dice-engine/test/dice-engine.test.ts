import { describe, expect, test } from 'bun:test';

import { SeededRandomSource } from '@creepiest-space/dice-core';

import { DiceEngine, RollCancelledError, RollTimeoutError } from '../src/index.js';
import { FakePhysics, FakeRenderer, FakeScheduler } from './fakes.js';

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    return new Error('Expected promise to reject');
  } catch (error) {
    return error;
  }
}

function createHarness(settleAfterSteps = 2) {
  const physics = new FakePhysics(settleAfterSteps);
  const renderer = new FakeRenderer();
  const scheduler = new FakeScheduler();
  const engine = new DiceEngine({
    physics,
    renderer,
    scheduler,
    now: () => scheduler.now,
    random: new SeededRandomSource(42),
    fixedStepSeconds: 0.01,
    maxFrameDeltaSeconds: 0.1,
    settling: {
      linearVelocityThreshold: 0.1,
      angularVelocityThreshold: 0.1,
      stableTimeMs: 10,
      maxRollTimeMs: 100,
    },
  });
  return { engine, physics, renderer, scheduler };
}

describe('DiceEngine', () => {
  test('initializes once and rejects invalid lifecycle calls', async () => {
    const { engine, physics, renderer } = createHarness();
    expect(String(await rejectionOf(engine.roll('1d6')))).toContain('has not been initialized');
    await engine.initialize();
    await engine.initialize();

    expect(physics.configureTrayCalls).toBe(1);
    expect(renderer.initializeCalls).toBe(1);
    expect(String(await rejectionOf(engine.roll('1d20')))).toContain('d20 is not supported');
    expect(String(await rejectionOf(engine.roll('1d6', { mode: 'parallel' })))).toContain(
      'Only queue',
    );
  });

  test('runs queued rolls sequentially and keeps events session-scoped', async () => {
    const { engine, physics, renderer, scheduler } = createHarness();
    await engine.initialize();
    const starts: string[] = [];
    const settled: string[] = [];
    const completed: string[] = [];
    engine.on('roll:start', (session) => starts.push(session.id));
    engine.on('die:settled', ({ sessionId }) => settled.push(sessionId));
    engine.on('roll:complete', (result) => completed.push(result.id));

    const first = engine.roll('1d6 + 2');
    const second = engine.roll('1d6');
    expect(physics.createdIds).toEqual(['roll-1:die-0']);
    scheduler.flush();
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult.total).toBe(firstResult.dice[0]!.value + 2);
    expect(firstResult.modifier).toBe(2);
    expect([1, 2, 3, 4, 5, 6]).toContain(secondResult.total);
    expect(starts).toEqual(['roll-1', 'roll-2']);
    expect(settled).toEqual(['roll-1', 'roll-2']);
    expect(completed).toEqual(['roll-1', 'roll-2']);
    expect(renderer.removedIds).toContain('roll-1:die-0');
    expect(renderer.dice.has('roll-2:die-0')).toBeTrue();
  });

  test('uses a fixed timestep and reports interpolation alpha', async () => {
    const { engine, physics, renderer, scheduler } = createHarness(100);
    await engine.initialize();
    const roll = engine.roll('1d6');
    const outcome = roll.catch((error: unknown) => error);

    scheduler.advance(35);
    expect(physics.stepCalls).toBe(3);
    expect(renderer.renderAlphas.at(-1)).toBeCloseTo(0.5, 10);
    engine.cancel();
    expect(await outcome).toBeInstanceOf(RollCancelledError);
  });

  test('cancels active and queued sessions without orphaning promises', async () => {
    const { engine, renderer } = createHarness(100);
    await engine.initialize();
    const active = engine.roll('1d6');
    const controller = new AbortController();
    const queued = engine.roll('1d6', { signal: controller.signal });
    const activeOutcome = active.catch((error: unknown) => error);
    const queuedOutcome = queued.catch((error: unknown) => error);

    controller.abort();
    expect(engine.cancel()).toBeTrue();
    expect(await activeOutcome).toBeInstanceOf(RollCancelledError);
    expect(await queuedOutcome).toBeInstanceOf(RollCancelledError);
    expect(renderer.dice.size).toBe(0);
  });

  test('rejects timeout and backend failures, then advances the queue', async () => {
    const timeoutHarness = createHarness(Number.POSITIVE_INFINITY);
    await timeoutHarness.engine.initialize();
    const timeout = timeoutHarness.engine.roll('1d6');
    const timeoutOutcome = timeout.catch((error: unknown) => error);
    timeoutHarness.scheduler.flush(10, 20);
    expect(await timeoutOutcome).toBeInstanceOf(RollTimeoutError);

    const failureHarness = createHarness();
    await failureHarness.engine.initialize();
    const backendError = new Error('backend failed');
    failureHarness.physics.errorOnStep = backendError;
    const errors: unknown[] = [];
    failureHarness.engine.on('error', ({ error }) => errors.push(error));
    const failed = failureHarness.engine.roll('1d6');
    const failureOutcome = failed.catch((error: unknown) => error);
    failureHarness.scheduler.advance();
    expect(await failureOutcome).toBe(backendError);
    expect(errors).toEqual([backendError]);
  });

  test('merges themes and destroys dependencies idempotently', async () => {
    const { engine, physics, renderer } = createHarness();
    await engine.initialize();
    const themes: string[] = [];
    engine.on('theme:change', (theme) => themes.push(theme.material));

    const theme = engine.setTheme({ material: 'matte', roughness: 0.9 });
    expect(theme.material).toBe('matte');
    expect(theme.roughness).toBe(0.9);
    expect(theme.labelColor).toBe('#181818');
    expect(renderer.theme).toEqual(theme);
    expect(themes).toEqual(['matte']);
    expect(() => engine.setTheme({ metalness: 2 })).toThrow(RangeError);

    engine.resize({ width: 800, height: 600, pixelRatio: 2 });
    expect(renderer.lastViewport?.width).toBe(800);
    engine.destroy();
    engine.destroy();
    expect(physics.destroyCalls).toBe(1);
    expect(renderer.destroyCalls).toBe(1);
    expect(String(await rejectionOf(engine.roll('1d6')))).toContain('destroyed');
  });
});
