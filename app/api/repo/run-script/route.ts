import { measure } from 'measure-fn';
import path from 'path';
import fs from 'fs';
import { blockInProduction, validateRepoPath } from '../validate-path';
import {
    buildProcessDigest,
    buildProcessName,
    ensureWithinRepo,
    getScriptLogPaths,
    isRunnableTsFile,
    normalizeRepoFilePath,
    relativeRepoPath,
    writeWrapperScript,
} from '../script-runner';

export async function POST(req: Request) {
    return measure('api:repo:run-script', async () => {
        try {
            const blockedInProd = blockInProduction('Script execution');
            if (blockedInProd) return blockedInProd;

            const { path: repoPath, filePath } = await req.json();

            if (!repoPath || !filePath) {
                return new Response('Repository path and file path are required', { status: 400 });
            }

            const blocked = validateRepoPath(repoPath);
            if (blocked) return blocked;

            const normalizedFilePath = normalizeRepoFilePath(filePath);
            if (!isRunnableTsFile(normalizedFilePath)) {
                return new Response('Only runnable .ts files are supported', { status: 400 });
            }
            if (normalizedFilePath.includes('..')) {
                return new Response('Invalid path', { status: 400 });
            }

            const absRepo = path.resolve(repoPath);
            const safeFilePath = ensureWithinRepo(absRepo, normalizedFilePath);
            const absFile = path.resolve(absRepo, safeFilePath);
            if (!fs.existsSync(absFile)) {
                return new Response('Script file not found', { status: 404 });
            }

            const { goutDir, stdoutPath, stderrPath } = getScriptLogPaths(absRepo, safeFilePath);
            fs.mkdirSync(goutDir, { recursive: true });

            const processName = buildProcessName(absRepo, safeFilePath);
            const digest = buildProcessDigest(absRepo, safeFilePath);
            const { command, wrapperPath } = writeWrapperScript(absRepo, safeFilePath, digest);

            const proc = Bun.spawnSync([
                'bgrun',
                '--name', processName,
                '--command', command,
                '--directory', absRepo,
                '--stdout', stdoutPath,
                '--stderr', stderrPath,
                '--force',
            ], {
                stdout: 'pipe',
                stderr: 'pipe',
            });

            if (proc.exitCode !== 0) {
                const message = proc.stderr.toString().trim() || proc.stdout.toString().trim() || 'Failed to launch script';
                return new Response(message, { status: 500 });
            }

            return Response.json({
                success: true,
                processName,
                command,
                wrapperPath: relativeRepoPath(absRepo, wrapperPath),
                filePath: safeFilePath,
                stdoutPath: relativeRepoPath(absRepo, stdoutPath),
                stderrPath: relativeRepoPath(absRepo, stderrPath),
                outputDir: '.gout',
            });
        } catch (error: any) {
            console.error('api:repo:run-script:error', error);
            return new Response(`Error: ${error.message}`, { status: 500 });
        }
    });
}