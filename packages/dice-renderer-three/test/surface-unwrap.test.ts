import { expect, test } from 'bun:test';

import { D6_DEFINITION } from '@dice-o-rolla/dice-geometry';

import { createPolyhedronGeometry, validateSurfaceUvs, type SurfaceUvMap } from '../src/index.js';

const uvs: SurfaceUvMap = Object.fromEntries(
  D6_DEFINITION.faces.map((face) => [
    face.value,
    [
      [0.1, 0.2],
      [0.3, 0.2],
      [0.3, 0.4],
      [0.1, 0.4],
    ],
  ]),
);

test('surface channel follows triangulated corners without changing local label UVs', () => {
  const original = createPolyhedronGeometry(D6_DEFINITION);
  const mapped = createPolyhedronGeometry(D6_DEFINITION, 1, uvs);
  expect(mapped.getAttribute('uv').array).toEqual(original.getAttribute('uv').array);
  expect(mapped.getAttribute('position').array).toEqual(original.getAttribute('position').array);
  const surface = mapped.getAttribute('uv1');
  for (const [index, corner] of [0, 1, 2, 0, 2, 3].entries()) {
    expect(surface.getX(index)).toBeCloseTo(uvs[1]![corner]![0]);
    expect(surface.getY(index)).toBeCloseTo(uvs[1]![corner]![1]);
  }
  mapped.dispose();
  original.dispose();
});

test('rejects missing, extra and malformed faces before geometry allocation', () => {
  const { 1: _first, ...missing } = uvs;
  expect(() => validateSurfaceUvs(D6_DEFINITION, missing)).toThrow('face 1');
  expect(() => validateSurfaceUvs(D6_DEFINITION, { ...uvs, 7: uvs[1]! })).toThrow('face 7');
  expect(() => validateSurfaceUvs(D6_DEFINITION, { ...uvs, 1: [[0, 0]] })).toThrow('face 1');
});
