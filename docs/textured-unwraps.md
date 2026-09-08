# Preparing and connecting textured dice nets

Use a connected SVG template to paint a die, build compressed textures, then register the resulting
skin set in an application. The same UV layout drives the template and the renderer. Standard
layouts cover d4, d6, d8, d10, d12 and d20, with separate artwork variants for d100 and d66 tens.

## Install the tools

In a consumer project:

```sh
npm install @dice-o-rolla/dice-engine @dice-o-rolla/dice-assets three
npm install --save-dev @dice-o-rolla/dice-assets-tools
```

The authoring CLI runs on Node.js 20+ or Bun. Install KTX-Software so `ktx --version` works; encoding
uses its `create` and `validate` commands. Template export does not require KTX-Software.

Inside this repository, run `bun install` and `bun run build`, then substitute
`node packages/dice-assets-tools/dist/cli.js` for `npx dice-assets` in the commands below.
`bun packages/dice-assets-tools/dist/cli.js` works as well.

## 1. Export a template

```sh
npx dice-assets template --types d6 --id painted --size 2048 --out ./art/painted
```

This produces `d6.svg`, `d6.uv.json` and `skin-set.source.json`. To prepare a complete set:

```sh
npx dice-assets template --types standard --id painted --out ./art/painted-set
```

`standard` includes the six physical shapes and the d100/d66 tens variants. A comma-separated
selection such as `--types d4,d6,d20` creates a partial set. The defaults are `standard`, an ID of
`custom` and a 2048 × 2048 texture.

Open the SVG in a vector editor. Its named groups are also exposed as Inkscape layers:

| Group     | Purpose                                                              | Included in the built texture |
| --------- | -------------------------------------------------------------------- | ----------------------------- |
| `artwork` | Paint or place embedded images over the neutral face polygons.       | Yes                           |
| `labels`  | Edit the supplied numbers and their appearance.                      | Yes                           |
| `guides`  | Face boundaries, physical face values and matching edge identifiers. | No                            |

Keep the document size, face positions and UV file aligned. The build removes the `guides` group
using an XML parser, including anything nested inside it. Keep those IDs when saving the SVG.
Embedded PNG/JPEG/WebP images are supported; convert linked images to embedded data before building.
If you export PNG instead, hide the guides yourself and update `baseColor` in the source manifest.

The artwork polygons extend past their boundaries by a small amount. Continue your artwork into
this padding at cut edges to reduce dark fringes in mipmaps. Matching edge IDs identify the two
sides of a physical edge. Padding cannot make an arbitrary drawing seamless: match the artwork on
both sides of every cut. Preserve the net's outer margin when painting.

Numbers are baked into the resulting texture. d4 templates place numbers at vertices. The d100
variant uses d10 geometry with 00–90 labels; d66 tens use d6 geometry with 10–60 labels. Their units
components use ordinary d10/d6 skins. The renderer does not rewrite baked numbers when a preset's
`faceLabels` changes.

## 2. Configure and build the source set

The generated source manifest can be edited directly:

```json
{
  "schemaVersion": 1,
  "id": "painted",
  "name": "Painted dice",
  "material": { "roughness": 0.7, "metalness": 0 },
  "dice": {
    "d6": { "unwrap": "d6.uv.json", "baseColor": "d6.svg" }
  }
}
```

Paths resolve relative to the manifest. Omit `material` to use roughness 0.7 and metalness 0; when
providing it, supply both fields. Optional material fields are `normalScale`, `clearcoat`,
`clearcoatRoughness` and metadata. Set IDs accept letters, digits, underscores and hyphens.

To add PBR detail, add `normal` and/or `orm` PNG paths to a die entry. All maps for that die must
have the same square dimensions, with a power-of-two side between 64 and 8192 pixels.

