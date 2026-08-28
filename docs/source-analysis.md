# Dice engine source analysis

## Scope and licensing

Two local repositories were inspected before implementation:

- `tmp/3DDiceRoller`, released into the public domain under the Unlicense, is the behavioral and
  algorithmic source for standard polyhedra, numbering, throw mechanics, result resolution, and
  notation behavior.
- `tmp/anvil-dice-engine`, declared `UNLICENSED`, is an architecture comparison only. No code,
  assets, shaders, textures, or sounds from it may be copied into this repository.

The target is a new TypeScript implementation using backend-neutral domain packages, Rapier for
physics, and Three.js for rendering. Cannon.js concepts are translated, not ported as APIs.

## 3DDiceRoller analysis

### `includes/DiceFactory.js`

Responsibility:

- registers dice presets and visual metadata;
- owns standard polyhedral vertices and polygon faces;
- chamfers render geometry and triangulates logical faces;
- builds Cannon convex shapes from the unchamfered vertices;
- creates Three.js meshes and label materials;
- resolves the displayed value from mesh face normals.

Dependencies and coupling:

- directly uses global `THREE`, `CANNON`, `window.DiceFactory`, favorites, colors, textures, and DOM
  canvas APIs;
- attaches physics shapes and result methods to mutable Three.js geometry and mesh objects;
- uses material indices as an implicit bridge between geometry, labels, and values.

Useful source material:

- authoritative ideal vertices and polygon topology for d4, d6, d8, d10, d12, and d20;
- explicit value stored as the last element of each source polygon;
- render chamfer algorithm: move per-face vertex copies toward each face center, then generate edge
  and corner faces;
- convex collider intent: use the ideal polyhedron rather than a bounding box;
- orientation-based result concept: rotate a logical face normal and select the direction nearest
  world up; d4 uses the resting face/opposite vertex convention.

What will be ported conceptually:

- ideal polyhedral topology and standard value associations;
- independently derived chamfered render geometry;
- independently derived convex collision vertices;
- face normals calculated from logical polygon definitions and validated by tests.

What will be discarded:

- old `THREE.Geometry`, `THREE.Face3`, Cannon shapes, global state, and mesh monkey-patching;
- material-index arithmetic as the result model;
- texture/material caches and all source assets;
- dependence on generated triangle order for face/value resolution;
- special value mutation through swapping material indices.

### `includes/DiceBox.js`

Responsibility:

- owns the Three scene, Cannon world, camera, renderer, tray, input, sound, and animation loop;
- expands parsed notation into randomized spawn transforms and velocities;
- creates rigid bodies, runs a hidden simulation, resets bodies, then replays it visibly;
- detects sleeping, handles rerolls and forced values, and aggregates results.

Dependencies and coupling:

- mixes DOM/input, audio, rendering, physics, notation, roll rules, result formatting, and globals in
  one class;
- assumes a source Z-up world: gravity is `(0, 0, -9.8 * 800)` and the desk is the Z=0 plane;
- directly reads and writes Cannon body fields and Three mesh transforms.

Useful source material:

- fixed simulation step of `1 / 60`;
- tray floor plus four fixed barriers;
- distinct desk/die, wall/die, and die/die material intent;
- randomized spawn position, orientation, linear motion, and angular motion;
- source body parameters: linear/angular damping `0.1`, sleeping enabled, and a sleep-time concept;
- hard termination intent (`iteration > 1000`) so a roll cannot run forever;
- result is stored only after physical rest.

What will be ported conceptually:

- fixed-step simulation, bounded tray, physical initial conditions, damping, sleeping observation,
  hard timeout, and one-way transform synchronization;
- separate throw generation with injected randomness;
- aggregation after all physical dice settle.

What will be discarded:

- simulate-then-replay, direct velocity assignment as the only throw API, forced result swapping,
  reroll mutation inside the physics loop, callback lifecycle, audio/UI behavior, and global access;
- source numeric scale (`baseScale` around 50 and gravity multiplied by 800), which makes velocity and
  sleep thresholds non-transferable to a normalized Rapier world;
- sleeping as the sole completion condition.

### `includes/DicePreset.js`

