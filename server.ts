/**
 * GitMaps fixed standalone server.
 *
 * This intentionally serves a small, dependency-light root app that talks to the
 * existing /api routes directly. It avoids relying on the partially reconstructed
 * TradJS page modules that were missing from the project scan.
 */
import net from 'node:net';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const rootDir = import.meta.dir;
const appDir = path.join(rootDir, 'app');
const clientDir = path.join(appDir, 'client');

async function isPortAvailable(candidate: number): Promise<boolean> {
  return await new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once('error', () => resolve(false));
    server.listen(candidate, '127.0.0.1', () => {
      server.close(() => resolve(true));
    });
  });
}

async function findAvailablePort(startPort: number, attempts = 50): Promise<number> {
  for (let offset = 0; offset < attempts; offset++) {
    const candidate = startPort + offset;
    if (await isPortAvailable(candidate)) return candidate;
  }
  throw new Error(`No free port found in range ${startPort}-${startPort + attempts - 1}`);
}

function contentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.js') return 'text/javascript; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.json') return 'application/json; charset=utf-8';
  if (ext === '.png') return 'image/png';
  if (ext === '.svg') return 'image/svg+xml';
  return 'application/octet-stream';
}

function serveFile(filePath: string): Response {
  return new Response(Bun.file(filePath), {
    headers: {
      'Content-Type': contentType(filePath),
      'Cache-Control': 'no-store',
    },
  });
}

async function dispatchApi(req: Request, pathname: string): Promise<Response> {
  const parts = pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  if (!parts.length) return Response.json({ error: 'API route required' }, { status: 404 });

  const routeFile = path.join(appDir, 'api', ...parts, 'route.ts');
  if (!existsSync(routeFile)) {
    return Response.json({ error: `API route not found: ${pathname}` }, { status: 404 });
  }

  try {
    const mod = await import(pathToFileURL(routeFile).href);
    const handler = mod[req.method.toUpperCase()];
    if (typeof handler !== 'function') {
      return Response.json({ error: `${req.method} not allowed for ${pathname}` }, { status: 405 });
    }
    return await handler(req);
  } catch (error: any) {
    console.error(`[server] ${req.method} ${pathname} failed`, error);
    return Response.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}

const requestedPort = process.env.BUN_PORT || process.env.PORT || process.env.GITMAPS_PORT;
const port = requestedPort ? parseInt(requestedPort, 10) : await findAvailablePort(3335);
process.env.BUN_PORT = String(port);

Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);
    const pathname = decodeURIComponent(url.pathname);

    if (pathname.startsWith('/api/')) {
      return dispatchApi(req, pathname);
    }

    if (pathname === '/app.js') return serveFile(path.join(clientDir, 'app.js'));
    if (pathname === '/styles.css') return serveFile(path.join(clientDir, 'styles.css'));
    if (pathname === '/favicon.ico') return new Response(null, { status: 204 });

    // SPA fallback: supports /, /?repo=..., /~repo/<encoded path>, and encoded path routes.
    if (req.method === 'GET') return serveFile(path.join(clientDir, 'index.html'));
    return new Response('Not found', { status: 404 });
  },
});

console.log(`GitMaps fixed server listening on http://localhost:${port}`);
