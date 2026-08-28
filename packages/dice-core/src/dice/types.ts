export const STANDARD_DIE_TYPES = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'] as const;

export type DieType = (typeof STANDARD_DIE_TYPES)[number];

export interface DieDefinition {
  readonly id: DieType;
  readonly sides: number;
}

interface BaseDieResult {
  readonly id: string;
  readonly value: number;
}

export type DiceComponentRole = 'tens' | 'units';

export interface DiceComponentResult {
  readonly groupId: string;
  readonly groupType: 'd100' | 'd66';
  readonly role: DiceComponentRole;
  readonly faceValue: number;
}

export interface StandardDieResult extends BaseDieResult {
  readonly type: Exclude<DieType, 'd100'>;
  readonly component?: never;
}

export interface ComponentDieResult extends BaseDieResult {
  readonly type: DieType;
  readonly component: DiceComponentResult;
}

export type DieResult = StandardDieResult | ComponentDieResult;

export function isDieType(value: unknown): value is DieType {
  return typeof value === 'string' && STANDARD_DIE_TYPES.some((type) => type === value);
}
