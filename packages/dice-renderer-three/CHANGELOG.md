# @dice-o-rolla/dice-renderer-three

## 0.5.1

### Patch Changes

- Apply PandaGM Standard Numbers to the D&D dice definitions and regenerate diagnostic net assets.
- Updated dependencies
  - @dice-o-rolla/dice-geometry@0.5.1
  - @dice-o-rolla/dice-renderer@0.5.1

## 0.5.0

### Minor Changes

- e65399d: Support complete surface unwraps on a separate UV channel and catalog skin sets. Include connected
  diagnostic nets, KTX2 textures and SVG previews for standard dice and paired tens variants, while
  preserving local label UVs and existing catalog compatibility.

### Patch Changes

- Updated dependencies [44ff815]
  - @dice-o-rolla/dice-geometry@0.5.0
  - @dice-o-rolla/dice-renderer@0.5.0

## 0.4.0

### Minor Changes

- 508cce5: Allow rolls and deterministic simulations to select a registered visual preset for each physical
  die, and unify the Three.js renderer options and resource validation while adding custom face
  material providers to the top-down renderer.

### Patch Changes

- @dice-o-rolla/dice-geometry@0.4.0
  - @dice-o-rolla/dice-renderer@0.4.0

## 0.3.1

### Patch Changes

- @dice-o-rolla/dice-geometry@0.3.1
  - @dice-o-rolla/dice-renderer@0.3.1

## 0.3.0

### Patch Changes

- @dice-o-rolla/dice-geometry@0.3.0
  - @dice-o-rolla/dice-renderer@0.3.0

## 0.2.0

### Minor Changes

- 491e1ae: Add engine-owned visual preset registration, mapped physical shapes, bounded Rapier collision and
  impact-force events, plus an optional production asset package with Web Audio sprites, KTX2 PBR
  skins, independent registries, and a procedural build-time pipeline. Harden engine initialization,
  promise termination, adapter cleanup, and browser mount/unmount lifecycle guarantees.

### Patch Changes

- Include Three.js declarations as an installed dependency for strict TypeScript consumers.
- Updated dependencies [491e1ae]
  - @dice-o-rolla/dice-renderer@0.2.0
  - @dice-o-rolla/dice-geometry@0.2.0

## 0.1.1

### Patch Changes

- d597c4a: Align d10 and percentile face labels with the symmetry axis of each kite-shaped face.
- @dice-o-rolla/dice-geometry@0.1.1
  - @dice-o-rolla/dice-renderer@0.1.1

## 0.1.0

### Minor Changes

- 325802b: Prepare the first coordinated release of the framework-neutral physical dice engine, including
  standard and percentile notation, Rapier simulation, Three.js renderers, and local integration
  artifacts.

### Patch Changes

- Updated dependencies [325802b]
  - @dice-o-rolla/dice-geometry@0.1.0
  - @dice-o-rolla/dice-renderer@0.1.0
