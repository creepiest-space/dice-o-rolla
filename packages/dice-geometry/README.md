# `@dice-o-rolla/dice-geometry`

Immutable geometry definitions and settled-face resolution for standard polyhedral dice, d10
percentile dice, and d6-based d66 rolls.

Most browser applications should install `@dice-o-rolla/dice-engine` instead. This lower-level
package is intended for custom physics or rendering adapters.

```ts
import { getDieGeometry } from '@dice-o-rolla/dice-geometry';

const d20 = getDieGeometry('d20');
```

Licensed under Apache-2.0. See `LICENSE`, `NOTICE`, and `THIRD_PARTY_NOTICES.md` in the package.

## Connected net API

`createStandardDiceNet('d6')` returns a `StandardDiceNet` with `geometryId` and complete per-corner
UV coordinates, normalized to `[0, 1]` with a bottom-left origin. Keys are physical face values and
corner order follows `face.indices`. `StandardDiceNetType` covers d4, d6, d8, d10, d12 and d20. The
layouts are deterministic and preserve polygon proportions; d6 uses a cross. d100/d66 artwork
variants reuse d10/d6 geometry. No Three.js, native image library or filesystem is required.
