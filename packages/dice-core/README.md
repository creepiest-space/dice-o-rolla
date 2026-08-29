# `@dice-o-rolla/dice-core`

Framework-neutral domain primitives for Dice O Rolla: notation parsing, roll results, lifecycle
events, limits, and random sources.

Most browser applications should install `@dice-o-rolla/dice-engine` instead. Use this package when
building a custom engine composition or consuming the domain model independently.

```ts
import { parseNotation, SeededRandomSource } from '@dice-o-rolla/dice-core';

const expression = parseNotation('2d20 + 4');
const random = new SeededRandomSource(42);
```

Licensed under Apache-2.0. See `LICENSE`, `NOTICE`, and `THIRD_PARTY_NOTICES.md` in the package.
