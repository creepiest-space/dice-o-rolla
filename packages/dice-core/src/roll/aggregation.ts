import type { DiceComponentResult, DieResult } from '../dice/types.js';
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

  const dice = Object.freeze(options.dice.map(freezeDieResult));
  const diceTotal = getDiceTotal(dice);

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

function freezeDieResult(die: DieResult): DieResult {
  if (die.component === undefined) return Object.freeze({ ...die });
  return Object.freeze({ ...die, component: Object.freeze({ ...die.component }) });
}

interface ComponentGroup {
  readonly type: DiceComponentResult['groupType'];
  tens?: DiceComponentResult;
  units?: DiceComponentResult;
}

function getDiceTotal(dice: readonly DieResult[]): number {
  let total = 0;
  const groups = new Map<string, ComponentGroup>();

  for (const die of dice) {
    const component = die.component;
    if (component === undefined) {
      if (die.included !== false) total += die.score ?? die.value;
      continue;
    }

    if (die.included !== undefined || die.score !== undefined) {
      throw new RangeError(
        'Keep/drop and score metadata is not supported on paired dice components',
      );
    }

    const existing = groups.get(component.groupId);
    const group = existing ?? { type: component.groupType };
    if (group.type !== component.groupType) {
      throw new RangeError(`Dice group ${component.groupId} mixes incompatible group types`);
    }
    if (group[component.role] !== undefined) {
      throw new RangeError(`Dice group ${component.groupId} has duplicate ${component.role} dice`);
    }
    const digit = component.groupType === 'd100' ? component.faceValue % 10 : component.faceValue;
    const expectedValue = component.role === 'tens' ? digit * 10 : digit;
    if (die.value !== expectedValue) {
      throw new RangeError(
        `Dice component ${die.id} has value ${die.value}; expected ${expectedValue} from its face`,
      );
    }
    group[component.role] = component;
    groups.set(component.groupId, group);
  }

  for (const [groupId, group] of groups) {
    if (group.tens === undefined || group.units === undefined) {
      throw new RangeError(`Dice group ${groupId} must contain one tens die and one units die`);
    }
    total += getGroupTotal(groupId, group.type, group.tens, group.units);
  }

  return total;
}

function getGroupTotal(
  groupId: string,
  groupType: DiceComponentResult['groupType'],
  tens: DiceComponentResult,
  units: DiceComponentResult,
): number {
  const tensFace = tens.faceValue;
  const unitsFace = units.faceValue;

  if (groupType === 'd100') {
    assertFaceRange(groupId, tensFace, 1, 10);
    assertFaceRange(groupId, unitsFace, 1, 10);
    const value = (tensFace % 10) * 10 + (unitsFace % 10);
    return value === 0 ? 100 : value;
  }

  assertFaceRange(groupId, tensFace, 1, 6);
  assertFaceRange(groupId, unitsFace, 1, 6);
  return tensFace * 10 + unitsFace;
}

function assertFaceRange(groupId: string, value: number, minimum: number, maximum: number): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(
      `Dice group ${groupId} has face value ${value}; expected an integer in [${minimum}, ${maximum}]`,
    );
  }
}
