import { describe, expect, test } from 'bun:test';

import { SeededRandomSource } from '@dice-o-rolla/dice-core';

import { initializeOwnedDiceEngine } from '../src/composition.js';
import { FakePhysics, FakeRenderer } from './fakes.js';

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    return new Error('Expected promise to reject');
  } catch (error) {
    return error;
  }
}

describe('initializeOwnedDiceEngine', () => {
  test('destroys physics when renderer construction fails', async () => {
    const physics = new FakePhysics();
    const rendererError = new Error('renderer construction failed');

    const error = await rejectionOf(
      initializeOwnedDiceEngine(
        physics,
        () => {
          throw rendererError;
        },
        { random: new SeededRandomSource(1) },
      ),
    );
    expect(error).toBe(rendererError);
    expect(physics.destroyCalls).toBe(1);
  });

  test('destroys renderer and physics when engine construction fails', async () => {
    const physics = new FakePhysics();
    const renderer = new FakeRenderer();

    const error = await rejectionOf(
      initializeOwnedDiceEngine(physics, () => renderer, {
        random: new SeededRandomSource(1),
        fixedStepSeconds: 0,
      }),
    );
    expect(error).toBeInstanceOf(RangeError);
    expect(renderer.destroyCalls).toBe(1);
    expect(physics.destroyCalls).toBe(1);
  });

  test('destroys renderer and physics when initialization fails', async () => {
    const physics = new FakePhysics();
    const renderer = new FakeRenderer();
    renderer.errorOnInitialize = new Error('renderer initialization failed');

    const error = await rejectionOf(
      initializeOwnedDiceEngine(physics, () => renderer, {
        random: new SeededRandomSource(1),
      }),
    );
    expect(error).toBe(renderer.errorOnInitialize);
    expect(renderer.destroyCalls).toBe(1);
    expect(physics.destroyCalls).toBe(1);
  });
});
