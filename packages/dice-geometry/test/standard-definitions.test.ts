import { describe, expect, test } from 'bun:test';

import type { QuaternionLike } from '@dice-o-rolla/dice-core';

import {
  calculateFaceNormal,
  getDieGeometry,
  getPolyhedronDefinitionIssues,
  getRegisteredDieTypes,
  resolveFace,
} from '../src/index.js';
import type { Vector3Tuple } from '../src/index.js';

const expectedCounts = {
  d4: { vertices: 4, faces: 4 },
  d6: { vertices: 8, faces: 6 },
  d8: { vertices: 6, faces: 8 },
  d10: { vertices: 12, faces: 10 },
  d12: { vertices: 20, faces: 12 },
  d20: { vertices: 12, faces: 20 },
} as const;

const standardGeometryTypes = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'] as const;

function dot(left: Vector3Tuple, right: Vector3Tuple): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function rotationToWorldUp(normal: Vector3Tuple): QuaternionLike {
  const alignment = normal[1];
  if (alignment < -1 + 1e-12) return { x: 1, y: 0, z: 0, w: 0 };
  const quaternion = { x: -normal[2], y: 0, z: normal[0], w: 1 + alignment };
  const magnitude = Math.hypot(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
  return {
    x: quaternion.x / magnitude,
    y: quaternion.y / magnitude,
    z: quaternion.z / magnitude,
    w: quaternion.w / magnitude,
  };
}

describe('standard polyhedron definitions', () => {
  test('registers every standard physical shape', () => {
    expect(getRegisteredDieTypes()).toEqual(standardGeometryTypes);
  });

  test.each([...standardGeometryTypes])(
    '%s has normalized vertices, planar faces, and complete values',
    (type) => {
      const definition = getDieGeometry(type);
      const expected = expectedCounts[type];

      expect(getPolyhedronDefinitionIssues(definition)).toEqual([]);
      expect(definition.vertices).toHaveLength(expected.vertices);
      expect(definition.faces).toHaveLength(expected.faces);
      expect(definition.faces.map((face) => face.value).toSorted((a, b) => a - b)).toEqual(
        Array.from({ length: expected.faces }, (_, index) => index + 1),
      );
      for (const vertex of definition.vertices) expect(Math.hypot(...vertex)).toBeCloseTo(1, 12);

      for (const face of definition.faces) {
        const normal = calculateFaceNormal(definition, face);
        const origin = definition.vertices[face.indices[0]!]!;
        expect(dot(normal, origin)).toBeGreaterThan(0);
        for (const index of face.indices) {
          const vertex = definition.vertices[index]!;
          const relative: Vector3Tuple = [
            vertex[0] - origin[0],
            vertex[1] - origin[1],
            vertex[2] - origin[2],
          ];
          expect(dot(normal, relative)).toBeCloseTo(0, 10);
        }
      }
    },
  );

  test.each([...standardGeometryTypes])('%s resolves every logical result direction', (type) => {
    const definition = getDieGeometry(type);
    for (const face of definition.faceDefinitions) {
      expect(resolveFace(definition, rotationToWorldUp(face.normal))).toBe(face.value);
    }
  });

  test('d4 result directions point opposite their resting polygon normals', () => {
    const definition = getDieGeometry('d4');
    definition.faces.forEach((face, index) => {
      const polygonNormal = calculateFaceNormal(definition, face);
      expect(dot(polygonNormal, definition.faceDefinitions[index]!.normal)).toBeCloseTo(-1, 12);
    });
  });
});
