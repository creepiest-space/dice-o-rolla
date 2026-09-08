# `@dice-o-rolla/dice-assets`

Optional production asset system for Dice O Rolla. The dependency direction stays one-way:
engine, physics, and renderer packages never import `dice-assets`; an application opts in and wires
opaque preset IDs to these adapters.

The catalog has independent registries for audio sprites, audio banks, PBR materials, reusable
patterns, skins, skin sets, and face atlases. A skin references assets by ID, so recolor, hue, saturation,
pattern scale, and shader compositing create variants without duplicating KTX2 data.

```ts
import catalog from '@dice-o-rolla/dice-assets/catalog.json' with { type: 'json' };
import {
  DiceAssetRegistry,
  ImpactSoundGate,
  WebAudioSpritePlayer,
} from '@dice-o-rolla/dice-assets';

const assets = new DiceAssetRegistry();
assets.registerCatalog(catalog);

const audio = new WebAudioSpritePlayer(assets, { context: new AudioContext() });
const impactGate = new ImpactSoundGate();
engine.on('roll:start', () => impactGate.clear());
engine.on('die:collision', (event) => impactGate.observeCollision(event));
engine.on('die:impact', (event) => {
  if (!impactGate.consumeImpact(event) || event.soundPackId === undefined) return;
  void audio.playImpact({
    force: event.force,
    dieMaterialBankId: event.soundPackId,
    ...(event.otherDieId === undefined ? { surfaceMaterialBankId: 'classic-wood-table' } : {}),
  });
});
```

Rapier reports contact force on every simulation step while two colliders remain touching.
`ImpactSoundGate` combines that stream with collision start/end events so each physical contact
produces one sound instead of an overlapping retrigger on every fixed step.

For Three.js, pass a `materialProvider` factory to `ThreeDiceRenderer` or `TopDownDiceRenderer`; the
factory receives its active `WebGLRenderer` and can construct `ThreeAssetMaterialProvider`. Call
`prepareSkin()` before dice using that skin can spawn. It loads KTX2 through Three's `KTX2Loader`,
shares texture instances, uses the packed ORM map for AO/roughness/metalness, and composites the face
atlas in the material shader.

## Prepared skin sets

Use `prepareTexturedSkinSet({ registry, provider, skinSetId })` to validate and preload a textured
set. Register the returned handle with `skinSet.register(engine)` and pass
`{ visualPresetSelector: skinSet.visualPresetSelector }` to `engine.roll()` or `engine.simulate()`.
The helper handles paired tens variants, leaves absent types to engine defaults and does not
change defaults during registration. Repeated registrations through the helper are idempotent;
conflicting content is rejected and failed registration rolls back entries added by that call.

