import { cp } from 'node:fs/promises';
import { join } from 'node:path';

const appRoot = join(import.meta.dir, '..');
await import('./sync-assets.ts');

const build = Bun.spawn(
  ['bun', 'build', './index.html', '--outdir', './dist', '--target', 'browser', '--minify'],
  { cwd: appRoot, stdout: 'inherit', stderr: 'inherit' },
);
if ((await build.exited) !== 0) throw new Error('Demo build failed');
await cp(join(appRoot, 'assets'), join(appRoot, 'dist', 'assets'), {
  recursive: true,
  force: true,
});
