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
4. replaces `workspace:*` ranges with local `file:./artifacts/*.tgz` references;
5. verifies every package's public entry point, declarations, license files, and absence of source
   imports;
6. creates the archives, a consumer dependency fragment, instructions, and SHA-256 checksums in
   `artifacts/`, then removes the staging directory.

The bundle contains:

```text
artifacts/
├─ dice-core.tgz
├─ dice-engine.tgz
├─ dice-geometry.tgz
├─ dice-physics.tgz
├─ dice-physics-rapier.tgz
├─ dice-renderer.tgz
├─ dice-renderer-three.tgz
├─ local-dependencies.json
├─ README.md
└─ SHA256SUMS
```

Each archive contains compiled ESM, TypeScript declarations, its package manifest, and the project
license notices. The engine archive also includes its package README. Package `exports` maps prevent
consumers from importing undocumented subpaths.

## Consumer installation

Copy the complete `artifacts` directory to the consumer application's root. Merge the `dependencies`
object from `artifacts/local-dependencies.json` into its `package.json`, then run:

```sh
shasum -a 256 -c artifacts/SHA256SUMS
bun install
```

Only `@creepiest-space/dice-engine` needs to be declared by the application. Its local dependency
references install the other six archives transitively. Bun obtains the public runtime dependencies
`@dimforge/rapier3d-compat` and `three` from the application's configured registry.

## Release boundary

The generated bundle is a local integration and CI artifact, not a registry publication. Packages
remain `private`, use version `0.0.0`, and contain local artifact paths that are unsuitable for npm.
Before an external release:

- assign one coordinated non-zero version to every publishable workspace package;
- package and publish the dependency graph before `dice-engine`;
- remove `private` only from packages intended for publication;
- add registry and repository metadata;
- replace local artifact references with coordinated registry version ranges;
- install the release candidates in an empty consumer project and test both public entry points;
- publish only through an explicitly authorized release workflow.

No publish or registry mutation is performed by the packaging command.
