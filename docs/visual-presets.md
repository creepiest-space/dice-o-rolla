# Visual presets and optional assets

A visual preset connects a logical die to a physical geometry and renderer presentation. Presets
are registered per `DiceEngine` instance; there is no global registry.

```ts
const preset = engine.registerVisualPreset(
  {
    id: 'custom:runic-d6',
    dieType: 'd6',
    geometryId: 'd6',
    scale: 1.15,
    faceLabels: { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 6: 'VI' },
    skinId: 'runic-stone',
    soundPackId: 'stone-table',
  },
  { makeDefault: true },
);

engine.setVisualPreset('d6', preset.id);
engine.unregisterVisualPreset(preset.id);
```

The default selection remains per physical die type. A particular `roll()` or `simulate()` can
override it independently for every allocated polyhedron with `visualPresetSelector`:

```ts
const trace = await engine.simulate('2d6 + d100', {
  seed: 2026,
  visualPresetSelector: ({ physicalIndex, component, defaultPresetId }) => {
    if (component?.role === 'tens') return 'custom:percentile-tens';
    if (component?.role === 'units') return 'custom:percentile-units';
    return physicalIndex % 2 === 0 ? 'custom:amethyst-d6' : defaultPresetId;
  },
});
```

The selector runs once for each physical die before any bodies are allocated. Its immutable context
contains notation-term coordinates, the notation-level and physical die types, the current default
preset ID, and the component role for `d100`/`d66`. Returning `undefined` retains the default.
Returned IDs must already be registered and match `physicalDieType`; otherwise the complete
operation is rejected without a partial roll. The selected IDs are captured in simulation traces,
so replay uses the same visuals without invoking the selector again.

Registration validates the geometry, labels, value map, and logical result range before a roll can
allocate physics bodies. `scale` applies to both the collider and rendered mesh. A `valueMap` must
map every physical face exactly once; the settled physical orientation is resolved first, then the
map converts that face into the logical value. A preset never rotates or relabels a settled die to
force a requested result.

Built-in presets use IDs such as `standard:d6` and cannot be unregistered. Removing a selected
custom preset restores the corresponding standard preset. Existing dice keep their immutable
render snapshots, while subsequent rolls use the new selection. Renderer adapters defer releasing
an unregistered descriptor until its last displayed mesh is removed. Re-registering the same ID is
rejected while that ID is still in use.

## Skins and sounds

`@dice-o-rolla/dice-assets` is an optional leaf package. No other Dice O Rolla package depends on
it. Core engine presets carry only opaque `skinId` and `soundPackId` strings; the application
connects those IDs to its renderer and audio adapters.

```ts
import { DiceAssetRegistry, ImpactSoundGate } from '@dice-o-rolla/dice-assets';

const assets = new DiceAssetRegistry();
assets.materials.register({ id: 'stone', roughness: 0.8, metalness: 0 });
assets.patterns.register({
  id: 'runes',
  baseColor: {
    uri: '/dice/runes.ktx2',
    mediaType: 'image/ktx2',
    colorSpace: 'srgb',
    mipmaps: true,
  },
});
assets.skins.register({ id: 'runic-stone', materialId: 'stone', patternId: 'runes' });
```

Runtime textures are UASTC KTX2 with offline mipmaps. PBR patterns split base color, normal, and
packed ORM; reusable face atlases come from SVG/font sources. `ThreeAssetMaterialProvider` and
`WebAudioSpritePlayer` are opt-in application adapters. Both `ThreeDiceRenderer` and
`TopDownDiceRenderer` accept a `materialProvider` instance or a factory that receives the initialized
`WebGLRenderer`.

## Lifecycle and collision events

The engine emits `die:spawn` and `die:remove` with the session, die, preset, skin, and sound-pack
identifiers. Removal reasons distinguish replacement, cancellation, failure, clearing, and engine
destruction.

Physics collision reporting is disabled by default. Enable it only when an effect adapter needs it:

```ts
const engine = new DiceEngine({
  physics,
  renderer,
  collisionEvents: { enabled: true, maxEventsPerFrame: 16 },
});

const impactGate = new ImpactSoundGate();
engine.on('roll:start', () => impactGate.clear());
engine.on('die:collision', (event) => impactGate.observeCollision(event));

engine.on('die:impact', (event) => {
  if (!impactGate.consumeImpact(event)) return;
  // WebAudioSpritePlayer maps Rapier force to gain and applies small randomized pitch/gain.
});
```

Rapier produces contact-force data on every fixed step while a contact persists. `ImpactSoundGate`
uses the collision lifecycle to consume only the first matching force event, preventing overlapping
audio retriggers. The per-frame bound prevents a dense roll from producing an unbounded main-thread
event burst. Effects are downstream consumers: they cannot alter random input, physics state, face
resolution, or aggregation.
