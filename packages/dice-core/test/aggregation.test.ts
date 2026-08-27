import { describe, expect, test } from 'bun:test';

import { createRollResult } from '../src/index.js';
import type { DieResult } from '../src/index.js';

describe('createRollResult', () => {
  test('sums physical die values and the modifier', () => {
    const dice = [
      { id: 'die-1', type: 'd6', value: 4 },
      { id: 'die-2', type: 'd6', value: 5 },
    ] satisfies DieResult[];
    const result = createRollResult({
      id: 'roll-1',
      notation: '2d6+3',
      dice,
      modifier: 3,
      startedAt: 100,
      completedAt: 250,
    });

    expect(result.total).toBe(12);
    expect(result.dice).toHaveLength(2);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.dice)).toBe(true);
    expect(Object.isFrozen(result.dice[0])).toBe(true);

    dice[0] = { id: 'replacement', type: 'd6', value: 1 };
    expect(result.total).toBe(12);
    expect(result.dice[0]?.id).toBe('die-1');
  });

  test('rejects invalid identity and time ranges', () => {
    expect(() =>
      createRollResult({
        id: '',
        notation: 'd6',
        dice: [],
        modifier: 0,
        startedAt: 0,
        completedAt: 1,
      }),
    ).toThrow(TypeError);

    expect(() =>
      createRollResult({
        id: 'roll-1',
        notation: 'd6',
        dice: [],
        modifier: 0,
        startedAt: 2,
        completedAt: 1,
      }),
    ).toThrow(RangeError);
  });
});
