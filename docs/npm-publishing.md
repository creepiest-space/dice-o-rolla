# Publishing to npm

## Package set

Seven packages are published together under the public `@dice-o-rolla` scope. Their source manifests
use one coordinated package version and `workspace:*` for internal dependencies. The release packer
creates clean staging manifests, resolves each workspace reference to the coordinated version, and
uses Bun to create the npm tarballs. The root workspace and `@dice-o-rolla/dice-demo` remain private.

Every npm tarball contains compiled ESM, TypeScript declarations, a package README, Apache-2.0
license and notice files, and no source or repository configuration. `publishConfig` pins public
access and the canonical npm registry.

## Release preparation

Create consumer-facing changesets as changes are merged. Prepare a release in a dedicated commit:

```sh
bun run version:packages
bun install
bun run release:check
bun run pack:dice-engine
git add .changeset packages bun.lock
git commit -m "chore(release): version packages"
```

`release:check` runs the complete repository gate, creates isolated staging manifests, packages the
registry candidates with `bun pm pack`, and inspects each tarball. It verifies that no `workspace:`
ranges remain in packed manifests and writes the dependency-ordered
`artifacts/npm/publish-manifest.json`. Review generated changelogs and resolved internal dependency
versions before publication. The release commit must be the exact commit being published.

## First publication

The npm organization or user account owning the `@dice-o-rolla` scope must exist before publishing.
Confirm that all seven names are available and that the authenticated account may create public
packages in the scope. The initial release establishes the packages and therefore uses an
interactive npm login with two-factor authentication or a narrowly scoped bootstrap token:

```sh
npm login
bun run release:publish
git push --follow-tags
```

`release:publish` reruns the full release gate, uses the npm CLI to publish the Bun-created tarballs
in dependency order, skips versions already present in npm, and creates package-specific Git tags.
It must never be run merely to test authentication.

## Trusted publishing

After the first release, configure an npm trusted publisher separately for each package. Select the
canonical GitHub owner and repository, workflow filename `npm-publish.yml`, environment `npm`, and
allow `npm publish`. Protect the GitHub `npm` environment with required reviewers.

The manual **Publish npm packages** workflow uses GitHub OIDC, the npm CLI, short-lived npm
credentials, and a GitHub-hosted runner. The repository packer resolves workspace ranges and Bun
produces the tarballs; npm only sends the verified archives. npm generates provenance automatically
for public packages published from a public repository. Once trusted publishing succeeds, disable
token-based package publishing and revoke the bootstrap token.

Trusted publishing requires each package's `repository.url` to exactly match the canonical GitHub
repository. This repository currently has no Git remote, so add `repository`, `homepage`, and `bugs`
metadata to all package manifests after the canonical remote URL is known and before enabling the
workflow.

Official references:

- [Scoped public packages](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/)
- [Trusted publishing](https://docs.npmjs.com/trusted-publishers/)
- [Bun workspace publishing](https://bun.sh/docs/pm/workspaces)
- [Changesets CLI](https://github.com/changesets/changesets/blob/main/docs/command-line-options.md)

## Recovery rules

Published versions are immutable. Never reuse or overwrite a version. If only part of the fixed
group is published, do not edit the successful packages; correct the failure and rerun
`release:publish`, which skips versions already present in npm. Use `npm deprecate` for a bad release
and prepare a new patch version instead of unpublishing it.
