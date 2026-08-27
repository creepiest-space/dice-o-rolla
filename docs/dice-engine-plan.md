# Dice engine implementation plan

## 1. Current baseline

The repository is an empty Bun + TypeScript monorepo prepared for implementation:

- Bun `1.3.14` with `apps/*` and `packages/*` workspaces;
- Turborepo `2.10` with `build`, `test`, `typecheck`, and `dev` tasks;
- TypeScript `7` with strict mode, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, and ESM/bundler semantics;
- Oxlint, Oxfmt, Knip, Commitlint, and Lefthook at the root;
- no existing application or package conventions beyond the root configuration.

Both local references required by the specification are available:

- `tmp/3DDiceRoller` — algorithms and behavioral reference;
- `tmp/anvil-dice-engine` — architecture reference only.

The implementation will use the `@creepiest-space/*` package scope, explicit public exports,
workspace dependencies, and the existing root toolchain.

## 2. Delivery strategy

Work is split into reviewable milestones. The critical path is:

```text
source analysis
  -> package foundations
  -> parser and geometry
  -> backend contracts
  -> d6 vertical slice
  -> engine lifecycle
  -> standard polyhedra
  -> demo and polish
  -> full validation
```

Each milestone ends with the smallest relevant tests. `bun run check` is required after every
non-trivial milestone; `bun run check:full` is required for the final milestone.

Every completed implementation iteration must be recorded in its own Conventional Commit. An
iteration is complete only when its scoped deliverable is implemented, the relevant checks pass,
and the resulting changes are committed. Do not combine unrelated iterations in one commit or
start the next iteration with uncommitted changes from the previous one.

## 3. Milestones

### M0 — Reference analysis and architectural decisions

Study the required files in `tmp/3DDiceRoller` and document, per file:

- responsibility and dependencies;
- reusable geometry, numbering, notation, throw, and result algorithms;
- Cannon.js and legacy UI coupling to discard;
- physical concepts that need a Rapier equivalent.

Study the Anvil engine facade, forge, parser, controller, core, and types. Record only architectural
observations; do not copy code or assets from the UNLICENSED project.

Deliverables:

- `docs/source-analysis.md`;
- initial coordinate conventions: Y-up, right-handed coordinates, quaternion `{x,y,z,w}`;
- a Cannon-to-Rapier concept mapping;
- explicit decisions for face numbering and percentile semantics.

Exit criteria:

- every required reference file is covered;
- geometry and face mapping can be implemented without relying on triangle order;
- open technical questions are recorded before package code is introduced.

### M1 — Workspace and package foundations

Create the initial workspace graph:

```text
packages/dice-core
packages/dice-geometry
packages/dice-physics
packages/dice-physics-rapier
packages/dice-renderer
packages/dice-renderer-three
packages/dice-engine
apps/dice-demo
```

For every package, configure:

- scoped package name and `workspace:*` internal dependencies;
- ESM, `exports`, and type exports;
- package-local TypeScript configuration extending `tsconfig.base.json`;
- Turbo-compatible `build`, `typecheck`, and `test` scripts;
- source-only imports through public package entry points.

Before choosing a bundler, verify whether plain `tsc` declarations plus a small ESM bundler is
enough for browser packages. Add only one shared build convention.

Exit criteria:

- dependency graph has no cycles;
- empty package skeletons participate in root checks;
- `dice-core` has no DOM, Three.js, or Rapier dependency.

### M2 — Core domain, notation, and deterministic utilities

Implement in `dice-core`:

- immutable vector/quaternion-like domain types;
- die definitions and roll result types;
- notation AST and parser for `d20`, `2d6`, sums, and signed modifiers;
- result aggregation;
- typed event emitter;
- `RandomSource` with a default adapter and deterministic test implementation;
- roll/session identifiers and state types.

Design the parser as a tokenizer plus parser rather than one monolithic regular expression. Reserve
AST extension points for keep/drop, reroll, explode, and success-counting operators without
implementing them yet.

Tests:

- whitespace and sign handling;
- multiple dice terms and modifiers;
- invalid and incomplete expressions;
- stable AST output and total aggregation;
- deterministic random source behavior.

