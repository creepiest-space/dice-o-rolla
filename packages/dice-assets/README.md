# `@dice-o-rolla/dice-assets`

Optional production asset system for Dice O Rolla. The dependency direction stays one-way:
engine, physics, and renderer packages never import `dice-assets`; an application opts in and wires
opaque preset IDs to these adapters.

The catalog has independent registries for audio sprites, audio banks, PBR materials, reusable
patterns, skins, and face atlases. A skin references assets by ID, so recolor, hue, saturation,
pattern scale, and shader compositing create variants without duplicating KTX2 data.

```ts
import catalog from '@dice-o-rolla/dice-assets/catalog.json' with { type: 'json' };
import { DiceAssetRegistry, WebAudioSpritePlayer } from '@dice-o-rolla/dice-assets';

const assets = new DiceAssetRegistry();
assets.registerCatalog(catalog);

const audio = new WebAudioSpritePlayer(assets, { context: new AudioContext() });
engine.on('die:impact', ({ force, soundPackId }) => {
  if (soundPackId !== undefined)
    void audio.playImpact({
      force,
      dieMaterialBankId: soundPackId,
      surfaceMaterialBankId: 'classic-wood-table',
    });
});
```

For Three.js, pass a `materialProvider` factory to `ThreeDiceRenderer`; the factory receives its
active `WebGLRenderer` and can construct `ThreeAssetMaterialProvider`. Call `prepareSkin()` before
dice using that skin can spawn. It loads KTX2 through Three's `KTX2Loader`, shares texture instances, uses the
packed ORM map for AO/roughness/metalness, and composites the face atlas in the material shader.

## Asset pipeline

Run `bun run --filter @dice-o-rolla/dice-assets assets:build`. The documented build performs:

- procedural generation of original mono WAV, PNG, and SVG masters;
- SVG/font text rasterization through Resvg into a single face atlas;
- `ktx create` conversion to UASTC KTX2 with offline mipmaps and Zstd supercompression;
- KTX validation with `ktx validate`;
- FFmpeg conversion and concatenation into mono WebM/Opus audio sprites;
- production JSON catalog generation with clip offsets, material banks, and atlas regions.

The checked-in set combines original procedural test textures/audio with Unlicense impact WAV
masters from 3DDiceRoller. Runtime audio is split into dice, coin, felt, metal, wood-table, and
wood-tray mono Opus sprites. See `THIRD_PARTY_NOTICES.md` and the upstream license copied beside the
source masters. No Dice So Nice assets are included.

Licensed under Apache-2.0.
