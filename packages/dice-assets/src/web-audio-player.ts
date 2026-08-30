import type { DiceAssetRegistry } from './asset-registry.js';
import type { AudioBankDefinition, AudioSpriteClip, AudioSpriteManifest } from './types.js';

export interface AudioParamLike {
  value: number;
}

export interface AudioBufferSourceNodeLike {
  buffer: unknown;
  readonly playbackRate: AudioParamLike;
  connect(destination: unknown): void;
  start(when?: number, offset?: number, duration?: number): void;
  addEventListener(
    type: 'ended',
    listener: () => void,
    options?: { readonly once?: boolean },
  ): void;
}

export interface GainNodeLike {
  readonly gain: AudioParamLike;
  connect(destination: unknown): void;
}

export interface AudioContextLike {
  readonly destination: unknown;
  decodeAudioData(data: ArrayBuffer): Promise<unknown>;
  createBufferSource(): AudioBufferSourceNodeLike;
  createGain(): GainNodeLike;
}

export interface WebAudioSpritePlayerOptions {
  readonly context: AudioContextLike;
  readonly fetch?: (uri: string) => Promise<{ arrayBuffer(): Promise<ArrayBuffer> }>;
  readonly random?: () => number;
}

export interface PlayImpactOptions {
  readonly force: number;
  readonly dieMaterialBankId: string;
  readonly surfaceMaterialBankId?: string;
}

export class WebAudioSpritePlayer {
  readonly #context: AudioContextLike;
  readonly #fetch: (uri: string) => Promise<{ arrayBuffer(): Promise<ArrayBuffer> }>;
  readonly #random: () => number;
  readonly #buffers = new Map<string, unknown>();
  readonly #loading = new Map<string, Promise<unknown>>();
  readonly #voices = new Map<string, number>();

  constructor(
    readonly registry: DiceAssetRegistry,
    options: WebAudioSpritePlayerOptions,
  ) {
    this.#context = options.context;
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#random = options.random ?? Math.random;
  }

  async preloadBank(bankId: string): Promise<void> {
    const bank = this.#requireBank(bankId);
    await this.#loadSprite(this.#requireSprite(bank.spriteId));
  }

  async playImpact(options: PlayImpactOptions): Promise<void> {
    await Promise.all([
      this.playBank(options.dieMaterialBankId, options.force),
      ...(options.surfaceMaterialBankId === undefined
        ? []
        : [this.playBank(options.surfaceMaterialBankId, options.force)]),
    ]);
  }

  async playBank(bankId: string, force: number): Promise<boolean> {
    const bank = this.#requireBank(bankId);
    const maxVoices = bank.maxVoices ?? 6;
    if ((this.#voices.get(bankId) ?? 0) >= maxVoices) return false;
    const sprite = this.#requireSprite(bank.spriteId);
    const clipId = chooseClip(bank, sprite, this.#random());
    const clip = sprite.clips[clipId];
    if (clip === undefined) return false;
    const buffer = await this.#loadSprite(sprite);
    const source = this.#context.createBufferSource();
    const gain = this.#context.createGain();
    source.buffer = buffer;
    source.playbackRate.value = centsToRate(
      randomSigned(this.#random) * (bank.pitchVariationCents ?? 24),
    );
    gain.gain.value = resolveImpactGain(bank, clip, force, randomSigned(this.#random));
    source.connect(gain);
    gain.connect(this.#context.destination);
    this.#voices.set(bankId, (this.#voices.get(bankId) ?? 0) + 1);
    source.addEventListener(
      'ended',
      () => {
        this.#voices.set(bankId, Math.max(0, (this.#voices.get(bankId) ?? 1) - 1));
      },
      { once: true },
    );
    source.start(0, clip.offsetSeconds, clip.durationSeconds);
    return true;
  }

  async #loadSprite(sprite: AudioSpriteManifest): Promise<unknown> {
    const cached = this.#buffers.get(sprite.id);
    if (cached !== undefined) return cached;
    const pending = this.#loading.get(sprite.id);
    if (pending !== undefined) return pending;
    const promise = this.#fetch(sprite.audio.uri)
      .then((response) => response.arrayBuffer())
      .then((data) => this.#context.decodeAudioData(data))
      .then(
        (buffer) => {
          this.#buffers.set(sprite.id, buffer);
          this.#loading.delete(sprite.id);
          return buffer;
        },
        (error: unknown) => {
          this.#loading.delete(sprite.id);
          throw error;
        },
      );
    this.#loading.set(sprite.id, promise);
    return promise;
  }

  #requireBank(id: string): AudioBankDefinition {
    const bank = this.registry.audioBanks.get(id);
    if (bank === undefined) throw new Error(`Unknown audio bank: ${id}`);
    return bank;
  }

  #requireSprite(id: string): AudioSpriteManifest {
    const sprite = this.registry.audio.get(id);
    if (sprite === undefined) throw new Error(`Unknown audio sprite: ${id}`);
    return sprite;
  }
}

export function resolveImpactGain(
  bank: AudioBankDefinition,
  clip: AudioSpriteClip,
  force: number,
  signedVariation = 0,
): number {
  const forceSpan = bank.forceRange[1] - bank.forceRange[0];
  const normalized = Math.min(1, Math.max(0, (force - bank.forceRange[0]) / forceSpan));
  const shaped = Math.sqrt(normalized);
  const base = bank.gainRange[0] + shaped * (bank.gainRange[1] - bank.gainRange[0]);
  const variation = 1 + signedVariation * (bank.gainVariation ?? 0.04);
  return Math.max(0, base * (clip.gain ?? 1) * variation);
}

function chooseClip(
  bank: AudioBankDefinition,
  sprite: AudioSpriteManifest,
  random: number,
): string {
  const weighted = bank.clipIds.map((id) => ({ id, weight: sprite.clips[id]?.weight ?? 1 }));
  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  let cursor = random * total;
  for (const entry of weighted) {
    cursor -= entry.weight;
    if (cursor <= 0) return entry.id;
  }
  return bank.clipIds.at(-1) ?? '';
}

function centsToRate(cents: number): number {
  return 2 ** (cents / 1_200);
}

function randomSigned(random: () => number): number {
  return random() * 2 - 1;
}
