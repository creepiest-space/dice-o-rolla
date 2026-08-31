import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

interface PackageManifest {
  readonly name: string;
  readonly version: string;
}

const packageDirectories = [
  'dice-assets',
  'dice-core',
  'dice-engine',
  'dice-geometry',
  'dice-physics',
  'dice-physics-rapier',
  'dice-renderer',
  'dice-renderer-three',
] as const;
const rootDirectory = resolve(import.meta.dir, '..');

const changesetStatus = await run(['bunx', 'changeset', 'status']);
if (changesetStatus.exitCode === 0) {
  process.stdout.write(changesetStatus.stdout);
  process.exit(0);
}

const releaseBase = await findBaseReference();
if (releaseBase !== undefined && (await isAppliedRelease(releaseBase))) {
  console.log(`Verified applied coordinated release against ${releaseBase}`);
  process.exit(0);
}

process.stdout.write(changesetStatus.stdout);
process.stderr.write(changesetStatus.stderr);
process.exit(changesetStatus.exitCode);

async function isAppliedRelease(reference: string): Promise<boolean> {
  const currentPackages = await Promise.all(packageDirectories.map(readCurrentPackage));
  const currentVersions = new Set(currentPackages.map(({ version }) => version));
  if (currentVersions.size !== 1) return false;

  const packageStates = await Promise.all(
    packageDirectories.map(async (directory, index) => {
      const currentPackage = currentPackages[index];
      if (currentPackage === undefined) return { advanced: false, valid: false };
      const [basePackage, changelog] = await Promise.all([
        readBasePackage(reference, directory),
        readFile(resolve(rootDirectory, 'packages', directory, 'CHANGELOG.md'), 'utf8'),
      ]);
      if (!changelog.includes(`\n## ${currentPackage.version}\n`)) {
        return { advanced: false, valid: false };
      }
      if (basePackage === undefined) return { advanced: true, valid: true };
      if (basePackage.name !== currentPackage.name) return { advanced: false, valid: false };
      const comparison = compareVersions(currentPackage.version, basePackage.version);
      return { advanced: comparison > 0, valid: comparison >= 0 };
    }),
  );
  return packageStates.every(({ advanced, valid }) => advanced && valid);
}

async function findBaseReference(): Promise<string | undefined> {
  const pullRequestBase = process.env.GITHUB_BASE_REF;
  const candidates = [
    ...(pullRequestBase === undefined ? [] : [`origin/${pullRequestBase}`, pullRequestBase]),
    'main',
    'origin/main',
  ];
  const results = await Promise.all(
    candidates.map(async (candidate) => ({
      candidate,
      result: await run(['git', 'rev-parse', '--verify', candidate]),
    })),
  );
  return results.find(({ result }) => result.exitCode === 0)?.candidate;
}

async function readCurrentPackage(directory: string): Promise<PackageManifest> {
  const source = await readFile(
    resolve(rootDirectory, 'packages', directory, 'package.json'),
    'utf8',
  );
  return parseManifest(source, directory);
}

async function readBasePackage(
  reference: string,
  directory: string,
): Promise<PackageManifest | undefined> {
  const result = await run(['git', 'show', `${reference}:packages/${directory}/package.json`]);
  return result.exitCode === 0
    ? parseManifest(result.stdout, `${reference}:${directory}`)
    : undefined;
}

function parseManifest(source: string, label: string): PackageManifest {
  const value: unknown = JSON.parse(source);
  if (
    typeof value !== 'object' ||
    value === null ||
    !('name' in value) ||
    !('version' in value) ||
    typeof value.name !== 'string' ||
    typeof value.version !== 'string'
  ) {
    throw new TypeError(`Invalid package manifest: ${label}`);
  }
  return { name: value.name, version: value.version };
}

function compareVersions(left: string, right: string): number {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  for (let index = 0; index < leftParts.length; index += 1) {
    const difference = leftParts[index] - rightParts[index];
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

function parseVersion(version: string): readonly [number, number, number] {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (match === null) throw new RangeError(`Unsupported release version: ${version}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

async function run(command: readonly string[]): Promise<{
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdout: string;
}> {
  const child = Bun.spawn(command, { cwd: rootDirectory, stderr: 'pipe', stdout: 'pipe' });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}
