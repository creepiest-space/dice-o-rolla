import type { KnipConfig } from 'knip';

export default {
  workspaces: {
    '.': {
      entry: ['tests/public-api/*.ts'],
    },
    'apps/*': {},
    'packages/*': {},
    'packages/dice-engine': {
      entry: ['src/index.ts', 'src/browser.ts'],
    },
  },
  ignore: ['cz.config.mts', '**/dist/**', '**/coverage/**'],
} satisfies KnipConfig;
