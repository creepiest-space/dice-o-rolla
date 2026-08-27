import type { DieResult } from '../dice/types.js';

export type RollState = 'pending' | 'rolling' | 'settled' | 'cancelled' | 'failed';

export type RollMode = 'queue' | 'replace' | 'parallel';

export interface RollSession {
  readonly id: string;
  readonly notation: string;
  readonly state: RollState;
  readonly createdAt: number;
  readonly startedAt?: number;
  readonly completedAt?: number;
}

export interface RollResult {
  readonly id: string;
  readonly notation: string;
  readonly dice: readonly DieResult[];
  readonly modifier: number;
  readonly total: number;
  readonly startedAt: number;
  readonly completedAt: number;
}

export interface CreateRollResultOptions {
  readonly id: string;
  readonly notation: string;
  readonly dice: readonly DieResult[];
  readonly modifier: number;
  readonly startedAt: number;
  readonly completedAt: number;
}
