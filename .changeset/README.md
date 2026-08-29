# Changesets

Add a changeset for every consumer-visible package change:

```sh
bun run changeset
```

Select the directly affected packages and describe the observable result. The seven runtime
packages are a fixed group and always receive one coordinated version. Changesets are not required
for tests, CI, formatting, internal refactoring, or documentation that does not change a public
contract.

Versioning and publishing are deliberately separate. See `docs/versioning.md`; never run a publish
command without explicit authorization.
