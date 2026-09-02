# Three.js renderer

`@dice-o-rolla/dice-renderer-three` provides two browser rendering adapters. The default
`ThreeDiceRenderer` uses an angled perspective tray. `TopDownDiceRenderer` frames the complete tray
from directly above for application-wide dice surfaces and overlays. Both own their Three.js scene,
camera, WebGL renderer, resize observer, meshes, geometries, materials, label textures, lights, and
canvas. `destroy()` releases or disconnects each owned resource and is safe to repeat.

```ts
import { TopDownDiceRenderer } from '@dice-o-rolla/dice-renderer-three';

const renderer = new TopDownDiceRenderer(container, {
  trayWidth: 10,
  trayDepth: 10,
  cameraPadding: 1.5,
  maxPixelRatio: 2,
  maxFramebufferPixels: 4_000_000,
  materialProvider: (webglRenderer) => createMaterialProvider(webglRenderer),
});
```

Both renderer options expose the same `materialProvider` contract. Pass a provider directly when it
does not need the WebGL renderer, or use the factory form shown above for KTX2 capability detection
and other GPU-dependent setup. The renderer passes the complete selected visual preset to every face
material request and disposes the provider during `destroy()`.

Set `trayWidth` and `trayDepth` to the matching physics tray dimensions. The top-down camera adapts
to portrait, landscape, and rectangular viewports without cropping the tray. Both adapters use the
same face-label UV correction from the shared mesh factory, preventing horizontal mirroring of canvas
labels.

The renderer uses the same right-handed, Y-up coordinates and `{x, y, z, w}` quaternion convention
as the geometry and physics packages. Standard meshes are generated from the shared geometry
registry; logical polygon faces become separate material groups, so face labels and result resolution
share one numbering source. The d4 uses three labels per triangular face to preserve its
vertex-result convention. Ambiguous scalar labels `6`/`9` on every die and percentile labels
`60`/`90` include an orientation dot below the value. The d10 geometry uses a planar UV projection
and compact labels so d10 and d100 values preserve their proportions on elongated kite faces.

`updateDie()` stores a plain snapshot. `render(alpha)` interpolates the previous and current
positions with lerp and orientations with quaternion slerp. It never writes back to physics state.
Alpha is clamped to `[0, 1]`.

The renderers measure their container with `ResizeObserver`, cap automatically selected device pixel
ratio at 2, and also support explicit `resize()` calls. Since `WebGLRenderer` requires a real WebGL 2
browser context, headless package tests cover mesh generation, both camera compositions, coordinate
conventions, interpolation, and non-GPU scene lifecycle. Browser integration is exercised by the demo
vertical slice.
