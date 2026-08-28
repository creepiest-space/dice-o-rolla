import type { Vector3Like } from '@dice-o-rolla/dice-core';

export interface SettlingOptions {
  readonly linearVelocityThreshold: number;
  readonly angularVelocityThreshold: number;
  readonly stableTimeMs: number;
  readonly maxRollTimeMs: number;
}

export interface SettlingSample {
  readonly linearVelocity: Vector3Like;
  readonly angularVelocity: Vector3Like;
  readonly sleeping: boolean;
}

export type SettlingState = 'moving' | 'stabilizing' | 'settled' | 'timed-out';

function magnitude(vector: Vector3Like): number {
  return Math.hypot(vector.x, vector.y, vector.z);
}

function assertNonNegativeFinite(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite non-negative number`);
  }
}

export class SettlingDetector {
  readonly #options: SettlingOptions;
  #elapsedMs = 0;
  #stableMs = 0;
  #state: SettlingState = 'moving';

  public constructor(options: SettlingOptions) {
    assertNonNegativeFinite('linearVelocityThreshold', options.linearVelocityThreshold);
    assertNonNegativeFinite('angularVelocityThreshold', options.angularVelocityThreshold);
    assertNonNegativeFinite('stableTimeMs', options.stableTimeMs);
    if (!Number.isFinite(options.maxRollTimeMs) || options.maxRollTimeMs <= 0) {
      throw new RangeError('maxRollTimeMs must be a finite positive number');
    }
    this.#options = options;
  }

  public update(sample: SettlingSample, deltaMs: number): SettlingState {
    if (this.#state === 'settled' || this.#state === 'timed-out') return this.#state;
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) {
      throw new RangeError('Settling delta must be a finite positive number of milliseconds');
    }

    this.#elapsedMs += deltaMs;
    const belowThreshold =
      magnitude(sample.linearVelocity) <= this.#options.linearVelocityThreshold &&
      magnitude(sample.angularVelocity) <= this.#options.angularVelocityThreshold;

    if (belowThreshold) {
      this.#stableMs += deltaMs;
      if (sample.sleeping) this.#stableMs = this.#options.stableTimeMs;
      if (this.#stableMs >= this.#options.stableTimeMs) {
        this.#state = 'settled';
        return this.#state;
      }
      this.#state = 'stabilizing';
    } else {
      this.#stableMs = 0;
      this.#state = 'moving';
    }

    if (this.#elapsedMs >= this.#options.maxRollTimeMs) this.#state = 'timed-out';
    return this.#state;
  }

  public reset(): void {
    this.#elapsedMs = 0;
    this.#stableMs = 0;
    this.#state = 'moving';
  }

  public get state(): SettlingState {
    return this.#state;
  }

  public get elapsedMs(): number {
    return this.#elapsedMs;
  }

  public get stableMs(): number {
    return this.#stableMs;
  }
}
