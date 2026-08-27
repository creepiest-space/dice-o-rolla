import { describe, expect, test } from 'bun:test';

import { NotationParseError, getNotationModifier, parseNotation } from '../src/index.js';
import type { NotationParseErrorCode, RollExpression } from '../src/index.js';

const validCases = [
  ['d20', [{ kind: 'dice', count: 1, sides: 20 }]],
  ['2d6', [{ kind: 'dice', count: 2, sides: 6 }]],
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
  ['d%', 'INVALID_SIDES'],
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
