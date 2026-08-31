export interface PresentableRollResult {
  readonly notation: string;
  readonly total: number;
  readonly dice: readonly {
    readonly type: string;
    readonly value: number;
    readonly included?: boolean;
    readonly score?: number;
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
    dice: result.dice.map(presentDie).join(' · '),
  };
}

function presentDie(die: PresentableRollResult['dice'][number]): string {
  const score = die.score === undefined ? '' : ` → ${die.score > 0 ? '+' : ''}${die.score}`;
  const dropped = die.included === false ? ' (dropped)' : '';
  return `${die.type}: ${die.value}${score}${dropped}`;
}
