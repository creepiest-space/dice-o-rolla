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

A material provider may implement `getSurfaceUvs(definition, preset)` to return a complete
`SurfaceUvMap` keyed by physical face value. Coordinates follow each face's vertex order. The
mesh factory validates them before allocation and writes them to `uv1`, preserving the original
`uv` channel for labels. Assign `texture.channel = 1` for maps that use the surface unwrap.
`createPolyhedronGeometry(definition, scale, surfaceUvs)` also accepts the map directly;
`validateSurfaceUvs` is available for early validation. Omitting the map preserves existing UVs.

Most browser applications should use the preassembled entry point from
`@dice-o-rolla/dice-engine/browser`.

Licensed under Apache-2.0. See `LICENSE`, `NOTICE`, and `THIRD_PARTY_NOTICES.md` in the package.
