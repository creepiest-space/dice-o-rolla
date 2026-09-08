import { expect, test } from 'bun:test';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DiceAssetRegistry } from '@dice-o-rolla/dice-assets';
import { Resvg } from '@resvg/resvg-js';

import { writeTextureTemplates, buildTexturedSkinSet } from '../../src/index.js';

test('builds a loadable PBR catalog with real KTX and no guides in the raster', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dice-ktx-'));
  try {
    const source = join(root, 'source');
    await writeTextureTemplates({
      outputDirectory: source,
      types: ['d6'],
      size: 128,
      id: 'painted',
    });
    // Two SVGs differing only in guides must produce identical compressed pixels.
    const original = await readFile(join(source, 'd6.svg'), 'utf8');
    const marker = '<rect width="128" height="128" fill="red"/>';
    await writeFile(
      join(source, 'd6.svg'),
      original.replace('inkscape:label="guides">', `inkscape:label="guides">${marker}`),
    );
    const first = await buildTexturedSkinSet({
      input: join(source, 'skin-set.source.json'),
      outputDirectory: join(root, 'first'),
    });
    await writeFile(join(source, 'd6.svg'), original);
    await buildTexturedSkinSet({
      input: join(source, 'skin-set.source.json'),
      outputDirectory: join(root, 'second'),
    });
    expect(await readFile(join(root, 'first/textures/d6-baseColor.ktx2'))).toEqual(
      await readFile(join(root, 'second/textures/d6-baseColor.ktx2')),
    );
    const normal = new Resvg(
      '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" fill="#8080ff"/></svg>',
    )
      .render()
      .asPng();
    await writeFile(join(source, 'normal.png'), normal);
    await writeFile(
      join(source, 'skin-set.source.json'),
      JSON.stringify({
        schemaVersion: 1,
        id: 'painted',
        dice: {
          d6: {
            unwrap: 'd6.uv.json',
            baseColor: 'd6.svg',
            normal: 'normal.png',
            orm: 'normal.png',
          },
        },
      }),
    );
    const result = await buildTexturedSkinSet({
      input: join(source, 'skin-set.source.json'),
      outputDirectory: join(root, 'first'),
      overwrite: true,
    });
    const registry = new DiceAssetRegistry();
    registry.registerCatalog(result.catalog);
    expect(registry.skinSets.get('painted')?.skins.d6).toBe('painted-d6');
    expect(first.catalog.patterns?.[0]?.unwrap?.geometryId).toBe('d6');
    const texture = await readFile(join(root, 'first/textures/d6-normal.ktx2'));
    expect(texture.readUInt32LE(40)).toBeGreaterThan(1);
    expect(texture.includes(Buffer.from('KTXorientation\0ru\0'))).toBe(true);
    expect(registry.patterns.get('painted-d6')?.normal?.colorSpace).toBe('linear');
    expect((await readdir(join(root, 'first'))).toSorted()).toEqual([
      'catalog.json',
      'previews',
      'textures',
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 120_000);
