# Architecture

## Dependency boundaries

Dependencies point inward toward small contracts and immutable domain data:

```text
dice-demo
  -> dice-engine/browser
       -> dice-engine
       -> dice-physics-rapier -> dice-physics -> dice-core
       -> dice-renderer-three -> dice-renderer -> dice-core

dice-engine
  -> dice-core
  -> dice-geometry -> dice-core
  -> dice-physics
  -> dice-renderer
```

The default `dice-engine` entry is backend-neutral. Only its `/browser` composition entry imports
Rapier and Three.js. No package imports an application, applications do not import one another, and
backend objects do not cross their package boundaries.

## Roll data flow

1. `DiceEngine.roll()` parses the complete notation into a typed AST and validates supported dice.
2. The engine expands logical expressions into physical dice. Paired d100/d% and d66 expressions
   receive explicit group and tens/units component metadata.
3. `ThrowGenerator` uses an injected `RandomSource` for initial position, unit quaternion, impulse,
   and torque impulse.
4. The physics adapter owns bodies and advances at a fixed timestep.
5. Each frame copies plain previous/current transforms from physics to renderer snapshots.
6. `SettlingDetector` reaches a terminal state only after velocity stability, Rapier sleep, or the
   hard timeout.
7. `resolveFace()` rotates immutable logical result directions by the settled quaternion. The roll
   aggregator combines those physical face values and the notation modifier.

The direction is always:

```text
Rapier state -> plain domain snapshot -> Three.js state
```

Rendering never mutates physics, and material indices never determine a result.

## Sessions and queue

Every call to `roll()` creates an independent session and promise. The implemented concurrency mode
is FIFO queueing. Session-scoped events make it possible to associate `roll:start`, `die:settled`,
`roll:complete`, cancellation, and errors without a singleton resolver.

An active or queued session can be cancelled explicitly or with `AbortSignal`. Every promise ends in
completion, cancellation, timeout, or failure. A terminal session cannot be resumed.

## Ownership and lifecycle

`initialize()` configures the tray and initializes the renderer once. The engine owns the injected
adapters for its lifetime.

- `clear()` cancels active and queued work, clears bodies and meshes, and keeps the engine reusable.
- `destroy()` performs `clear()`, destroys renderer and physics resources, removes listeners, and is
  idempotent.
- `ThreeDiceRenderer` and `TopDownDiceRenderer` own their canvas, resize observer, scene, camera,
  geometries, materials, label textures, and WebGL context.
- `RapierPhysicsWorld` owns its WASM world, tray body, rigid bodies, and colliders. Removed body
  handles are invalidated.

Consumers must call `destroy()` when the containing view is unmounted.

## Extension points

- Add notation nodes in `dice-core`; do not encode roll rules in applications or renderers.
- Add immutable physical shapes and result directions in `dice-geometry`.
- Implement alternative `PhysicsWorld` or `DiceRenderer` adapters against their neutral contracts.
- Keep themes visual and physics profiles mechanical; neither should silently change the other.

Current scope intentionally excludes keep/drop, reroll, explode, success counting, advantage,
network rooms, sound, forced faces, and copied reference assets.
