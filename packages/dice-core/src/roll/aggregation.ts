import type { RollNotation } from '../notation/ast.js';
import type { CreateRollResultOptions, RollResult } from './types.js';

export function getNotationModifier(notation: RollNotation): number {
  return notation.expressions.reduce(
    (total, expression) => total + (expression.kind === 'modifier' ? expression.value : 0),
    0,
  );
}

export function createRollResult(options: CreateRollResultOptions): RollResult {
  if (options.id.length === 0) {
    throw new TypeError('Roll result id must not be empty');
  }
  if (options.completedAt < options.startedAt) {
    throw new RangeError('Roll completion time must not precede its start time');
  }

  const dice = Object.freeze(options.dice.map((die) => Object.freeze({ ...die })));
  const diceTotal = dice.reduce((total, die) => total + die.value, 0);

  return Object.freeze({
    id: options.id,
    notation: options.notation,
    dice,
    modifier: options.modifier,
    total: diceTotal + options.modifier,
    startedAt: options.startedAt,
    completedAt: options.completedAt,
  });
}
