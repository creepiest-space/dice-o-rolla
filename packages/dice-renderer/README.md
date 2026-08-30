# `@dice-o-rolla/dice-renderer`

Renderer-neutral snapshots, themes, and lifecycle contracts for Dice O Rolla.

Implement these interfaces to connect the engine to a custom renderer. The official WebGL
implementation is available from `@dice-o-rolla/dice-renderer-three`.

```ts
import type { DiceRenderer, RendererTheme } from '@dice-o-rolla/dice-renderer';
```

The package also exports `VisualPresetRegistry`. Preset descriptors contain geometry, scaling,
labels, value mapping, and optional opaque asset IDs, but never load skins or sounds. A renderer is
not required to depend on `@dice-o-rolla/dice-assets`.

Licensed under Apache-2.0. See `LICENSE`, `NOTICE`, and `THIRD_PARTY_NOTICES.md` in the package.
