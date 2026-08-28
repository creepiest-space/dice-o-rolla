export type {
  DiceComponentResult,
  DiceComponentRole,
  ComponentDieResult,
  DieDefinition,
  DieResult,
  DieType,
  StandardDieResult,
} from './dice/types.js';
export { isDieType, STANDARD_DIE_TYPES } from './dice/types.js';
export { TypedEventEmitter } from './events/typed-event-emitter.js';
export type { QuaternionLike, Vector3Like } from './math/types.js';
export type {
  DiceExpression,
  ModifierExpression,
  PairedDiceExpression,
  PairedDiceType,
  RollExpression,
  RollNotation,
} from './notation/ast.js';
export { NotationParseError } from './notation/errors.js';
export type { NotationParseErrorCode } from './notation/errors.js';
export { parseNotation } from './notation/parser.js';
export type { RandomSource } from './random/random-source.js';
export {
  cryptoRandomSource,
  mathRandomSource,
  SeededRandomSource,
} from './random/random-source.js';
export { createRollResult, getNotationModifier } from './roll/aggregation.js';
export type {
  CreateRollResultOptions,
  RollMode,
  RollResult,
  RollSession,
  RollState,
} from './roll/types.js';
