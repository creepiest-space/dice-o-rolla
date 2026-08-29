import { cp, mkdir, readFile, rename, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

interface PackageManifest {
  readonly name: string;
  readonly version: string;
  readonly description?: string;
  readonly private?: boolean;
  readonly license?: string;
  readonly files?: readonly string[];
  readonly scripts?: Readonly<Record<string, string>>;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
  readonly optionalDependencies?: Readonly<Record<string, string>>;
  readonly peerDependencies?: Readonly<Record<string, string>>;
  readonly publishConfig?: {
    readonly access?: string;
    readonly registry?: string;
  };
  [key: string]: unknown;
}

interface PackageEntry {
  readonly directory: string;
  readonly manifest: PackageManifest;
}

interface PackResult {
  readonly archive: string;
  readonly files: readonly string[];
  readonly manifest: PackageManifest;
}

const packageDirectories = [
  'dice-core',
  'dice-geometry',
  'dice-physics',
  'dice-renderer',
  'dice-physics-rapier',
  'dice-renderer-three',
  'dice-engine',
] as const;
const requiredPackFiles = [
  'LICENSE',
  'NOTICE',
  'README.md',
  'THIRD_PARTY_NOTICES.md',
  'dist/index.d.ts',
  'dist/index.js',
  'package.json',
] as const;

const rootDirectory = resolve(import.meta.dir, '..');
const packagesDirectory = resolve(rootDirectory, 'packages');
const outputDirectory = resolve(rootDirectory, 'artifacts', 'npm');
const stagingDirectory = resolve(outputDirectory, '.staging');

await rm(outputDirectory, { force: true, recursive: true });
await mkdir(outputDirectory, { recursive: true });

const packageEntries: readonly PackageEntry[] = await Promise.all(
  packageDirectories.map(async (directory) => ({
    directory,
    manifest: await readManifest(resolve(packagesDirectory, directory, 'package.json')),
  })),
);
const versions = new Set(packageEntries.map(({ manifest }) => manifest.version));
if (versions.size !== 1) {
  throw new Error(`Publishable package versions must match: ${[...versions].join(', ')}`);
}
const coordinatedVersion = packageEntries[0]?.manifest.version;
if (coordinatedVersion === undefined || coordinatedVersion === '0.0.0') {
  throw new Error('Publishable packages must have a coordinated non-zero version');
}

const packageNames = new Set(packageEntries.map(({ manifest }) => manifest.name));
for (const { manifest } of packageEntries) validateSourceManifest(manifest, packageNames);

const packResults = await Promise.all(
  packageEntries.map(({ directory, manifest }) =>
    packWorkspace(directory, manifest, packageNames, coordinatedVersion),
  ),
);
for (const [index, packResult] of packResults.entries()) {
  const sourceManifest = packageEntries[index]?.manifest;
  if (sourceManifest === undefined) throw new Error(`Missing manifest for pack result ${index}`);
  validatePackResult(packResult, sourceManifest, packageNames, coordinatedVersion);
}
await rm(stagingDirectory, { force: true, recursive: true });

await Bun.write(
  resolve(outputDirectory, 'publish-manifest.json'),
  `${JSON.stringify(
    {
      schemaVersion: 1,
      version: coordinatedVersion,
      packages: packageEntries.map(({ manifest }, index) => ({
        name: manifest.name,
        version: manifest.version,
        archive: packResults[index]?.archive,
      })),
    },
    null,
    2,
  )}\n`,
);

console.log(
  `Verified ${packageEntries.length} Bun-packed npm packages at coordinated version ${coordinatedVersion}`,
);

function validateSourceManifest(
  manifest: PackageManifest,
  availablePackageNames: ReadonlySet<string>,
): void {
  if (manifest.private === true) throw new Error(`${manifest.name} is private`);
  if (manifest.description === undefined || manifest.description.length === 0) {
    throw new Error(`${manifest.name} requires a description`);
  }
  if (manifest.license !== 'Apache-2.0') {
    throw new Error(`${manifest.name} must declare Apache-2.0`);
  }
  if (
    manifest.publishConfig?.access !== 'public' ||
    manifest.publishConfig.registry !== 'https://registry.npmjs.org/'
  ) {
    throw new Error(`${manifest.name} must publish publicly to the npm registry`);
  }

  for (const dependencyGroup of getDependencyGroups(manifest)) {
    for (const [name, range] of Object.entries(dependencyGroup ?? {})) {
      if (availablePackageNames.has(name) && range !== 'workspace:*') {
        throw new Error(`${manifest.name} must declare internal dependency ${name}@workspace:*`);
      }
      if (!availablePackageNames.has(name) && range.startsWith('workspace:')) {
        throw new Error(
          `${manifest.name} references external workspace dependency ${name}@${range}`,
        );
      }
    }
  }
}

function validatePackResult(
  packResult: PackResult,
  sourceManifest: PackageManifest,
  availablePackageNames: ReadonlySet<string>,
  resolvedVersion: string,
): void {
  const packedManifest = packResult.manifest;
  if (packedManifest.name !== sourceManifest.name || packedManifest.version !== resolvedVersion) {
    throw new Error(`Bun pack returned unexpected identity for ${sourceManifest.name}`);
  }
  const files = new Set(packResult.files);
  for (const requiredFile of requiredPackFiles) {
    if (!files.has(requiredFile)) {
      throw new Error(`${sourceManifest.name} tarball is missing ${requiredFile}`);
    }
  }
  for (const path of files) {
    if (path.startsWith('src/') || path.includes('/__tests__/') || path.startsWith('tsconfig.')) {
      throw new Error(`${sourceManifest.name} tarball contains development file ${path}`);
    }
  }
  for (const dependencyGroup of getDependencyGroups(packedManifest)) {
    for (const [name, range] of Object.entries(dependencyGroup ?? {})) {
      if (range.startsWith('workspace:')) {
        throw new Error(`${sourceManifest.name} packed npm dependency was not resolved: ${name}`);
      }
      if (availablePackageNames.has(name) && range !== resolvedVersion) {
        throw new Error(
          `${sourceManifest.name} packed dependency ${name} must resolve to ${resolvedVersion}`,
        );
      }
    }
  }
}

async function packWorkspace(
  directory: string,
  manifest: PackageManifest,
  availablePackageNames: ReadonlySet<string>,
  resolvedVersion: string,
): Promise<PackResult> {
  const sourceDirectory = resolve(packagesDirectory, directory);
  const packageDirectory = resolve(stagingDirectory, directory);
  await mkdir(packageDirectory, { recursive: true });
  await Promise.all(
    ['dist', 'LICENSE', 'NOTICE', 'README.md', 'THIRD_PARTY_NOTICES.md'].map((path) =>
      cp(resolve(sourceDirectory, path), resolve(packageDirectory, path), { recursive: true }),
    ),
  );
  const packedSourceManifest: PackageManifest = {
    ...manifest,
    dependencies: resolveWorkspaceDependencies(
      manifest.dependencies,
      availablePackageNames,
      resolvedVersion,
    ),
    optionalDependencies: resolveWorkspaceDependencies(
      manifest.optionalDependencies,
      availablePackageNames,
      resolvedVersion,
    ),
    peerDependencies: resolveWorkspaceDependencies(
      manifest.peerDependencies,
      availablePackageNames,
      resolvedVersion,
    ),
  };
  delete packedSourceManifest.scripts;
  delete packedSourceManifest.devDependencies;
  await Bun.write(
    resolve(packageDirectory, 'package.json'),
    `${JSON.stringify(packedSourceManifest, null, 2)}\n`,
  );

  const archive = `${directory}-${manifest.version}.tgz`;
  await readCommand(
    ['bun', 'pm', 'pack', '--filename', archive, '--ignore-scripts', '--quiet'],
    packageDirectory,
  );
  const archivePath = resolve(outputDirectory, archive);
  await rename(resolve(packageDirectory, archive), archivePath);
  const [fileList, packedManifestText] = await Promise.all([
    readCommand(['tar', '-tzf', archivePath], rootDirectory),
    readCommand(['tar', '-xOzf', archivePath, 'package/package.json'], rootDirectory),
  ]);
  return {
    archive,
    files: fileList
      .split('\n')
      .filter((path) => path.length > 0)
      .map((path) => path.replace(/^package\//, '')),
    manifest: parseManifest(packedManifestText, archivePath),
  };
}

function resolveWorkspaceDependencies(
  dependencies: Readonly<Record<string, string>> | undefined,
  availablePackageNames: ReadonlySet<string>,
  resolvedVersion: string,
): Readonly<Record<string, string>> | undefined {
  if (dependencies === undefined) return undefined;
  return Object.fromEntries(
    Object.entries(dependencies).map(([name, range]) => [
      name,
      availablePackageNames.has(name) && range === 'workspace:*' ? resolvedVersion : range,
    ]),
  );
}

function getDependencyGroups(
  manifest: PackageManifest,
): ReadonlyArray<Readonly<Record<string, string>> | undefined> {
  return [
    manifest.dependencies,
    manifest.devDependencies,
    manifest.optionalDependencies,
    manifest.peerDependencies,
  ];
}

async function readManifest(path: string): Promise<PackageManifest> {
  return parseManifest(await readFile(path, 'utf8'), path);
}

function parseManifest(contents: string, source: string): PackageManifest {
  const parsed: unknown = JSON.parse(contents);
  if (!isPackageManifest(parsed)) throw new Error(`Invalid package manifest: ${source}`);
  return parsed;
}

async function readCommand(command: readonly string[], cwd: string): Promise<string> {
  const process = Bun.spawn(command, { cwd, stdout: 'pipe', stderr: 'pipe' });
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(
      `Command failed with exit code ${exitCode}: ${command.join(' ')}\n${stderr.trim()}`,
    );
  }
  return stdout.trim();
}

function isPackageManifest(value: unknown): value is PackageManifest {
  return (
    isRecord(value) &&
    typeof value.name === 'string' &&
    typeof value.version === 'string' &&
    (value.description === undefined || typeof value.description === 'string') &&
    (value.private === undefined || typeof value.private === 'boolean') &&
    (value.license === undefined || typeof value.license === 'string') &&
    (value.publishConfig === undefined || isRecord(value.publishConfig))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
