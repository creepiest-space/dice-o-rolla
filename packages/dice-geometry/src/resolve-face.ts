import type { QuaternionLike } from '@dice-o-rolla/dice-core';

import type { PolyhedronDefinition, Vector3Tuple } from './types.js';
import { dot } from './vector-math.js';

const WORLD_UP: Vector3Tuple = [0, 1, 0];

function normalizeQuaternion(orientation: QuaternionLike): QuaternionLike {
  const magnitude = Math.hypot(orientation.x, orientation.y, orientation.z, orientation.w);
  if (!Number.isFinite(magnitude) || magnitude <= Number.EPSILON) {
    throw new RangeError('Die orientation must be a finite, non-zero quaternion');
  }

  return {
    x: orientation.x / magnitude,
    y: orientation.y / magnitude,
    z: orientation.z / magnitude,
    w: orientation.w / magnitude,
  };
}

function rotateVector(vector: Vector3Tuple, orientation: QuaternionLike): Vector3Tuple {
  const { x, y, z, w } = orientation;
  const twiceCrossX = 2 * (y * vector[2] - z * vector[1]);
  const twiceCrossY = 2 * (z * vector[0] - x * vector[2]);
  const twiceCrossZ = 2 * (x * vector[1] - y * vector[0]);

  return [
    vector[0] + w * twiceCrossX + (y * twiceCrossZ - z * twiceCrossY),
    vector[1] + w * twiceCrossY + (z * twiceCrossX - x * twiceCrossZ),
    vector[2] + w * twiceCrossZ + (x * twiceCrossY - y * twiceCrossX),
  ];
}

export function resolveFace(definition: PolyhedronDefinition, orientation: QuaternionLike): number {
  const firstFace = definition.faceDefinitions[0];
  if (firstFace === undefined) throw new RangeError(`${definition.id} has no logical faces`);
  const normalizedOrientation = normalizeQuaternion(orientation);

  let bestValue = firstFace.value;
  let bestAlignment = dot(rotateVector(firstFace.normal, normalizedOrientation), WORLD_UP);

  for (let index = 1; index < definition.faceDefinitions.length; index += 1) {
    const face = definition.faceDefinitions[index];
    if (face === undefined) continue;
    const alignment = dot(rotateVector(face.normal, normalizedOrientation), WORLD_UP);
    if (alignment > bestAlignment) {
      bestAlignment = alignment;
      bestValue = face.value;
    }
  }

  return bestValue;
}
