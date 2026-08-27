import { defineReferencePolyhedron } from '../define-reference-polyhedron.js';

const phi = (1 + Math.sqrt(5)) / 2;

export const D20_DEFINITION = defineReferencePolyhedron(
  'd20',
  [
    [-1, phi, 0],
    [1, phi, 0],
    [-1, -phi, 0],
    [1, -phi, 0],
    [0, -1, phi],
    [0, 1, phi],
    [0, -1, -phi],
    [0, 1, -phi],
    [phi, 0, -1],
    [phi, 0, 1],
    [-phi, 0, -1],
    [-phi, 0, 1],
  ],
  [
    { indices: [0, 11, 5], value: 1 },
    { indices: [0, 5, 1], value: 2 },
    { indices: [0, 1, 7], value: 3 },
    { indices: [0, 7, 10], value: 4 },
    { indices: [0, 10, 11], value: 5 },
    { indices: [1, 5, 9], value: 6 },
    { indices: [5, 11, 4], value: 7 },
    { indices: [11, 10, 2], value: 8 },
    { indices: [10, 7, 6], value: 9 },
    { indices: [7, 1, 8], value: 10 },
    { indices: [3, 9, 4], value: 11 },
    { indices: [3, 4, 2], value: 12 },
    { indices: [3, 2, 6], value: 13 },
    { indices: [3, 6, 8], value: 14 },
    { indices: [3, 8, 9], value: 15 },
    { indices: [4, 9, 5], value: 16 },
    { indices: [2, 4, 11], value: 17 },
    { indices: [6, 2, 10], value: 18 },
    { indices: [8, 6, 7], value: 19 },
    { indices: [9, 8, 1], value: 20 },
  ],
);
