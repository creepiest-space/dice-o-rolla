import type { PolygonDefinition, PolyhedronDefinition, Vector3Tuple } from './types.js';
import { cross, length, normalize, subtract } from './vector-math.js';

export function calculateFaceNormal(
  definition: PolyhedronDefinition,
  face: PolygonDefinition,
): Vector3Tuple {
  const firstIndex = face.indices[0];
  if (firstIndex === undefined) {
    throw new RangeError('A polygon must contain at least three vertex indices');
  }
  const origin = definition.vertices[firstIndex];
  if (origin === undefined) {
    throw new RangeError(`Face references missing vertex ${firstIndex}`);
  }

  for (let offset = 1; offset < face.indices.length - 1; offset += 1) {
    const secondIndex = face.indices[offset];
    const thirdIndex = face.indices[offset + 1];
    if (secondIndex === undefined || thirdIndex === undefined) continue;

    const second = definition.vertices[secondIndex];
    const third = definition.vertices[thirdIndex];
    if (second === undefined || third === undefined) {
      throw new RangeError('Face references a missing vertex');
    }

    const normal = cross(subtract(second, origin), subtract(third, origin));
    if (length(normal) > Number.EPSILON) return normalize(normal);
  }

  throw new RangeError('A polygon must contain three non-collinear vertices');
}
