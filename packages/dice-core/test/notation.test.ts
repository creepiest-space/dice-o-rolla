import { describe, expect, test } from 'bun:test';

import { NotationParseError, getNotationModifier, parseNotation } from '../src/index.js';
import type { NotationParseErrorCode, RollExpression } from '../src/index.js';

const validCases = [
  ['d20', [{ kind: 'dice', count: 1, sides: 20 }]],
  ['2d6', [{ kind: 'dice', count: 2, sides: 6 }]],
  ['d%', [{ kind: 'paired-dice', count: 1, type: 'd100' }]],
  ['2d100', [{ kind: 'paired-dice', count: 2, type: 'd100' }]],
  ['d66', [{ kind: 'paired-dice', count: 1, type: 'd66' }]],
  [
    '4d6kh3',
    [
      {
        kind: 'dice',
        count: 4,
        sides: 6,
        selection: { operator: 'kh', count: 3 },
      },
    ],
  ],
  [
    '4d6 dl 1',
    [
      {
        kind: 'dice',
        count: 4,
        sides: 6,
        selection: { operator: 'dl', count: 1 },
      },
    ],
  ],
  [
    'd20s{1=-2,17..19=1,20=2}',
    [
      {
        kind: 'dice',
        count: 1,
        sides: 20,
        score: [
          { minimum: 1, maximum: 1, score: -2 },
          { minimum: 17, maximum: 19, score: 1 },
          { minimum: 20, maximum: 20, score: 2 },
        ],
      },
    ],
  ],
  [
    '4D20KH3S{ 1 = -2, 17..19 = +1, 20 = 2 }',
    [
      {
        kind: 'dice',
        count: 4,
        sides: 20,
        selection: { operator: 'kh', count: 3 },
        score: [
          { minimum: 1, maximum: 1, score: -2 },
          { minimum: 17, maximum: 19, score: 1 },
          { minimum: 20, maximum: 20, score: 2 },
        ],
      },
    ],
  ],
  [
    '4d6+5',
    [
      { kind: 'dice', count: 4, sides: 6 },
      { kind: 'modifier', value: 5 },
    ],
  ],
  [
    '2d20-1',
    [
      { kind: 'dice', count: 2, sides: 20 },
      { kind: 'modifier', value: -1 },
    ],
  ],
  [
    '1d8 + 2D6 + 4',
    [
      { kind: 'dice', count: 1, sides: 8 },
      { kind: 'dice', count: 2, sides: 6 },
      { kind: 'modifier', value: 4 },
    ],
  ],
] as const satisfies readonly (readonly [string, readonly RollExpression[]])[];

const invalidCases = [
  ['', 'EMPTY_NOTATION'],
  ['   ', 'EMPTY_NOTATION'],
  ['2d', 'INVALID_SIDES'],
  ['0d6', 'INVALID_COUNT'],
  ['1d1', 'INVALID_SIDES'],
  ['-2d6', 'NEGATIVE_DICE'],
  ['2d6+', 'EXPECTED_TERM'],
  ['2d6 3d4', 'EXPECTED_OPERATOR'],
  ['2dd6', 'INVALID_SIDES'],
  ['2d6kh3', 'INVALID_SELECTION'],
  ['2d6dl2', 'INVALID_SELECTION'],
  ['4d6kh0', 'INVALID_SELECTION'],
  ['4d6kh', 'INVALID_SELECTION'],
  ['4d6kh3dl1', 'INVALID_DICE_OPERATION'],
  ['4d6s{}', 'INVALID_SCORE_RULE'],
  ['4d6s{1}', 'INVALID_SCORE_RULE'],
  ['4d6s{1=1,}', 'INVALID_SCORE_RULE'],
  ['4d6s{0=1}', 'INVALID_SCORE_RULE'],
  ['4d6s{6..4=1}', 'INVALID_SCORE_RULE'],
  ['4d6s{1..3=1,3..4=2}', 'OVERLAPPING_SCORE_RULE'],
  ['d100kh1', 'INVALID_DICE_OPERATION'],
  ['d66s{6=1}', 'INVALID_DICE_OPERATION'],
  ['d20s{20=2}kh1', 'INVALID_DICE_OPERATION'],
  ['wat', 'UNEXPECTED_CHARACTER'],
  ['9007199254740992d6', 'UNSAFE_INTEGER'],
] as const satisfies readonly (readonly [string, NotationParseErrorCode])[];

describe('parseNotation', () => {
  test.each(validCases)('parses %s', (source, expressions) => {
    expect(parseNotation(source)).toEqual({ kind: 'roll', source, expressions });
  });

  test('preserves separate modifiers and aggregates them explicitly', () => {
    const notation = parseNotation('2d6 + 5 - 2 + 1');

    expect(getNotationModifier(notation)).toBe(4);
    expect(
      notation.expressions.filter((expression) => expression.kind === 'modifier'),
    ).toHaveLength(3);
  });

  test.each(invalidCases)('rejects %s with %s', (source, code) => {
    try {
      parseNotation(source);
      throw new Error('Expected notation parsing to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(NotationParseError);
      if (error instanceof NotationParseError) {
        expect(error.code).toBe(code);
        expect(error.input).toBe(source);
      }
    }
  });
});
