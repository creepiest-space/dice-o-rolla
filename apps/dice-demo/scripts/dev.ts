import { resolve, sep } from 'node:path';

await import('./build.ts');

const appRoot = resolve(import.meta.dir, '..');
const distRoot = resolve(appRoot, 'dist');
const configuredPort = Number(process.env.DICE_DEMO_PORT ?? 3000);
if (!Number.isSafeInteger(configuredPort) || configuredPort <= 0 || configuredPort > 65_535) {
  throw new RangeError('DICE_DEMO_PORT must be a valid TCP port');
}

const serve = (hostname: string): ReturnType<typeof Bun.serve> =>
  Bun.serve({ hostname, port: configuredPort, fetch: serveAsset });

// Bind both loopback families explicitly. Otherwise Bun may silently fall back
// from an occupied ::1 to 127.0.0.1, making localhost and 127.0.0.1 serve
// different applications on the same port.
const servers: Array<ReturnType<typeof Bun.serve>> = [];
try {
  servers.push(serve('::1'));
  servers.push(serve('127.0.0.1'));
} catch (error: unknown) {
  for (const server of servers) void server.stop();
  throw error;
}

const watcher = Bun.spawn(
  ['bun', 'build', './index.html', '--outdir', './dist', '--target', 'browser', '--watch'],
  { cwd: appRoot, stdout: 'inherit', stderr: 'inherit' },
);

console.log(`Dice demo ready at http://localhost:${configuredPort}/`);

const shutdown = (): void => {
  watcher.kill();
  for (const server of servers) void server.stop();
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
await watcher.exited;

async function serveAsset(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const relativePath = decodeURIComponent(
    url.pathname === '/' ? 'index.html' : url.pathname.slice(1),
  );
  const target = resolve(distRoot, relativePath);
  if (target !== distRoot && !target.startsWith(`${distRoot}${sep}`)) {
    return new Response('Invalid path', { status: 400 });
  }
  const file = Bun.file(target);
  if (await file.exists()) {
    const contentType = contentTypeFor(target);
    return new Response(
      file,
      contentType === undefined ? undefined : { headers: { 'Content-Type': contentType } },
    );
  }
  if (request.headers.get('accept')?.includes('text/html') === true) {
    return new Response(Bun.file(resolve(distRoot, 'index.html')));
  }
  return new Response('Not found', { status: 404 });
}

function contentTypeFor(path: string): string | undefined {
  if (path.endsWith('.ktx2')) return 'image/ktx2';
  if (path.endsWith('.wasm')) return 'application/wasm';
  if (path.endsWith('.webm')) return 'audio/webm';
  return undefined;
}
