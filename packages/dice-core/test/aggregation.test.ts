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

  test('excludes dropped dice and uses scores instead of raw face values', () => {
    const result = createRollResult({
      id: 'roll-rules',
      notation: '4d20kh3s{1=-2,17..19=1,20=2}+1',
      dice: [
        { id: 'die-1', type: 'd20', value: 20, included: true, score: 2 },
        { id: 'die-2', type: 'd20', value: 18, included: true, score: 1 },
        { id: 'die-3', type: 'd20', value: 12, included: true, score: 0 },
        { id: 'die-4', type: 'd20', value: 1, included: false, score: -2 },
      ],
      modifier: 1,
      startedAt: 0,
      completedAt: 1,
    });

    expect(result.total).toBe(4);
    expect(result.dice[3]).toEqual({
      id: 'die-4',
      type: 'd20',
      value: 1,
      included: false,
      score: -2,
    });
  });

  test('rejects selection and score metadata on paired components', () => {
    expect(() =>
      createRollResult({
        id: 'roll-components',
        notation: 'd%',
        dice: [
          // @ts-expect-error Runtime validation also protects untyped JavaScript consumers.
          { ...percentileDice('percentile-1', 4, 2)[0]!, score: 1 },
          percentileDice('percentile-1', 4, 2)[1]!,
        ],
        modifier: 0,
        startedAt: 0,
        completedAt: 1,
      }),
    ).toThrow('not supported on paired dice');
  });

  test('aggregates every d100 face combination, including 00 + 0 = 100', () => {
    for (let tensFace = 1; tensFace <= 10; tensFace += 1) {
      for (let unitsFace = 1; unitsFace <= 10; unitsFace += 1) {
        const dice = percentileDice('percentile-1', tensFace, unitsFace);
        const result = createRollResult({
          id: `roll-${tensFace}-${unitsFace}`,
          notation: 'd%',
          dice,
          modifier: 0,
          startedAt: 0,
          completedAt: 1,
        });
        const digits = (tensFace % 10) * 10 + (unitsFace % 10);
        expect(result.total).toBe(digits === 0 ? 100 : digits);
        expect(result.dice).toHaveLength(2);
        expect(Object.isFrozen(result.dice[0]?.component)).toBeTrue();
      }
    }
  });

  test('aggregates every d66 face combination as two physical d6 results', () => {
    for (let tensFace = 1; tensFace <= 6; tensFace += 1) {
      for (let unitsFace = 1; unitsFace <= 6; unitsFace += 1) {
        const result = createRollResult({
          id: `roll-${tensFace}-${unitsFace}`,
          notation: 'd66',
          dice: [
            componentDie('tens', 'd66', 'd6', tensFace, tensFace * 10),
            componentDie('units', 'd66', 'd6', unitsFace, unitsFace),
          ],
          modifier: 0,
          startedAt: 0,
          completedAt: 1,
        });
        expect(result.total).toBe(tensFace * 10 + unitsFace);
      }
    }
  });

  test('rejects incomplete, duplicate, and out-of-range component groups', () => {
    const options = {
      id: 'roll-components',
      notation: 'd%',
      modifier: 0,
      startedAt: 0,
      completedAt: 1,
    } as const;

    expect(() =>
      createRollResult({
        ...options,
        dice: [componentDie('tens', 'd100', 'd100', 4, 40)],
      }),
    ).toThrow('one tens die and one units die');
    expect(() =>
      createRollResult({
        ...options,
        dice: [
          componentDie('tens', 'd100', 'd100', 4, 40),
          componentDie('tens', 'd100', 'd100', 5, 50),
        ],
      }),
    ).toThrow('duplicate tens');
    expect(() =>
      createRollResult({
        ...options,
        dice: percentileDice('percentile-1', 0, 1),
      }),
    ).toThrow('expected an integer in [1, 10]');
  });
});

function percentileDice(groupId: string, tensFace: number, unitsFace: number): DieResult[] {
  return [
    componentDie('tens', 'd100', 'd100', tensFace, (tensFace % 10) * 10, groupId),
    componentDie('units', 'd100', 'd10', unitsFace, unitsFace % 10, groupId),
  ];
}

function componentDie(
  role: 'tens' | 'units',
  groupType: 'd100' | 'd66',
  type: 'd100' | 'd10' | 'd6',
  faceValue: number,
  value: number,
  groupId = 'group-1',
): DieResult {
  return {
    id: `${groupId}:${role}`,
    type,
    value,
    component: { groupId, groupType, role, faceValue },
  };
}
