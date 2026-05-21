/**
 * Git Canvas Server
 * Uses tradjs's createAppRouter with proper JSX components.
 */
import net from 'node:net';
import path from 'path';
import { serve, createAppRouter } from 'tradjs';

const appDir = path.join(import.meta.dir, 'app');

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
    if (await isPortAvailable(candidate)) {
      return candidate;
    }
  }
  throw new Error(`No free port found in range ${startPort}-${startPort + attempts - 1}`);
}

const requestedPort =
  process.env.BUN_PORT || process.env.PORT || process.env.GITMAPS_PORT;
const resolvedPort = requestedPort
  ? parseInt(requestedPort, 10)
  : await findAvailablePort(3335);

process.env.BUN_PORT = String(resolvedPort);

serve(
  createAppRouter({
    appDir,
    globalCss: path.join(appDir, 'globals.css'),
    hotReload: false,
  }),
  {
    port: resolvedPort,
    hotReload: false,
  },
);
