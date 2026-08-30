import { describe, expect, test } from 'bun:test';

import {
  DiceAssetRegistry,
  resolveImpactGain,
  WebAudioSpritePlayer,
  type AudioBufferSourceNodeLike,
  type AudioContextLike,
} from '../src/index.js';

function registry(): DiceAssetRegistry {
  const result = new DiceAssetRegistry();
  result.audio.register({
    id: 'sprite',
    channels: 1,
    audio: { uri: '/sprite.webm', mediaType: 'audio/webm; codecs=opus' },
    clips: { hit: { offsetSeconds: 0.2, durationSeconds: 0.1, gain: 0.5 } },
  });
  result.audioBanks.register({
    id: 'resin',
    kind: 'die-material',
    spriteId: 'sprite',
    clipIds: ['hit'],
    forceRange: [1, 101],
    gainRange: [0.1, 0.9],
    pitchVariationCents: 20,
  });
  return result;
}

describe('WebAudioSpritePlayer', () => {
  test('maps Rapier force to a bounded perceptual gain', () => {
    const bank = registry().audioBanks.get('resin')!;
    const clip = registry().audio.get('sprite')!.clips.hit!;
    expect(resolveImpactGain(bank, clip, 1)).toBeCloseTo(0.05);
    expect(resolveImpactGain(bank, clip, 101)).toBeCloseTo(0.45);
  });

  test('decodes once and plays only the selected sprite range', async () => {
    const starts: number[][] = [];
    const source = (): AudioBufferSourceNodeLike => ({
      buffer: undefined,
      playbackRate: { value: 1 },
      connect() {},
      start(...values: number[]) {
        starts.push(values);
      },
      addEventListener() {},
    });
    const context: AudioContextLike = {
      destination: {},
      async decodeAudioData() {
        return { decoded: true };
      },
      createBufferSource: source,
      createGain: () => ({ gain: { value: 1 }, connect() {} }),
    };
    const player = new WebAudioSpritePlayer(registry(), {
      context,
      random: () => 0.5,
      fetch: async () => ({ arrayBuffer: async () => new ArrayBuffer(1) }),
    });
    await player.playBank('resin', 50);
    await player.playBank('resin', 50);
    expect(starts).toEqual([
      [0, 0.2, 0.1],
      [0, 0.2, 0.1],
    ]);
  });
});
