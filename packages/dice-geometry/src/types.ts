import type { DieType } from '@creepiest-space/dice-core';

export type Vector3Tuple = readonly [x: number, y: number, z: number];

export interface PolygonDefinition {
  readonly indices: readonly number[];
  readonly value: number;
}

export interface FaceDefinition {
  readonly value: number;
  readonly normal: Vector3Tuple;
}

export interface PolyhedronDefinition {
  readonly id: DieType;
  readonly vertices: readonly Vector3Tuple[];
  readonly faces: readonly PolygonDefinition[];
  readonly faceDefinitions: readonly FaceDefinition[];
}
