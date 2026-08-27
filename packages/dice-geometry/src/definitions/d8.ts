import { defineReferencePolyhedron } from '../define-reference-polyhedron.js';

export const D8_DEFINITION = defineReferencePolyhedron(
  'd8',
  [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ],
  [
    { indices: [0, 2, 4], value: 1 },
    { indices: [0, 4, 3], value: 2 },
    { indices: [0, 3, 5], value: 3 },
    { indices: [0, 5, 2], value: 4 },
    { indices: [1, 3, 4], value: 5 },
    { indices: [1, 4, 2], value: 6 },
    { indices: [1, 2, 5], value: 7 },
    { indices: [1, 5, 3], value: 8 },
  ],
);
