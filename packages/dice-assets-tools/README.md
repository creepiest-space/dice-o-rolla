# `@dice-o-rolla/dice-assets-tools`

TypeScript API and CLI for painting connected dice nets and building KTX2 skin sets. Requires
Node.js 20+ or Bun. Install KTX-Software (`ktx` on PATH) for encoding; template export works without it.

```sh
npm install --save-dev @dice-o-rolla/dice-assets-tools
npx dice-assets template --types d6 --id painted --out ./art/painted
# Paint the artwork layer and edit labels in art/painted/d6.svg.
npx dice-assets build --input ./art/painted/skin-set.source.json --out ./public/dice/painted
```

Use `--types standard` for all standard shapes and d100/d66 tens variants. Templates default to
2048 × 2048; `--size` accepts square powers of two from 64 to 8192. The groups `artwork` and `labels`
are rasterized; `guides` is removed. Embed linked images before building. Source manifests accept
SVG/PNG base color and optional, equally sized PNG normal and ORM maps. Encoding uses sRGB base
color, linear PBR maps, bottom-left orientation, mipmaps and KTX validation.

The output must be new unless `--overwrite` is supplied. That flag replaces the entire destination
after a successful build; keep sources elsewhere. Failures leave an existing destination intact.
`--ktx /path/to/ktx` selects the encoder executable.

```ts
import {
  createTextureTemplate,
  writeTextureTemplates,
  buildTexturedSkinSet,
} from '@dice-o-rolla/dice-assets-tools';

const template = createTextureTemplate('d6', { size: 2048 });
await writeTextureTemplates({ outputDirectory: './art/custom', types: ['d6'], id: 'custom' });
const built = await buildTexturedSkinSet({
  input: './art/custom/skin-set.source.json',
  outputDirectory: './public/dice/custom',
});
console.log(template.unwrap, built.catalog);
```

The package exports the source-manifest and option types with the functions. Use
`prepareTexturedSkinSet` from `@dice-o-rolla/dice-assets` in the browser to connect the generated
catalog; keep this tooling package out of browser imports.

[Complete authoring and connection guide](https://github.com/creepiest-space/dice-o-rolla/blob/main/docs/textured-unwraps.md).

Repository checks: `bun run test` runs unit tests; `bun run test:integration` requires the real
`ktx` executable and checks KTX output, guide removal and atomic replacement.

Licensed under Apache-2.0. See `LICENSE`, `NOTICE` and `THIRD_PARTY_NOTICES.md`.
