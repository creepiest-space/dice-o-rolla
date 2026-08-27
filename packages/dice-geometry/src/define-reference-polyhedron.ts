import type { DieType } from '@creepiest-space/dice-core';

import { definePolyhedron } from './define-polyhedron.js';
import { calculateFaceNormal } from './face-normal.js';
import type { PolygonDefinition, PolyhedronDefinition, Vector3Tuple } from './types.js';
import { dot, normalize } from './vector-math.js';

interface ReferenceFace {
  readonly indices: readonly number[];
  readonly value: number;
}

interface ReferencePolyhedronOptions {
  readonly invertResultNormals?: boolean;
}

function convertVertex([sourceX, sourceY, sourceZ]: Vector3Tuple): Vector3Tuple {
  return normalize([sourceX, sourceZ, -sourceY]);
}

function outwardNormal(definition: PolyhedronDefinition, face: PolygonDefinition): Vector3Tuple {
  const calculated = calculateFaceNormal(definition, face);
  const centroid = face.indices.reduce<Vector3Tuple>(
    (sum, index) => {
      const vertex = definition.vertices[index];
      if (vertex === undefined) throw new RangeError(`Face references missing vertex ${index}`);
      return [sum[0] + vertex[0], sum[1] + vertex[1], sum[2] + vertex[2]];
    },
    [0, 0, 0],
  );
  return dot(calculated, centroid) < 0
    ? [-calculated[0], -calculated[1], -calculated[2]]
    : calculated;
}

export function defineReferencePolyhedron(
  id: DieType,
  sourceVertices: readonly Vector3Tuple[],
  referenceFaces: readonly ReferenceFace[],
  options: ReferencePolyhedronOptions = {},
): PolyhedronDefinition {
  const vertices = sourceVertices.map(convertVertex);
  const faces = referenceFaces.map(({ indices, value }) => ({ indices, value }));
  const shell: PolyhedronDefinition = {
    id,
    vertices,
    faces,
    faceDefinitions: [],
  };
  const faceDefinitions = faces.map((face) => {
    const normal = outwardNormal(shell, face);
    return {
      value: face.value,
      normal: options.invertResultNormals
        ? ([-normal[0], -normal[1], -normal[2]] as Vector3Tuple)
        : normal,
    };
  });
  return definePolyhedron({ id, vertices, faces, faceDefinitions });
}
