import { definePolyhedron } from '../define-polyhedron.js';
import type { PolyhedronDefinition } from '../types.js';

const coordinate = 1 / Math.sqrt(3);

export const D6_DEFINITION = definePolyhedron({
  id: 'd6',
  vertices: Object.freeze([
    [-coordinate, -coordinate, coordinate],
    [coordinate, -coordinate, coordinate],
    [coordinate, -coordinate, -coordinate],
    [-coordinate, -coordinate, -coordinate],
    [-coordinate, coordinate, coordinate],
    [coordinate, coordinate, coordinate],
    [coordinate, coordinate, -coordinate],
    [-coordinate, coordinate, -coordinate],
  ]),
  faces: Object.freeze([
    { indices: [0, 3, 2, 1], value: 1 },
    { indices: [1, 2, 6, 5], value: 2 },
    { indices: [0, 1, 5, 4], value: 3 },
    { indices: [3, 7, 6, 2], value: 4 },
    { indices: [0, 4, 7, 3], value: 5 },
    { indices: [4, 5, 6, 7], value: 6 },
  ]),
  faceDefinitions: Object.freeze([
    { value: 1, normal: [0, -1, 0] },
    { value: 2, normal: [1, 0, 0] },
    { value: 3, normal: [0, 0, 1] },
    { value: 4, normal: [0, 0, -1] },
    { value: 5, normal: [-1, 0, 0] },
    { value: 6, normal: [0, 1, 0] },
  ]),
} satisfies PolyhedronDefinition);
