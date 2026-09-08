import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { getDieGeometry } from '@dice-o-rolla/dice-geometry';
import { validateSurfaceUvs } from '@dice-o-rolla/dice-renderer-three';

import {
  createDiagnosticUnwrap,
  diagnosticSvg,
  DIAGNOSTIC_TYPES,
  polygonsOverlap,
} from '../scripts/diagnostic-nets.js';
import { DiceAssetRegistry } from '../src/index.js';
import type { DiceAssetCatalogManifest } from '../src/types.js';

const runtime = join(import.meta.dir, '../assets/runtime');
for (const type of DIAGNOSTIC_TYPES) {
  test(`${type}: connected, non-overlapping, isometric net with reproducible preview`, async () => {
    const geometry = getDieGeometry(type === 'd100' ? 'd10' : type === 'd66' ? 'd6' : type);
    const unwrap = createDiagnosticUnwrap(geometry);
    validateSurfaceUvs(geometry, unwrap.faces);
    let ratio: number | undefined;
    const connected = new Map(geometry.faces.map((face) => [face.value, new Set<number>()]));
    for (const face of geometry.faces) {
      const points = unwrap.faces[face.value]!;
      // All corner-to-corner distances, including diagonals, preserve one scale.
      for (let i = 0; i < points.length; i++)
        for (let j = i + 1; j < points.length; j++) {
          const a = geometry.vertices[face.indices[i]!]!,
            b = geometry.vertices[face.indices[j]!]!;
          const actual =
            Math.hypot(points[i]![0] - points[j]![0], points[i]![1] - points[j]![1]) /
            Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
          ratio ??= actual;
          expect(actual).toBeCloseTo(ratio, 8);
        }
      for (const other of geometry.faces) {
        if (face.value === other.value) continue;
        expect(polygonsOverlap(points, unwrap.faces[other.value]!)).toBe(false);
        const shared = face.indices.filter((index) => other.indices.includes(index));
        if (shared.length !== 2) continue;
        const coincides = shared.every((vertex) => {
          const a = points[face.indices.indexOf(vertex)]!,
            b = unwrap.faces[other.value]![other.indices.indexOf(vertex)]!;
          return Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-8;
        });
        if (coincides) connected.get(face.value)!.add(other.value);
      }
    }
    const seen = new Set<number>();
    const visit = (id: number): void => {
      if (seen.has(id)) return;
      seen.add(id);
      for (const other of connected.get(id)!) visit(other);
    };
    visit(geometry.faces[0]!.value);
    expect(seen.size).toBe(geometry.faces.length);
    if (type === 'd6') expect(connected.get(1)?.size).toBe(4);
    const svg = diagnosticSvg(geometry, unwrap, type === 'd100' || type === 'd66');
    expect(await readFile(join(runtime, 'previews', `diagnostic-${type}.svg`), 'utf8')).toBe(svg);
    const ktx = await readFile(join(runtime, 'textures', `diagnostic-${type}.ktx2`));
    expect([...ktx.subarray(0, 12)]).toEqual([171, 75, 84, 88, 32, 50, 48, 187, 13, 10, 26, 10]);
    expect(ktx.readUInt32LE(40)).toBeGreaterThan(1);
    // Every physical edge is identified twice, once on each side of the cut/fold.
    for (const face of geometry.faces)
      for (let i = 0; i < face.indices.length; i++) {
        const a = face.indices[i]!,
          b = face.indices[(i + 1) % face.indices.length]!;
        expect(svg.split(`>${Math.min(a, b)}:${Math.max(a, b)}</text>`)).toHaveLength(3);
      }
  });
}

test('generated skin set covers standard dice and percentile tens', async () => {
  const catalog = JSON.parse(
    await readFile(join(runtime, 'catalog.json'), 'utf8'),
  ) as DiceAssetCatalogManifest;
  const registry = new DiceAssetRegistry();
  registry.registerCatalog(catalog);
  expect(Object.keys(registry.skinSets.get('diagnostic')!.skins)).toEqual([...DIAGNOSTIC_TYPES]);
  expect(registry.patterns.get('diagnostic-d100')?.unwrap?.geometryId).toBe('d10');
});
