import { lstat, mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';

/** Stage beside the destination so the final rename stays on the same filesystem. */
export async function writeDirectory(
  destination: string,
  overwrite: boolean,
  write: (directory: string) => Promise<void>,
): Promise<void> {
  const output = resolve(destination),
    parent = dirname(output);
  if (output === parent) throw new Error('Output must not be a filesystem root');
  await mkdir(parent, { recursive: true });
  const lock = `${output}.dice-assets-lock`;
  try {
    await mkdir(lock);
  } catch {
    throw new Error(`Output is locked: ${output}`);
  }
  let staging: string | undefined, backup: string | undefined;
  try {
    const existing = await lstat(output).catch((error: unknown) => {
      if (isMissing(error)) return undefined;
      throw error;
    });
    if (
      existing !== undefined &&
      (!overwrite || !existing.isDirectory() || existing.isSymbolicLink())
    )
      throw new Error(
        `Output already exists; use overwrite only for a disposable output directory: ${output}`,
      );
    staging = await mkdtemp(resolve(parent, `.${basename(output)}-staging-`));
    await write(staging);
    if (existing !== undefined) {
      backup = `${staging}-previous`;
      await rename(output, backup);
    }
    try {
      await rename(staging, output);
      staging = undefined;
    } catch (error) {
      if (backup !== undefined) {
        await rename(backup, output);
        backup = undefined;
      }
      throw error;
    }
    if (backup !== undefined) {
      await rm(backup, { recursive: true, force: true });
      backup = undefined;
    }
  } finally {
    if (staging !== undefined) await rm(staging, { recursive: true, force: true });
    await rm(lock, { recursive: true, force: true });
  }
}
function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
