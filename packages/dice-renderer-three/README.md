# `@dice-o-rolla/dice-renderer-three`

Official Three.js WebGL rendering adapters for Dice O Rolla, including the standard perspective
renderer and `TopDownDiceRenderer` for overhead application surfaces.

```ts
import { ThreeDiceRenderer, TopDownDiceRenderer } from '@dice-o-rolla/dice-renderer-three';
```

Both renderers accept the same `materialProvider` option, either as an existing
`ThreeFaceMaterialProvider` or as a factory receiving the initialized `WebGLRenderer`. This keeps
KTX2 capability detection and GPU-backed asset setup available in perspective and top-down layouts.
Their common theme, resizing, framebuffer-limit, antialiasing, and material options are exported as
`ThreeRendererOptions`; top-down options only extend that contract with camera and tray framing.

Most browser applications should use the preassembled entry point from
`@dice-o-rolla/dice-engine/browser`.

Licensed under Apache-2.0. See `LICENSE`, `NOTICE`, and `THIRD_PARTY_NOTICES.md` in the package.
