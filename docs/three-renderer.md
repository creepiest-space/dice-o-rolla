# Three.js renderer

`@creepiest-space/dice-renderer-three` is the browser rendering adapter. It owns its Three.js scene,
camera, WebGL renderer, resize observer, meshes, geometries, materials, label textures, lights, and
canvas. `destroy()` releases or disconnects each owned resource and is safe to repeat.

The renderer uses the same right-handed, Y-up coordinates and `{x, y, z, w}` quaternion convention
as the geometry and physics packages. Standard meshes are generated from the shared geometry
registry; logical polygon faces become separate material groups, so face labels and result resolution
share one numbering source. The d4 uses three labels per triangular face to preserve its
vertex-result convention.

`updateDie()` stores a plain snapshot. `render(alpha)` interpolates the previous and current
positions with lerp and orientations with quaternion slerp. It never writes back to physics state.
Alpha is clamped to `[0, 1]`.

The renderer measures its container with `ResizeObserver`, caps automatically selected device pixel
ratio at 2, and also supports explicit `resize()` calls. Since `WebGLRenderer` requires a real WebGL 2
browser context, headless package tests cover mesh generation, coordinate conventions, interpolation,
and non-GPU scene lifecycle. Browser integration is exercised by the demo vertical slice.
