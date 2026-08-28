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
});
