import { cp, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = join(import.meta.dir, '..');
const repositoryRoot = join(appRoot, '..', '..');
const staticRoot = join(appRoot, 'assets');
const runtimeAssets = join(repositoryRoot, 'packages', 'dice-assets', 'assets', 'runtime');
const threeEntry = fileURLToPath(import.meta.resolve('three'));
const basisSource = join(dirname(threeEntry), '..', 'examples', 'jsm', 'libs', 'basis');

await mkdir(staticRoot, { recursive: true });
await cp(runtimeAssets, join(staticRoot, 'dice'), { recursive: true, force: true });
await mkdir(join(staticRoot, 'basis'), { recursive: true });
await Promise.all(
  ['basis_transcoder.js', 'basis_transcoder.wasm'].map((file) =>
    cp(join(basisSource, file), join(staticRoot, 'basis', file), { force: true }),
  ),
);
