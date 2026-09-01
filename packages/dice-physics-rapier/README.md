# `@dice-o-rolla/dice-physics-rapier`

Official Rapier 3D physics backend for Dice O Rolla. It provides the simulation world, rigid
bodies, tray boundaries, convex colliders, and settled orientation snapshots.

Most browser applications should use the preassembled entry point from
`@dice-o-rolla/dice-engine/browser`.

`clear()` restores a deterministic configured baseline: it invalidates dynamic handles, recreates
the Rapier World and EventQueue, and reapplies the current gravity and tray. This lets repeated
seeded engine simulations reuse one adapter without inheriting solver state from an earlier run.

```ts
import { RapierPhysicsWorld } from '@dice-o-rolla/dice-physics-rapier';
```

Licensed under Apache-2.0. See `LICENSE`, `NOTICE`, and `THIRD_PARTY_NOTICES.md` in the package.
