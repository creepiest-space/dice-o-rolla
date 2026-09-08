# @dice-o-rolla/dice-assets

## 0.5.0

### Minor Changes

- e65399d: Support complete surface unwraps on a separate UV channel and catalog skin sets. Include connected
  diagnostic nets, KTX2 textures and SVG previews for standard dice and paired tens variants, while
  preserving local label UVs and existing catalog compatibility.
- 44ff815: Expose standard connected dice nets and prepared textured skin-set registration. Add a Node.js/Bun
  authoring API and CLI for layered SVG templates, validated KTX2 catalogs and transactional builds,
  with a complete authoring and browser integration guide.

### Patch Changes

- Updated dependencies [e65399d]
- Updated dependencies [44ff815]
  - @dice-o-rolla/dice-renderer-three@0.5.0
  - @dice-o-rolla/dice-geometry@0.5.0
  - @dice-o-rolla/dice-renderer@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies [508cce5]
  - @dice-o-rolla/dice-renderer-three@0.4.0

## 0.3.1

### Patch Changes

- @dice-o-rolla/dice-renderer-three@0.3.1

## 0.3.0

### Patch Changes

- @dice-o-rolla/dice-renderer-three@0.3.0

## 0.2.0

### Minor Changes

- 491e1ae: Add engine-owned visual preset registration, mapped physical shapes, bounded Rapier collision and
  impact-force events, plus an optional production asset package with Web Audio sprites, KTX2 PBR
  skins, independent registries, and a procedural build-time pipeline. Harden engine initialization,
  promise termination, adapter cleanup, and browser mount/unmount lifecycle guarantees.

### Patch Changes

- Include Three.js declarations as an installed dependency for strict TypeScript consumers.
- Updated dependencies [491e1ae]
  - @dice-o-rolla/dice-renderer-three@0.2.0
