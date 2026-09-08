import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { createStandardDiceNet, getDieGeometry } from '@dice-o-rolla/dice-geometry';
import { getFaceLabel } from '@dice-o-rolla/dice-renderer-three';

import {
  TEXTURE_TEMPLATE_TYPES,
  type TextureTemplate,
  type TextureTemplateType,
  type TexturedSkinSetSource,
  type WriteTextureTemplatesOptions,
} from './types.js';
import { writeDirectory } from './write-directory.js';

export function geometryType(type: TextureTemplateType) {
  return type === 'd100' ? 'd10' : type === 'd66' ? 'd6' : type;
}
export function assertImageSize(size: number): void {
  if (!Number.isSafeInteger(size) || size < 64 || size > 8192 || (size & (size - 1)) !== 0)
    throw new RangeError('Texture size must be a power of two between 64 and 8192');
}
export function assertTemplateType(type: string): asserts type is TextureTemplateType {
  if (!TEXTURE_TEMPLATE_TYPES.some((value) => value === type))
    throw new RangeError(`Unsupported dice texture type: ${type}`);
}
export function assertPortableId(id: string): void {
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(id))
    throw new RangeError('Skin set id must contain only letters, digits, underscores and hyphens');
}

export function createTextureTemplate(
  type: TextureTemplateType,
  options: { readonly size?: number } = {},
): TextureTemplate {
  assertTemplateType(type);
  const size = options.size ?? 2048;
  assertImageSize(size);
  const unwrap = createStandardDiceNet(geometryType(type));
  const geometry = getDieGeometry(geometryType(type));
  const artwork: string[] = [],
    labels: string[] = [],
    guides: string[] = [];
  for (const face of geometry.faces) {
    const points = unwrap.faces[face.value]!.map(([u, v]) => [u * size, (1 - v) * size] as const);
    const polygon = points.map((point) => point.join(',')).join(' ');
    const cx = points.reduce((sum, p) => sum + p[0], 0) / points.length,
      cy = points.reduce((sum, p) => sum + p[1], 0) / points.length;
    const radius = Math.min(...points.map((p) => Math.hypot(p[0] - cx, p[1] - cy)));
    artwork.push(
      `<polygon id="art-face-${face.value}" points="${polygon}" fill="#e0e6ed" stroke="#e0e6ed" stroke-width="${size / 128}" stroke-linejoin="round"/>`,
    );
    guides.push(
      `<polygon points="${polygon}" fill="none" stroke="#d72b65" stroke-width="${size / 1024}"/><text x="${cx}" y="${cy - radius * 0.3}" font-size="${radius * 0.09}" text-anchor="middle">${type} / face ${face.value}</text>`,
    );
    for (let edge = 0; edge < points.length; edge++) {
      const a = points[edge]!,
        b = points[(edge + 1) % points.length]!;
      const av = face.indices[edge]!,
        bv = face.indices[(edge + 1) % points.length]!;
      guides.push(
        `<text x="${(a[0] + b[0]) * 0.43 + cx * 0.14}" y="${(a[1] + b[1]) * 0.43 + cy * 0.14}" font-size="${radius * 0.08}" text-anchor="middle">${Math.min(av, bv)}:${Math.max(av, bv)}</text>`,
      );
    }
    const label = getFaceLabel(geometry, face);
    if (typeof label === 'string' || typeof label === 'number') {
      const display =
        type === 'd100'
          ? face.value === 10
            ? '00'
            : String(face.value * 10)
          : type === 'd66'
            ? String(face.value * 10)
            : String(label);
      labels.push(
        `<text x="${cx}" y="${cy}" font-size="${radius * 0.5}" text-anchor="middle" dominant-baseline="central">${display}</text>`,
      );
    } else {
      for (const [index, value] of label.entries()) {
        const point = points[index]!;
        labels.push(
          `<text x="${(cx + point[0]) / 2}" y="${(cy + point[1]) / 2}" font-size="${radius * 0.24}" text-anchor="middle" dominant-baseline="central">${value}</text>`,
        );
      }
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" font-family="sans-serif" fill="#172535">${layer('artwork', artwork)}${layer('labels', labels)}${layer('guides', guides)}</svg>\n`;
  return { type, unwrap, svg };
}

export async function writeTextureTemplates(
  options: WriteTextureTemplatesOptions,
): Promise<TexturedSkinSetSource> {
  const id = options.id ?? 'custom';
  assertPortableId(id);
  const types = options.types ?? TEXTURE_TEMPLATE_TYPES;
  if (types.length === 0 || new Set(types).size !== types.length)
    throw new RangeError('Choose at least one distinct dice type');
  const templates = types.map((type) =>
    createTextureTemplate(type, options.size === undefined ? {} : { size: options.size }),
  );
  const manifest: TexturedSkinSetSource = {
    schemaVersion: 1,
    id,
    name: id,
    material: { roughness: 0.7, metalness: 0 },
    dice: Object.fromEntries(
      templates.map((template) => [
        template.type,
        { unwrap: `${template.type}.uv.json`, baseColor: `${template.type}.svg` },
      ]),
    ),
  };
  await writeDirectory(options.outputDirectory, options.overwrite ?? false, async (directory) => {
    await Promise.all(
      templates.flatMap((template) => [
        writeFile(join(directory, `${template.type}.svg`), template.svg),
        writeFile(
          join(directory, `${template.type}.uv.json`),
          `${JSON.stringify(template.unwrap, null, 2)}\n`,
        ),
      ]),
    );
    await writeFile(
      join(directory, 'skin-set.source.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
  });
  return manifest;
}

const layer = (id: string, contents: string[]) =>
  `<g id="${id}" inkscape:groupmode="layer" inkscape:label="${id}">${contents.join('')}</g>`;
