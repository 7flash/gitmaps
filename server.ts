/**
 * Git Canvas Server
 * Uses tradjs's createAppRouter with proper JSX components.
 */
import path from 'path';
import { serve, createAppRouter } from 'tradjs';

const appDir = path.join(import.meta.dir, 'app');

serve(createAppRouter({
    appDir,
    globalCss: path.join(appDir, 'globals.css'),
    hotReload: false,
}), {
    port: parseInt(process.env.BUN_PORT || process.env.PORT || '3335'),
    hotReload: false,
});
