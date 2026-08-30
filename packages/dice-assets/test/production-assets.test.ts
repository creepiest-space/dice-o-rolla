import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { DiceAssetCatalogLoader, DiceAssetRegistry } from '../src/index.js';

const runtime = join(import.meta.dir, '..', 'assets', 'runtime');

describe('production asset fixtures', () => {
  test('loads the generated catalog through all registries', async () => {
    const registry = new DiceAssetRegistry();
    const loader = new DiceAssetCatalogLoader(registry, {
      fetch: async () => ({
        json: async () =>
          JSON.parse(await readFile(join(runtime, 'catalog.json'), 'utf8')) as unknown,
      }),
    });
    await loader.load('/catalog.json');
    expect(registry.materials.get('procedural-resin')).toBeDefined();
    expect(registry.patterns.get('procedural-speckle')).toBeDefined();
    expect(registry.skins.get('procedural-amethyst')).toBeDefined();
    expect(registry.faces.get('procedural-digits')).toBeDefined();
    expect(
      registry.audioBanks
        .list()
        .map(({ kind }) => kind)
        .toSorted(),
    ).toEqual(['die-material', 'surface-material']);
    expect(registry.patterns.get('procedural-speckle')?.baseColor.uri).toBe(
      '/textures/speckle-base.ktx2',
    );
  });

  test('contains KTX2 textures and WebM audio rather than source formats', async () => {
    const ktx = await readFile(join(runtime, 'textures', 'speckle-base.ktx2'));
    const webm = await readFile(join(runtime, 'audio', 'resin.webm'));
    expect([...ktx.subarray(0, 12)]).toEqual([171, 75, 84, 88, 32, 50, 48, 187, 13, 10, 26, 10]);
    expect([...webm.subarray(0, 4)]).toEqual([26, 69, 223, 163]);
  });
});