Exit criteria:

- parser and aggregation work without browser or physics dependencies;
- no `any`, unsafe global mutable state, or backend-specific types.

### M3 — Geometry model and face resolution

Implement backend-neutral definitions in `dice-geometry`:

- vertices and logical polygon faces;
- explicit face values and outward unit normals;
- separate render and collider conversion inputs;
- geometry registry for `d6` first;
- quaternion-vector transformation and upward-face resolver.

Face resolution must maximize the dot product of the transformed logical normal with world up. It
must not infer values from generated triangle indices.

Tests:

- registry and definition invariants;
- normalized, outward face normals;
- valid and unique face values;
- known orientations for `d6`;
- smoke harness ready for every later die type.

Exit criteria:

- one authoritative d6 definition can drive rendering, collision, and result resolution;
- coordinate and scaling conventions are documented in `docs/dice-definitions.md`.

### M4 — Backend-neutral physics and renderer contracts

Implement `dice-physics`:

- world, die handle, tray, transform, and state contracts;
- create/remove/clear/destroy lifecycle;
- physics material and tray profile types;
- throw parameter generator using injected `RandomSource`;
- backend-neutral settling detector with stable-time and maximum-time rules.

Implement `dice-renderer`:

- create/update/remove die contracts;
- render, resize, clear, and idempotent destroy lifecycle;
- render snapshots containing previous and current transforms.

Keep DOM usage out of core packages. If container ownership is needed, place it in the browser
integration API rather than the renderer-neutral model.

Tests:

- settling threshold, stable duration, sleeping shortcut, reset, and timeout;
- reproducible throw parameter generation;
- contract fakes suitable for engine tests.

Exit criteria:

- engine behavior can be tested with fake physics and renderer implementations;
- no Rapier or Three.js types leak through public contracts.

### M5 — Rapier backend and d6 physics

Implement `dice-physics-rapier` with the official Rapier JavaScript/WASM compatibility package:

- shared-safe asynchronous WASM initialization;
- fixed-step world wrapper;
- dynamic die bodies and fixed tray bodies;
- convex-hull collider generation from the d6 definition;
- material profiles, damping, sleeping, impulses, and optional CCD;
- domain/Rapier transform adapters;
- complete cleanup of bodies, colliders, and world references.

Calibrate values from the physical intent of 3DDiceRoller rather than copying Cannon.js API or
constants blindly.

Integration tests:

- initialization is safe across repeated calls;
- a d6 falls onto and remains inside the tray;
- linear and torque impulses change motion;
- body state and quaternion conversion are correct;
- settling occurs before the hard timeout;
- cleanup and repeated destroy calls are safe.

Exit criteria:

- headless d6 simulation produces a valid resolved face from its final physical orientation;
- collider is a real convex polyhedron, not a bounding box.

### M6 — Three.js renderer and complete d6 vertical slice

Implement `dice-renderer-three`:

- scene, camera, WebGL renderer, lights, shadows, and resource ownership;
- d6 mesh factory driven by the shared geometry definition;
- basic plastic and matte materials;
- transform interpolation with position lerp and quaternion slerp;
- `ResizeObserver` plus explicit resize support;
- complete geometry, material, renderer, canvas, and observer disposal.

Assemble the first browser pipeline:

```text
roll("1d6") -> parse -> create body/mesh -> throw -> fixed-step simulation
             -> settle -> resolve face -> RollResult
```

Exit criteria:

- displayed upper face equals the returned value;
- rendering never writes physics state;
- fixed timestep is independent of animation-frame delta;
- repeated initialize/clear/destroy cycles do not leak owned resources.

### M7 — DiceEngine facade, sessions, queue, and events

Implement `dice-engine` against contracts only:

- asynchronous initialization;
- one `RollSession` per request;
- Promise-based `roll()` with FIFO queue policy;
- cancellation and failure transitions;
- typed start, die-settled, completion, cancellation, and error events;
- modifier aggregation;
- visual theme state kept separate from physics profiles;
- clear, resize, and idempotent destroy behavior.

Add a browser convenience factory in an integration entry point that composes Rapier and Three.js;
do not add those dependencies to the backend-neutral facade.

