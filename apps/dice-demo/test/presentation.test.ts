import { describe, expect, test } from 'bun:test';

import { presentRollResult } from '../src/presentation.js';

describe('presentRollResult', () => {
  test('uses the engine total and physical dice values without recomputing them', () => {
    expect(
      presentRollResult({
        notation: 'd%',
        total: 100,
        dice: [
          { type: 'd100', value: 0 },
          { type: 'd10', value: 0 },
        ],
      }),
    ).toEqual({
      notation: 'd%',
      total: '100',
      dice: 'd100: 0 · d10: 0',
    });
  });

  test('shows score contributions and dropped physical dice', () => {
    expect(
      presentRollResult({
        notation: '3d20kh2s{1=-2,17..19=1,20=2}',
        total: 3,
        dice: [
          { type: 'd20', value: 20, score: 2, included: true },
          { type: 'd20', value: 18, score: 1, included: true },
          { type: 'd20', value: 1, score: -2, included: false },
        ],
      }),
    ).toEqual({
      notation: '3d20kh2s{1=-2,17..19=1,20=2}',
      total: '3',
      dice: 'd20: 20 → +2 · d20: 18 → +1 · d20: 1 → -2 (dropped)',
    });
  });
});
