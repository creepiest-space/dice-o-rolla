import { D6_DEFINITION } from '@creepiest-space/dice-geometry';
import type { PolygonDefinition, PolyhedronDefinition } from '@creepiest-space/dice-geometry';
import type { RendererTheme } from '@creepiest-space/dice-renderer';
import { BufferGeometry, Float32BufferAttribute, Mesh, type MeshStandardMaterial } from 'three';

import { ThreeMaterialFactory } from './material-factory.js';

type Vector2Tuple = readonly [u: number, v: number];
type Vector3Tuple = readonly [x: number, y: number, z: number];

const D10_LABEL_SCALE = 0.7;
const D10_UV_EXTENT = 0.86;

export const DEFAULT_THREE_THEME: RendererTheme = Object.freeze({
  material: 'plastic',
  bodyColor: '#f7f3e8',
  labelColor: '#181818',
  roughness: 0.28,
  metalness: 0,
});

export interface ThreeDiceMesh {
  readonly mesh: Mesh<BufferGeometry, MeshStandardMaterial[]>;
  dispose(): void;
}

export function createPolyhedronGeometry(
  definition: PolyhedronDefinition,
  scale = 1,
): BufferGeometry {
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new RangeError('scale must be a positive finite number');
  }

  const positions: number[] = [];
  const uvs: number[] = [];
  const geometry = new BufferGeometry();

  definition.faces.forEach((face, materialIndex) => {
    const start = positions.length / 3;
    const uvByVertex = createFaceUvs(definition, face);

    for (let index = 1; index < face.indices.length - 1; index += 1) {
      for (const faceIndex of [0, index, index + 1]) {
        const vertexIndex = face.indices[faceIndex];
        const vertex = vertexIndex === undefined ? undefined : definition.vertices[vertexIndex];
        const uv = uvByVertex[faceIndex];
        if (vertex === undefined || uv === undefined) {
          throw new RangeError(`Face ${face.value} references an invalid vertex`);
        }
        positions.push(vertex[0] * scale, vertex[1] * scale, vertex[2] * scale);
        uvs.push(uv[0], uv[1]);
      }
    }
    geometry.addGroup(start, positions.length / 3 - start, materialIndex);
  });

  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export class ThreeDiceMeshFactory {
  readonly #materials: ThreeMaterialFactory;

  constructor(materials = new ThreeMaterialFactory()) {
    this.#materials = materials;
  }

  create(
    definition: PolyhedronDefinition,
    theme: RendererTheme = DEFAULT_THREE_THEME,
    scale = 1,
    faceLabels?: Readonly<Record<number, string | number>>,
  ): ThreeDiceMesh {
    const geometry = createPolyhedronGeometry(definition, scale);
    const materials = definition.faces.map((face) =>
      this.#materials.createFace(
        getFaceLabel(definition, face, faceLabels),
        theme,
        definition.id === 'd10' ? { labelScale: D10_LABEL_SCALE } : undefined,
      ),
    );
    const mesh = new Mesh(geometry, materials);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    return {
      mesh,
      dispose(): void {
        geometry.dispose();
        for (const material of materials) {
          material.map?.dispose();
          material.dispose();
        }
      },
    };
  }

  createD6(theme: RendererTheme = DEFAULT_THREE_THEME, scale = 1): ThreeDiceMesh {
    return this.create(D6_DEFINITION, theme, scale);
  }
}

export function createFaceUvs(
  definition: PolyhedronDefinition,
  face: PolygonDefinition,
): readonly Vector2Tuple[] {
  if (definition.id !== 'd10') {
    return face.indices.map((_, index) => {
      const angle = Math.PI / 2 - (index / face.indices.length) * Math.PI * 2;
      return [0.5 - Math.cos(angle) * 0.5, 0.5 + Math.sin(angle) * 0.5];
    });
  }

  const vertices = face.indices.map((vertexIndex) => {
    const vertex = definition.vertices[vertexIndex];
    if (vertex === undefined) {
      throw new RangeError(`Face ${face.value} references an invalid vertex`);
    }
    return vertex;
  });
  const centroid = average(vertices);
  const vertical = normalize(subtract(vertices[0]!, centroid));
  const normal = normalize(
    cross(subtract(vertices[1]!, vertices[0]!), subtract(vertices[2]!, vertices[0]!)),
  );
  let horizontal = normalize(cross(vertical, normal));
  if (dot(subtract(vertices[1]!, centroid), horizontal) > 0) {
    horizontal = scaleVector(horizontal, -1);
  }

  const projected = vertices.map((vertex) => {
    const offset = subtract(vertex, centroid);
    return [dot(offset, horizontal), dot(offset, vertical)] as const;
  });
  const xCoordinates = projected.map(([x]) => x);
  const yCoordinates = projected.map(([, y]) => y);
  const minX = Math.min(...xCoordinates);
  const maxX = Math.max(...xCoordinates);
  const minY = Math.min(...yCoordinates);
  const maxY = Math.max(...yCoordinates);
  const extent = Math.max(maxX - minX, maxY - minY);
  if (extent <= Number.EPSILON) {
    throw new RangeError(`Face ${face.value} cannot be projected to texture coordinates`);
  }
  const uvScale = D10_UV_EXTENT / extent;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  return projected.map(([x, y]) => [0.5 + (x - centerX) * uvScale, 0.5 + (y - centerY) * uvScale]);
}

function average(vertices: readonly Vector3Tuple[]): Vector3Tuple {
  const sum = vertices.reduce<Vector3Tuple>(
    (result, vertex) => [result[0] + vertex[0], result[1] + vertex[1], result[2] + vertex[2]],
    [0, 0, 0],
  );
  return scaleVector(sum, 1 / vertices.length);
}

function subtract(left: Vector3Tuple, right: Vector3Tuple): Vector3Tuple {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function scaleVector(vector: Vector3Tuple, multiplier: number): Vector3Tuple {
  return [vector[0] * multiplier, vector[1] * multiplier, vector[2] * multiplier];
}

function dot(left: Vector3Tuple, right: Vector3Tuple): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function cross(left: Vector3Tuple, right: Vector3Tuple): Vector3Tuple {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function normalize(vector: Vector3Tuple): Vector3Tuple {
  const length = Math.hypot(...vector);
  if (length <= Number.EPSILON) throw new RangeError('Cannot normalize a zero-length vector');
  return scaleVector(vector, 1 / length);
}

export function getFaceLabel(
  definition: PolyhedronDefinition,
  face: PolygonDefinition,
  faceLabels?: Readonly<Record<number, string | number>>,
): string | number | readonly number[] {
  const override = faceLabels?.[face.value];
  if (override !== undefined) return override;
  if (definition.id === 'd4') {
    return face.indices.map((vertexIndex) => {
      const oppositeFace = definition.faces.find(
        (candidate) => !candidate.indices.includes(vertexIndex),
      );
      if (oppositeFace === undefined) {
        throw new RangeError(`No d4 result is associated with vertex ${vertexIndex}`);
      }
      return oppositeFace.value;
    });
  }
  if (definition.id === 'd10' && face.value === 10) return 0;
  return face.value;
}
