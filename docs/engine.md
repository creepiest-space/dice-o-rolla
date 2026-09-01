# DiceEngine lifecycle

`@dice-o-rolla/dice-engine` is the backend-neutral facade. Its default entry point imports only
the core, geometry, physics, and renderer contracts. Concrete Rapier and Three.js composition lives
in the separate `@dice-o-rolla/dice-engine/browser` entry point.

## Roll flow

`initialize()` configures the tray and renderer once. Concurrent calls share the same initialization
operation. If initialization rejects, an engine assembled by `createDefaultDiceEngine()` releases
the partially created renderer and physics world before it rejects. Consumers that construct
`DiceEngine` with custom adapters must call `destroy()` after an initialization failure.

`roll()` parses and validates notation before creating a session. The initial concurrency policy is
FIFO queueing: a second immediate call remains pending until the first reaches a terminal state.

During a roll, frame deltas feed an accumulator. Physics advances only in fixed `1 / 60` second
steps; rendering receives the remaining fraction as interpolation alpha. A die result comes from the
settled physical quaternion and the shared logical face normals. Randomness affects only the initial
position, orientation, and impulses.

Rolls containing more than four dice distribute their initial positions over the tray in a stable
grid with small random jitter. This avoids overlapping convex bodies while leaving orientation and
impulses random. The default six-unit walls contain the complete spawn range; the load suite verifies
that deterministic `20d6` and `50d6` profiles settle before the hard timeout.

Every promise terminates through completion, cancellation, timeout, or failure. `AbortSignal` can
cancel an individual queued or active call. `clear()` cancels all work and removes dice while
keeping the engine reusable. `destroy()` also releases renderer and physics resources, removes all
engine listeners, and is idempotent.

## Physical traces

`simulate(notation, { seed, captureFrames, frameIntervalSteps })` is the deterministic,
renderer-free counterpart to `roll()`. It uses a call-local seeded random source for initial
transforms and impulses, advances the configured physics world at the engine fixed timestep, and
returns a versioned `PhysicalRollTrace`. The trace records its producer, physics profile, die
definitions and initial conditions, logical result, collision/impact timeline, and either sampled
transforms or only the terminal transform. Timestamps inside the result and trace are
simulation-relative, which keeps the payload portable and JSON-serializable. `frameIntervalSteps`
defaults to `1`; increase it to trade animation fidelity for a smaller payload.

Before each simulation the engine calls `PhysicsWorld.clear()` to restore a clean configured
baseline. Physics adapters must reset backend solver state as well as remove dynamic bodies. The
Rapier adapter recreates its World and EventQueue while preserving gravity and tray configuration;
therefore repeated calls with the same notation, seed, profile, and definitions produce the same
physical result on one engine instance.

`replay(trace, { theme, signal })` creates the traced dice in the configured renderer and advances
only captured transforms; Rapier is not stepped. The renderer interpolates adjacent trace frames
using its existing `previous`/`current` contract. A successful replay leaves its terminal dice on
screen. Aborting it removes replay-owned dice and rejects with `RollCancelledError`.
If scheduling the first or a later replay frame fails, the same replay promise rejects, replay-owned
dice are removed, and the engine immediately returns to its idle state.

Replay validates the trace version, engine producer, physics profile, registered preset geometry,
definition fingerprints, final orientation-derived faces, and aggregate total before it creates
renderer state. It rejects incompatible or corrupted input instead of rotating, relabelling, or
trusting a stored result. Recorded collision and impact events are emitted on the replay timeline,
so an external Web Audio consumer can use the same force-driven sound path as a live roll.

Trace capture is bounded independently from roll input. The defaults allow 1,200 frames, 60,000
die transform samples, and 20,000 events. `DiceEngineOptions.traceLimits` may lower or explicitly
raise those bounds. Capture and replay throw `TraceLimitExceededError` when an envelope exceeds the
configured policy; callers should still apply their own transport and storage limits to untrusted
JSON.

Simulation and replay are exclusive operations: they reject while a roll, queued roll, or replay is
active. Starting either operation replaces settled dice from an earlier roll or replay. This keeps
the existing single-world, single-renderer ownership model intact and prevents a headless
simulation from colliding with visible bodies.

Cleanup attempts every owned operation even when an adapter throws. `clear()` or the first
`destroy()` call can throw an `AggregateError` describing cleanup failures; affected roll promises
are already terminal, and a failed `destroy()` still leaves the engine permanently destroyed.
Cleanup failures encountered by `cancel()` are reported through the typed `error` event without
changing the roll's `RollCancelledError` outcome.

## Lifecycle obligations

| Operation      | Allowed state               | Effect                                                                    |
| -------------- | --------------------------- | ------------------------------------------------------------------------- |
| `initialize()` | constructed or initializing | Configures adapters once; concurrent calls coalesce.                      |
| `roll()`       | initialized                 | Starts or queues one bounded session.                                     |
| `simulate()`   | initialized and idle        | Produces a deterministic renderer-neutral physical trace.                 |
| `replay()`     | initialized and idle        | Renders a trace without stepping the physics world.                       |
| `cancel()`     | initialized                 | Cancels one active or queued session.                                     |
| `clear()`      | initialized                 | Cancels every session and removes dice; adapters remain usable.           |
| `destroy()`    | any non-destroyed state     | Cancels work and releases all owned resources; repeated calls do nothing. |

After `destroy()`, roll, layout, theme mutation, cancellation, clearing, and preset operations reject
or throw `DiceEngineDestroyedError`; repeated `destroy()` calls do nothing. Applications must retain
and invoke listener unsubscribe functions for listeners they want to remove before teardown;
`destroy()` removes any remaining engine listeners. The browser renderer owns its canvas,
`ResizeObserver`, WebGL context, scene resources, and optional material provider. The Rapier adapter
owns its bodies, colliders, event queue, tray, and world.

## Events

The facade exposes typed `roll:start`, `die:spawn`, `die:settled`, `die:remove`, `roll:complete`,
`roll:cancel`, `theme:change`, and `error` events. Payloads carry their session identity; there is no
singleton pending resolver. Optional `die:collision` reporting is disabled by default and bounded
per rendered frame when enabled. Simulation temporarily collects collision and impact events for
its trace even when live collision events are disabled, then restores the configured live policy.

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

## Supported environments

The backend-neutral root entry is declaration-tested with TypeScript 7 and targets modern ESM
runtimes. Repository tooling supports Bun 1.3 or newer and Node.js 20 or newer. The `/browser` entry
requires WebAssembly, WebGL 2, Web Crypto, `AbortController`, `ResizeObserver`, and
`requestAnimationFrame`; sound consumers additionally require the Web Audio API and WebM/Opus
decoding.

The automated browser lifecycle and roll suite runs against the current Playwright Chromium build.
Current stable Chrome and Edge are the guaranteed browser family for `0.3`. Current Firefox and
Safari are compatibility targets, but are not release-gated until their Playwright projects are
enabled. Server-side rendering must not call the `/browser` factory; use the root entry with custom
headless adapters instead.