Responsibility:

- stores type, shape alias, labels, values, mass, inertia-like throw tuning, scale, and visual data;
- expands d4 labels into three labels per triangular face;
- loads label and bump-map images.

Useful source material:

- distinction between a logical die type and a reused physical shape (`d100` uses `d10`);
- value sequences and the d4 display convention;
- per-die relative mass/throw tuning as calibration hints.

What will be discarded:

- image loading, DOM types, mutable presets, mixed physics/visual fields, and array padding that exists
  only to match Three material indices.

Target replacement:

- immutable geometry definitions, separate visual themes, and separate physics profiles;
- aliases or percentile component roles represented explicitly rather than by implicit label offsets.

### `includes/DiceNotation.js`

Responsibility:

- parses dice sets, arithmetic operators, legacy function blocks, grouping metadata, boost markers,
  and forced results;
- combines duplicate sets and serializes its mutable parsed representation.

Useful generic behavior:

- omitted count defaults to one;
- whitespace is insignificant;
- multiple dice terms and a trailing signed constant are supported;
- parsing and serialization are separate concepts.

Legacy behavior not included in the initial parser:

- `!` throw boost markers;
- `@` forced results;
- arbitrary registered dice names, global factory validation, implicit `d20` for a bare modifier;
- multiplication, division, remainder, exponentiation, and incomplete grouping implementation;
- `{function,args}` extension syntax and silent coalescing of duplicate terms.

Target approach:

- tokenizer plus typed AST with complete-input validation and structured errors;
- initial grammar limited to additive dice terms and signed integer modifiers;
- future keep/drop, reroll, explode, success-counting, advantage, and disadvantage nodes can be added
  without changing the basic dice node.

### `includes/DiceRoller.js`

Responsibility:

- application bootstrap and global service locator;
- constructs factory, colors, functions, rooms, socket behavior, settings UI, and event bindings;
- coordinates theme and surface selection and browser lifecycle.

Useful source material:

- confirms that engine configuration, theme selection, and application/network behavior are distinct
  concerns even though the legacy implementation combines them.

What will be discarded:

- the class itself, global assignments, jQuery/Teal integration, socket and room logic, settings UI,
  browser-global event management, and source UI behavior.

Target replacement:

- a small backend-neutral `DiceEngine` facade and a thin demo that owns UI and browser composition.

### `includes/DiceFunctions.js`

Responsibility:

- registers reroll and after-roll callbacks;
- implements basic reroll, advantage, disadvantage, and unfinished filter/template behaviors;
- mutates mesh result histories and ignored flags.

Useful source material:

- roll operators should run on structured groups/results, not on a flattened total;
- reroll rules operate during the roll lifecycle, while keep/drop rules operate during aggregation.

What will be deferred or discarded:

- dynamic function registry, arbitrary string arguments, mesh mutation, forced faces, and application
  help objects;
- reroll and keep/drop execution in the first vertical slice. The AST will reserve extension points,
  but these features will be implemented only after the base lifecycle is stable.

## Geometry and value mapping

The source stores each ideal polygon as `[vertexIndex..., value]`. The target will split this into
explicit fields and will never expose the encoded source array format.

| Die | Ideal topology                                   | Source value convention                    | Target result direction                     |
| --- | ------------------------------------------------ | ------------------------------------------ | ------------------------------------------- |
| d4  | tetrahedron, 4 vertices / 4 triangles            | face labels contain the other three values | opposite of the resting-face outward normal |
| d6  | cube, 8 vertices / 6 quads                       | polygon values 1–6                         | upward face normal                          |
| d8  | octahedron, 6 vertices / 8 triangles             | polygon values 1–8                         | upward face normal                          |
| d10 | pentagonal trapezohedron, 12 vertices / 10 kites | source face ids 0–9 map to values/labels   | upward face normal                          |
| d12 | dodecahedron, 20 vertices / 12 pentagons         | polygon values 1–12                        | upward face normal                          |
| d20 | icosahedron, 12 vertices / 20 triangles          | polygon values 1–20                        | upward face normal                          |