| Map         | Source format | Encoding | Channel convention                         |
| ----------- | ------------- | -------- | ------------------------------------------ |
| `baseColor` | SVG or PNG    | sRGB     | Color and optional alpha                   |
| `normal`    | PNG           | Linear   | Tangent-space normal, OpenGL +Y convention |
| `orm`       | PNG           | Linear   | R: occlusion, G: roughness, B: metalness   |

```sh
npx dice-assets build --input ./art/painted/skin-set.source.json --out ./public/dice/painted
```

The build validates the manifest, UV coverage and map dimensions before encoding. It rasterizes SVG
without guides, produces UASTC KTX2 with mipmaps and Zstd compression, uses a bottom-left texture
origin and validates each KTX2 file. It writes `catalog.json`, `textures/` and `previews/`; intermediate
PNGs remain outside the published result. Previews retain the source guides for inspection.

The destination must be new by default. Use `--overwrite` only for a dedicated generated directory:
it replaces that entire directory after a successful build. Source files must stay outside it.
An encoding or validation failure leaves a previous output unchanged. Concurrent builds targeting
the same output are rejected. `--ktx /path/to/ktx` selects a specific encoder executable.

If encoding manually, use `--convert-texcoord-origin bottom-left`. Compressed KTX2 data cannot rely
on Three.js `flipY`. UV pairs in `*.uv.json` are normalized `[u, v]` values with the origin at the
bottom left. Each record key is a physical face value and each pair follows the corresponding
`face.indices` vertex order. Display labels are independent of those keys.

## 3. Host the runtime files

Serve the generated directory intact so relative catalog URLs reach its textures and previews.
Also copy `basis_transcoder.js` and `basis_transcoder.wasm` from
`node_modules/three/examples/jsm/libs/basis/` to your application's public `basis/` directory. Serve
WASM with `application/wasm`; when files are on a different origin, configure CORS for them.
See [browser deployment](security.md) for workers and Content Security Policy.

The tooling package is a development dependency. Browser code imports `dice-assets`, not
`dice-assets-tools`; Resvg, filesystem operations and the KTX process runner stay out of the browser
bundle.

## 4. Prepare and connect the set

This complete composition uses the generated `painted` set. Give the container a visible size in
CSS, for example `width: 100%; height: 400px`.

```ts
import {
  DiceAssetCatalogLoader,
  DiceAssetRegistry,
  ThreeAssetMaterialProvider,
  prepareTexturedSkinSet,
} from '@dice-o-rolla/dice-assets';
import { createDefaultDiceEngine } from '@dice-o-rolla/dice-engine/browser';

export async function createPaintedDice(container: HTMLElement) {
  const registry = new DiceAssetRegistry();
  await new DiceAssetCatalogLoader(registry).load('/dice/painted/catalog.json');

  let provider: ThreeAssetMaterialProvider | undefined;
  const engine = await createDefaultDiceEngine({
    container,
    renderer: {
      materialProvider(renderer) {
        provider = new ThreeAssetMaterialProvider(registry, {
          renderer,
          transcoderPath: '/basis/',
        });
        return provider;
      },
    },
  });

  try {
    if (provider === undefined) throw new Error('Material provider was not created');
    const skinSet = await prepareTexturedSkinSet({
      registry,
      provider,
      skinSetId: 'painted',
    });
    skinSet.register(engine);
    return { engine, skinSet };
  } catch (error) {
    engine.destroy();
    throw error;
  }
}
```

Use the returned selector for both single-die and mixed-set rolls:

```ts
const { engine, skinSet } = await createPaintedDice(container);
const options = { visualPresetSelector: skinSet.visualPresetSelector };
await engine.roll('d6', options);
await engine.roll('d4+d6+d8+d10+d12+d20+d%', options);
const trace = await engine.simulate('d66', { seed: 2026, captureFrames: true, ...options });
await engine.replay(trace);
// When the application removes this view:
engine.destroy();
```

