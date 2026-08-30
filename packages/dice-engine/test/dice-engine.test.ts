import { describe, expect, test } from 'bun:test';

import { SeededRandomSource } from '@dice-o-rolla/dice-core';

import {
  DiceEngine,
  RollCancelledError,
  RollLimitExceededError,
  RollTimeoutError,
} from '../src/index.js';
import type { DiceEngineLimits } from '../src/index.js';
import { FakePhysics, FakeRenderer, FakeScheduler } from './fakes.js';

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    return new Error('Expected promise to reject');
  } catch (error) {
    return error;
  }
}

function createHarness(settleAfterSteps = 2, limits?: Partial<DiceEngineLimits>) {
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
    ...(limits === undefined ? {} : { limits }),
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
    expect(String(await rejectionOf(engine.roll('1d2')))).toContain('d2 is not supported');
    expect(String(await rejectionOf(engine.roll('1d6', { mode: 'parallel' })))).toContain(
      'Only queue',
    );
  });

  test('coalesces concurrent initialization and rejects it when destroyed in flight', async () => {
    const { engine, physics, renderer } = createHarness();
    let releaseInitialization!: () => void;
    renderer.initializeTask = new Promise<void>((resolve) => {
      releaseInitialization = resolve;
    });

    const first = engine.initialize();
    const second = engine.initialize();
    expect(renderer.initializeCalls).toBe(1);
    expect(physics.configureTrayCalls).toBe(1);

    engine.destroy();
    releaseInitialization();
    const outcomes = await Promise.all([rejectionOf(first), rejectionOf(second)]);
    expect(outcomes.every((error) => String(error).includes('destroyed'))).toBeTrue();
    expect(renderer.destroyCalls).toBe(1);
    expect(physics.destroyCalls).toBe(1);
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

  test('derives d100 and d66 groups from both settled physical dice', async () => {
    const { engine, physics, renderer, scheduler } = createHarness();
    await engine.initialize();

    const percentile = engine.roll('d%');
    scheduler.flush();
    const percentileResult = await percentile;
    expect(physics.createdIds).toEqual(['roll-1:die-0', 'roll-1:die-1']);
    expect(percentileResult.dice.map((die) => die.type)).toEqual(['d100', 'd10']);
    expect(percentileResult.dice.map((die) => die.component?.role)).toEqual(['tens', 'units']);
    const tens = percentileResult.dice[0]!;
    const units = percentileResult.dice[1]!;
    const digits = (tens.component!.faceValue % 10) * 10 + (units.component!.faceValue % 10);
    expect(percentileResult.total).toBe(digits === 0 ? 100 : digits);
    expect(tens.value).toBe((tens.component!.faceValue % 10) * 10);
    expect(units.value).toBe(units.component!.faceValue % 10);
    expect(renderer.dice.get('roll-1:die-0')?.geometryId).toBe('d10');
    expect(renderer.dice.get('roll-1:die-0')?.faceLabels?.[10]).toBe('00');

    const d66 = engine.roll('d66');
    scheduler.flush();
    const d66Result = await d66;
    expect(d66Result.dice.map((die) => die.type)).toEqual(['d6', 'd6']);
    expect(d66Result.total).toBe(
      d66Result.dice[0]!.component!.faceValue * 10 + d66Result.dice[1]!.component!.faceValue,
    );
    expect(renderer.dice.get('roll-2:die-0')?.faceLabels?.[6]).toBe(60);
  });

  test('applies keep/drop and score rules per dice term after every die settles', async () => {
    const { engine, scheduler } = createHarness();
    await engine.initialize();

    const roll = engine.roll('4d20kh3s{1=-2,17..19=1,20=2}+1');
    scheduler.flush();
    const result = await roll;
    const ranked = result.dice.toSorted(
      (left, right) => right.value - left.value || left.id.localeCompare(right.id),
    );
    const expectedIncluded = new Set(ranked.slice(0, 3).map((die) => die.id));

    expect(result.dice).toHaveLength(4);
    for (const die of result.dice) {
      expect(die.included).toBe(expectedIncluded.has(die.id));
      expect(die.score).toBe(die.value === 1 ? -2 : die.value === 20 ? 2 : die.value >= 17 ? 1 : 0);
    }
    expect(result.total).toBe(
      result.dice.reduce(
        (total, die) => total + (die.included === false ? 0 : (die.score ?? 0)),
        1,
      ),
    );

    const separateTerms = engine.roll('2d6kh1 + 2d6kl1');
    scheduler.flush();
    const separateResult = await separateTerms;
    expect(separateResult.dice.slice(0, 2).filter((die) => die.included)).toHaveLength(1);
    expect(separateResult.dice.slice(2).filter((die) => die.included)).toHaveLength(1);

    const dropHighest = engine.roll('4d6dh1');
    const dropLowest = engine.roll('4d6dl1');
    scheduler.flush();
    const dropResults = await Promise.all([dropHighest, dropLowest]);
    for (const [dropResult, extreme] of [
      [dropResults[0], Math.max],
      [dropResults[1], Math.min],
    ] as const) {
      const dropped = dropResult.dice.filter((die) => die.included === false);
      expect(dropped).toHaveLength(1);
      expect(dropped[0]?.value).toBe(extreme(...dropResult.dice.map((die) => die.value)));
    }
  });

  test('registers visual presets and applies scale, labels, and asset identifiers', async () => {
    const { engine, physics, renderer, scheduler } = createHarness();
    const preset = engine.registerVisualPreset(
      {
        id: 'custom:runic-d6',
        dieType: 'd6',
        geometryId: 'd6',
        scale: 1.2,
        faceLabels: { 1: 'I', 6: 'VI' },
        skinId: 'runic-stone',
        soundPackId: 'stone-table',
      },
      { makeDefault: true },
    );
    const spawned: unknown[] = [];
    const removed: unknown[] = [];
    engine.on('die:spawn', (event) => spawned.push(event));
    engine.on('die:remove', (event) => removed.push(event));
    await engine.initialize();

    expect(renderer.presets.get(preset.id)).toEqual(preset);
    const roll = engine.roll('1d6');
    scheduler.flush();
    await roll;
    const state = renderer.dice.get('roll-1:die-0');
    expect(state?.presetId).toBe('custom:runic-d6');
    expect(state?.geometryId).toBe('d6');
    expect(state?.scale).toBe(1.2);
    expect(state?.faceLabels).toEqual({ 1: 'I', 6: 'VI' });
    expect(physics.createdOptions[0]?.scale).toBe(1.2);
    expect(spawned).toEqual([
      {
        sessionId: 'roll-1',
        dieId: 'roll-1:die-0',
        dieType: 'd6',
        presetId: 'custom:runic-d6',
        skinId: 'runic-stone',
        soundPackId: 'stone-table',
      },
    ]);

    expect(engine.unregisterVisualPreset(preset.id)).toBeTrue();
    expect(engine.getVisualPreset('d6').id).toBe('standard:d6');
    expect(renderer.presets.has(preset.id)).toBeFalse();
    expect(() => engine.registerVisualPreset(preset)).toThrow('currently in use');
    engine.clear();
    expect(removed).toEqual([
      expect.objectContaining({ dieId: 'roll-1:die-0', reason: 'cleared' }),
    ]);
    expect(engine.registerVisualPreset(preset).id).toBe(preset.id);
  });

  test('maps resolved physical faces through a complete visual preset value map', async () => {
    const standardHarness = createHarness();
    await standardHarness.engine.initialize();
    const standardRoll = standardHarness.engine.roll('1d6');
    standardHarness.scheduler.flush();
    const standardValue = (await standardRoll).dice[0]!.value;

    const mappedHarness = createHarness();
    mappedHarness.engine.registerVisualPreset(
      {
        id: 'custom:reverse-d6',
        dieType: 'd6',
        geometryId: 'd6',
        valueMap: { 1: 6, 2: 5, 3: 4, 4: 3, 5: 2, 6: 1 },
      },
      { makeDefault: true },
    );
    await mappedHarness.engine.initialize();
    const mappedRoll = mappedHarness.engine.roll('1d6');
    mappedHarness.scheduler.flush();
    expect((await mappedRoll).dice[0]!.value).toBe(7 - standardValue);
  });

  test('validates preset geometry, maps, selection, and built-in lifecycle', () => {
    const { engine } = createHarness();
    expect(() =>
      engine.registerVisualPreset({ id: 'bad:geometry', dieType: 'd6', geometryId: 'd2' }),
    ).toThrow('not registered');
    expect(() =>
      engine.registerVisualPreset({
        id: 'bad:map',
        dieType: 'd6',
        geometryId: 'd6',
        valueMap: { 1: 1 },
      }),
    ).toThrow('every geometry face');
    engine.registerVisualPreset({ id: 'custom:d20', dieType: 'd20', geometryId: 'd20' });
    expect(() => engine.setVisualPreset('d6', 'custom:d20')).toThrow('for d20');
    expect(() => engine.unregisterVisualPreset('standard:d6')).toThrow('cannot be unregistered');
    expect(engine.unregisterVisualPreset('missing')).toBeFalse();
  });

  test('keeps collision events opt-in and bounded per rendered frame', async () => {
    const disabled = createHarness(100);
    await disabled.engine.initialize();
    expect(disabled.physics.collisionEventsEnabled).toBeFalse();

    const physics = new FakePhysics(100);
    const renderer = new FakeRenderer();
    const scheduler = new FakeScheduler();
    const engine = new DiceEngine({
      physics,
      renderer,
      scheduler,
      now: () => scheduler.now,
      random: new SeededRandomSource(42),
      fixedStepSeconds: 0.01,
      collisionEvents: { enabled: true, maxEventsPerFrame: 1 },
    });
    engine.registerVisualPreset(
      {
        id: 'custom:sounding-d6',
        dieType: 'd6',
        geometryId: 'd6',
        soundPackId: 'wooden-table',
      },
      { makeDefault: true },
    );
    const collisions: unknown[] = [];
    engine.on('die:collision', (event) => collisions.push(event));
    await engine.initialize();
    const roll = engine.roll('1d6');
    const outcome = roll.catch((error: unknown) => error);
    physics.collisionEvents.push(
      { dieId: 'roll-1:die-0', started: true },
      { dieId: 'roll-1:die-0', started: false },
    );
    scheduler.advance(10);

    expect(physics.collisionEventsEnabled).toBeTrue();
    expect(collisions).toEqual([
      expect.objectContaining({
        dieId: 'roll-1:die-0',
        presetId: 'custom:sounding-d6',
        soundPackId: 'wooden-table',
        started: true,
      }),
    ]);
    engine.cancel();
    expect(await outcome).toBeInstanceOf(RollCancelledError);
  });

  test('publishes Rapier impact force with visual asset ids', async () => {
    const physics = new FakePhysics(100);
    const renderer = new FakeRenderer();
    const scheduler = new FakeScheduler();
    const engine = new DiceEngine({
      physics,
      renderer,
      scheduler,
      now: () => scheduler.now,
      random: new SeededRandomSource(42),
      fixedStepSeconds: 0.01,
      collisionEvents: { enabled: true, maxEventsPerFrame: 4 },
    });
    engine.registerVisualPreset(
      {
        id: 'custom:audio-d6',
        dieType: 'd6',
        geometryId: 'd6',
        skinId: 'amethyst',
        soundPackId: 'resin',
      },
      { makeDefault: true },
    );
    const impacts: unknown[] = [];
    engine.on('die:impact', (event) => impacts.push(event));
    await engine.initialize();
    const outcome = engine.roll('1d6').catch((error: unknown) => error);
    physics.impactEvents.push({ dieId: 'roll-1:die-0', force: 37.5 });
    scheduler.advance(10);
    expect(impacts).toEqual([
      expect.objectContaining({
        dieId: 'roll-1:die-0',
        force: 37.5,
        skinId: 'amethyst',
        soundPackId: 'resin',
      }),
    ]);
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

  test('terminates cancellation even when both adapters fail to remove a die', async () => {
    const { engine, physics, renderer } = createHarness(100);
    await engine.initialize();
    const cleanupErrors: unknown[] = [];
    engine.on('error', ({ error }) => cleanupErrors.push(error));
    const roll = engine.roll('1d6');
    physics.errorOnRemove = new Error('physics remove failed');
    renderer.errorOnRemove = new Error('renderer remove failed');

    expect(engine.cancel()).toBeTrue();
    expect(await rejectionOf(roll)).toBeInstanceOf(RollCancelledError);
    expect(cleanupErrors).toHaveLength(1);
    expect(cleanupErrors[0]).toBeInstanceOf(AggregateError);
    expect((cleanupErrors[0] as AggregateError).errors).toHaveLength(2);
  });

  test('rejects rolls that exceed notation and dice limits before allocating bodies', async () => {
    const { engine, physics } = createHarness();
    await engine.initialize();

    const errors = await Promise.all(
      ['51d6', '26d100', '9007199254740991d6', '25d6 + 26d6'].map((notation) =>
        rejectionOf(engine.roll(notation)),
      ),
    );
    for (const error of errors) expect(error).toBeInstanceOf(RollLimitExceededError);
    const longNotation = `1d6${' '.repeat(254)}`;
    const lengthError = await rejectionOf(engine.roll(longNotation));
    expect(lengthError).toBeInstanceOf(RollLimitExceededError);
    expect((lengthError as RollLimitExceededError).limit).toBe('notation-length');
    expect(physics.createdIds).toHaveLength(0);
  });

  test('bounds the pending roll queue', async () => {
    const { engine } = createHarness(100, { maxQueuedRolls: 1 });
    await engine.initialize();
    const active = engine.roll('1d6');
    const queued = engine.roll('1d6');
    const rejected = engine.roll('1d6');

    const error = await rejectionOf(rejected);
    expect(error).toBeInstanceOf(RollLimitExceededError);
    expect((error as RollLimitExceededError).limit).toBe('queue-size');

    const activeOutcome = active.catch((rollError: unknown) => rollError);
    const queuedOutcome = queued.catch((rollError: unknown) => rollError);
    engine.clear();
    expect(await activeOutcome).toBeInstanceOf(RollCancelledError);
    expect(await queuedOutcome).toBeInstanceOf(RollCancelledError);
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

  test('listener failures do not interrupt rolls, cancellation, or backend errors', async () => {
    const rollHarness = createHarness();
    await rollHarness.engine.initialize();
    const observed: string[] = [];
    rollHarness.engine.on('roll:start', () => {
      throw new Error('start listener failed');
    });
    rollHarness.engine.on('die:settled', () => {
      throw new Error('settled listener failed');
    });
    rollHarness.engine.on('roll:complete', () => {
      throw new Error('complete listener failed');
    });
    rollHarness.engine.on('roll:complete', ({ id }) => observed.push(id));

    const first = rollHarness.engine.roll('1d6');
    const second = rollHarness.engine.roll('1d6');
    rollHarness.scheduler.flush();
    expect((await first).id).toBe('roll-1');
    expect((await second).id).toBe('roll-2');
    expect(observed).toEqual(['roll-1', 'roll-2']);

    const cancelHarness = createHarness(100);
    await cancelHarness.engine.initialize();
    cancelHarness.engine.on('roll:cancel', () => {
      throw new Error('cancel listener failed');
    });
    const cancelled = cancelHarness.engine.roll('1d6');
    cancelHarness.engine.cancel();
    expect(await rejectionOf(cancelled)).toBeInstanceOf(RollCancelledError);

    const errorHarness = createHarness();
    await errorHarness.engine.initialize();
    errorHarness.physics.errorOnStep = new Error('backend failed');
    errorHarness.engine.on('error', () => {
      throw new Error('error listener failed');
    });
    const failed = errorHarness.engine.roll('1d6');
    errorHarness.scheduler.advance();
    expect(String(await rejectionOf(failed))).toContain('backend failed');
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

  test('attempts every teardown action and stays destroyed after cleanup failures', async () => {
    const { engine, physics, renderer } = createHarness();
    await engine.initialize();
    physics.errorOnDestroy = new Error('physics destroy failed');
    renderer.errorOnDestroy = new Error('renderer destroy failed');

    expect(() => engine.destroy()).toThrow(AggregateError);
    expect(physics.destroyCalls).toBe(1);
    expect(renderer.destroyCalls).toBe(1);
    expect(() => engine.destroy()).not.toThrow();
    expect(String(await rejectionOf(engine.roll('1d6')))).toContain('destroyed');
  });
});
