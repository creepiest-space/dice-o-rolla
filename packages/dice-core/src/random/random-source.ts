export interface RandomSource {
  next(): number;
}

const UINT32_RANGE = 4_294_967_296;
const UINT53_RANGE = 9_007_199_254_740_992;

export const mathRandomSource: RandomSource = Object.freeze({
  next: (): number => Math.random(),
});

export const cryptoRandomSource: RandomSource = Object.freeze({
  next: (): number => {
    const crypto = globalThis.crypto;
    if (crypto === undefined) {
      throw new Error('Web Crypto is required for cryptographic dice randomness');
    }
    const words = new Uint32Array(2);
    crypto.getRandomValues(words);
    const high = words[0]! & 0x001f_ffff;
    return (high * UINT32_RANGE + words[1]!) / UINT53_RANGE;
  },
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
