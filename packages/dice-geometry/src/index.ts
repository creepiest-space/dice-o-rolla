export { D6_DEFINITION } from './definitions/d6.js';
export { calculateFaceNormal } from './face-normal.js';
export { getDieGeometry, getRegisteredDieTypes, hasDieGeometry } from './geometry-registry.js';
export { resolveFace } from './resolve-face.js';
export type {
  FaceDefinition,
  PolygonDefinition,
  PolyhedronDefinition,
  Vector3Tuple,
} from './types.js';
export { assertValidPolyhedronDefinition, getPolyhedronDefinitionIssues } from './validation.js';
