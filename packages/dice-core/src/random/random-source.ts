export interface RandomSource {
  next(): number;
}

export const mathRandomSource: RandomSource = Object.freeze({
  next: (): number => Math.random(),
});

export class SeededRandomSource implements RandomSource {
  #state: number;

  public constructor(seed: number) {
    if (!Number.isSafeInteger(seed)) {
      throw new TypeError('Random seed must be a safe integer');
    }
    this.#state = seed >>> 0;
  }

  public next(): number {
    this.#state = (this.#state + 0x6d2b79f5) >>> 0;
    let value = this.#state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  }
}
