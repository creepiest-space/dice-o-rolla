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

interface WorkspacePackage {
  readonly directory: string;
  readonly includeReadme?: boolean;
}

interface VersionedWorkspacePackage extends WorkspacePackage {
  readonly archive: string;
}

interface PackagedWorkspace {
  readonly workspacePackage: VersionedWorkspacePackage;
  readonly manifest: PackageManifest;
}

const workspacePackages: readonly WorkspacePackage[] = [
  { directory: 'dice-core' },
  { directory: 'dice-geometry' },
  { directory: 'dice-physics' },
  { directory: 'dice-renderer' },
  { directory: 'dice-physics-rapier' },
  { directory: 'dice-renderer-three' },
  { directory: 'dice-engine', includeReadme: true },
];

const rootDirectory = resolve(import.meta.dir, '..');
const packagesDirectory = resolve(rootDirectory, 'packages');
const artifactsDirectory = resolve(rootDirectory, 'artifacts');
const stagingRoot = resolve(artifactsDirectory, '.dice-engine-packages');

await mkdir(artifactsDirectory, { recursive: true });
await rm(stagingRoot, { force: true, recursive: true });
await run(['bun', 'run', 'build:dice-engine'], rootDirectory);

const sourceManifests = await Promise.all(
  workspacePackages.map(async (workspacePackage) => ({
    workspacePackage,
    manifest: await readManifest(
      resolve(packagesDirectory, workspacePackage.directory, 'package.json'),
    ),
  })),
);
const releaseVersion = getCoordinatedVersion(sourceManifests.map(({ manifest }) => manifest));
const manifests: readonly PackagedWorkspace[] = sourceManifests.map(
  ({ workspacePackage, manifest }) => ({
    workspacePackage: {
      ...workspacePackage,
      archive: `${workspacePackage.directory}-${releaseVersion}.tgz`,
    },
    manifest,
  }),
);
const workspaceNames = new Set(manifests.map(({ manifest }) => manifest.name));

const oldArchiveGlob = new Bun.Glob('dice-*.tgz');
for await (const archive of oldArchiveGlob.scan({ cwd: artifactsDirectory, onlyFiles: true })) {
  await rm(resolve(artifactsDirectory, archive), { force: true });
}

await Promise.all(
  manifests.map(({ workspacePackage, manifest }) =>
    packageWorkspace(workspacePackage, manifest, workspaceNames),
  ),
);

await writeConsumerFiles(manifests, releaseVersion);
await rm(stagingRoot, { force: true, recursive: true });

console.log(`Created local integration artifacts in ${artifactsDirectory}`);

async function packageWorkspace(
  workspacePackage: VersionedWorkspacePackage,
  sourceManifest: PackageManifest,
  availableWorkspaceNames: ReadonlySet<string>,
): Promise<void> {
  const sourceDirectory = resolve(packagesDirectory, workspacePackage.directory);
  const stagingDirectory = resolve(stagingRoot, workspacePackage.directory);
  await mkdir(stagingDirectory, { recursive: true });
  await cp(resolve(sourceDirectory, 'dist'), resolve(stagingDirectory, 'dist'), {
    recursive: true,
  });

  const distributionFiles: Array<readonly [string, string]> = [
    [resolve(rootDirectory, 'LICENSE'), 'LICENSE'],
    [resolve(rootDirectory, 'NOTICE'), 'NOTICE'],
    [resolve(rootDirectory, 'THIRD_PARTY_NOTICES.md'), 'THIRD_PARTY_NOTICES.md'],
  ];
  if (workspacePackage.includeReadme === true) {
    distributionFiles.push([resolve(sourceDirectory, 'README.md'), 'README.md']);
  }
  await Promise.all(
    distributionFiles.map(([source, filename]) => cp(source, resolve(stagingDirectory, filename))),
  );

  const files = ['dist', 'LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.md'];
  if (workspacePackage.includeReadme === true) files.push('README.md');
  const packageManifest: PackageManifest = {
    ...sourceManifest,
    files,
  };
  delete packageManifest.scripts;
  delete packageManifest.devDependencies;
  packageManifest.dependencies = omitWorkspaceDependencies(
    sourceManifest.dependencies ?? {},
    availableWorkspaceNames,
  );

  await Bun.write(
    resolve(stagingDirectory, 'package.json'),
    `${JSON.stringify(packageManifest, null, 2)}\n`,
  );
  await verifyStagingPackage(stagingDirectory, packageManifest, workspacePackage.includeReadme);
  await run(
    ['bun', 'pm', 'pack', '--filename', workspacePackage.archive, '--quiet'],
    stagingDirectory,
  );
  await rename(
    resolve(stagingDirectory, workspacePackage.archive),
    resolve(artifactsDirectory, workspacePackage.archive),
  );
}

