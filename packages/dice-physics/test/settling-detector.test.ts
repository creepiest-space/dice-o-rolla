import { describe, expect, test } from 'bun:test';

import { SettlingDetector } from '../src/index.js';
import type { SettlingSample } from '../src/index.js';

const stopped: SettlingSample = {
  linearVelocity: { x: 0.05, y: 0, z: 0 },
  angularVelocity: { x: 0, y: 0.05, z: 0 },
  sleeping: false,
};

const moving: SettlingSample = {
  linearVelocity: { x: 0.2, y: 0, z: 0 },
  angularVelocity: { x: 0, y: 0.2, z: 0 },
  sleeping: false,
};

function createDetector(): SettlingDetector {
  return new SettlingDetector({
    linearVelocityThreshold: 0.1,
    angularVelocityThreshold: 0.1,
    stableTimeMs: 300,
    maxRollTimeMs: 1_000,
  });
}

describe('SettlingDetector', () => {
  test('requires uninterrupted velocity stability', () => {
    const detector = createDetector();

    expect(detector.update(stopped, 100)).toBe('stabilizing');
    expect(detector.update(moving, 100)).toBe('moving');
    expect(detector.stableMs).toBe(0);
    expect(detector.update(stopped, 100)).toBe('stabilizing');
    expect(detector.update(stopped, 200)).toBe('settled');
  });

  test('uses sleeping only together with low velocities', () => {
    const detector = createDetector();

    expect(detector.update({ ...moving, sleeping: true }, 10)).toBe('moving');
    expect(detector.update({ ...stopped, sleeping: true }, 10)).toBe('settled');
  });

  test('times out and remains terminal', () => {
    const detector = createDetector();

    expect(detector.update(moving, 600)).toBe('moving');
    expect(detector.update(moving, 400)).toBe('timed-out');
    expect(detector.update(stopped, 100)).toBe('timed-out');
    expect(detector.elapsedMs).toBe(1_000);
  });

  test('resets all accumulated state', () => {
    const detector = createDetector();
    detector.update(stopped, 100);
    detector.reset();

    expect(detector.state).toBe('moving');
    expect(detector.elapsedMs).toBe(0);
    expect(detector.stableMs).toBe(0);
  });

  test('validates options and deltas', () => {
    expect(
      () =>
        new SettlingDetector({
          linearVelocityThreshold: -1,
          angularVelocityThreshold: 1,
          stableTimeMs: 1,
          maxRollTimeMs: 10,
        }),
    ).toThrow(RangeError);
    expect(() => createDetector().update(stopped, 0)).toThrow(RangeError);
  });
});
