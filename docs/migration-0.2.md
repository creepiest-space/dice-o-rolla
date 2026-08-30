# Migrating from 0.1 to 0.2

Version 0.2 is additive: existing standard notation and the browser factory remain compatible. The
release adds roll-rule metadata, visual presets, optional collision events, and the independent
asset package. Consumers that serialize results or exhaustively inspect public unions should review
the changes below.

## Roll results

Standard physical dice can now include two optional fields:

```ts
interface StandardDieResult {
  readonly included?: boolean;
  readonly score?: number;
}
```

`included` is present when a dice term uses `kh`, `kl`, `dh`, or `dl`. A discarded die remains in
`RollResult.dice` with `included: false` but contributes nothing to `total`. `score` is present when
the term uses `s{...}` and contains that face's mapped contribution, including zero for an unlisted
face. When scoring is active, `RollResult.total` sums scores rather than raw face values, then applies
integer modifiers.

Code that previously recomputed a total with `result.dice.reduce(...)` must use `result.total` or
mirror the documented selection and scoring rules. Component dice for `d%`, `d100`, and `d66` never
carry `included` or `score`; those notations reject selection and score suffixes.

## Parsed notation

`DiceExpression` can now expose `selection?: DiceSelection` and
`score?: readonly DiceScoreRule[]`. Exhaustive consumers should preserve these fields when cloning or
serializing an AST. The new AST and result collections remain readonly.

## Visual presets and assets

The engine now registers immutable visual presets and emits optional spawn, settle, removal,
collision, and impact events. `skinId` and `soundPackId` are opaque identifiers; the engine does not
load textures or audio.

Applications that need the provided KTX2 skins or WebM/Opus audio sprites must install
`@dice-o-rolla/dice-assets` explicitly. No runtime package depends on it, so applications without
custom assets require no migration.

## Lifecycle behavior

Concurrent `initialize()` calls now coalesce. Cancellation still rejects the roll with
`RollCancelledError`, even if an adapter fails during cleanup. `clear()` and the first `destroy()`
may throw `AggregateError` when owned adapters fail to release resources; all affected roll promises
are already terminal, and `destroy()` remains final and idempotent.

Call `clear()` to reuse an engine and `destroy()` when its view unmounts. A custom composition must
also call `destroy()` after `initialize()` rejects; `createDefaultDiceEngine()` performs this cleanup
automatically.
