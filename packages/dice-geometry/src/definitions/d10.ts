import { defineReferencePolyhedron } from '../define-reference-polyhedron.js';
import type { Vector3Tuple } from '../types.js';

const ring: Vector3Tuple[] = [];
const angle = (Math.PI * 2) / 10;
// Corrects the reference's rounded 0.105 so normalized kite faces remain planar.
const halfHeight = 0.10616611026445441;
for (let index = 0; index < 10; index += 1) {
  ring.push([
    Math.cos(index * angle),
    Math.sin(index * angle),
    halfHeight * (index % 2 === 0 ? -1 : 1),
  ]);
}

export const D10_DEFINITION = defineReferencePolyhedron(
  'd10',
  [...ring, [0, 0, -1], [0, 0, 1]],
  [
    { indices: [5, 6, 7, 11], value: 1 },
    { indices: [4, 3, 2, 10], value: 2 },
    { indices: [1, 2, 3, 11], value: 3 },
    { indices: [0, 9, 8, 10], value: 4 },
    { indices: [7, 8, 9, 11], value: 5 },
    { indices: [8, 7, 6, 10], value: 6 },
    { indices: [9, 0, 1, 11], value: 7 },
    { indices: [2, 1, 0, 10], value: 8 },
    { indices: [3, 4, 5, 11], value: 9 },
    { indices: [6, 5, 4, 10], value: 10 },
  ],
);
