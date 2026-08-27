import { describe, expect, test } from 'bun:test';

import { D6_DEFINITION } from '@creepiest-space/dice-geometry';

import { createPolyhedronGeometry } from '../src/index.js';

describe('createPolyhedronGeometry', () => {
  test('creates one material group per logical d6 face', () => {
    const geometry = createPolyhedronGeometry(D6_DEFINITION, 2);
    const position = geometry.getAttribute('position');
    const uv = geometry.getAttribute('uv');

    expect(position.count).toBe(36);
    expect(uv.count).toBe(position.count);
    expect(geometry.groups).toHaveLength(6);
    expect(geometry.groups.map((group) => group.materialIndex)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(geometry.boundingSphere?.radius).toBeCloseTo(2, 6);
    geometry.dispose();
  });

  test('preserves outward normals for bottom and top faces', () => {
    const geometry = createPolyhedronGeometry(D6_DEFINITION);
    const normal = geometry.getAttribute('normal');

    expect([normal.getX(0), normal.getY(0), normal.getZ(0)]).toEqual([0, -1, 0]);
    const topStart = geometry.groups[5]?.start;
    expect(topStart).toBeNumber();
    expect([normal.getX(topStart!), normal.getY(topStart!), normal.getZ(topStart!)]).toEqual([
      0, 1, 0,
    ]);
    geometry.dispose();
  });

  test('validates scale and face indices', () => {
    expect(() => createPolyhedronGeometry(D6_DEFINITION, 0)).toThrow(RangeError);
    expect(() =>
      createPolyhedronGeometry({
        ...D6_DEFINITION,
        faces: [{ value: 1, indices: [0, 1, 100] }],
      }),
    ).toThrow('invalid vertex');
  });
});
