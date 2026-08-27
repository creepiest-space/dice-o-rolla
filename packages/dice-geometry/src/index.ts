export { D4_DEFINITION } from './definitions/d4.js';
export { D6_DEFINITION } from './definitions/d6.js';
export { D8_DEFINITION } from './definitions/d8.js';
export { D10_DEFINITION } from './definitions/d10.js';
export { D12_DEFINITION } from './definitions/d12.js';
export { D20_DEFINITION } from './definitions/d20.js';
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
