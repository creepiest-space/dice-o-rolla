export interface DiceExpression {
  readonly kind: 'dice';
  readonly count: number;
  readonly sides: number;
}

export interface ModifierExpression {
  readonly kind: 'modifier';
  readonly value: number;
}

export type RollExpression = DiceExpression | ModifierExpression;

export interface RollNotation {
  readonly kind: 'roll';
  readonly source: string;
  readonly expressions: readonly RollExpression[];
}
