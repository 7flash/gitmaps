import { measure } from 'measure-fn';
import path from 'path';
import { blockInProduction, validateRepoPath } from '../validate-path';
import {
    buildProcessName,
    ensureWithinRepo,
    isRunnableTsFile,
    normalizeRepoFilePath,
} from '../script-runner';

async function runBgrun(args: string[]) {
    const proc = Bun.spawnSync(['bgrun', ...args], {
        stdout: 'pipe',
        stderr: 'pipe',
    });
    if (proc.exitCode !== 0) {
        throw new Error(proc.stderr.toString().trim() || proc.stdout.toString().trim() || 'bgrun command failed');
    }
    return proc.stdout.toString().trim();
}

export async function POST(req: Request) {
    return measure('api:repo:script-control', async () => {
        try {
            const blockedInProd = blockInProduction('Script execution');
            if (blockedInProd) return blockedInProd;

            const { path: repoPath, filePath, action } = await req.json();
            if (!repoPath || !filePath || !action) {
                return new Response('Repository path, file path, and action are required', { status: 400 });
            }

            const blocked = validateRepoPath(repoPath);
            if (blocked) return blocked;

            const absRepo = path.resolve(repoPath);
            const safeFilePath = ensureWithinRepo(absRepo, normalizeRepoFilePath(filePath));
            if (!isRunnableTsFile(safeFilePath)) {
                return new Response('Only runnable .ts files are supported', { status: 400 });
            }

            const processName = buildProcessName(absRepo, safeFilePath);

            if (action === 'stop') {
                await runBgrun(['--stop', processName]);
            } else if (action === 'delete') {
                await runBgrun(['--delete', processName]);
            } else if (action === 'restart') {
                await runBgrun(['--restart', processName]);
            } else {
                return new Response('Unsupported action', { status: 400 });
            }

            return Response.json({ success: true, processName, action });
        } catch (error: any) {
            console.error('api:repo:script-control:error', error);
            return new Response(`Error: ${error.message}`, { status: 500 });
        }
    });
}
