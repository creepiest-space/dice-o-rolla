import { describe, expect, test } from 'bun:test';

import { DiceAssetRegistry, type RuntimeTextureReference } from '../src/index.js';

const texture = (uri: string, colorSpace: 'srgb' | 'linear' = 'srgb'): RuntimeTextureReference => ({
  uri,
  mediaType: 'image/ktx2',
  colorSpace,
  mipmaps: true,
});

describe('DiceAssetRegistry', () => {
  test('keeps materials, reusable patterns, face atlases and skins separate', () => {
    const registry = new DiceAssetRegistry();
    registry.materials.register({ id: 'resin', roughness: 0.35, metalness: 0 });
    registry.patterns.register({ id: 'speckle', baseColor: texture('./speckle.ktx2') });
    registry.faces.register({
      id: 'digits',
      texture: texture('./digits.ktx2'),
      width: 512,
      height: 512,
      faces: { '1': { x: 0, y: 0, width: 128, height: 128 } },
    });
    const skin = registry.registerSkin({
      id: 'obsidian',
      materialId: 'resin',
      patternId: 'speckle',
      faceAtlasId: 'digits',
      tint: '#181828',
      hueRotation: 0.2,
      composite: 'multiply',
    });

    registry.validateReferences();
    expect(registry.getSkin('obsidian')).toBe(skin);
    expect(Object.isFrozen(registry.patterns.get('speckle')?.baseColor)).toBeTrue();
  });

  test('loads a catalog and validates audio-bank references', () => {
    const registry = new DiceAssetRegistry();
    registry.registerCatalog({
      schemaVersion: 1,
      audioSprites: [
        {
          id: 'resin-sprite',
          channels: 1,
          audio: { uri: './resin.webm', mediaType: 'audio/webm; codecs=opus' },
          clips: { hit1: { offsetSeconds: 0, durationSeconds: 0.12 } },
        },
      ],
      audioBanks: [
        {
          id: 'resin',
          kind: 'die-material',
          spriteId: 'resin-sprite',
          clipIds: ['hit1'],
          forceRange: [0.5, 120],
          gainRange: [0.02, 0.8],
        },
      ],
    });
    expect(registry.audioBanks.get('resin')?.kind).toBe('die-material');
  });

  test('handles replacement and removal explicitly', () => {
    const registry = new DiceAssetRegistry();
    registry.materials.register({ id: 'resin', roughness: 0.4, metalness: 0 });
    expect(() =>
      registry.materials.register({ id: 'resin', roughness: 0.2, metalness: 0 }),
    ).toThrow('already registered');
    registry.materials.register({ id: 'resin', roughness: 0.2, metalness: 0 }, { replace: true });
    expect(registry.materials.unregister('resin')?.roughness).toBe(0.2);
    expect(registry.revision).toBe(3);
  });

  test('rejects invalid runtime assets and dangling references', () => {
    const registry = new DiceAssetRegistry();
    expect(() => registry.materials.register({ id: 'bad', roughness: 2, metalness: 0 })).toThrow(
      RangeError,
    );
    expect(() => registry.patterns.register({ id: 'bad', baseColor: texture('') })).toThrow(
      RangeError,
    );
    registry.skins.register({ id: 'missing', materialId: 'none', patternId: 'none' });
    expect(() => registry.validateReferences()).toThrow('missing material');
  });
});
