# `@dice-o-rolla/dice-assets`

Backend-neutral descriptors and registries for optional Dice O Rolla skins and sound packs.

The package stores metadata and asset references only. It does not fetch files, create GPU
resources, decode audio, or play sounds. Renderer and audio adapters decide how to load and dispose
the referenced resources. Other Dice O Rolla packages do not depend on `dice-assets`; applications
opt into it and connect asset IDs from visual presets to their chosen adapters.

```ts
import { DiceAssetRegistry } from '@dice-o-rolla/dice-assets';

const assets = new DiceAssetRegistry();
assets.registerSkin({
  id: 'obsidian',
  material: 'custom',
  textures: { body: { uri: '/dice/obsidian.webp', mediaType: 'image/webp' } },
});
assets.registerSoundPack({
  id: 'wooden-table',
  dieCollision: { samples: [{ uri: '/dice/hit.ogg' }] },
});
```

Licensed under Apache-2.0.
