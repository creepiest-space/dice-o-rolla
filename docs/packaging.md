# Library packaging

## Build graph

`dice-engine` is an ESM package with separate backend-neutral and browser entry points. Build the
package and all of its workspace dependencies with:

```sh
bun run build:dice-engine
```

Turbo selects `dice-engine` plus its dependency graph and emits JavaScript and TypeScript declarations
into each package's ignored `dist` directory.

## Local integration bundle

Create a verified set of local package archives with:

```sh
bun run pack:dice-engine
```

The command:

1. removes previous archives and the artifact staging directory;
2. rebuilds `dice-engine` and its workspace dependencies;
3. stages the `dist` output and distribution metadata for all seven runtime packages;
4. removes workspace-only dependency edges from the local-only package manifests;
5. verifies every package's public entry point, declarations, license files, and absence of source
   imports;
6. verifies that all runtime packages have one coordinated version;
7. creates versioned archives, a release manifest, a consumer dependency fragment, instructions,
   and SHA-256 checksums in `artifacts/`, then removes the staging directory.

The bundle contains:

```text
artifacts/
├─ dice-core-<version>.tgz
├─ dice-engine-<version>.tgz
├─ dice-geometry-<version>.tgz
├─ dice-physics-<version>.tgz
├─ dice-physics-rapier-<version>.tgz
├─ dice-renderer-<version>.tgz
├─ dice-renderer-three-<version>.tgz
├─ local-dependencies.json
├─ release-manifest.json
├─ README.md
└─ SHA256SUMS
```

Each archive contains compiled ESM, TypeScript declarations, its package manifest, and the project
license notices. The engine archive also includes its package README. Package `exports` maps prevent
consumers from importing undocumented subpaths. `release-manifest.json` records the coordinated
version, source commit, archive filename, and SHA-256 of every package.

## Consumer installation

Copy the complete `artifacts` directory to the consumer application's root. Merge the complete
`dependencies` object from `artifacts/local-dependencies.json` into its `package.json`, then run one
of the supported package managers:

```sh
shasum -a 256 -c artifacts/SHA256SUMS
bun install
# or: npm install
```

All seven `@dice-o-rolla/*` packages must remain direct `file:` dependencies. Internal dependency
edges are intentionally omitted only from these local-only manifests because npm and Bun resolve
relative tarballs differently. The application's complete dependency list makes the packages
available from its root `node_modules` without registry lookups. The package manager obtains the
public runtime dependencies `@dimforge/rapier3d-compat` and `three` from the configured registry.

## Release boundary

The generated bundle is a local integration and CI artifact, not a registry publication. Before an
external release:

- prepare one coordinated non-zero version with the Changesets workflow documented in
  `docs/versioning.md`;
- package and publish the dependency graph before `dice-engine`;
- verify the Bun-packed registry manifests and tarballs with `bun run release:check`;
- add repository metadata after the canonical remote has been created;
- replace local consumer references with coordinated registry version ranges;
- install the release candidates in an empty consumer project and test both public entry points;
- publish only through an explicitly authorized release workflow.

No publish or registry mutation is performed by the packaging command. See `docs/npm-publishing.md`
for the separate registry release process.
