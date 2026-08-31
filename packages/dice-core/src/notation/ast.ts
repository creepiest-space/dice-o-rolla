export type DiceSelectionOperator = 'kh' | 'kl' | 'dh' | 'dl';

export interface DiceSelection {
  readonly operator: DiceSelectionOperator;
  readonly count: number;
}

export interface DiceScoreRule {
  readonly minimum: number;
  readonly maximum: number;
  readonly score: number;
}

export interface DiceExpression {
  readonly kind: 'dice';
  readonly count: number;
  readonly sides: number;
  readonly selection?: DiceSelection;
  readonly score?: readonly DiceScoreRule[];
}

export type PairedDiceType = 'd100' | 'd66';

export interface PairedDiceExpression {
  readonly kind: 'paired-dice';
  readonly count: number;
  readonly type: PairedDiceType;
}

export interface ModifierExpression {
  readonly kind: 'modifier';
  readonly value: number;
}

export type RollExpression = DiceExpression | PairedDiceExpression | ModifierExpression;

export interface RollNotation {
  readonly kind: 'roll';
  readonly source: string;
  readonly expressions: readonly RollExpression[];
}
