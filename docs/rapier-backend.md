# Rapier physics backend

`@creepiest-space/dice-physics-rapier` implements the renderer-neutral physics contracts with the
official `@dimforge/rapier3d-compat` WebAssembly package.

## Coordinate system and dimensions

The backend uses a right-handed, Y-up world. Gravity defaults to `(0, -9.81, 0)`. Geometry vertices
are multiplied by the die `scale` before the convex hull is built. Tray `width` and `depth` describe
its clear inner area; its floor is at `y = 0`, and walls extend upward from that plane.

## Lifecycle

Create worlds asynchronously with `RapierPhysics.create()`. Rapier initialization is shared between
all concurrent calls. A world owns its WASM resources and every body created through it. Call
`destroy()` when finished; the operation is idempotent. Handles for removed dice are invalidated and
throw if used again.

The simulation is stepped explicitly in seconds. A fixed timestep such as `1 / 60` is recommended.
Renderer code should read the plain objects returned by `getState()` and must not retain Rapier
objects.

```ts
const world = await RapierPhysics.create();
world.configureTray({
  width: 10,
  depth: 10,
  wallHeight: 2,
  wallThickness: 0.25,
  material: { friction: 0.8, restitution: 0.1 },
});

// Create dice, apply impulses, and call world.step(1 / 60) in the engine loop.
world.destroy();
```
