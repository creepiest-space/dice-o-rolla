import { describe, expect, test } from 'bun:test';

import {
  D6_DEFINITION,
  calculateFaceNormal,
  getDieGeometry,
  getPolyhedronDefinitionIssues,
  getRegisteredDieTypes,
  hasDieGeometry,
} from '../src/index.js';

function dot(
  left: readonly [number, number, number],
  right: readonly [number, number, number],
): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

describe('d6 geometry definition', () => {
  test('is registered with the standard polyhedra', () => {
    expect(getRegisteredDieTypes()).toEqual(['d4', 'd6', 'd8', 'd10', 'd12', 'd20']);
    expect(hasDieGeometry('d6')).toBe(true);
    expect(hasDieGeometry('d20')).toBe(true);
    expect(getDieGeometry('d6')).toBe(D6_DEFINITION);
    expect(getDieGeometry('d20').id).toBe('d20');
  });

  test('satisfies registry invariants', () => {
    expect(getPolyhedronDefinitionIssues(D6_DEFINITION)).toEqual([]);
    expect(D6_DEFINITION.vertices).toHaveLength(8);
    expect(D6_DEFINITION.faces).toHaveLength(6);
    expect(D6_DEFINITION.faces.map(({ value }) => value)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(Object.isFrozen(D6_DEFINITION)).toBe(true);
    expect(Object.isFrozen(D6_DEFINITION.vertices[0])).toBe(true);
    expect(Object.isFrozen(D6_DEFINITION.faces[0]?.indices)).toBe(true);
    expect(Object.isFrozen(D6_DEFINITION.faceDefinitions[0]?.normal)).toBe(true);
  });

  test('uses a normalized circumradius', () => {
    for (const vertex of D6_DEFINITION.vertices) {
      expect(Math.hypot(...vertex)).toBeCloseTo(1, 12);
    }
  });

  test('has outward polygon normals aligned with logical d6 result normals', () => {
    D6_DEFINITION.faces.forEach((face, index) => {
      const logicalFace = D6_DEFINITION.faceDefinitions[index];
      expect(logicalFace).toBeDefined();
      if (logicalFace === undefined) return;

      const normal = calculateFaceNormal(D6_DEFINITION, face);
      expect(dot(normal, logicalFace.normal)).toBeCloseTo(1, 12);

      const firstVertexIndex = face.indices[0];
      const firstVertex =
        firstVertexIndex === undefined ? undefined : D6_DEFINITION.vertices[firstVertexIndex];
      expect(firstVertex).toBeDefined();
      if (firstVertex !== undefined) expect(dot(normal, firstVertex)).toBeGreaterThan(0);
    });
  });
});
