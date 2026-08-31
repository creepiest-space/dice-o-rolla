# Library packaging

## Build graph

`dice-engine` is an ESM package with separate backend-neutral and browser entry points. Build the
package and all of its workspace dependencies with:

```sh
bun run build:dice-engine
```

Turbo selects `dice-engine` plus its dependency graph and the independent `dice-assets` workspace,
then emits JavaScript and TypeScript declarations into each package's ignored `dist` directory.

## Local integration bundle

Create a verified set of local package archives with:

```sh
bun run pack:dice-engine
```

The command:

1. removes previous archives and the artifact staging directory;
2. rebuilds `dice-engine` and its workspace dependencies;
3. stages the `dist` output and distribution metadata for seven runtime packages plus the optional
   `dice-assets` package;
4. removes workspace-only dependency edges from the local-only package manifests;
5. verifies every package's public entry point, declarations, license files, and absence of source
   imports;
6. verifies that all runtime packages have one coordinated version;
7. creates versioned archives, a release manifest, a consumer dependency fragment, instructions,
   and SHA-256 checksums in `artifacts/`, then removes the staging directory.

The bundle contains:

```text
artifacts/
├─ dice-assets-<version>.tgz
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
license notices. The engine archive also includes its package README. The optional `dice-assets`
archive additionally contains its production catalog, KTX2 textures, and mono WebM/Opus sprites;
source WAV/PNG/SVG masters stay outside the published archive. Package `exports` maps prevent
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

All seven runtime `@dice-o-rolla/*` packages must remain direct `file:` dependencies. The
independent `dice-assets` entry may be removed if the consumer does not use skin or sound catalogs.
Internal dependency edges are intentionally omitted only from these local-only manifests because
npm and Bun resolve relative tarballs differently. The application's complete dependency list makes
the packages available from its root `node_modules` without registry lookups. The package manager
obtains the public runtime dependencies `@dimforge/rapier3d-compat` and `three` from the configured
registry.

The generated bundle is a local integration artifact, not a registry publication. The packaging
command never publishes packages or mutates a registry.

## Automated npm releases

Every publishable change should include a Changeset. A push to `main` runs the npm release workflow
in one of three modes:

1. `version` creates or updates a Conventional Commit release pull request with coordinated package
   versions, changelogs, and an updated Bun lockfile;
2. `publish` runs the complete release gate after that pull request is merged, publishes the checked
   npm tarballs, creates package tags, and pushes them to GitHub;
3. `none` exits without creating a pull request or touching the registry.

The workflow can also be dispatched manually from `main` to retry the mode selected from the current
repository state. Publishing is idempotent: versions already present in npm are skipped, which lets a
partially completed eight-package release continue safely.

The `version` and `publish` jobs have separate GitHub permissions. Only `version` can create release
pull requests, and only the protected `npm` environment can request an OIDC token and publish. No
long-lived npm write token is required. Configure npm Trusted Publishing separately for every
`@dice-o-rolla/*` package with:

- GitHub owner `creepiest-space`;
- repository `dice-o-rolla`;
- workflow filename `npm-publish.yml`;
- environment `npm`;
- allowed action `npm publish`.

Restrict the GitHub `npm` environment to `main` and add required reviewers when publication should
remain approval-gated. GitHub Actions must also be allowed to create pull requests for the automatic
Changesets version PR.
