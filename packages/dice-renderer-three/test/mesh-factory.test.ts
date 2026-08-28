import { describe, expect, test } from 'bun:test';

import {
  D10_DEFINITION,
  D6_DEFINITION,
  getDieGeometry,
  getRegisteredDieTypes,
} from '@dice-o-rolla/dice-geometry';

import { createFaceUvs, createPolyhedronGeometry, getFaceLabel } from '../src/index.js';

describe('createPolyhedronGeometry', () => {
  test.each([...getRegisteredDieTypes()])(
    '%s triangulates every polygon into its material group',
    (type) => {
      const definition = getDieGeometry(type);
      const geometry = createPolyhedronGeometry(definition);
      const expectedVertices = definition.faces.reduce(
        (total, face) => total + (face.indices.length - 2) * 3,
        0,
      );

      expect(geometry.getAttribute('position').count).toBe(expectedVertices);
      expect(geometry.groups).toHaveLength(definition.faces.length);
      expect(geometry.groups.map((group) => group.materialIndex)).toEqual(
        definition.faces.map((_, index) => index),
      );
      geometry.dispose();
    },
  );

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

  test('maps CanvasTexture labels without horizontal mirroring', () => {
    const geometry = createPolyhedronGeometry(D6_DEFINITION);
    const uv = geometry.getAttribute('uv');

    expect(Array.from({ length: 6 }, (_, index) => [uv.getX(index), uv.getY(index)])).toEqual([
      [0.5, 1],
      [0, 0.5],
      [0.5, 0],
      [0.5, 1],
      [0.5, 0],
      [1, 0.5],
    ]);
    geometry.dispose();
  });

  test('preserves d10 kite proportions in texture coordinates', () => {
    const face = D10_DEFINITION.faces[0]!;
    const uvs = createFaceUvs(D10_DEFINITION, face);
    const vertices = face.indices.map((index) => D10_DEFINITION.vertices[index]!);
    const scaleRatios: number[] = [];

    for (let left = 0; left < vertices.length; left += 1) {
      for (let right = left + 1; right < vertices.length; right += 1) {
        const vertexDistance = Math.hypot(
          vertices[left]![0] - vertices[right]![0],
          vertices[left]![1] - vertices[right]![1],
          vertices[left]![2] - vertices[right]![2],
        );
        const uvDistance = Math.hypot(
          uvs[left]![0] - uvs[right]![0],
          uvs[left]![1] - uvs[right]![1],
        );
        scaleRatios.push(uvDistance / vertexDistance);
      }
    }

    for (const ratio of scaleRatios.slice(1)) {
      expect(ratio).toBeCloseTo(scaleRatios[0]!, 10);
    }
    for (const [u, v] of uvs) {
      expect(u).toBeGreaterThanOrEqual(0.07);
      expect(u).toBeLessThanOrEqual(0.93);
      expect(v).toBeGreaterThanOrEqual(0.07);
      expect(v).toBeLessThanOrEqual(0.93);
    }
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

  test('maps d4 vertex labels and the conventional d10 zero label', () => {
    const d4 = getDieGeometry('d4');
    expect(d4.faces.map((face) => getFaceLabel(d4, face))).toEqual([
      [3, 4, 2],
      [4, 3, 1],
      [4, 1, 2],
      [3, 2, 1],
    ]);
    const d10 = getDieGeometry('d10');
    const zeroFace = d10.faces.find((face) => face.value === 10);
    expect(zeroFace).toBeDefined();
    if (zeroFace === undefined) throw new Error('Missing d10 value ten face');
    expect(getFaceLabel(d10, zeroFace)).toBe(0);
  });

  test('uses explicit face labels for paired tens dice', () => {
    const d10 = getDieGeometry('d10');
    const zeroFace = d10.faces.find((face) => face.value === 10)!;
    const sevenFace = d10.faces.find((face) => face.value === 7)!;

    expect(getFaceLabel(d10, zeroFace, { 10: '00' })).toBe('00');
    expect(getFaceLabel(d10, sevenFace, { 7: 70 })).toBe(70);
  });
});
