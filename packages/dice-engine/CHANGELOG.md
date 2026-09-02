# @dice-o-rolla/dice-engine

## 0.4.0

### Minor Changes

- 508cce5: Allow rolls and deterministic simulations to select a registered visual preset for each physical
  die, and unify the Three.js renderer options and resource validation while adding custom face
  material providers to the top-down renderer.

### Patch Changes

- Updated dependencies [508cce5]
  - @dice-o-rolla/dice-renderer-three@0.4.0
  - @dice-o-rolla/dice-core@0.4.0
  - @dice-o-rolla/dice-geometry@0.4.0
  - @dice-o-rolla/dice-physics@0.4.0
  - @dice-o-rolla/dice-physics-rapier@0.4.0
  - @dice-o-rolla/dice-renderer@0.4.0

## 0.3.1

### Patch Changes

- a840fe3: Restore deterministic repeated seeded simulations by resetting Rapier solver state, and terminate
  replay cleanly when its frame scheduler throws.
- Updated dependencies [a840fe3]
  - @dice-o-rolla/dice-physics@0.3.1
  - @dice-o-rolla/dice-physics-rapier@0.3.1
  - @dice-o-rolla/dice-core@0.3.1
  - @dice-o-rolla/dice-geometry@0.3.1
  - @dice-o-rolla/dice-renderer@0.3.1
  - @dice-o-rolla/dice-renderer-three@0.3.1

## 0.3.0

### Minor Changes

- Add deterministic physical simulation and renderer-only replay with bounded, versioned traces,
  definition and result verification, collision/impact timelines, and immutable die provenance.

### Patch Changes

- Updated dependencies
  - @dice-o-rolla/dice-core@0.3.0
  - @dice-o-rolla/dice-geometry@0.3.0
  - @dice-o-rolla/dice-physics@0.3.0
  - @dice-o-rolla/dice-physics-rapier@0.3.0
  - @dice-o-rolla/dice-renderer@0.3.0
  - @dice-o-rolla/dice-renderer-three@0.3.0

## 0.2.0

### Minor Changes

- 491e1ae: Add engine-owned visual preset registration, mapped physical shapes, bounded Rapier collision and
  impact-force events, plus an optional production asset package with Web Audio sprites, KTX2 PBR
  skins, independent registries, and a procedural build-time pipeline. Harden engine initialization,
  promise termination, adapter cleanup, and browser mount/unmount lifecycle guarantees.
- d97722f: Add keep/drop dice selection and per-face score maps to standard dice notation and roll results.

### Patch Changes

- Updated dependencies [491e1ae]
- Updated dependencies [d97722f]
  - @dice-o-rolla/dice-physics@0.2.0
  - @dice-o-rolla/dice-physics-rapier@0.2.0
  - @dice-o-rolla/dice-renderer@0.2.0
  - @dice-o-rolla/dice-renderer-three@0.2.0
  - @dice-o-rolla/dice-core@0.2.0
  - @dice-o-rolla/dice-geometry@0.2.0

## 0.1.1

### Patch Changes

- Updated dependencies [d597c4a]
  - @dice-o-rolla/dice-renderer-three@0.1.1
  - @dice-o-rolla/dice-core@0.1.1
  - @dice-o-rolla/dice-geometry@0.1.1
  - @dice-o-rolla/dice-physics@0.1.1
  - @dice-o-rolla/dice-physics-rapier@0.1.1
  - @dice-o-rolla/dice-renderer@0.1.1

## 0.1.0

### Minor Changes

- 325802b: Prepare the first coordinated release of the framework-neutral physical dice engine, including
  standard and percentile notation, Rapier simulation, Three.js renderers, and local integration
  artifacts.

### Patch Changes

- Updated dependencies [325802b]
  - @dice-o-rolla/dice-core@0.1.0
  - @dice-o-rolla/dice-geometry@0.1.0
  - @dice-o-rolla/dice-physics@0.1.0
  - @dice-o-rolla/dice-physics-rapier@0.1.0
  - @dice-o-rolla/dice-renderer@0.1.0
  - @dice-o-rolla/dice-renderer-three@0.1.0