Tests with fakes:

- lifecycle and invalid-state calls;
- two immediate rolls execute sequentially;
- Promise and events belong to the correct session;
- cancellation, timeout, error propagation, clear, theme merge, and destroy.

Exit criteria:

- the facade imports neither Three.js nor Rapier;
- no singleton pending resolver exists;
- all roll promises have a completion, cancellation, failure, or timeout path.

### M8 — Standard polyhedral dice

Add dice in this order: `d4`, `d8`, `d10`, `d12`, `d20`. For each die, complete one small vertical
slice before moving to the next:

1. authoritative vertices, logical faces, values, and normals;
2. render mesh and label orientation;
3. convex collider;
4. known-orientation resolver tests;
5. Rapier smoke test and browser visual verification.

Exit criteria:

- every standard die physically rolls and returns only a valid face value;
- definitions satisfy geometry invariants and do not depend on triangulation order;
- 20 simultaneous dice settle reliably within the configured timeout.

### M9 — Percentile notation and dice

Add `d%`, `d100`, and `d66` semantics to the AST and aggregation model. Represent percentile rolls
as two physical d10-family dice, with explicit tens and units values and `00 + 0 = 100`.

Tests:

- parser and AST cases;
- all percentile boundary combinations;
- result contains both physical dice;
- no random shortcut determines the reported percentile value.

Exit criteria:

- percentile results are derived from settled body orientations;
- public result types describe component dice without special-case ambiguity.

### M10 — Thin demo application

Create a minimal browser app that consumes only public package exports and provides:

- notation input, Roll, and Clear;
- shortcuts for all supported dice;
- last result display;
- plastic/matte theme selection;
- physics preset selection;
- responsive canvas behavior.

Do not port UI, assets, sounds, textures, or shaders from either reference repository.

Exit criteria:

- demo contains no parsing, physics, face-resolution, or roll-queue logic;
- production build succeeds and the displayed result matches the engine response.

### M11 — Documentation, performance, and release validation

Complete:

- root `README.md` with setup and consumer examples;
- `docs/architecture.md` with dependency boundaries and lifecycle;
- `docs/physics.md` and `docs/rapier-backend.md`;
- final `docs/source-analysis.md` and `docs/dice-definitions.md`;
- performance checks for 20, 50, and 100 dice, targeting reliable use at 20–50 dice.

Run the complete gate:

```sh
bun run format
bun run check:full
```

Also manually verify the demo in a browser for resize, repeated rolls, queueing, clearing, themes,
and teardown.

Exit criteria:

- every item in the project Definition of Done is satisfied;
- lint, typecheck, tests, dead-code analysis, and builds pass from the repository root;
- remaining limitations and performance observations are documented.

## 4. Cross-cutting implementation rules

- Keep applications thin and package imports public.
- Preserve strict TypeScript settings; do not solve errors by weakening root configuration.
- Never import an application from another application.
- Keep Three.js, Rapier, DOM, and WASM details at their designated boundaries.
- Use one-way state flow: Rapier -> domain snapshot -> Three.js.
- Separate visual themes from physics material profiles.
- Treat physics output as the result; randomness affects only initial throw conditions.
- Make resource ownership explicit and every destructive lifecycle operation idempotent.
- Do not copy Anvil implementation or assets; do not add Cannon.js as a dependency.
- Keep commits and changes small enough that each milestone can be reviewed independently.

## 5. Suggested commit sequence

```text
docs: analyze dice engine references
chore: scaffold dice engine workspaces
feat(core): add notation and roll domain
feat(geometry): add d6 definition and face resolver
feat(physics): add backend contracts and settling detector
feat(rapier): add d6 physics backend
feat(renderer): add three.js d6 renderer
feat(engine): add queued roll lifecycle
feat(geometry): add standard polyhedral dice
feat(core): add percentile dice notation
feat(demo): add browser dice demo
docs: complete dice engine documentation
```

Each listed commit is a required iteration boundary. If a milestone needs several independently
verifiable changes, split it into additional small Conventional Commits rather than accumulating a
large milestone commit.
