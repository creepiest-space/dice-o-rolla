import type { ConvexHullColliderDefinition, DicePhysicsMaterial } from '@dice-o-rolla/dice-physics';
import type RAPIER from '@dimforge/rapier3d-compat';

import { assertNonNegative, assertPositive, assertVector } from './validation.js';

export function createConvexHullCollider(
  rapier: typeof RAPIER,
  definition: ConvexHullColliderDefinition,
  scale: number,
  mass: number,
  material: DicePhysicsMaterial,
): RAPIER.ColliderDesc {
  assertPositive(scale, 'scale');
  assertPositive(mass, 'mass');
  assertNonNegative(material.friction, 'material.friction');
  assertNonNegative(material.restitution, 'material.restitution');
  if (definition.vertices.length < 4) {
    throw new RangeError('A convex hull requires at least four vertices');
  }

  const points = new Float32Array(definition.vertices.length * 3);
  definition.vertices.forEach((vertex, index) => {
    assertVector(vertex, `collider.vertices[${index}]`);
    const offset = index * 3;
    points[offset] = vertex.x * scale;
    points[offset + 1] = vertex.y * scale;
    points[offset + 2] = vertex.z * scale;
  });

  const descriptor = rapier.ColliderDesc.convexHull(points);
  if (descriptor === null) {
    throw new RangeError('Collider vertices do not form a valid three-dimensional convex hull');
  }
  return descriptor
    .setMass(mass)
    .setFriction(material.friction)
    .setRestitution(material.restitution);
}
