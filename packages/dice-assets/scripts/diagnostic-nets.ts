import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  getDieGeometry,
  calculateFaceNormal,
  type PolyhedronDefinition,
} from '@dice-o-rolla/dice-geometry';
import { getFaceLabel } from '@dice-o-rolla/dice-renderer-three';
import { Resvg } from '@resvg/resvg-js';

import type { DicePatternDefinition, DiceSkinDefinition, DiceSurfaceUnwrap } from '../src/types.js';

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
export function polygonsOverlap(a: readonly Point[], b: readonly Point[]): boolean {
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
export function createDiagnosticUnwrap(definition: PolyhedronDefinition): DiceSurfaceUnwrap {
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
    geometryId: definition.id,
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

const SIZE = 2048;
const color = (value: number) =>
  ['#f6b573', '#a8d98c', '#8ccce8', '#e5a2cb', '#d3bcf3', '#f0da85', '#87d9cd', '#ef9c99'][
    value % 8
  ]!;
export function diagnosticSvg(
  definition: PolyhedronDefinition,
  unwrap: DiceSurfaceUnwrap,
  tens = false,
): string {
  const bodies: string[] = [],
    details: string[] = [];
  for (const face of definition.faces) {
    const points = unwrap.faces[face.value]!.map(([u, v]): Point => [u * SIZE, (1 - v) * SIZE]);
    const polygon = points.map((p) => p.join(',')).join(' ');
    const cx = points.reduce((sum, p) => sum + p[0], 0) / points.length,
      cy = points.reduce((sum, p) => sum + p[1], 0) / points.length;
    const radius = Math.min(...points.map((p) => Math.hypot(p[0] - cx, p[1] - cy)));
    bodies.push(
      `<polygon points="${polygon}" fill="${color(face.value)}" stroke="${color(face.value)}" stroke-width="16" stroke-linejoin="round"/>`,
    );
    details.push(
      `<defs><clipPath id="face-${face.value}"><polygon points="${polygon}"/></clipPath></defs><g clip-path="url(#face-${face.value})"><polygon points="${polygon}" fill="url(#grid)"/><polygon points="${polygon}" fill="none" stroke="#162338" stroke-width="3"/>`,
    );
    for (let edge = 0; edge < points.length; edge++) {
      const a = points[edge]!,
        b = points[(edge + 1) % points.length]!;
      const av = face.indices[edge]!,
        bv = face.indices[(edge + 1) % points.length]!;
      const edgeId = `${Math.min(av, bv)}:${Math.max(av, bv)}`;
      const t = av < bv ? 0.3 : 0.7;
      const mx = a[0] * (1 - t) + b[0] * t,
        my = a[1] * (1 - t) + b[1] * t;
      const dx = cx - mx,
        dy = cy - my,
        distance = Math.hypot(dx, dy);
      details.push(
        `<path d="M ${mx} ${my} l ${(dx / distance) * radius * 0.25} ${(dy / distance) * radius * 0.25}" stroke="#fff" stroke-width="10"/><circle cx="${mx}" cy="${my}" r="6" fill="#132035"/><text x="${(a[0] + b[0]) * 0.43 + cx * 0.14}" y="${(a[1] + b[1]) * 0.43 + cy * 0.14}" font-size="${radius * 0.085}" text-anchor="middle" fill="#142035">${edgeId}</text>`,
      );
    }
    const label = getFaceLabel(definition, face);
    if (typeof label !== 'string' && typeof label !== 'number') {
      label.forEach((value, index) => {
        const p = points[index]!;
        details.push(
          `<text x="${cx * 0.5 + p[0] * 0.5}" y="${cy * 0.5 + p[1] * 0.5}" font-size="${radius * 0.24}" text-anchor="middle" dominant-baseline="central" fill="#101a2d">${value}</text>`,
        );
      });
    } else {
      const display = tens ? (face.value === 10 ? '00' : String(face.value * 10)) : label;
      details.push(
        `<text x="${cx}" y="${cy}" font-size="${radius * 0.5}" font-family="sans-serif" font-weight="bold" text-anchor="middle" dominant-baseline="central" fill="#101a2d" stroke="#fff" stroke-width="1">${display}</text>`,
      );
    }
    details.push(
      `<path d="M ${cx - radius * 0.3} ${cy + radius * 0.35} h ${radius * 0.6} l ${-radius * 0.1} ${-radius * 0.07} m ${radius * 0.1} ${radius * 0.07} l ${-radius * 0.1} ${radius * 0.07}" fill="none" stroke="#142035" stroke-width="3"/><text x="${cx}" y="${cy - radius * 0.32}" font-size="${radius * 0.08}" text-anchor="middle">${definition.id} / F${face.value}</text></g>`,
    );
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}"><defs><pattern id="grid" width="16" height="16" patternUnits="userSpaceOnUse"><path d="M 16 0 H 0 V 16" fill="none" stroke="#142035" stroke-opacity=".2" stroke-width="1"/></pattern></defs>${bodies.join('')}${details.join('')}</svg>\n`;
}

export const DIAGNOSTIC_TYPES = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100', 'd66'] as const;
export async function buildDiagnosticAssets(source: string, runtime: string) {
  await mkdir(join(source, 'diagnostic'), { recursive: true });
  await mkdir(join(runtime, 'previews'), { recursive: true });
  const patterns: DicePatternDefinition[] = [],
    skins: DiceSkinDefinition[] = [];
  await DIAGNOSTIC_TYPES.reduce(async (previous, type) => {
    await previous;
    const definition = getDieGeometry(type === 'd100' ? 'd10' : type === 'd66' ? 'd6' : type);
    const unwrap = createDiagnosticUnwrap(definition);
    const svg = diagnosticSvg(definition, unwrap, type === 'd100' || type === 'd66');
    const name = `diagnostic-${type}`;
    await writeFile(join(source, 'diagnostic', `${name}.svg`), svg);
    await writeFile(join(runtime, 'previews', `${name}.svg`), svg);
    const png = join(source, 'diagnostic', `${name}.png`);
    await writeFile(png, new Resvg(svg).render().asPng());
    const output = join(runtime, 'textures', `${name}.ktx2`);
    const command = Bun.spawn(
      [
        'ktx',
        'create',
        '--format',
        'R8G8B8A8_SRGB',
        '--assign-tf',
        'srgb',
        '--convert-texcoord-origin',
        'bottom-left',
        '--encode',
        'uastc-ldr-4x4',
        '--generate-mipmap',
        '--zstd',
        '12',
        png,
        output,
      ],
      { stdout: 'inherit', stderr: 'inherit' },
    );
    if ((await command.exited) !== 0) throw new Error(`Failed to encode ${name}`);
    const validation = Bun.spawn(['ktx', 'validate', output], {
      stdout: 'inherit',
      stderr: 'inherit',
    });
    if ((await validation.exited) !== 0) throw new Error(`Invalid ${name}`);
    patterns.push({
      id: name,
      baseColor: {
        uri: `./textures/${name}.ktx2`,
        mediaType: 'image/ktx2',
        colorSpace: 'srgb',
        mipmaps: true,
      },
      unwrap: { ...unwrap, preview: { uri: `./previews/${name}.svg`, mediaType: 'image/svg+xml' } },
    });
    skins.push({
      id: name,
      name: `Diagnostic ${type}`,
      materialId: 'diagnostic-matte',
      patternId: name,
    });
  }, Promise.resolve());
  return {
    patterns,
    skins,
    skinSets: [
      {
        id: 'diagnostic',
        name: 'Diagnostic nets',
        skins: Object.fromEntries(DIAGNOSTIC_TYPES.map((type) => [type, `diagnostic-${type}`])),
      },
    ],
  };
}
