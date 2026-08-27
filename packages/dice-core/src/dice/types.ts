export const STANDARD_DIE_TYPES = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'] as const;

export type DieType = (typeof STANDARD_DIE_TYPES)[number];

export interface DieDefinition {
  readonly id: DieType;
  readonly sides: number;
}

export interface DieResult {
  readonly id: string;
  readonly type: DieType;
  readonly value: number;
}

export function isDieType(value: unknown): value is DieType {
  return typeof value === 'string' && STANDARD_DIE_TYPES.some((type) => type === value);
}
