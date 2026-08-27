import { describe, expect, test } from 'bun:test';

import { D6_DEFINITION, resolveFace } from '../src/index.js';

const halfSqrt2 = Math.SQRT1_2;

describe('resolveFace', () => {
  test.each([
    ['identity', { x: 0, y: 0, z: 0, w: 1 }, 6],
    ['upside down', { x: 1, y: 0, z: 0, w: 0 }, 1],
    ['positive quarter turn around Z', { x: 0, y: 0, z: halfSqrt2, w: halfSqrt2 }, 2],
    ['negative quarter turn around Z', { x: 0, y: 0, z: -halfSqrt2, w: halfSqrt2 }, 5],
    ['negative quarter turn around X', { x: -halfSqrt2, y: 0, z: 0, w: halfSqrt2 }, 3],
    ['positive quarter turn around X', { x: halfSqrt2, y: 0, z: 0, w: halfSqrt2 }, 4],
  ])('resolves %s', (_name, orientation, expected) => {
    expect(resolveFace(D6_DEFINITION, orientation)).toBe(expected);
  });

  test('normalizes a finite quaternion before resolving', () => {
    expect(resolveFace(D6_DEFINITION, { x: 0, y: 0, z: 2, w: 2 })).toBe(2);
  });

  test('rejects invalid quaternions', () => {
    expect(() => resolveFace(D6_DEFINITION, { x: 0, y: 0, z: 0, w: 0 })).toThrow(RangeError);
    expect(() => resolveFace(D6_DEFINITION, { x: Number.NaN, y: 0, z: 0, w: 1 })).toThrow(
      RangeError,
    );
  });
});
