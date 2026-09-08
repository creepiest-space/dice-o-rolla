import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  getDieGeometry,
  createStandardDiceNet,
  type PolyhedronDefinition,
} from '@dice-o-rolla/dice-geometry';
import { getFaceLabel } from '@dice-o-rolla/dice-renderer-three';
import { Resvg } from '@resvg/resvg-js';

import type { DicePatternDefinition, DiceSkinDefinition, DiceSurfaceUnwrap } from '../src/types.js';

type Point = readonly [number, number];

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
    const unwrap = createStandardDiceNet(type === 'd100' ? 'd10' : type === 'd66' ? 'd6' : type);
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
