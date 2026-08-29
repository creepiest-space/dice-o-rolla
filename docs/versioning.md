# Versioning and changelogs

## Release unit

The seven runtime packages form one product and use a coordinated version:

```text
@dice-o-rolla/dice-core
@dice-o-rolla/dice-geometry
@dice-o-rolla/dice-physics
@dice-o-rolla/dice-physics-rapier
@dice-o-rolla/dice-renderer
@dice-o-rolla/dice-renderer-three
@dice-o-rolla/dice-engine
```

Changesets configures them as a fixed group, so changing one package versions the complete runtime
set. The private root workspace and `@dice-o-rolla/dice-demo` are not release units.

Packages remain private until registry publication is explicitly authorized. Private package
versioning is enabled only to produce coherent local artifacts and changelogs; it does not publish
anything.

## Version policy

Versions follow Semantic Versioning. Before `1.0.0`:

- `patch` is a backward-compatible defect correction;
- `minor` is new functionality or an incompatible public API change;
- `alpha`, `beta`, and `rc` prereleases are used for integration validation.

After `1.0.0`, incompatible public API changes require `major`, backward-compatible functionality
requires `minor`, and backward-compatible fixes require `patch`. A released version is immutable.

The first planned coordinated release is `0.1.0`. Use a `next` prerelease only when registry-based
integration testing is required.

## Change workflow

Conventional Commits describe repository history. A changeset independently records release intent
and is authoritative for the version bump and package changelog.

Add a changeset for consumer-visible behavior or API changes:

```sh
bun run changeset
```

Use outcome-oriented summaries. Describe what changed for a consumer, not the implementation detail.
For an incompatible change, include the old API, replacement API, and a migration instruction.

Changesets are normally unnecessary for tests, CI, formatting, internal refactoring, and
documentation that does not modify a public contract. Validate pending release metadata with:

```sh
bun run version:status
```

## Version preparation

Preparing a release is a separate, reviewable iteration:

```sh
bun run version:packages
bun install --frozen-lockfile
bun run check:full
bun run pack:dice-engine
```

Review all package versions, internal dependency ranges, generated changelogs, the lockfile, local
artifact manifest, checksums, and consumer smoke tests. Commit the result as:

```text
chore(release): version packages
```

Use `bun run version:pre:enter` and `bun run version:pre:exit` to enter or leave the `next`
prerelease train. Do not run version preparation in an ordinary feature commit.

## Changelog and tags

Generated `packages/*/CHANGELOG.md` files are the package-level record. The engine changelog is the
primary consumer entry point; GitHub Releases provide the consolidated release summary. Avoid a
manually duplicated root changelog.

Coordinated repository releases use one annotated tag, `vX.Y.Z`. If registry publication is added
later, package-specific tags produced by the publishing tool may supplement the repository tag.

## Publication boundary

Versioning, packaging, tagging, GitHub Releases, and registry publication are distinct actions.
Neither `version:packages` nor `pack:dice-engine` publishes packages. Publishing requires an
explicitly authorized workflow, protected credentials, a complete release gate, and verified
release candidates installed in clean Bun and npm consumers.
