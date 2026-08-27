import { describe, expect, test } from 'bun:test';

import type { RenderDieState } from '@creepiest-space/dice-renderer';
import { Object3D } from 'three';

import { applyInterpolatedTransform } from '../src/index.js';

const state: RenderDieState = {
  id: 'die-1',
  geometryId: 'd6',
  previous: {
    position: { x: 0, y: 2, z: 4 },
    quaternion: { x: 0, y: 0, z: 0, w: 1 },
  },
  current: {
    position: { x: 10, y: 4, z: 0 },
    quaternion: { x: 0, y: 1, z: 0, w: 0 },
  },
};

describe('applyInterpolatedTransform', () => {
  test('lerps position and slerps quaternion without changing the snapshot', () => {
    const object = new Object3D();
    const snapshot = structuredClone(state);
    applyInterpolatedTransform(object, state, 0.5);

    expect(object.position.toArray()).toEqual([5, 3, 2]);
    expect(Math.abs(object.quaternion.y)).toBeCloseTo(Math.SQRT1_2, 12);
    expect(Math.abs(object.quaternion.w)).toBeCloseTo(Math.SQRT1_2, 12);
    expect(state).toEqual(snapshot);
  });

  test('clamps finite alpha and rejects non-finite values', () => {
    const object = new Object3D();
    applyInterpolatedTransform(object, state, 2);
    expect(object.position.toArray()).toEqual([10, 4, 0]);

    applyInterpolatedTransform(object, state, -1);
    expect(object.position.toArray()).toEqual([0, 2, 4]);
    expect(() => applyInterpolatedTransform(object, state, Number.NaN)).toThrow(RangeError);
  });
});
