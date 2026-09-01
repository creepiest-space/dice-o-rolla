export const STANDARD_DIE_TYPES = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'] as const;

export type DieType = (typeof STANDARD_DIE_TYPES)[number];

export interface DieDefinition {
  readonly id: DieType;
  readonly sides: number;
}

interface BaseDieResult {
  readonly id: string;
  readonly value: number;
  readonly provenance?: DieResultProvenance;
}

export type DieResultState = 'included' | 'discarded';

export interface DieResultProvenance {
  readonly termId: string;
  readonly termIndex: number;
  readonly dieIndex: number;
  readonly physicalIndex: number;
  readonly state: DieResultState;
  readonly faceValue: number;
  readonly contribution?: number;
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
  readonly included?: boolean;
  readonly score?: number;
}

export interface ComponentDieResult extends BaseDieResult {
  readonly type: DieType;
  readonly component: DiceComponentResult;
  readonly included?: never;
  readonly score?: never;
}

export type DieResult = StandardDieResult | ComponentDieResult;

export function isDieType(value: unknown): value is DieType {
  return typeof value === 'string' && STANDARD_DIE_TYPES.some((type) => type === value);
}
