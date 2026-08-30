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

`@dice-o-rolla/dice-assets` is an optional package containing immutable descriptors and registries
for skin and sound-pack resources. No other Dice O Rolla package depends on it. Core engine presets
carry only opaque `skinId` and `soundPackId` strings; the application connects those IDs to its
renderer and audio adapters.

```ts
import { DiceAssetRegistry } from '@dice-o-rolla/dice-assets';

const assets = new DiceAssetRegistry();
assets.registerSkin({
  id: 'runic-stone',
  material: 'custom',
  textures: { body: { uri: '/dice/runic-stone.webp', mediaType: 'image/webp' } },
});
assets.registerSoundPack({
  id: 'stone-table',
  dieCollision: {
    samples: [{ uri: '/dice/stone-hit-1.ogg' }, { uri: '/dice/stone-hit-2.ogg' }],
  },
});
```

The asset package does not fetch, decode, render, or play resources. This keeps consumers that do
not need custom skins or audio free of asset code and files.

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

engine.on('die:collision', (event) => {
  if (!event.started || event.soundPackId === undefined) return;
  // Resolve event.soundPackId through the application's DiceAssetRegistry.
});
```

The per-frame bound prevents a dense roll from producing an unbounded main-thread event burst.
Effects are downstream consumers: they cannot alter random input, physics state, face resolution,
or aggregation.
