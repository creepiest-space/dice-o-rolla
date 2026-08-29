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
