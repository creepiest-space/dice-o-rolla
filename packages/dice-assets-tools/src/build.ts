import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';

import {
  DiceAssetRegistry,
  type DiceAssetCatalogManifest,
  type DiceSurfaceUnwrap,
  type RuntimeTextureReference,
} from '@dice-o-rolla/dice-assets';
import { getDieGeometry } from '@dice-o-rolla/dice-geometry';
import { validateSurfaceUvs } from '@dice-o-rolla/dice-renderer-three';
import { Resvg } from '@resvg/resvg-js';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

import { assertImageSize, assertPortableId, assertTemplateType, geometryType } from './template.js';
import type {
  BuildTexturedSkinSetOptions,
  BuiltTexturedSkinSet,
  TexturedSkinSetSource,
  TextureTemplateType,
} from './types.js';
import { writeDirectory } from './write-directory.js';

const execute = promisify(execFile);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
function assertSource(value: unknown): asserts value is TexturedSkinSetSource {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    typeof value.id !== 'string' ||
    !isRecord(value.dice)
  )
    throw new TypeError('Source manifest requires schemaVersion 1, id and dice');
  assertPortableId(value.id);
  if (value.name !== undefined && typeof value.name !== 'string')
    throw new TypeError('name must be a string');
  if (value.material !== undefined) {
    if (!isRecord(value.material)) throw new TypeError('material must be an object');
    const material = value.material;
    for (const key of ['roughness', 'metalness'])
      if (typeof material[key] !== 'number' || !Number.isFinite(material[key]))
        throw new TypeError(`material.${key} must be a finite number`);
    for (const key of ['normalScale', 'clearcoat', 'clearcoatRoughness'])
      if (
        material[key] !== undefined &&
        (typeof material[key] !== 'number' || !Number.isFinite(material[key]))
      )
        throw new TypeError(`material.${key} must be a finite number`);
    if (
      material.metadata !== undefined &&
      (!isRecord(material.metadata) ||
        !Object.values(material.metadata).every(
          (item) =>
            typeof item === 'string' ||
            typeof item === 'boolean' ||
            (typeof item === 'number' && Number.isFinite(item)),
        ))
    )
      throw new TypeError('Invalid material metadata');
  }
  if (Object.keys(value.dice).length === 0)
    throw new TypeError('Source manifest must contain at least one die');
  for (const [type, entry] of Object.entries(value.dice)) {
    assertTemplateType(type);
    if (
      !isRecord(entry) ||
      typeof entry.unwrap !== 'string' ||
      entry.unwrap.length === 0 ||
      typeof entry.baseColor !== 'string' ||
      entry.baseColor.length === 0
    )
      throw new TypeError(`${type} requires unwrap and baseColor paths`);
    for (const map of ['normal', 'orm'])
      if (entry[map] !== undefined && (typeof entry[map] !== 'string' || entry[map].length === 0))
        throw new TypeError(`${type}.${map} must be a path`);
  }
}

