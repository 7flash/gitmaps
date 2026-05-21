/**
 * Git Canvas Server
 * Uses tradjs's createAppRouter with proper JSX components.
 */
import path from 'path';
import { serve, createAppRouter } from 'tradjs';

const appDir = path.join(import.meta.dir, 'app');

const requestedPort =
  process.env.BUN_PORT || process.env.PORT || process.env.GITMAPS_PORT;
const resolvedPort = requestedPort ? parseInt(requestedPort, 10) : undefined;

serve(
  createAppRouter({
    appDir,
    globalCss: path.join(appDir, 'globals.css'),
    hotReload: false,
  }),
  resolvedPort !== undefined
    ? {
        port: resolvedPort,
        hotReload: false,
      }
    : {
        hotReload: false,
      },
);
