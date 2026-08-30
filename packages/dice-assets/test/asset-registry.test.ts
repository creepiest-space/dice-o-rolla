import { describe, expect, test } from 'bun:test';

import { DiceAssetRegistry, type DiceSkinDefinition } from '../src/index.js';

describe('DiceAssetRegistry', () => {
  test('stores immutable skins separately from visual presets', () => {
    const registry = new DiceAssetRegistry();
    const skin = registry.registerSkin({
      id: 'obsidian',
      material: 'custom',
      roughness: 0.4,
      textures: { body: { uri: './obsidian.webp', mediaType: 'image/webp' } },
    });

    expect(registry.getSkin('obsidian')).toBe(skin);
    expect(skin.textures?.body?.uri).toBe('./obsidian.webp');
    expect(Object.isFrozen(skin.textures?.body)).toBeTrue();
  });

  test('stores weighted sound cues without loading audio', () => {
    const registry = new DiceAssetRegistry();
    const pack = registry.registerSoundPack({
      id: 'wooden-table',
      dieCollision: {
        samples: [
          { uri: './hit-1.ogg', weight: 2 },
          { uri: './hit-2.ogg', volume: 0.8 },
        ],
      },
    });

    expect(pack.dieCollision?.samples.map(({ weight }) => weight)).toEqual([2, 1]);
    expect(pack.dieCollision?.maxVoices).toBe(4);
    expect(registry.listSoundPacks()).toEqual([pack]);
  });

  test('handles replacement and removal explicitly', () => {
    const registry = new DiceAssetRegistry();
    registry.registerSkin({ id: 'plain', material: 'plastic' });
    expect(() => registry.registerSkin({ id: 'plain', material: 'matte' })).toThrow(
      'already registered',
    );
    registry.registerSkin({ id: 'plain', material: 'matte' }, { replace: true });
    expect(registry.unregisterSkin('plain')?.material).toBe('matte');
    expect(registry.unregisterSkin('plain')).toBeUndefined();
    expect(registry.revision).toBe(3);
  });

  test.each<readonly [DiceSkinDefinition]>([
    [{ id: '', material: 'plastic' }],
    [{ id: 'bad', material: 'plastic', roughness: 2 }],
    [{ id: 'bad', material: 'custom', textures: { body: { uri: '' } } }],
  ])('rejects invalid skin descriptors %#', (skin) => {
    expect(() => new DiceAssetRegistry().registerSkin(skin)).toThrow(RangeError);
  });

  test('rejects empty and invalid sound cues', () => {
    const registry = new DiceAssetRegistry();
    expect(() =>
      registry.registerSoundPack({ id: 'empty', dieCollision: { samples: [] } }),
    ).toThrow('at least one sample');
    expect(() =>
      registry.registerSoundPack({
        id: 'invalid',
        settle: { samples: [{ uri: './settle.ogg', weight: 0 }] },
      }),
    ).toThrow('weight');
  });
});
