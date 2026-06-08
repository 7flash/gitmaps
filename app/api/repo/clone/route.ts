import { measure } from 'measure-fn';
import simpleGit from 'simple-git';
import path from 'path';
import fs from 'fs';
import { parseSafeGitUrl } from '../git-url';

const CLONES_DIR = path.join(process.cwd(), 'git-canvas', 'repos');

/**
 * POST /api/repo/clone
 * Body: { url: string }
 * Clones a remote git repo into git-canvas/repos/<name> and returns the local path.
 * If already cloned, returns existing path immediately.
 */
export async function POST(req: Request) {
    return measure('api:repo:clone', async () => {
        try {
            const { url } = await req.json() as { url: string };

            let safe;
            try {
                safe = parseSafeGitUrl(url);
            } catch (err: any) {
                return Response.json({ error: err.message }, { status: 400 });
            }
            const repoName = safe.repoName;
            const cloneUrl = safe.url;

            // Ensure clones directory exists
            fs.mkdirSync(CLONES_DIR, { recursive: true });

            const targetPath = path.join(CLONES_DIR, repoName);

            // Check if already cloned
            if (fs.existsSync(path.join(targetPath, '.git'))) {
                // Pull latest
                try {
                    const git = simpleGit(targetPath);
                    await git.pull();
                    console.log(`[clone] Updated existing repo: ${repoName}`);
                } catch {
                    // Pull failed (maybe detached HEAD, dirty, etc) — that's fine
                    console.log(`[clone] Using existing repo (pull skipped): ${repoName}`);
                }
                return Response.json({ ok: true, path: targetPath, cached: true });
            }

            // Clone
            console.log(`[clone] Cloning ${cloneUrl} → ${targetPath}`);
            const git = simpleGit();
            await git.clone(cloneUrl, targetPath, ['--depth', '100']);

            console.log(`[clone] ✅ Cloned ${repoName}`);
            return Response.json({ ok: true, path: targetPath, cached: false });
        } catch (error: any) {
            console.error('api:repo:clone:error', error);
            return Response.json(
                { error: error.message || 'Clone failed' },
                { status: 500 }
            );
        }
    });
}