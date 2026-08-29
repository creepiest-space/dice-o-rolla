import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

interface PublishPackage {
  readonly name: string;
  readonly version: string;
  readonly archive: string;
}

interface PublishManifest {
  readonly version: string;
  readonly packages: readonly PublishPackage[];
}

const rootDirectory = resolve(import.meta.dir, '..');
const artifactsDirectory = resolve(rootDirectory, 'artifacts', 'npm');
const manifest = parsePublishManifest(
  await readFile(resolve(artifactsDirectory, 'publish-manifest.json'), 'utf8'),
);

await ensureTrackedFilesAreClean();
await publishPackages(manifest.packages);
await run(['bunx', 'changeset', 'git-tag'], rootDirectory);

async function publishPackages(packages: readonly PublishPackage[], index = 0): Promise<void> {
  const packageEntry = packages[index];
  if (packageEntry === undefined) return;
  if (await packageIsPublished(packageEntry)) {
    console.log(`Skipping published ${packageEntry.name}@${packageEntry.version}`);
  } else {
    console.log(`Publishing ${packageEntry.name}@${packageEntry.version}`);
    await run(
      ['npm', 'publish', resolve(artifactsDirectory, packageEntry.archive), '--access', 'public'],
      rootDirectory,
    );
  }
  await publishPackages(packages, index + 1);
}

async function packageIsPublished(packageEntry: PublishPackage): Promise<boolean> {
  const packageVersion = `${packageEntry.name}@${packageEntry.version}`;
  const process = Bun.spawn(['npm', 'view', packageVersion, 'version', '--json'], {
    cwd: rootDirectory,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]);
  if (exitCode === 0) return JSON.parse(stdout) === packageEntry.version;
  if (stderr.includes('E404')) return false;
  throw new Error(`Unable to query ${packageVersion}: ${stderr.trim()}`);
}

function parsePublishManifest(contents: string): PublishManifest {
  const parsed: unknown = JSON.parse(contents);
  if (
    !isRecord(parsed) ||
    typeof parsed.version !== 'string' ||
    !Array.isArray(parsed.packages) ||
    !parsed.packages.every(isPublishPackage)
  ) {
    throw new Error('Invalid artifacts/npm/publish-manifest.json');
  }
  return { version: parsed.version, packages: parsed.packages };
}

async function ensureTrackedFilesAreClean(): Promise<void> {
  await run(['git', 'diff', '--quiet'], rootDirectory);
  await run(['git', 'diff', '--cached', '--quiet'], rootDirectory);
}

async function run(command: readonly string[], cwd: string): Promise<void> {
  const process = Bun.spawn(command, {
    cwd,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  });
  const exitCode = await process.exited;
  if (exitCode !== 0) {
    throw new Error(`Command failed with exit code ${exitCode}: ${command.join(' ')}`);
  }
}

function isPublishPackage(value: unknown): value is PublishPackage {
  return (
    isRecord(value) &&
    typeof value.name === 'string' &&
    typeof value.version === 'string' &&
    typeof value.archive === 'string' &&
    /^[a-z0-9-]+-[0-9A-Za-z.+-]+\.tgz$/.test(value.archive)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
