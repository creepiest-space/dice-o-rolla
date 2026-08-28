import type { QuaternionLike, RandomSource, Vector3Like } from '@dice-o-rolla/dice-core';

export interface NumberRange {
  readonly min: number;
  readonly max: number;
}

export interface Vector3Range {
  readonly x: NumberRange;
  readonly y: NumberRange;
  readonly z: NumberRange;
}

export interface ThrowGeneratorOptions {
  readonly position: Vector3Range;
  readonly impulse: Vector3Range;
  readonly torqueImpulse: Vector3Range;
}

export interface ThrowParameters {
  readonly position: Vector3Like;
  readonly quaternion: QuaternionLike;
  readonly impulse: Vector3Like;
  readonly torqueImpulse: Vector3Like;
}

function assertRange(name: string, range: NumberRange): void {
  if (!Number.isFinite(range.min) || !Number.isFinite(range.max) || range.min > range.max) {
    throw new RangeError(`${name} must contain finite values with min <= max`);
  }
}

function assertVectorRange(name: string, range: Vector3Range): void {
  assertRange(`${name}.x`, range.x);
  assertRange(`${name}.y`, range.y);
  assertRange(`${name}.z`, range.z);
}

export class ThrowGenerator {
  readonly #random: RandomSource;
  readonly #options: ThrowGeneratorOptions;

  public constructor(random: RandomSource, options: ThrowGeneratorOptions) {
    assertVectorRange('position', options.position);
    assertVectorRange('impulse', options.impulse);
    assertVectorRange('torqueImpulse', options.torqueImpulse);
    this.#random = random;
    this.#options = options;
  }

  public generate(): ThrowParameters {
    const position = this.#sampleVector(this.#options.position);
    const impulse = this.#sampleVector(this.#options.impulse);
    const torqueImpulse = this.#sampleVector(this.#options.torqueImpulse);
    const first = this.#next();
    const second = this.#next();
    const third = this.#next();
    const lowerRadius = Math.sqrt(1 - first);
    const upperRadius = Math.sqrt(first);
    const lowerAngle = Math.PI * 2 * second;
    const upperAngle = Math.PI * 2 * third;

    return {
      position,
      quaternion: {
        x: lowerRadius * Math.sin(lowerAngle),
        y: lowerRadius * Math.cos(lowerAngle),
        z: upperRadius * Math.sin(upperAngle),
        w: upperRadius * Math.cos(upperAngle),
      },
      impulse,
      torqueImpulse,
    };
  }

  #sampleVector(range: Vector3Range): Vector3Like {
    return {
      x: this.#sampleRange(range.x),
      y: this.#sampleRange(range.y),
      z: this.#sampleRange(range.z),
    };
  }

  #sampleRange(range: NumberRange): number {
    return range.min + (range.max - range.min) * this.#next();
  }

  #next(): number {
    const value = this.#random.next();
    if (!Number.isFinite(value) || value < 0 || value >= 1) {
      throw new RangeError('RandomSource.next() must return a finite value in [0, 1)');
    }
    return value;
  }
}