async function writeConsumerFiles(
  packageManifests: readonly PackagedWorkspace[],
  coordinatedVersion: string,
): Promise<void> {
  const dependencies = Object.fromEntries(
    packageManifests.map(({ workspacePackage, manifest }) => [
      manifest.name,
      `file:./artifacts/${workspacePackage.archive}`,
    ]),
  );
  await Bun.write(
    resolve(artifactsDirectory, 'local-dependencies.json'),
    `${JSON.stringify({ dependencies }, null, 2)}\n`,
  );

  const packagedEntries = await Promise.all(
    packageManifests.map(async ({ workspacePackage, manifest }) => {
      const archivePath = resolve(artifactsDirectory, workspacePackage.archive);
      const hasher = new Bun.CryptoHasher('sha256');
      hasher.update(await Bun.file(archivePath).arrayBuffer());
      return {
        name: manifest.name,
        version: manifest.version,
        archive: workspacePackage.archive,
        sha256: hasher.digest('hex'),
      };
    }),
  );
  const checksums = packagedEntries.map(({ archive, sha256 }) => `${sha256}  artifacts/${archive}`);
  await Bun.write(resolve(artifactsDirectory, 'SHA256SUMS'), `${checksums.join('\n')}\n`);

  const gitCommit = await readCommand(['git', 'rev-parse', 'HEAD'], rootDirectory);
  await Bun.write(
    resolve(artifactsDirectory, 'release-manifest.json'),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        version: coordinatedVersion,
        gitCommit,
        packages: Object.fromEntries(
          packagedEntries.map(({ name, version, archive, sha256 }) => [
            name,
            { version, archive, sha256 },
          ]),
        ),
      },
      null,
      2,
    )}\n`,
  );

  await Bun.write(
    resolve(artifactsDirectory, 'README.md'),
    `# Local dice-engine artifacts

Copy this entire \`artifacts\` directory to the root of the consumer application. Merge the complete
\`dependencies\` object from \`artifacts/local-dependencies.json\` into the application's
\`package.json\`, then run \`npm install\` or \`bun install\`.

Import the browser composition with:

\`\`\`ts
import { createDefaultDiceEngine } from '@dice-o-rolla/dice-engine/browser';
\`\`\`

For an overhead application surface, import \`TopDownDiceRenderer\` from
\`@dice-o-rolla/dice-renderer-three\` and inject it into the backend-neutral engine.

All seven local tarballs must remain direct application dependencies. Their package manifests omit
workspace-only dependency edges so npm and Bun do not query a registry for unpublished packages. The
package manager resolves the remaining public runtime dependencies, \`@dimforge/rapier3d-compat\` and
\`three\`, from the configured registry. Verify the copied archives with
\`shasum -a 256 -c artifacts/SHA256SUMS\` before installation.

This bundle contains coordinated package version \`${coordinatedVersion}\`. Machine-readable package
versions, archive names, checksums, and the source commit are recorded in
\`artifacts/release-manifest.json\`.
`,
  );
}

function getCoordinatedVersion(packageManifestsInput: readonly PackageManifest[]): string {
  const versions = new Set(packageManifestsInput.map(({ version }) => version));
  if (versions.size !== 1) {
    throw new Error(`Runtime package versions must match: ${[...versions].join(', ')}`);
  }
  const version = packageManifestsInput[0]?.version;
  if (version === undefined || version.length === 0) {
    throw new Error('At least one versioned runtime package is required');
  }
  return version;
}

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

function omitWorkspaceDependencies(
  dependencies: Readonly<Record<string, string>>,
  availableWorkspaceNames: ReadonlySet<string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(dependencies).filter(([name, range]) => {
      if (!range.startsWith('workspace:')) return true;
      if (!availableWorkspaceNames.has(name)) {
        throw new Error(`Missing local archive for workspace dependency ${name}`);
      }
      return false;
    }),
  );
}

async function verifyStagingPackage(
  stagingDirectory: string,
  manifest: PackageManifest,
  includeReadme = false,
): Promise<void> {
  const requiredFiles = [
    'LICENSE',
    'NOTICE',
    'THIRD_PARTY_NOTICES.md',
    'dist/index.js',
    'dist/index.d.ts',
  ];
  if (includeReadme) requiredFiles.push('README.md', 'dist/browser.js', 'dist/browser.d.ts');
  await Promise.all(
    requiredFiles.map(async (path) => {
      if (!(await Bun.file(resolve(stagingDirectory, path)).exists())) {
        throw new Error(`Package ${manifest.name} is missing required file: ${path}`);
      }
    }),
  );

  const serializedManifest = JSON.stringify(manifest);
  if (serializedManifest.includes('workspace:')) {
    throw new Error(`Package ${manifest.name} contains an unresolved workspace dependency`);
  }
  const glob = new Bun.Glob('dist/**/*.d.ts');
  for await (const declarationPath of glob.scan({ cwd: stagingDirectory, onlyFiles: true })) {
    const declaration = await readFile(resolve(stagingDirectory, declarationPath), 'utf8');
    if (!declaration.includes('/src/')) continue;
    throw new Error(`Package ${manifest.name} exposes a source import: ${declarationPath}`);
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

async function readCommand(command: readonly string[], cwd: string): Promise<string> {
  const process = Bun.spawn(command, {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
  });
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
