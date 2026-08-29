# dice-o-rolla

A framework-neutral physical dice engine built with strict TypeScript, Rapier, and Three.js. Dice
results come from settled rigid-body orientations; random values are used only to generate the
physical throw.

The repository is a Bun workspace whose publishable packages are independently layered so the
domain, geometry, physics contracts, Rapier backend, renderer contracts, Three.js adapter, and
consumer-facing engine can evolve without application coupling.

## Requirements

- Bun 1.3 or newer;
- a WebGL 2 browser for the Three.js renderer;
- Node.js 20 or newer only when using Node-based repository tooling.

## Start the demo

```sh
bun install
bun run dev
```

Turbo starts `apps/dice-demo`; open the URL printed by Bun. The demo supports notation input,
quick-roll buttons, clearing, plastic/matte themes, throw presets, and responsive resizing.

Create a production bundle with:

```sh
bun run build
```

## Browser consumer

Install the complete browser composition from npm:

```sh
npm install @dice-o-rolla/dice-engine
```

The browser composition entry creates the official Rapier and Three.js adapters and initializes the
engine:

```ts
import { createDefaultDiceEngine } from '@dice-o-rolla/dice-engine/browser';

const container = document.querySelector<HTMLElement>('#dice-tray');
if (container === null) throw new Error('Missing dice tray');

const engine = await createDefaultDiceEngine({ container });
const result = await engine.roll('2d20 + 4');

console.log(result.total, result.dice);
engine.setTheme({ material: 'matte', roughness: 0.85 });

// Release the frame loop, WebGL resources, observers, and Rapier world.
engine.destroy();
```

Applications with custom backends can import `DiceEngine` from `@dice-o-rolla/dice-engine` and
inject implementations of `PhysicsWorld` and `DiceRenderer`.

The browser composition uses Web Crypto for throw generation by default. `mathRandomSource` remains
available as an explicitly non-cryptographic adapter, while `SeededRandomSource` is intended for
reproducible tests and simulations. A cryptographic random source makes initial throw conditions
harder to predict, but it does not make a result calculated in an end-user browser authoritative.
Competitive play, rankings, prizes, and wagering require a trusted server-side result; publicly
verifiable fairness additionally requires a protocol such as commit-reveal.

## Supported notation

```text
d20
2d6
4d6+5
1d8 + 2d6 - 1
d%
d100
d66
```

`d%` and `d100` each create a tens d10 and a units d10. `00 + 0` is 100. `d66` creates two physical
d6 dice and produces values from 11 through 66. Percentile and d66 results retain both physical dice
and their component roles.

## Packages

| Workspace                           | Responsibility                                         |
| ----------------------------------- | ------------------------------------------------------ |
| `@dice-o-rolla/dice-core`           | notation, results, events, random source, domain types |
| `@dice-o-rolla/dice-geometry`       | immutable polyhedra and face resolution                |
| `@dice-o-rolla/dice-physics`        | backend contracts, throw generation, settling policy   |
| `@dice-o-rolla/dice-physics-rapier` | Rapier WASM world, bodies, tray, convex colliders      |
| `@dice-o-rolla/dice-renderer`       | renderer-neutral snapshots and lifecycle               |
| `@dice-o-rolla/dice-renderer-three` | Three.js scene, meshes, labels, interpolation          |
| `@dice-o-rolla/dice-engine`         | sessions, queue, fixed-step orchestration, facade      |
| `@dice-o-rolla/dice-demo`           | thin browser UI                                        |

See [architecture](docs/architecture.md), [physics](docs/physics.md),
[Rapier backend](docs/rapier-backend.md), [dice definitions](docs/dice-definitions.md),
[versioning](docs/versioning.md), [npm publishing](docs/npm-publishing.md), and
[security guidance](docs/security.md) for design, release, and deployment details.

Build the library package graph with `bun run build:dice-engine`, or create the verified local
integration bundle in `artifacts/` with `bun run pack:dice-engine`. See
[library packaging](docs/packaging.md) for installation instructions, contents, and the release
boundary.

## Verification

```sh
bun run check
bun run check:full
```

The full gate runs formatting, ordinary and type-aware lint, strict TypeScript checks, tests,
dead-code analysis, and every production build. See [performance observations](docs/performance.md)
for the measured 20/50/100-die load profile.

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE), [NOTICE](NOTICE), and
[third-party notices](THIRD_PARTY_NOTICES.md).
