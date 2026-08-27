import type { PolyhedronDefinition, Vector3Tuple } from './types.js';
import { length } from './vector-math.js';

const UNIT_TOLERANCE = 1e-9;

function isFiniteVector(vector: Vector3Tuple): boolean {
  return vector.every((component) => Number.isFinite(component));
}

export function getPolyhedronDefinitionIssues(definition: PolyhedronDefinition): readonly string[] {
  const issues: string[] = [];

  if (definition.vertices.length < 4) issues.push('A polyhedron must have at least four vertices');
  if (definition.faces.length < 4) issues.push('A polyhedron must have at least four faces');
  if (definition.faces.length !== definition.faceDefinitions.length) {
    issues.push('Polygon faces and logical face definitions must have equal lengths');
  }

  definition.vertices.forEach((vertex, index) => {
    if (!isFiniteVector(vertex)) issues.push(`Vertex ${index} contains a non-finite component`);
  });

  const values = new Set<number>();
  definition.faces.forEach((face, faceIndex) => {
    if (face.indices.length < 3) issues.push(`Face ${faceIndex} has fewer than three vertices`);
    if (new Set(face.indices).size !== face.indices.length) {
      issues.push(`Face ${faceIndex} repeats a vertex index`);
    }
    for (const index of face.indices) {
      if (!Number.isInteger(index) || index < 0 || index >= definition.vertices.length) {
        issues.push(`Face ${faceIndex} references invalid vertex ${index}`);
      }
    }
    if (!Number.isSafeInteger(face.value)) issues.push(`Face ${faceIndex} has an invalid value`);
    if (values.has(face.value)) issues.push(`Face value ${face.value} is duplicated`);
    values.add(face.value);

    const logicalFace = definition.faceDefinitions[faceIndex];
    if (logicalFace === undefined || logicalFace.value !== face.value) {
      issues.push(`Face ${faceIndex} does not align with its logical face definition`);
    }
  });

  definition.faceDefinitions.forEach((face, faceIndex) => {
    if (!isFiniteVector(face.normal)) {
      issues.push(`Logical face ${faceIndex} contains a non-finite normal`);
    } else if (Math.abs(length(face.normal) - 1) > UNIT_TOLERANCE) {
      issues.push(`Logical face ${faceIndex} normal is not normalized`);
    }
  });

  return issues;
}

export function assertValidPolyhedronDefinition(definition: PolyhedronDefinition): void {
  const issues = getPolyhedronDefinitionIssues(definition);
  if (issues.length > 0) {
    throw new TypeError(`Invalid ${definition.id} definition:\n- ${issues.join('\n- ')}`);
  }
}
