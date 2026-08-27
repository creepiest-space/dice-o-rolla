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
