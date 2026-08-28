import { cp, mkdir, readFile, rename, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

interface PackageManifest {
  readonly name: string;
  readonly version: string;
  private?: boolean;
  files?: readonly string[];
  scripts?: Readonly<Record<string, string>>;
  dependencies?: Record<string, string>;
  [key: string]: unknown;
}

const rootDirectory = resolve(import.meta.dir, '..');
const engineDirectory = resolve(rootDirectory, 'packages/dice-engine');
const engineDistDirectory = resolve(engineDirectory, 'dist');
const artifactsDirectory = resolve(rootDirectory, 'artifacts');
const stagingDirectory = resolve(artifactsDirectory, 'dice-engine-package');
const archivePath = resolve(artifactsDirectory, 'dice-engine.tgz');

await mkdir(artifactsDirectory, { recursive: true });
await rm(stagingDirectory, { force: true, recursive: true });
await rm(archivePath, { force: true });
await rm(engineDistDirectory, { force: true, recursive: true });
await run(['bun', 'run', 'build:dice-engine'], rootDirectory);

await mkdir(stagingDirectory, { recursive: true });
await cp(engineDistDirectory, resolve(stagingDirectory, 'dist'), { recursive: true });
const distributionFiles = [
  [resolve(rootDirectory, 'LICENSE'), 'LICENSE'],
  [resolve(rootDirectory, 'NOTICE'), 'NOTICE'],
  [resolve(engineDirectory, 'README.md'), 'README.md'],
  [resolve(rootDirectory, 'THIRD_PARTY_NOTICES.md'), 'THIRD_PARTY_NOTICES.md'],
] as const;
await Promise.all(
  distributionFiles.map(([source, filename]) => cp(source, resolve(stagingDirectory, filename))),
);

const sourceManifest = await readManifest(resolve(engineDirectory, 'package.json'));
const workspaceVersions = await readWorkspaceVersions();
const packageManifest: PackageManifest = {
  ...sourceManifest,
  files: ['dist', 'LICENSE', 'NOTICE', 'README.md', 'THIRD_PARTY_NOTICES.md'],
};
delete packageManifest.scripts;
packageManifest.dependencies = replaceWorkspaceVersions(
  sourceManifest.dependencies ?? {},
  workspaceVersions,
);

await Bun.write(
  resolve(stagingDirectory, 'package.json'),
  `${JSON.stringify(packageManifest, null, 2)}\n`,
);
await verifyStagingPackage(packageManifest);
await run(['bun', 'pm', 'pack', '--filename', 'dice-engine.tgz', '--quiet'], stagingDirectory);
await rename(resolve(stagingDirectory, 'dice-engine.tgz'), archivePath);
await rm(stagingDirectory, { force: true, recursive: true });

console.log(`Created ${archivePath}`);

async function readManifest(path: string): Promise<PackageManifest> {
  const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
  if (!isRecord(parsed) || typeof parsed.name !== 'string' || typeof parsed.version !== 'string') {
    throw new TypeError(`Invalid package manifest: ${path}`);
  }
  const dependencies = readStringRecord(parsed.dependencies, `${path} dependencies`);
  return {
    ...parsed,
    name: parsed.name,
    version: parsed.version,
    ...(dependencies === undefined ? {} : { dependencies }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readStringRecord(value: unknown, description: string): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || Object.values(value).some((entry) => typeof entry !== 'string')) {
    throw new TypeError(`Invalid ${description}`);
  }
  return Object.fromEntries(Object.entries(value).map(([name, entry]) => [name, String(entry)]));
}

async function readWorkspaceVersions(): Promise<ReadonlyMap<string, string>> {
  const versions = new Map<string, string>();
  const glob = new Bun.Glob('packages/*/package.json');
  const paths = await Array.fromAsync(glob.scan({ cwd: rootDirectory, onlyFiles: true }));
  const manifests = await Promise.all(
    paths.map((path) => readManifest(resolve(rootDirectory, path))),
  );
  for (const manifest of manifests) {
    versions.set(manifest.name, manifest.version);
  }
  return versions;
}

function replaceWorkspaceVersions(
  dependencies: Readonly<Record<string, string>>,
  availableVersions: ReadonlyMap<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(dependencies).map(([name, range]) => {
      if (!range.startsWith('workspace:')) return [name, range];
      const version = availableVersions.get(name);
      if (version === undefined) throw new Error(`Missing workspace version for ${name}`);
      return [name, version];
    }),
  );
}

async function verifyStagingPackage(manifest: PackageManifest): Promise<void> {
  const requiredFiles = [
    'LICENSE',
    'NOTICE',
    'README.md',
    'THIRD_PARTY_NOTICES.md',
    'dist/index.js',
    'dist/index.d.ts',
    'dist/browser.js',
    'dist/browser.d.ts',
  ];
  await Promise.all(
    requiredFiles.map(async (path) => {
      if (!(await Bun.file(resolve(stagingDirectory, path)).exists())) {
        throw new Error(`Package is missing required file: ${path}`);
      }
    }),
  );

  const serializedManifest = JSON.stringify(manifest);
  if (serializedManifest.includes('workspace:')) {
    throw new Error('Package manifest contains an unresolved workspace dependency');
  }
  const publicDeclarations = ['dist/index.d.ts', 'dist/browser.d.ts'];
  const declarations = await Promise.all(
    publicDeclarations.map((path) => readFile(resolve(stagingDirectory, path), 'utf8')),
  );
  for (const [index, declaration] of declarations.entries()) {
    if (!declaration.includes('/src/')) continue;
    throw new Error(`Public declaration exposes a source import: ${publicDeclarations[index]}`);
  }
}

async function run(command: readonly string[], cwd: string): Promise<void> {
  const process = Bun.spawn(command, {
    cwd,
    stdout: 'inherit',
    stderr: 'inherit',
  });
  const exitCode = await process.exited;
  if (exitCode !== 0) {
    throw new Error(`Command failed with exit code ${exitCode}: ${command.join(' ')}`);
  }
}
