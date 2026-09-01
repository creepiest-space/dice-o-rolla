export class RollCancelledError extends Error {
  readonly sessionId: string;

  constructor(sessionId: string) {
    super(`Roll ${sessionId} was cancelled`);
    this.name = 'RollCancelledError';
    this.sessionId = sessionId;
  }
}

export class RollTimeoutError extends Error {
  readonly sessionId: string;

  constructor(sessionId: string) {
    super(`Roll ${sessionId} did not settle before the timeout`);
    this.name = 'RollTimeoutError';
    this.sessionId = sessionId;
  }
}

export class DiceEngineDestroyedError extends Error {
  constructor() {
    super('DiceEngine has been destroyed');
    this.name = 'DiceEngineDestroyedError';
  }
}

export type RollLimit = 'notation-length' | 'logical-dice' | 'physical-dice' | 'queue-size';

export class RollLimitExceededError extends RangeError {
  readonly limit: RollLimit;
  readonly maximum: number;
  readonly actual: number;

  constructor(limit: RollLimit, maximum: number, actual: number) {
    super(`Roll exceeds ${limit} limit of ${maximum} (received ${actual})`);
    this.name = 'RollLimitExceededError';
    this.limit = limit;
    this.maximum = maximum;
    this.actual = actual;
  }
}

export type TraceLimit = 'events' | 'frames' | 'samples';

export class TraceLimitExceededError extends RangeError {
  readonly limit: TraceLimit;
  readonly maximum: number;
  readonly actual: number;

  constructor(limit: TraceLimit, maximum: number, actual: number) {
    super(`Physical roll trace exceeds ${limit} limit of ${maximum} (received ${actual})`);
    this.name = 'TraceLimitExceededError';
    this.limit = limit;
    this.maximum = maximum;
    this.actual = actual;
  }
}
