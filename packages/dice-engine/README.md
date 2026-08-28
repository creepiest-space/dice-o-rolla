# `@creepiest-space/dice-engine`

Framework-neutral orchestration for physically simulated polyhedral dice. The package exposes a
backend-neutral engine and an optional browser composition backed by Rapier and Three.js.

## Browser usage

```ts
import { createDefaultDiceEngine } from '@creepiest-space/dice-engine/browser';

const container = document.querySelector<HTMLElement>('#dice-tray');
if (container === null) throw new Error('Missing dice tray');

const engine = await createDefaultDiceEngine({ container });
const result = await engine.roll('2d20 + 4');

console.log(result.total, result.dice);
engine.destroy();
```

The browser entry point initializes Rapier WASM, creates the Three.js renderer, uses Web Crypto for
throw generation, and releases partially initialized resources if composition fails.

## Custom adapters

```ts
import { DiceEngine } from '@creepiest-space/dice-engine';

const engine = new DiceEngine({ physics, renderer });
await engine.initialize();
```

The main entry point depends on domain contracts rather than concrete Rapier or Three.js types.

## Supported notation

The initial grammar supports standard polyhedral expressions and integer modifiers, including:

```text
d20
4d6 + 2
d%
d100
d66
```

Default resource limits reject oversized notation, more than 50 logical or physical dice, and more
than eight pending rolls. Consumers may lower or explicitly raise these limits through
`DiceEngineOptions.limits` after testing their target devices.

## Trust and cleanup

Client-side results are not authoritative for rankings, prizes, or wagering. Call `destroy()` when
the engine is no longer needed to release frame scheduling, observers, physics resources, WebGL
resources, and the renderer canvas.

## License

Licensed under the Apache License, Version 2.0. The package archive includes `LICENSE`, `NOTICE`, and
`THIRD_PARTY_NOTICES.md`.
