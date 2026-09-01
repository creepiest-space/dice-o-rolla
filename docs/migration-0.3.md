# Migrating from 0.2 to 0.3

Version 0.3 adds deterministic physical traces and immutable result provenance. Existing `roll()`
calls and notation remain compatible.

## Simulation and replay

Use `simulate()` when another client must reproduce the exact physical animation:

```ts
const trace = await engine.simulate('4d6kh3', {
  seed: 2026,
  captureFrames: true,
  frameIntervalSteps: 2,
});

await engine.replay(trace, { signal });
```

The seed is required. `captureFrames: false` stores only the terminal frame and is suitable for
verification but not smooth playback. `frameIntervalSteps` samples every Nth fixed step while
always preserving the terminal frame.

Treat a trace as a versioned transport envelope, not as an indefinitely stable save format. Replay
rejects a different trace version or producer version, changed preset/geometry fingerprints,
malformed timelines, mismatching orientation-derived faces, and mismatching totals. Store the
engine package version with long-lived application data and define a migration policy before
upgrading it.

The default capture/replay bounds are 1,200 frames, 60,000 die transform samples, and 20,000
collision/impact events. Configure `DiceEngineOptions.traceLimits` for a stricter application
budget. Catch `TraceLimitExceededError` to distinguish a policy rejection from invalid trace data.

## Result provenance

Engine-produced `DieResult` objects now include optional `provenance`. It supplies stable
`termId`, `termIndex`, `dieIndex`, and `physicalIndex` coordinates together with `faceValue`,
`state`, and the die's optional `contribution`. The property is optional so custom core consumers
can continue constructing results without it. Published results and nested provenance objects are
immutable snapshots.

Use provenance to correlate logs, UI annotations, and score explanations. Do not infer these
coordinates from result-array order, and do not reparse notation in a renderer or sound consumer.

## Replay effects

Traces include collision and impact events at simulation-relative timestamps. During replay the
engine emits the ordinary `die:spawn`, `die:collision`, and `die:impact` events, preserving preset
`skinId` and `soundPackId` metadata. Existing event-driven sound integrations therefore follow the
recorded physics timeline; no audio data is embedded in the trace.