With a partial set, absent shapes and absent tens variants keep the engine's selected defaults.
Registration does not change those defaults. Prepare a second set with another ID or
`presetPrefix` and pass its selector to a subsequent roll to switch sets. Replay uses the captured
presets, so keep their registrations and material provider alive while replaying traces.

`register()` is idempotent for registrations managed by this API, including another prepared handle
with identical content. Conflicting content under the same prefix is rejected. Pre-existing
registrations created outside the helper are handled by the engine's normal conflict checks.
Registration failures roll back the presets added by that call. Treat helper-managed preset IDs as
owned by their bindings instead of unregistering/replacing them externally.

Preparing loads textures but does not register engine presets. All geometry checks happen before
preloading. The provider must use the supplied registry; it owns the textures, not the prepared
handle. Engine destruction disposes its renderer's provider. To reload changed catalog contents,
create a fresh registry and provider; prepared texture caches are not a live asset editor.

## TypeScript authoring API

```ts
import { createStandardDiceNet } from '@dice-o-rolla/dice-geometry';
import {
  createTextureTemplate,
  writeTextureTemplates,
  buildTexturedSkinSet,
} from '@dice-o-rolla/dice-assets-tools';

const uv = createStandardDiceNet('d6');
const template = createTextureTemplate('d6', { size: 2048 });
// uv and template.unwrap use the same layout; template.svg contains editable groups.
await writeTextureTemplates({ outputDirectory: './art/custom', types: ['d6'], id: 'custom' });
const result = await buildTexturedSkinSet({
  input: './art/custom/skin-set.source.json',
  outputDirectory: './public/dice/custom',
});
console.log(uv.geometryId, template.type, result.outputDirectory);
```

| API                                      | Result                                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `createStandardDiceNet(type)`            | `StandardDiceNet`: geometry ID and complete per-corner UVs; no filesystem or renderer dependency. |
| `createTextureTemplate(type, { size? })` | `TextureTemplate`: logical type, unwrap and editable SVG.                                         |
| `writeTextureTemplates(options)`         | Writes templates and source manifest; returns `TexturedSkinSetSource`.                            |
| `buildTexturedSkinSet(options)`          | Returns `BuiltTexturedSkinSet` with output directory and runtime catalog.                         |
| `prepareTexturedSkinSet(options)`        | Returns `PreparedTexturedSkinSet` with immutable presets, registration and a per-roll selector.   |

Preparation options require `registry`, `provider` and `skinSetId`. `presetPrefix` defaults to
`skin-set:<skinSetId>`; optional `soundPackId` is passed through to generated presets. The target
engine only needs `registerVisualPreset` and `unregisterVisualPreset` methods; no engine
implementation or Rapier dependency is introduced by the helper.

## Troubleshooting and verification

| Symptom                                     | Check                                                                                          |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Texture upside down or sampling blank areas | KTX origin must be bottom-left, and UV JSON must match the SVG used to paint.                  |
| Wrong numbers on a percentile die           | Provide the d100 tens variant and pass the prepared selector to `roll`/`simulate`.             |
| Missing or changed numbers                  | Keep the SVG `labels` group visible, or include numbers in the exported PNG.                   |
| Dark seams at distance                      | Extend artwork beyond cut edges and inspect the mipmaps; keep matching edge colors aligned.    |
| Geometry/face validation error              | Do not reorder UV corners or mix files from different dice templates.                          |
| KTX not found                               | Install KTX-Software, check `ktx --version`, or pass `--ktx`.                                  |
| Texture/transcoder loading fails            | Check catalog-relative paths, the trailing slash on `transcoderPath`, HTTP responses and CORS. |

In the repository, run `bun run check:full` for types, unit tests and public API checks. Run
`bun run --cwd packages/dice-assets-tools test:integration` with KTX-Software installed to exercise
real encoding and transactional output. Run `bun run test:e2e` to compare the diagnostic demo with
its fixed visual baselines. CLI preparation is not a browser editor or a model importer.
