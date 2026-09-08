import { expect, test } from 'bun:test';

import {
  DiceAssetRegistry,
  resolveCatalogReferences,
  type DicePatternDefinition,
} from '../src/index.js';

const pattern: DicePatternDefinition = {
  id: 'net',
  baseColor: { uri: './net.ktx2', mediaType: 'image/ktx2', colorSpace: 'srgb', mipmaps: true },
  unwrap: {
    geometryId: 'd6',
    faces: {
      1: [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ],
    },
    preview: { uri: './net.svg' },
  },
};

test('skin sets resolve immutable skins and contribute to registry revision', () => {
  const registry = new DiceAssetRegistry();
  registry.registerCatalog({
    schemaVersion: 1,
    materials: [{ id: 'mat', roughness: 0.5, metalness: 0 }],
    patterns: [pattern],
    skins: [{ id: 'skin', materialId: 'mat', patternId: 'net' }],
    skinSets: [{ id: 'set', skins: { d6: 'skin' } }],
  });
  expect(registry.revision).toBe(4);
  expect(Object.isFrozen(registry.skinSets.get('set')?.skins)).toBe(true);
  registry.skins.unregister('skin');
  expect(() => registry.validateReferences()).toThrow('references missing skin');
});

test('invalid coordinates and repeating unwraps are rejected', () => {
  const registry = new DiceAssetRegistry();
  for (const value of [NaN, Infinity, -0.01, 1.01]) {
    expect(() =>
      registry.patterns.register({
        ...pattern,
        unwrap: {
          geometryId: 'd6',
          faces: {
            1: [
              [value, 0],
              [1, 0],
              [0, 1],
            ],
          },
        },
      }),
    ).toThrow('face 1');
  }
  expect(() => registry.patterns.register({ ...pattern, repeat: [2, 2] })).toThrow('cannot repeat');
  expect(() => registry.skinSets.register({ id: 'empty', skins: {} })).toThrow('must contain');
});

test('catalog resolves texture and preview URIs while preserving UVs', () => {
  const resolved = resolveCatalogReferences(
    { schemaVersion: 1, patterns: [pattern] },
    '/assets/catalog.json',
  );
  expect(resolved.patterns?.[0]?.unwrap?.preview?.uri).toBe('/assets/net.svg');
  expect(resolved.patterns?.[0]?.baseColor.uri).toBe('/assets/net.ktx2');
  expect(resolved.patterns?.[0]?.unwrap?.faces).toEqual(pattern.unwrap?.faces);
});