For d4, a `FaceDefinition.normal` is a logical result direction rather than necessarily the outward
normal of the rendered triangle. Defining it as the negated resting-face normal preserves the generic
`max(dot(rotatedNormal, worldUp))` resolver.

The source d10 polygon ids `0–9` are converted explicitly to ordinary values `1–10`. The percentile
adapter displays value ten as digit `0` and tens value `00`; the pair `00 + 0` is 100. This avoids
carrying the source's label/material offset arithmetic into geometry.

## Coordinate convention

The target convention is fixed before geometry implementation:

- right-handed coordinates;
- world up is positive Y;
- the tray floor is Y=0 and gravity points along negative Y;
- domain quaternion field order is `{ x, y, z, w }`;
- a quaternion rotates a local vector into world space;
- geometry is centered at the origin and defined in normalized die units.

3DDiceRoller uses positive Z as up. Source geometry is converted once when definitions are authored:

```text
targetX = sourceX
targetY = sourceZ
targetZ = -sourceY
```

This is a proper rotation that preserves handedness. Source-space conversion must not appear in
runtime physics/render loops. Rapier and Three adapters will copy the already-normalized domain
transform and will be covered by rotation tests.

## Result resolution decision

The target resolver is backend-neutral:

```text
for each logical result face
  rotate its local result normal by the domain quaternion
  compute dot(rotatedNormal, worldUp)
return the value with the greatest dot product
```

Definitions must have one tested result direction per possible value. Render chamfer faces and
triangulation are irrelevant. Tests will cover identity and known rotations plus a validity smoke
test for every die.

The implemented resolver deterministically selects the greatest alignment after the die settles. It
does not yet expose a confidence margin for a physically stable cocked die; this limitation is
explicit and never replaced by a random tie-break result.

## Cannon-to-Rapier concept mapping

Source values are calibration clues, not compatible constants.

| Physical concept | 3DDiceRoller/Cannon                             | Target Rapier abstraction                                             |
| ---------------- | ----------------------------------------------- | --------------------------------------------------------------------- |
| gravity          | world gravity in a large Z-up unit scale        | configurable Y-down world gravity, initially `-9.81`                  |
| dynamic die      | `CANNON.Body` with mass and convex shape        | dynamic rigid body plus convex-hull collider                          |
| floor/walls      | mass-zero plane bodies                          | fixed rigid bodies with floor/wall colliders                          |
| die shape        | `CANNON.ConvexPolyhedron` from ideal vertices   | convex hull generated from definition vertices                        |
| friction         | pair-specific contact materials                 | collider friction and documented combine rule                         |
| restitution      | pair-specific contact materials                 | collider restitution and documented combine rule                      |
| damping          | body linear/angular damping `0.1`               | rigid-body linear and angular damping                                 |
| throw            | initial velocity and angular velocity           | linear impulse and torque impulse after creation                      |
| initial rotation | random axis/angle                               | random normalized domain quaternion                                   |
| sleeping         | allowed with source-scale speed/time thresholds | Rapier sleeping as a hint plus custom settling detector               |
| stepping         | fixed `1 / 60`                                  | fixed `1 / 60` accumulator owned by engine loop                       |
| tunneling        | not explicitly addressed                        | optional CCD for high-energy throws after measurement                 |
| termination      | sleep or 1000 iterations                        | stable-duration detector plus `maxRollTimeMs`                         |
| cleanup          | remove bodies/meshes                            | explicit remove/clear/idempotent destroy and released WASM references |

Rapier method use was verified against the installed official package. Combine rules remain at the
backend defaults, and backend objects stay private to `dice-physics-rapier`.

## Anvil architecture comparison

### Useful ideas

- `DiceEngine` demonstrates a small consumer-facing facade around initialization, rolling, theme,
  resize, events, and destruction.
- `RollController` makes a roll coordinator distinct from scene/world setup and groups physical dice
  for percentile aggregation.
- `DiceParser` is separated from rendering and physics.
- `EngineCore` identifies a composition and loop layer.
- `SceneManager` separates camera/lights/tray visuals from roll rules.
- Theme and physics settings are represented as different structures.

These are responsibility-level observations only; the target implementation will be independently
designed against package contracts.

