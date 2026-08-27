import { D6_DEFINITION } from '@creepiest-space/dice-geometry';
import type { PolyhedronDefinition } from '@creepiest-space/dice-geometry';
import type { RendererTheme } from '@creepiest-space/dice-renderer';
import { BufferGeometry, Float32BufferAttribute, Mesh, type MeshStandardMaterial } from 'three';

import { ThreeMaterialFactory } from './material-factory.js';

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
    const uvByVertex = face.indices.map((_, index) => {
      const angle = Math.PI / 2 - (index / face.indices.length) * Math.PI * 2;
      return [0.5 + Math.cos(angle) * 0.5, 0.5 + Math.sin(angle) * 0.5] as const;
    });

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

  createD6(theme: RendererTheme = DEFAULT_THREE_THEME, scale = 1): ThreeDiceMesh {
    const geometry = createPolyhedronGeometry(D6_DEFINITION, scale);
    const materials = D6_DEFINITION.faces.map((face) =>
      this.#materials.createFace(face.value, theme),
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
}
