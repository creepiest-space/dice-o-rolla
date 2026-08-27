import { defineConfig } from 'oxlint';

export default defineConfig({
  categories: {
    correctness: 'error',
    suspicious: 'warn',
    perf: 'warn',
  },
  plugins: ['typescript', 'unicorn', 'import', 'oxc'],
  options: {
    typeAware: false,
    maxWarnings: 0,
  },
  rules: {
    'eslint/no-debugger': 'error',
    'eslint/no-console': 'off',
    'typescript/consistent-type-imports': 'warn',
    'import/no-cycle': 'error',
  },
  overrides: [
    {
      files: ['**/test/**/*.ts'],
      rules: {
        'typescript/no-unsafe-type-assertion': 'off',
      },
    },
  ],
  ignorePatterns: ['dist/**', 'coverage/**', '.turbo/**'],
});
