import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Resvg } from '@resvg/resvg-js';

const root = join(import.meta.dir, '..', 'assets');
const source = join(root, 'source');
const runtime = join(root, 'runtime');
interface PipelineConfig {
  readonly textures: readonly {
    readonly input: string;
    readonly output: string;
    readonly colorSpace: 'srgb' | 'linear';
  }[];
  readonly atlases: readonly {
    readonly input: string;
    readonly intermediate: string;
    readonly output: string;
    readonly width: number;
  }[];
  readonly sprites: readonly {
    readonly id: string;
    readonly output: string;
    readonly clips: readonly {
      readonly id: string;
      readonly input: string;
      readonly durationSeconds: number;
    }[];
  }[];
}
const pipelineSource: unknown = JSON.parse(await readFile(join(source, 'pipeline.json'), 'utf8'));
if (!isPipelineConfig(pipelineSource)) throw new TypeError('Invalid asset pipeline config');
const pipeline = pipelineSource;
await mkdir(join(runtime, 'textures'), { recursive: true });
await mkdir(join(runtime, 'audio'), { recursive: true });

await Promise.all(
  pipeline.atlases.map(async (atlas) => {
    const svg = await readFile(join(source, atlas.input));
    const atlasPng = new Resvg(svg, { fitTo: { mode: 'width', value: atlas.width } })
      .render()
      .asPng();
    await writeFile(join(source, atlas.intermediate), atlasPng);
  }),
);

await Promise.all([
  ...pipeline.textures.map((texture) =>
    ktx(texture.input, texture.output, texture.colorSpace === 'srgb'),
  ),
  ...pipeline.atlases.map((atlas) => ktx(atlas.intermediate, atlas.output, true)),
  ...pipeline.sprites.map((definition) =>
    sprite(
      definition.clips.map(({ input }) => input),
      definition.output,
    ),
  ),
]);

const ktxRef = (uri: string, colorSpace: 'srgb' | 'linear') => ({
  uri,
  mediaType: 'image/ktx2',
  colorSpace,
  mipmaps: true,
});
const faces = Object.fromEntries(
  Array.from({ length: 20 }, (_, index) => [
    String(index + 1),
    {
      x: (index % 5) * 128,
      y: Math.floor(index / 5) * 128,
      width: 128,
      height: 128,
    },
  ]),
);
const catalog = {
  schemaVersion: 1,
  audioSprites: pipeline.sprites.map((definition) => ({
    id: definition.id,
    audio: { uri: `./audio/${definition.output}`, mediaType: 'audio/webm; codecs=opus' },
    channels: 1,
    clips: Object.fromEntries(
      definition.clips.map((clip, index) => [
        clip.id,
        {
          offsetSeconds: definition.clips
            .slice(0, index)
            .reduce((total, item) => total + item.durationSeconds, 0),
          durationSeconds: clip.durationSeconds,
        },
      ]),
    ),
  })),
  audioBanks: [
    {
      id: 'procedural-resin',
      kind: 'die-material',
      spriteId: 'procedural-resin',
      clipIds: ['hit1', 'hit2'],
      forceRange: [0.5, 140],
      gainRange: [0.025, 0.85],
      pitchVariationCents: 28,
      gainVariation: 0.05,
      maxVoices: 8,
    },
    {
      id: 'procedural-wood',
      kind: 'surface-material',
      spriteId: 'procedural-wood',
      clipIds: ['hit1', 'hit2'],
      forceRange: [0.5, 140],
      gainRange: [0.015, 0.55],
      pitchVariationCents: 22,
      gainVariation: 0.04,
      maxVoices: 8,
    },
  ],
  materials: [
    {
      id: 'procedural-resin',
      roughness: 0.34,
      metalness: 0.04,
      normalScale: 0.6,
      clearcoat: 0.18,
      clearcoatRoughness: 0.2,
    },
  ],
  patterns: [
    {
      id: 'procedural-speckle',
      baseColor: ktxRef('./textures/speckle-base.ktx2', 'srgb'),
      normal: ktxRef('./textures/speckle-normal.ktx2', 'linear'),
      orm: ktxRef('./textures/speckle-orm.ktx2', 'linear'),
    },
  ],
  faces: [
    {
      id: 'procedural-digits',
      texture: ktxRef('./textures/digits.ktx2', 'srgb'),
      width: 640,
      height: 512,
      faces,
    },
  ],
  skins: [
    {
      id: 'procedural-amethyst',
      materialId: 'procedural-resin',
      patternId: 'procedural-speckle',
      faceAtlasId: 'procedural-digits',
      tint: '#d8bcff',
      labelColor: '#fff8dc',
      hueRotation: 0.04,
      saturation: 1.08,
      composite: 'multiply',
    },
  ],
};
await writeFile(join(runtime, 'catalog.json'), `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`Built production assets in ${runtime}`);

async function ktx(input: string, output: string, srgb: boolean): Promise<void> {
  await run([
    'ktx',
    'create',
    '--format',
    srgb ? 'R8G8B8A8_SRGB' : 'R8G8B8A8_UNORM',
    '--assign-tf',
    srgb ? 'srgb' : 'linear',
    '--encode',
    'uastc-ldr-4x4',
    '--generate-mipmap',
    '--zstd',
    '12',
    join(source, input),
    join(runtime, output),
  ]);
  await run(['ktx', 'validate', join(runtime, output)]);
}

async function sprite(inputs: string[], output: string): Promise<void> {
  const inputArgs = inputs.flatMap((file) => ['-i', join(source, 'audio', file)]);
  const streams = inputs.map((_, index) => `[${index}:a]`).join('');
  await run([
    'ffmpeg',
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    ...inputArgs,
    '-filter_complex',
    `${streams}concat=n=${inputs.length}:v=0:a=1[out]`,
    '-map',
    '[out]',
    '-ac',
    '1',
    '-c:a',
    'libopus',
    '-b:a',
    '64k',
    '-fflags',
    '+bitexact',
    '-flags:a',
    '+bitexact',
    '-map_metadata',
    '-1',
    join(runtime, 'audio', output),
  ]);
}

async function run(command: string[]): Promise<void> {
  const process = Bun.spawn(command, { stdout: 'inherit', stderr: 'inherit' });
  if ((await process.exited) !== 0)
    throw new Error(`Asset command failed: ${command[0]} ${command[1] ?? ''}`);
}

function isPipelineConfig(value: unknown): value is PipelineConfig {
  if (!isRecord(value)) return false;
  if (!Array.isArray(value.textures)) return false;
  if (!Array.isArray(value.atlases)) return false;
  if (!Array.isArray(value.sprites)) return false;
  return (
    value.textures.every((item: unknown) => hasStrings(item, ['input', 'output', 'colorSpace'])) &&
    value.atlases.every(
      (item: unknown) =>
        hasStrings(item, ['input', 'intermediate', 'output']) &&
        'width' in item &&
        typeof item.width === 'number',
    ) &&
    value.sprites.every(
      (item: unknown) =>
        hasStrings(item, ['id', 'output']) &&
        'clips' in item &&
        Array.isArray(item.clips) &&
        item.clips.every(
          (clip: unknown) =>
            hasStrings(clip, ['id', 'input']) &&
            'durationSeconds' in clip &&
            typeof clip.durationSeconds === 'number',
        ),
    )
  );
}

function hasStrings(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return isRecord(value) && keys.every((key) => typeof value[key] === 'string');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}