function svgWithoutGuides(source: string): string {
  const document = new DOMParser({
    onError: (_level, message) => {
      throw new Error(`Invalid SVG: ${message}`);
    },
  }).parseFromString(source, 'image/svg+xml');
  if (document.doctype !== null || document.documentElement?.localName !== 'svg')
    throw new Error('Expected an SVG document without a doctype');
  const elements = Array.from(document.getElementsByTagName('*'));
  for (const element of elements) {
    if (element.localName === 'script') throw new Error('SVG scripts are not supported');
    if (element.getAttribute('id') === 'guides') element.parentNode?.removeChild(element);
    const href = element.getAttribute('href') ?? element.getAttribute('xlink:href');
    if (href && !href.startsWith('#') && !/^data:image\/(?:png|jpeg|webp);base64,/i.test(href))
      throw new Error('Embed linked SVG images as PNG/JPEG/WebP data URIs before building');
  }
  return new XMLSerializer().serializeToString(document);
}
interface ImageSource {
  readonly png: Buffer;
  readonly size: number;
  readonly preview: Buffer | string;
  readonly extension: 'svg' | 'png';
}
async function loadImage(path: string, allowSvg: boolean): Promise<ImageSource> {
  const bytes = await readFile(path),
    extension = extname(path).toLowerCase();
  let png: Buffer, preview: Buffer | string;
  if (extension === '.svg' && allowSvg) {
    preview = bytes.toString('utf8');
    const svg = svgWithoutGuides(preview);
    const renderer = new Resvg(svg);
    if (renderer.width !== renderer.height) throw new RangeError(`${path}: texture must be square`);
    assertImageSize(renderer.width);
    png = renderer.render().asPng();
  } else if (extension === '.png') {
    png = bytes;
    preview = bytes;
  } else throw new Error(`${path}: expected ${allowSvg ? 'SVG or PNG' : 'PNG'}`);
  if (png.length < 24 || !png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    throw new Error(`${path}: invalid PNG`);
  const size = png.readUInt32BE(16);
  if (size !== png.readUInt32BE(20)) throw new RangeError(`${path}: texture must be square`);
  assertImageSize(size);
  return { png, size, preview, extension: extension === '.svg' ? 'svg' : 'png' };
}
async function runKtx(executable: string, args: readonly string[]): Promise<void> {
  try {
    await execute(executable, [...args], { maxBuffer: 8 * 1024 * 1024 });
  } catch (error) {
    if (isRecord(error) && error.code === 'ENOENT')
      throw new Error(
        'KTX CLI was not found. Install KTX-Software and put ktx on PATH, or set ktxExecutable.',
        { cause: error },
      );
    throw new Error(
      `KTX ${args[0]} failed: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

export async function buildTexturedSkinSet(
  options: BuildTexturedSkinSetOptions,
): Promise<BuiltTexturedSkinSet> {
  const input = resolve(options.input),
    output = resolve(options.outputDirectory);
  const toInput = relative(output, input);
  if (
    !isAbsolute(toInput) &&
    toInput !== '..' &&
    !toInput.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)
  )
    throw new Error('Keep the source manifest outside the output directory');
  const source: unknown = JSON.parse(await readFile(input, 'utf8'));
  assertSource(source);
  const root = dirname(input);
  const material = {
    ...source.material,
    roughness: source.material?.roughness ?? 0.7,
    metalness: source.material?.metalness ?? 0,
    id: `${source.id}-material`,
  };
  const prepared = await Promise.all(
    Object.entries(source.dice).map(async ([rawType, entry]) => {
      assertTemplateType(rawType);
      const raw: unknown = JSON.parse(await readFile(resolve(root, entry.unwrap), 'utf8'));
      if (!isRecord(raw) || raw.geometryId !== geometryType(rawType) || !isRecord(raw.faces))
        throw new Error(`${rawType}: unwrap geometry must be ${geometryType(rawType)}`);
      const faces: Record<number, readonly (readonly [number, number])[]> = {};
      for (const [key, coordinates] of Object.entries(raw.faces)) {
        if (!/^[1-9]\d*$/.test(key) || !Array.isArray(coordinates))
          throw new TypeError(`${rawType}: invalid face ${key}`);
        faces[Number(key)] = coordinates.map((uv: unknown) => {
          if (
            !Array.isArray(uv) ||
            uv.length !== 2 ||
            typeof uv[0] !== 'number' ||
            typeof uv[1] !== 'number'
          )
            throw new TypeError(`${rawType}: invalid UV on face ${key}`);
          return [uv[0], uv[1]] as const;
        });
      }
      const unwrap: DiceSurfaceUnwrap = { geometryId: geometryType(rawType), faces };
      validateSurfaceUvs(getDieGeometry(geometryType(rawType)), unwrap.faces);
      const [baseColor, normal, orm] = await Promise.all([
        loadImage(resolve(root, entry.baseColor), true),
        entry.normal === undefined ? undefined : loadImage(resolve(root, entry.normal), false),
        entry.orm === undefined ? undefined : loadImage(resolve(root, entry.orm), false),
      ]);
      if (
        (normal !== undefined && normal.size !== baseColor.size) ||
        (orm !== undefined && orm.size !== baseColor.size)
      )
        throw new Error(`${rawType}: baseColor, normal and ORM dimensions must match`);
      return { type: rawType, unwrap, baseColor, normal, orm };
    }),
  );
  const catalog: DiceAssetCatalogManifest = {
    schemaVersion: 1,
    materials: [material],
    patterns: prepared.map((die) => ({
      id: `${source.id}-${die.type}`,
      baseColor: texture(die.type, 'baseColor'),
      ...(die.normal === undefined ? {} : { normal: texture(die.type, 'normal') }),
      ...(die.orm === undefined ? {} : { orm: texture(die.type, 'orm') }),
      unwrap: {
        geometryId: die.unwrap.geometryId,
        faces: die.unwrap.faces,
        preview: {
          uri: `./previews/${die.type}.${die.baseColor.extension}`,
          mediaType: die.baseColor.extension === 'svg' ? 'image/svg+xml' : 'image/png',
        },
      },
    })),
    skins: prepared.map((die) => ({
      id: `${source.id}-${die.type}`,
      materialId: material.id,
      patternId: `${source.id}-${die.type}`,
    })),
    skinSets: [
      {
        id: source.id,
        ...(source.name === undefined ? {} : { name: source.name }),
        skins: Object.fromEntries(prepared.map((die) => [die.type, `${source.id}-${die.type}`])),
      },
    ],
  };
  new DiceAssetRegistry().registerCatalog(catalog);
  const executable = options.ktxExecutable ?? 'ktx';
  await writeDirectory(output, options.overwrite ?? false, async (staging) => {
    await Promise.all(
      ['textures', 'previews', '.intermediate'].map((directory) => mkdir(join(staging, directory))),
    );
    await prepared.reduce(async (previous, die) => {
      await previous;
      await writeFile(
        join(staging, 'previews', `${die.type}.${die.baseColor.extension}`),
        die.baseColor.preview,
      );
      await (['baseColor', 'normal', 'orm'] as const).reduce(async (prior, map) => {
        await prior;
        const image = die[map];
        if (image === undefined) return;
        const pngPath = join(staging, '.intermediate', `${die.type}-${map}.png`),
          outputPath = join(staging, 'textures', `${die.type}-${map}.ktx2`);
        await writeFile(pngPath, image.png);
        await runKtx(executable, [
          'create',
          '--format',
          map === 'baseColor' ? 'R8G8B8A8_SRGB' : 'R8G8B8A8_UNORM',
          '--assign-tf',
          map === 'baseColor' ? 'srgb' : 'linear',
          '--convert-texcoord-origin',
          'bottom-left',
          '--encode',
          'uastc-ldr-4x4',
          '--generate-mipmap',
          '--zstd',
          '12',
          pngPath,
          outputPath,
        ]);
        await runKtx(executable, ['validate', outputPath]);
      }, Promise.resolve());
    }, Promise.resolve());
    await writeFile(join(staging, 'catalog.json'), `${JSON.stringify(catalog, null, 2)}\n`);
    const { rm } = await import('node:fs/promises');
    await rm(join(staging, '.intermediate'), { recursive: true });
  });
  return { outputDirectory: output, catalog };
}

const texture = (type: TextureTemplateType, map: string): RuntimeTextureReference => ({
  uri: `./textures/${type}-${map}.ktx2`,
  mediaType: 'image/ktx2',
  colorSpace: map === 'baseColor' ? 'srgb' : 'linear',
  mipmaps: true,
});
