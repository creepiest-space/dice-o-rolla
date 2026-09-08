import type { KnipConfig } from 'knip';

export default {
  // Public declaration fixtures intentionally use TS paths to built packages;
  // they are not dependencies of root tooling.
  ignoreIssues: { 'tests/public-api/*.ts': ['unlisted'] },
  workspaces: {
    '.': {
      entry: ['tests/public-api/*.ts'],
    },
    'apps/*': {},
    'packages/*': {},
    'packages/dice-assets': {
      entry: ['src/index.ts', 'src/tools/index.ts', 'src/tools/cli.ts'],
    },
    'packages/dice-engine': {
      entry: ['src/index.ts', 'src/browser.ts'],
    },
  },
  ignore: ['cz.config.mts', '**/dist/**', '**/coverage/**'],
} satisfies KnipConfig;
