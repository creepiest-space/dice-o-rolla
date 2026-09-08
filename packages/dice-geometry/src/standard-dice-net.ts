import { calculateFaceNormal } from './face-normal.js';
import { getDieGeometry } from './geometry-registry.js';
import type { PolyhedronDefinition } from './types.js';

export type StandardDiceNetType = 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20';
export interface StandardDiceNet {
  readonly geometryId: StandardDiceNetType;
  /** Complete per-corner UVs, normalized with a bottom-left origin. */
  readonly faces: Readonly<Record<number, readonly (readonly [u: number, v: number])[]>>;
}

type Point = readonly [number, number];
type Vec = readonly [number, number, number];
const dot = (a: Vec, b: Vec) => a.reduce((sum, value, index) => sum + value * b[index]!, 0);
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const unit = (a: Vec): Vec => {
  const length = Math.hypot(...a);
  return [a[0] / length, a[1] / length, a[2] / length];
};
const cross = (a: Vec, b: Vec): Vec => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** Positive-area intersection only: shared edges and vertices are allowed. */
function polygonsOverlap(a: readonly Point[], b: readonly Point[]): boolean {
  for (const polygon of [a, b]) {
    for (let i = 0; i < polygon.length; i++) {
      const p = polygon[i]!,
        q = polygon[(i + 1) % polygon.length]!;
      const axis: Point = [p[1] - q[1], q[0] - p[0]];
      const project = (points: readonly Point[]) =>
        points.map((v) => v[0] * axis[0] + v[1] * axis[1]);
      const x = project(a),
        y = project(b);
      if (
        Math.min(Math.max(...x), Math.max(...y)) - Math.max(Math.min(...x), Math.min(...y)) <
        1e-9
      )
        return false;
    }
  }
  return true;
}

function projectFace(
  definition: PolyhedronDefinition,
  faceIndex: number,
  edge: number,
  start: Point,
  end: Point,
): readonly Point[] {
  const face = definition.faces[faceIndex]!;
  const origin = definition.vertices[face.indices[edge]!]!;
  const next = definition.vertices[face.indices[(edge + 1) % face.indices.length]!]!;
  const horizontal = unit(sub(next, origin));
  const normal = calculateFaceNormal(definition, face);
  const vertical = unit(cross(normal, horizontal));
  const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
  const x = (end[0] - start[0]) / length,
    y = (end[1] - start[1]) / length;
  return face.indices.map((index) => {
    const offset = sub(definition.vertices[index]!, origin);
    const u = dot(offset, horizontal),
      v = dot(offset, vertical);
    return [start[0] + u * x - v * y, start[1] + u * y + v * x];
  });
}

/** Deterministic edge unfolding with bounded backtracking; d6 uses a fixed cross. */
export function createStandardDiceNet(type: StandardDiceNetType): StandardDiceNet {
  const definition = getDieGeometry(type);
  const first = definition.faces[0]!;
  const length = Math.hypot(
    ...sub(definition.vertices[first.indices[1]!]!, definition.vertices[first.indices[0]!]!),
  );
  const placed = new Map<number, readonly Point[]>([
    [0, projectFace(definition, 0, 0, [0, 0], [length, 0])],
  ]);
  let attempts = 0;
  const search = (): boolean => {
    if (placed.size === definition.faces.length) return true;
    if (++attempts > 100_000) throw new Error(`Cannot unfold ${definition.id}`);
    const parents = Array.from(placed);
    for (const [parentIndex, parentPoints] of parents) {
      const parent = definition.faces[parentIndex]!;
      for (let childIndex = 0; childIndex < definition.faces.length; childIndex++) {
        if (placed.has(childIndex)) continue;
        const child = definition.faces[childIndex]!;
        if (definition.id === 'd6' && (child.value === 6 ? parent.value !== 3 : parent.value !== 1))
          continue;
        for (let edge = 0; edge < child.indices.length; edge++) {
          const a = parent.indices.indexOf(child.indices[edge]!);
          const b = parent.indices.indexOf(child.indices[(edge + 1) % child.indices.length]!);
          if (a < 0 || b < 0 || (b + 1) % parent.indices.length !== a) continue;
          const polygon = projectFace(
            definition,
            childIndex,
            edge,
            parentPoints[a]!,
            parentPoints[b]!,
          );
          if ([...placed.values()].some((other) => polygonsOverlap(polygon, other))) continue;
          placed.set(childIndex, polygon);
          if (search()) return true;
          placed.delete(childIndex);
        }
      }
    }
    return false;
  };
  if (!search()) throw new Error(`No connected net for ${definition.id}`);
  const points = [...placed.values()].flat();
  const minX = Math.min(...points.map((p) => p[0])),
    minY = Math.min(...points.map((p) => p[1]));
  const width = Math.max(...points.map((p) => p[0])) - minX,
    height = Math.max(...points.map((p) => p[1])) - minY;
  const extent = Math.max(width, height) / 0.9;
  return {
    geometryId: type,
    faces: Object.fromEntries(
      definition.faces.map((face, index) => [
        face.value,
        placed
          .get(index)!
          .map(([x, y]) => [
            (x - minX + (extent - width) / 2) / extent,
            (y - minY + (extent - height) / 2) / extent,
          ]),
      ]),
    ),
  };
}
