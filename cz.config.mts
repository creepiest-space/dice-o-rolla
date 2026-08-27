export default {
  types: [
    { value: 'feat', name: 'feat:     A new feature' },
    { value: 'fix', name: 'fix:      A bug fix' },
    { value: 'docs', name: 'docs:     Documentation only changes' },
    { value: 'refactor', name: 'refactor: Code change without feature/fix' },
    { value: 'perf', name: 'perf:     Performance improvement' },
    { value: 'test', name: 'test:     Add or update tests' },
    { value: 'build', name: 'build:    Build system or dependencies' },
    { value: 'ci', name: 'ci:       CI configuration' },
    { value: 'chore', name: 'chore:    Maintenance' },
    { value: 'revert', name: 'revert:   Revert a previous commit' },
  ],
  scopes: [],
  allowCustomScopes: true,
  allowEmptyScopes: true,
};
