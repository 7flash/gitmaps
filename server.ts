/**
 * Git Canvas Server
 * Uses melina's createAppRouter with proper JSX components.
 */
import path from 'path';
import { serve, createAppRouter } from 'melina';

const appDir = path.join(import.meta.dir, 'app');

serve(createAppRouter({
    appDir,
    globalCss: path.join(appDir, 'globals.css'),
    hotReload: false,
}), {
    port: parseInt(process.env.PORT || process.env.BUN_PORT || "3335"),
    hotReload: false,
});