### Problems not to repeat

- The app package declares React and React DOM peer dependencies even though the intended core facade
  should be framework-neutral.
- The facade uses one `_pendingRollResolve`, so a second roll resolves the previous Promise with a
  fabricated cancellation result instead of preserving session identity.
- Events use `Function`, string keys, and `any` rather than a typed event map.
- `setTheme` relies on an unsafe partial-to-complete cast and does not own coherent theme state.
- `resize()` is incomplete; `EngineCore` installs an anonymous window listener that cannot be removed.
- `destroy()` stops the frame and removes the canvas but does not fully dispose renderer, scene,
  physics, controls, listeners, geometries, or materials.
- `DiceForge` combines geometry, material creation, canvas textures, label/value mapping, Cannon
  shapes, caching, and result metadata in one large class.
- `RollController` directly depends on both Three.js and Cannon, uses unsafe casts, mutates arrays
  during aggregation, and mixes spawning, settling, resolution, percentile rules, and rendering sync.
- Settling is a single-frame velocity threshold with no stable duration or hard timeout.
- The parser tolerates malformed input and silently substitutes values instead of validating the
  complete notation.
- Physics is advanced from a frame delta, transform interpolation is absent, and cleanup ownership is
  incomplete.
- Application, server, React UI, audio, and library-like engine code live in one package.

## Target responsibility boundaries

```text
dice-core
  domain values, AST, sessions, events, random source, math-like data

dice-geometry
  ideal polyhedra, logical result directions, registry, resolver

dice-physics
  backend contracts, throw generation, settling policy

dice-physics-rapier
  WASM initialization, world, bodies, colliders, Rapier adapters

dice-renderer
  backend-neutral render snapshots and lifecycle

dice-renderer-three
  scene, camera, mesh/material factories, interpolation, disposal

dice-engine
  roll sessions, queue, orchestration, aggregation, typed events

dice-demo
  browser composition and UI only
```

The composition root creates concrete Rapier and Three implementations and injects them into the
backend-neutral engine. State flows only from physics to a domain snapshot and then to rendering.

## Decisions carried into implementation

1. Use Y-up consistently in domain, Rapier, and Three.js.
2. Normalize geometry around the origin; calibrate real scale and mass in Rapier rather than copying
   source units.
3. Store explicit logical faces and values, independent of render triangulation and materials.
4. Begin with one complete d6 pipeline before adding other polyhedra.
5. Use convex hulls from authoritative vertices; bounding boxes are not acceptable standard-die
   colliders.
6. Apply randomness only to physical initial conditions through `RandomSource`.
7. Resolve results only from final rigid-body orientation.
8. Use both velocity stability over time and sleeping state, bounded by a hard roll timeout.
9. Model every roll as an independent session and initially serialize sessions through a FIFO queue.
10. Keep themes and physics profiles separate and make all cleanup paths idempotent.

## Final implementation disposition

Measured implementation resolved the original open choices as follows:

- normalized circumradius-one geometry is shared by collider and renderer; the default die scale and
  mass are both one;
- the default tray is 10 × 10 with six-unit walls, which contain the full 3.5–5 spawn height and make
  deterministic 20/50-die profiles reliable;
- ideal polyhedral vertices form Rapier convex hulls; render triangulation and materials remain
  irrelevant to collisions and results;
- the engine uses a `1 / 60` fixed step, 0.25 damping, velocity thresholds of 0.08, 300 ms stability,
  and a 10-second hard timeout;
- CCD is enabled in the initial Rapier backend; its cost has not yet been isolated from other
  high-count costs;
- the initial renderer uses per-face canvas textures. An atlas, resource sharing, and instancing are
  deferred optimizations;
- a separate cocked-die confidence margin is not implemented. Velocity stability and the hard
  timeout prevent resolving a still-moving die, but a physically stable edge case selects the best
  aligned logical direction.

The final architecture follows the recorded target boundaries. No Anvil implementation or assets
were copied, no Cannon.js dependency was introduced, and percentile values are derived from two
settled physical components. Remaining scale and rendering limitations are recorded in
`docs/performance.md` rather than hidden behind fabricated success paths.
