# DiceEngine lifecycle

`@dice-o-rolla/dice-engine` is the backend-neutral facade. Its default entry point imports only
the core, geometry, physics, and renderer contracts. Concrete Rapier and Three.js composition lives
in the separate `@dice-o-rolla/dice-engine/browser` entry point.

## Roll flow

`initialize()` configures the tray and renderer once. `roll()` parses and validates notation before
creating a session. The initial concurrency policy is FIFO queueing: a second immediate call remains
pending until the first reaches a terminal state.

During a roll, frame deltas feed an accumulator. Physics advances only in fixed `1 / 60` second
steps; rendering receives the remaining fraction as interpolation alpha. A die result comes from the
settled physical quaternion and the shared logical face normals. Randomness affects only the initial
position, orientation, and impulses.

Rolls containing more than four dice distribute their initial positions over the tray in a stable
grid with small random jitter. This avoids overlapping convex bodies while leaving orientation and
impulses random. The default six-unit walls contain the complete spawn range; the load suite verifies
that deterministic `20d6` and `50d6` profiles settle before the hard timeout.

Every promise terminates through completion, cancellation, timeout, or failure. `AbortSignal` can
cancel an individual queued or active call. `clear()` cancels all work and removes dice. `destroy()`
also releases renderer and physics resources and is idempotent.

## Events

The facade exposes typed `roll:start`, `die:spawn`, `die:settled`, `die:remove`, `roll:complete`,
`roll:cancel`, `theme:change`, and `error` events. Payloads carry their session identity; there is no
singleton pending resolver. Optional `die:collision` reporting is disabled by default and bounded
per rendered frame when enabled.

## Browser composition

```ts
import { createDefaultDiceEngine } from '@dice-o-rolla/dice-engine/browser';

const engine = await createDefaultDiceEngine({ container });
const result = await engine.roll('1d6 + 2');

engine.destroy();
```

`d%` and `d100` expand to physical tens and units d10 shapes; `d66` expands to two d6 shapes. The
returned dice retain component group, role, and raw settled face metadata.

Applications that need custom adapters can instantiate `DiceEngine` from the default entry point
and inject any implementations of `PhysicsWorld` and `DiceRenderer`.
