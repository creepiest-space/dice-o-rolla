#!/usr/bin/env node
import { parseArgs } from 'node:util';

import { buildTexturedSkinSet } from './build.js';
import { assertTemplateType, writeTextureTemplates } from './template.js';
import { TEXTURE_TEMPLATE_TYPES, type TextureTemplateType } from './types.js';

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    options: {
      help: { type: 'boolean' },
      types: { type: 'string' },
      out: { type: 'string' },
      input: { type: 'string' },
      id: { type: 'string' },
      size: { type: 'string' },
      overwrite: { type: 'boolean' },
      ktx: { type: 'string' },
    },
    allowPositionals: true,
  });
  if (values.help || positionals.length === 0) {
    console.log(
      'dice-assets template --types d6|standard|d4,d6 --out DIR [--id custom] [--size 2048]\ndice-assets build --input skin-set.source.json --out DIR [--ktx PATH]\nUse --overwrite to replace the entire destination directory after success.',
    );
    return;
  }
  if (positionals.length !== 1 || values.out === undefined)
    throw new Error('Specify one command and --out DIR; see --help');
  const shared = { outputDirectory: values.out, overwrite: values.overwrite ?? false };
  if (positionals[0] === 'template') {
    if (values.input !== undefined || values.ktx !== undefined)
      throw new Error('--input and --ktx are build options');
    const types: readonly TextureTemplateType[] =
      values.types === undefined || values.types === 'standard'
        ? TEXTURE_TEMPLATE_TYPES
        : values.types.split(',').map((value) => {
            assertTemplateType(value);
            return value;
          });
    await writeTextureTemplates({
      ...shared,
      types,
      ...(values.id === undefined ? {} : { id: values.id }),
      ...(values.size === undefined ? {} : { size: Number(values.size) }),
    });
    console.log(`Templates written to ${values.out}`);
  } else if (positionals[0] === 'build') {
    if (
      values.input === undefined ||
      values.types !== undefined ||
      values.id !== undefined ||
      values.size !== undefined
    )
      throw new Error('build requires --input and does not accept template options');
    await buildTexturedSkinSet({
      ...shared,
      input: values.input,
      ...(values.ktx === undefined ? {} : { ktxExecutable: values.ktx }),
    });
    console.log(`Catalog written to ${values.out}/catalog.json`);
  } else throw new Error(`Unknown command: ${positionals[0]}`);
}
void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
