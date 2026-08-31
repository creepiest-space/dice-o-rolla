# `@dice-o-rolla/dice-core`

Framework-neutral domain primitives for Dice O Rolla: notation parsing, roll results, lifecycle
events, limits, and random sources.

Most browser applications should install `@dice-o-rolla/dice-engine` instead. Use this package when
building a custom engine composition or consuming the domain model independently.

```ts
import { parseNotation, SeededRandomSource } from '@dice-o-rolla/dice-core';

const expression = parseNotation('4d20kh3s{1=-2,17..19=1,20=2} + 1');
const random = new SeededRandomSource(42);
```

Standard dice terms support `kh`, `kl`, `dh`, and `dl` selection followed by an optional score map.
Unlisted faces score zero. Paired percentile and d66 terms intentionally reject these operations.

Licensed under Apache-2.0. See `LICENSE`, `NOTICE`, and `THIRD_PARTY_NOTICES.md` in the package.
