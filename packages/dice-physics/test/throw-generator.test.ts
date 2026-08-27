import { describe, expect, test } from 'bun:test';

import { SeededRandomSource } from '@creepiest-space/dice-core';

import { ThrowGenerator } from '../src/index.js';
import type { ThrowGeneratorOptions } from '../src/index.js';

const options: ThrowGeneratorOptions = {
  position: {
    x: { min: -5, max: 5 },
    y: { min: 2, max: 4 },
    z: { min: -3, max: 3 },
  },
  impulse: {
    x: { min: -12, max: -8 },
    y: { min: 1, max: 3 },
    z: { min: -2, max: 2 },
  },
  torqueImpulse: {
    x: { min: -5, max: 5 },
    y: { min: -5, max: 5 },
    z: { min: -5, max: 5 },
  },
};

describe('ThrowGenerator', () => {
  test('reproduces complete physical initial conditions', () => {
    const first = new ThrowGenerator(new SeededRandomSource(123), options);
    const second = new ThrowGenerator(new SeededRandomSource(123), options);

    expect(first.generate()).toEqual(second.generate());
    expect(first.generate()).toEqual(second.generate());
  });

  test('keeps values in configured ranges and creates a unit quaternion', () => {
    const generated = new ThrowGenerator(new SeededRandomSource(7), options).generate();

    expect(generated.position.x).toBeWithin(-5, 5);
    expect(generated.position.y).toBeWithin(2, 4);
    expect(generated.position.z).toBeWithin(-3, 3);
    expect(generated.impulse.x).toBeWithin(-12, -8);
    expect(generated.torqueImpulse.z).toBeWithin(-5, 5);
    expect(
      Math.hypot(
        generated.quaternion.x,
        generated.quaternion.y,
        generated.quaternion.z,
        generated.quaternion.w,
      ),
    ).toBeCloseTo(1, 12);
  });

  test('validates ranges and random source output', () => {
    expect(
      () =>
        new ThrowGenerator(new SeededRandomSource(1), {
          ...options,
          position: { ...options.position, x: { min: 1, max: -1 } },
        }),
    ).toThrow(RangeError);

    const generator = new ThrowGenerator({ next: () => 1 }, options);
    expect(() => generator.generate()).toThrow(RangeError);
  });
});
