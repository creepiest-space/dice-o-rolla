import { defineReferencePolyhedron } from '../define-reference-polyhedron.js';

const phi = (1 + Math.sqrt(5)) / 2;
const inversePhi = 1 / phi;

export const D12_DEFINITION = defineReferencePolyhedron(
  'd12',
  [
    [0, inversePhi, phi],
    [0, inversePhi, -phi],
    [0, -inversePhi, phi],
    [0, -inversePhi, -phi],
    [phi, 0, inversePhi],
    [phi, 0, -inversePhi],
    [-phi, 0, inversePhi],
    [-phi, 0, -inversePhi],
    [inversePhi, phi, 0],
    [inversePhi, -phi, 0],
    [-inversePhi, phi, 0],
    [-inversePhi, -phi, 0],
    [1, 1, 1],
    [1, 1, -1],
    [1, -1, 1],
    [1, -1, -1],
    [-1, 1, 1],
    [-1, 1, -1],
    [-1, -1, 1],
    [-1, -1, -1],
  ],
  [
    { indices: [2, 14, 4, 12, 0], value: 1 },
    { indices: [15, 9, 11, 19, 3], value: 2 },
    { indices: [16, 10, 17, 7, 6], value: 3 },
    { indices: [6, 7, 19, 11, 18], value: 4 },
    { indices: [6, 18, 2, 0, 16], value: 5 },
    { indices: [18, 11, 9, 14, 2], value: 6 },
    { indices: [1, 17, 10, 8, 13], value: 7 },
    { indices: [1, 13, 5, 15, 3], value: 8 },
    { indices: [13, 8, 12, 4, 5], value: 9 },
    { indices: [5, 4, 14, 9, 15], value: 10 },
    { indices: [0, 12, 8, 10, 16], value: 11 },
    { indices: [3, 19, 7, 17, 1], value: 12 },
  ],
);