The provider must use the same registry and owns the texture lifetime. Use separate registries and
providers when reloading changed assets. For a complete preparation and browser example, see
[Preparing and connecting textured dice nets](https://github.com/creepiest-space/dice-o-rolla/blob/main/docs/textured-unwraps.md).
The `@dice-o-rolla/dice-assets/tools` entry point exports editable SVG templates and builds
KTX2 catalogs under Node.js or Bun; it is not needed by browser consumers.

## Texture authoring API and CLI

The same package provides Node.js 20+/Bun tools through `@dice-o-rolla/dice-assets/tools`.
Keep this entry out of browser imports. Install KTX-Software (`ktx` on PATH) for encoding;
template export does not require it.

```sh
npx dice-assets template --types d6 --id painted --out ./art/painted
# Paint art/painted/d6.svg, then build the runtime catalog.
npx dice-assets build --input ./art/painted/skin-set.source.json --out ./public/dice/painted
```

```ts
import {
  createTextureTemplate,
  writeTextureTemplates,
  buildTexturedSkinSet,
} from '@dice-o-rolla/dice-assets/tools';

const template = createTextureTemplate('d6', { size: 2048 });
await writeTextureTemplates({ outputDirectory: './art/custom', types: ['d6'], id: 'custom' });
const built = await buildTexturedSkinSet({
  input: './art/custom/skin-set.source.json',
  outputDirectory: './public/dice/custom',
});
console.log(template.unwrap, built.catalog);
```

Use `--types standard` for all shapes and tens variants. The `artwork` and `labels` layers are
rasterized; `guides` is removed. `--overwrite` replaces the entire generated destination only after
a successful build, so keep source files elsewhere. See the guide above for PBR maps and hosting.
Run `bun run test:integration` in this workspace to verify real KTX encoding.

## Connected surface unwraps

A `DicePatternDefinition` can include `unwrap: DiceSurfaceUnwrap`: a `geometryId`, a `faces`
record keyed by physical face value, and an optional SVG `preview` reference. Every face contains
one `[u, v]` pair per vertex, in the exact order of the geometry's `face.indices`. Coordinates are
normalized to `[0, 1]` with a **bottom-left origin**. Include all faces, including those whose visible
labels differ from their physical values. The material provider checks geometry compatibility and
complete corner coverage before mesh allocation.

Use `ktx create --convert-texcoord-origin bottom-left` when encoding surface maps from PNG. KTX2
textures are compressed and cannot rely on Three.js `flipY`. Base color, normal and ORM maps use
UV channel 1 with clamp wrapping; label atlases retain local face UVs in channel 0. Unwrapped
patterns cannot declare `repeat`; pattern scaling is ignored for surface sampling. Existing
patterns without `unwrap` keep their per-face mapping.

`DiceSkinSetDefinition` groups skins by application-level die type:

```ts
const set = assets.skinSets.get('diagnostic');
const cubeSkinId = set?.skins.d6; // diagnostic-d6
```

The bundled `diagnostic` set provides d4, d6, d8, d10, d12, d20, d100 tens and d66 tens. Each skin
uses one connected, non-overlapping net; d6 uses a cross. Diagnostic labels are baked into the
texture, including d4's vertex labels and the separate tens variants. Register a visual preset for
each skin using its pattern's `unwrap.geometryId`. For paired dice, select the tens preset through
`roll`/`simulate`'s existing `visualPresetSelector`; its `component.role` and `component.groupType`
distinguish the tens component from the ordinary d10/d6 units component.

Prepare each skin before creating dice. Dispose the provider when its renderer is released;
in-flight texture loads settle and release resources without repopulating a disposed provider.
The loader resolves preview URLs relative to the catalog, just like texture URLs. Catalog schema
version remains 1; all new fields are optional.

## Asset pipeline

Run `bun run --filter @dice-o-rolla/dice-assets assets:build`. The documented build performs:

- procedural generation of original mono WAV, PNG, and SVG masters;
- SVG/font text rasterization through Resvg into a single face atlas;
- `ktx create` conversion to UASTC KTX2 with offline mipmaps and Zstd supercompression;
- KTX validation with `ktx validate`;
- FFmpeg conversion and concatenation into mono WebM/Opus audio sprites;
- connected diagnostic nets, SVG previews and KTX2 textures with edge padding and mipmaps;
- production JSON catalog generation with clip offsets, material banks, atlas regions and skin sets.

The checked-in set combines original procedural test textures/audio with Unlicense impact WAV
masters from 3DDiceRoller. Runtime audio is split into dice, coin, felt, metal, wood-table, and
wood-tray mono Opus sprites. See `THIRD_PARTY_NOTICES.md` and the upstream license copied beside the
source masters. No Dice So Nice assets are included.

Licensed under Apache-2.0.

Diagnostic sources are generated by `scripts/diagnostic-nets.ts` from the registered polyhedra.
The deterministic edge-unfolding search preserves lengths and rejects overlapping polygons.
Tests verify connectivity, corner distances, winding, shared edge identifiers, raster colors,
KTX orientation and mipmaps. Regenerate through `assets:build`; do not hand-edit runtime files.
