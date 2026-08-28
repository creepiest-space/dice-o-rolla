# Rapier physics backend

`@creepiest-space/dice-physics-rapier` implements the renderer-neutral physics contracts with the
official `@dimforge/rapier3d-compat` WebAssembly package.

The backend is the only workspace that imports Rapier. Its public surface accepts and returns plain
domain objects; Rapier `World`, `RigidBody`, collider descriptors, and WASM initialization remain
private implementation details.

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

Dynamic bodies use continuous collision detection, sleeping, configured linear/angular damping, and
a convex-hull collider derived from the ideal die vertices. Collider mass, friction, and restitution
come from `CreatePhysicsDieOptions`. The tray is one fixed rigid body with five cuboid colliders: a
floor and four walls.

```ts
const world = await RapierPhysics.create();
world.configureTray({
  width: 10,
  depth: 10,
  wallHeight: 6,
  wallThickness: 0.25,
  material: { friction: 0.8, restitution: 0.1 },
});

// Create dice, apply impulses, and call world.step(1 / 60) in the engine loop.
world.destroy();
```

## Validation and failure behavior

The adapter rejects non-finite transforms, invalid quaternions, non-positive mass/scale/timestep,
negative material values, duplicate or empty ids, and vertex sets that cannot form a 3D convex hull.
If collider creation fails after a body is allocated, the body is removed before the error escapes.

`removeDie()` is idempotent for unknown ids. Removed handles throw on later access. `clear()` removes
all dynamic dice but leaves the configured tray available; `destroy()` also removes the tray and
frees the Rapier world.

## Backend limitations

- friction and restitution currently use Rapier's default combine behavior;
- every standard die uses an ideal convex hull rather than a chamfered render hull;
- CCD is enabled for all dice rather than selected by a measured profile;
- the backend does not choose settling thresholds or aggregate results—those belong to the engine
  and core packages.
