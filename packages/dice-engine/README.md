# `@dice-o-rolla/dice-engine`

Framework-neutral orchestration for physically simulated polyhedral dice. The package exposes a
backend-neutral engine and an optional browser composition backed by Rapier and Three.js.

## Browser usage

```ts
import { createDefaultDiceEngine } from '@dice-o-rolla/dice-engine/browser';

const container = document.querySelector<HTMLElement>('#dice-tray');
if (container === null) throw new Error('Missing dice tray');

const engine = await createDefaultDiceEngine({ container });
const result = await engine.roll('2d20 + 4');

console.log(result.total, result.dice);
engine.destroy();
```

The browser entry point initializes Rapier WASM, creates the Three.js renderer, uses Web Crypto for
throw generation, and releases partially initialized resources if composition fails. Concurrent
`initialize()` calls coalesce, while every roll promise terminates by settlement, cancellation,
timeout, or failure.

## Custom adapters

```ts
import { DiceEngine } from '@dice-o-rolla/dice-engine';

const engine = new DiceEngine({ physics, renderer });
await engine.initialize();
```

The main entry point depends on domain contracts rather than concrete Rapier or Three.js types.

## Deterministic simulation and replay

`simulate()` runs the configured physics adapter with a per-call seeded random source and returns a
JSON-serializable `PhysicalRollTrace`. It does not render or emit the ordinary roll lifecycle events.
Set `captureFrames: true` when the trace will be animated; otherwise the trace contains only its
terminal frame.

```ts
const trace = await engine.simulate('2d20kh1', {
  seed: 2026,
  captureFrames: true,
  frameIntervalSteps: 2,
});

await engine.replay(trace, {
  theme: { material: 'matte', roughness: 0.85 },
  signal: abortController.signal,
});
```

`replay()` consumes the captured transforms without stepping physics. Its optional theme is applied
through the normal engine theme state, and the terminal dice remain rendered until the next roll,
replay, `clear()`, or `destroy()`. Simulation and replay require an idle engine because the facade
owns one physics world, renderer, and frame scheduler. Replay cancellation rejects with
`RollCancelledError`.

Traces include producer and physics profile metadata, initial throw conditions, definition
fingerprints, collision/impact events, and the immutable logical result. Replay validates registered
definitions, final orientation-derived faces, and the aggregate total before rendering. Default
trace limits are 1,200 frames, 60,000 die samples, and 20,000 events; customize them through
`DiceEngineOptions.traceLimits`. `TraceLimitExceededError` identifies the rejected dimension.

## Visual presets and optional effects

`registerVisualPreset()` associates a logical die with a validated physical geometry, scale, face
labels, and optional value map. `skinId` and `soundPackId` are opaque application-owned references;
the engine does not load assets. Skins and sound definitions belong in the optional
`@dice-o-rolla/dice-assets` package, which is not a dependency of the engine.

The engine emits `die:spawn` and `die:remove` lifecycle events. Collision events are opt-in through
`DiceEngineOptions.collisionEvents`, bounded by `maxEventsPerFrame`, and suitable for an external
sound or effects adapter.

## Supported notation

The initial grammar supports standard polyhedral expressions and integer modifiers, including:

```text
d20
4d6 + 2
4d6kh3
2d20kl1
5d20s{1=-2,17..19=1,20=2}
d%
d100
d66
```

Keep/drop rolls retain every physical die in `result.dice` and expose the selection through
`included`. Score maps expose each contribution through `score`; unlisted faces contribute zero.
Selection is applied before scoring, followed by integer modifiers. Paired `d%`, `d100`, and `d66`
terms currently reject keep/drop and score operations.

Engine-produced dice also contain immutable `provenance`: stable term, logical-die, and physical-die
coordinates plus the settled face, inclusion state, and contribution. Consumers can explain a
total without reparsing notation or depending on renderer state.

Default resource limits reject oversized notation, more than 50 logical or physical dice, and more
than eight pending rolls. Consumers may lower or explicitly raise these limits through
`DiceEngineOptions.limits` after testing their target devices.

## Trust and cleanup

Client-side results are not authoritative for rankings, prizes, or wagering. Call `destroy()` when
the engine is no longer needed to release frame scheduling, observers, physics resources, WebGL
resources, and the renderer canvas. `clear()` keeps the engine reusable; `destroy()` is idempotent
and final. See the canonical
[lifecycle and runtime contract](https://github.com/creepiest-space/dice-o-rolla/blob/main/docs/engine.md).
Consumers upgrading from `0.1` should also review the
[0.2 migration notes](https://github.com/creepiest-space/dice-o-rolla/blob/main/docs/migration-0.2.md).
Consumers upgrading from `0.2` should review the
[0.3 migration notes](https://github.com/creepiest-space/dice-o-rolla/blob/main/docs/migration-0.3.md).

## License

Licensed under the Apache License, Version 2.0. The package archive includes `LICENSE`, `NOTICE`, and
`THIRD_PARTY_NOTICES.md`.
