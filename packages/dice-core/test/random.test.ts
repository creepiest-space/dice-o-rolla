import { describe, expect, test } from 'bun:test';

import { cryptoRandomSource, SeededRandomSource } from '../src/index.js';

describe('cryptoRandomSource', () => {
  test('produces values in the RandomSource range', () => {
    const values = Array.from({ length: 128 }, () => cryptoRandomSource.next());

    expect(values.every((value) => Number.isFinite(value) && value >= 0 && value < 1)).toBe(true);
    expect(new Set(values).size).toBeGreaterThan(1);
  });
});

describe('SeededRandomSource', () => {
  test('reproduces a sequence for the same seed', () => {
    const first = new SeededRandomSource(42);
    const second = new SeededRandomSource(42);

    const firstSequence = Array.from({ length: 8 }, () => first.next());
    const secondSequence = Array.from({ length: 8 }, () => second.next());

    expect(firstSequence).toEqual(secondSequence);
    expect(firstSequence.every((value) => value >= 0 && value < 1)).toBe(true);
  });

  test('rejects non-integer seeds', () => {
    expect(() => new SeededRandomSource(Number.NaN)).toThrow(TypeError);
    expect(() => new SeededRandomSource(1.5)).toThrow(TypeError);
  });
});
