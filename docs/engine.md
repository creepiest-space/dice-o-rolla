# DiceEngine lifecycle

`@creepiest-space/dice-engine` is the backend-neutral facade. Its default entry point imports only
the core, geometry, physics, and renderer contracts. Concrete Rapier and Three.js composition lives
in the separate `@creepiest-space/dice-engine/browser` entry point.

## Roll flow

`initialize()` configures the tray and renderer once. `roll()` parses and validates notation before
creating a session. The initial concurrency policy is FIFO queueing: a second immediate call remains
pending until the first reaches a terminal state.

During a roll, frame deltas feed an accumulator. Physics advances only in fixed `1 / 60` second
steps; rendering receives the remaining fraction as interpolation alpha. A die result comes from the
settled physical quaternion and the shared logical face normals. Randomness affects only the initial
position, orientation, and impulses.

Every promise terminates through completion, cancellation, timeout, or failure. `AbortSignal` can
cancel an individual queued or active call. `clear()` cancels all work and removes dice. `destroy()`
also releases renderer and physics resources and is idempotent.

## Events

The facade exposes typed `roll:start`, `die:settled`, `roll:complete`, `roll:cancel`, `theme:change`,
and `error` events. Payloads carry their session identity; there is no singleton pending resolver.

## Browser composition

```ts
import { createDefaultDiceEngine } from '@creepiest-space/dice-engine/browser';

const engine = await createDefaultDiceEngine({ container });
const result = await engine.roll('1d6 + 2');

engine.destroy();
```

Applications that need custom adapters can instantiate `DiceEngine` from the default entry point
and inject any implementations of `PhysicsWorld` and `DiceRenderer`.
