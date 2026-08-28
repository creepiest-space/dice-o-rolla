export interface PresentableRollResult {
  readonly notation: string;
  readonly total: number;
  readonly dice: readonly {
    readonly type: string;
    readonly value: number;
  }[];
}

export interface RollPresentation {
  readonly notation: string;
  readonly total: string;
  readonly dice: string;
}

export function presentRollResult(result: PresentableRollResult): RollPresentation {
  return {
    notation: result.notation,
    total: String(result.total),
    dice: result.dice.map((die) => `${die.type}: ${die.value}`).join(' · '),
  };
}
