import type { KnipConfig } from 'knip';

export default {
  workspaces: {
    'apps/*': {},
    'packages/*': {},
  },
  ignore: ['cz.config.mts', '**/dist/**', '**/coverage/**'],
} satisfies KnipConfig;
