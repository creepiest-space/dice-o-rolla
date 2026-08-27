import type {
  FaceDefinition,
  PolygonDefinition,
  PolyhedronDefinition,
  Vector3Tuple,
} from './types.js';
import { assertValidPolyhedronDefinition } from './validation.js';

function freezeVector(vector: Vector3Tuple): Vector3Tuple {
  return Object.freeze([vector[0], vector[1], vector[2]]);
}

function freezePolygon(face: PolygonDefinition): PolygonDefinition {
  return Object.freeze({
    indices: Object.freeze(Array.from(face.indices)),
    value: face.value,
  });
}

function freezeFaceDefinition(face: FaceDefinition): FaceDefinition {
  return Object.freeze({
    value: face.value,
    normal: freezeVector(face.normal),
  });
}

export function definePolyhedron(definition: PolyhedronDefinition): PolyhedronDefinition {
  assertValidPolyhedronDefinition(definition);
  return Object.freeze({
    id: definition.id,
    vertices: Object.freeze(definition.vertices.map(freezeVector)),
    faces: Object.freeze(definition.faces.map(freezePolygon)),
    faceDefinitions: Object.freeze(definition.faceDefinitions.map(freezeFaceDefinition)),
  });
}
