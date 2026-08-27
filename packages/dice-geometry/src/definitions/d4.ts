import { defineReferencePolyhedron } from '../define-reference-polyhedron.js';

export const D4_DEFINITION = defineReferencePolyhedron(
  'd4',
  [
    [1, 1, 1],
    [-1, -1, 1],
    [-1, 1, -1],
    [1, -1, -1],
  ],
  [
    { indices: [1, 0, 2], value: 1 },
    { indices: [0, 1, 3], value: 2 },
    { indices: [0, 3, 2], value: 3 },
    { indices: [1, 2, 3], value: 4 },
  ],
  { invertResultNormals: true },
);
