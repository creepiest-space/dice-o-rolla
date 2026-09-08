import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DOMParser } from '@xmldom/xmldom';

import {
  createTextureTemplate,
  writeTextureTemplates,
  buildTexturedSkinSet,
  TEXTURE_TEMPLATE_TYPES,
} from '../../src/tools/index.js';
import { writeDirectory } from '../../src/tools/write-directory.js';

const temporary: string[] = [];
async function directory() {
  const path = await mkdtemp(join(tmpdir(), 'dice-authoring-'));
  temporary.push(path);
  return path;
}
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});
const rejection = (promise: Promise<unknown>) =>
  promise.then(
    () => 'unexpected success',
    (error: unknown) => (error instanceof Error ? error.message : String(error)),
  );

for (const type of TEXTURE_TEMPLATE_TYPES)
  test(`${type} has editable layers and geometry-aligned UVs`, () => {
    const template = createTextureTemplate(type, { size: 256 });
    const document = new DOMParser().parseFromString(template.svg, 'image/svg+xml');
    expect(
      ['artwork', 'labels', 'guides'].every((id) => document.getElementById(id) !== null),
    ).toBe(true);
    expect(template.unwrap.geometryId).toBe(type === 'd100' ? 'd10' : type === 'd66' ? 'd6' : type);
    if (type === 'd100') expect(document.getElementById('labels')!.textContent).toContain('00');
    if (type === 'd66') expect(document.getElementById('labels')!.textContent).toContain('60');
    if (type === 'd4')
      expect(document.getElementById('labels')!.getElementsByTagName('text')).toHaveLength(12);
  });

test('writes a source manifest and refuses accidental overwrites', async () => {
  const root = await directory(),
    out = join(root, 'source');
  const manifest = await writeTextureTemplates({
    outputDirectory: out,
    types: ['d6'],
    id: 'painted',
    size: 128,
  });
  expect(manifest.dice.d6).toEqual({ unwrap: 'd6.uv.json', baseColor: 'd6.svg' });
  expect((await readdir(out)).toSorted()).toEqual(['d6.svg', 'd6.uv.json', 'skin-set.source.json']);
  expect(await rejection(writeTextureTemplates({ outputDirectory: out, types: ['d6'] }))).toContain(
    'already exists',
  );
  expect(() => createTextureTemplate('d6', { size: 257 })).toThrow('power of two');
});

test('validates input before encoding and preserves output on failed KTX encoding', async () => {
  const root = await directory(),
    source = join(root, 'source'),
    output = join(root, 'output');
  await writeTextureTemplates({ outputDirectory: source, types: ['d6'], size: 64 });
  await writeDirectory(output, false, async (path) => {
    await writeFile(join(path, 'sentinel'), 'keep');
  });
  const options = {
    input: join(source, 'skin-set.source.json'),
    outputDirectory: output,
    overwrite: true,
    ktxExecutable: join(root, 'missing-ktx'),
  };
  expect(await rejection(buildTexturedSkinSet(options))).toContain('KTX CLI was not found');
  expect(await readFile(join(output, 'sentinel'), 'utf8')).toBe('keep');
  expect((await readdir(root)).toSorted()).toEqual(['output', 'source']);
  await writeFile(join(source, 'd6.uv.json'), JSON.stringify({ geometryId: 'd4', faces: {} }));
  expect(await rejection(buildTexturedSkinSet(options))).toContain('unwrap geometry must be d6');
}, 30000);

test('rejects malformed SVG and mismatched PBR dimensions', async () => {
  const root = await directory(),
    source = join(root, 'source');
  await writeTextureTemplates({ outputDirectory: source, types: ['d6'], size: 64 });
  await writeFile(join(source, 'd6.svg'), '<svg><g></svg>');
  const options = {
    input: join(source, 'skin-set.source.json'),
    outputDirectory: join(root, 'out'),
  };
  expect(await rejection(buildTexturedSkinSet(options))).toContain('Invalid SVG');
  await writeFile(join(source, 'd6.svg'), createTextureTemplate('d6', { size: 128 }).svg);
  const { Resvg } = await import('@resvg/resvg-js');
  await writeFile(
    join(source, 'normal.png'),
    new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"/>').render().asPng(),
  );
  await writeFile(
    options.input,
    JSON.stringify({
      schemaVersion: 1,
      id: 'test',
      dice: { d6: { unwrap: 'd6.uv.json', baseColor: 'd6.svg', normal: 'normal.png' } },
    }),
  );
  expect(await rejection(buildTexturedSkinSet(options))).toContain('dimensions must match');
}, 30000);

test('CLI reports usage errors with a nonzero status', async () => {
  const child = Bun.spawn(
    [
      process.execPath,
      join(import.meta.dir, '../../src/tools/cli.ts'),
      'template',
      '--types',
      'd7',
      '--out',
      'unused',
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  const error = await new Response(child.stderr).text();
  expect(await child.exited).toBe(1);
  expect(error).toContain('Unsupported dice texture type');
});
