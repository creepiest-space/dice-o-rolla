# Library packaging

## Build graph

`dice-engine` is an ESM package with separate backend-neutral and browser entry points. Build the
package and all of its workspace dependencies with:

```sh
bun run build:dice-engine
```

Turbo selects `dice-engine` plus its dependency graph and emits JavaScript and TypeScript declarations
into each package's ignored `dist` directory.

## Package archive

Create a verified package archive with:

```sh
bun run pack:dice-engine
```

The command:

1. removes the previous package output and artifact staging directory;
2. rebuilds `dice-engine` and its workspace dependencies;
3. copies only the engine `dist` output, its package README, and distribution metadata into an
   isolated staging package;
4. replaces `workspace:*` dependency ranges with the exact versions from sibling manifests;
5. verifies public entry points, declarations, license files, and the absence of source imports;
6. creates `artifacts/dice-engine.tgz` and removes the staging directory.

The archive contains:

```text
package/
├─ dist/
│  ├─ index.js
│  ├─ index.d.ts
│  ├─ browser.js
│  └─ browser.d.ts
├─ LICENSE
├─ NOTICE
├─ README.md
├─ THIRD_PARTY_NOTICES.md
└─ package.json
```

Internal modules required by the public entry points are also present under `dist`, but the package
`exports` map prevents consumers from importing undocumented subpaths.

## Release boundary

The generated archive is a packaging and CI artifact, not a registry publication. The package remains
`private` and currently uses version `0.0.0`. Its normalized manifest depends on exact matching
versions of the sibling `@creepiest-space/*` packages. Before an external release:

- assign one coordinated non-zero version to every publishable workspace package;
- package and publish the dependency graph before `dice-engine`;
- remove `private` only from packages intended for publication;
- add registry and repository metadata;
- install the archives in an empty consumer project and test both public entry points;
- publish only through an explicitly authorized release workflow.

No publish or registry mutation is performed by the packaging command.
