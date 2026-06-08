import { measure } from 'measure-fn';
import path from 'path';
import { blockInProduction, validateRepoPath } from '../validate-path';
import {
    buildProcessName,
    ensureWithinRepo,
    getBgrunProcess,
    getScriptLogPaths,
    isRunnableTsFile,
    normalizeRepoFilePath,
    relativeRepoPath,
    tailTextFile,
} from '../script-runner';

export async function POST(req: Request) {
    return measure('api:repo:script-output', async () => {
        try {
            const blockedInProd = blockInProduction('Script execution');
            if (blockedInProd) return blockedInProd;

            const { path: repoPath, filePath, lines } = await req.json();
            if (!repoPath || !filePath) {
                return new Response('Repository path and file path are required', { status: 400 });
            }

            const blocked = validateRepoPath(repoPath);
            if (blocked) return blocked;

            const absRepo = path.resolve(repoPath);
            const safeFilePath = ensureWithinRepo(absRepo, normalizeRepoFilePath(filePath));
            if (!isRunnableTsFile(safeFilePath)) {
                return new Response('Only runnable .ts files are supported', { status: 400 });
            }

            const processName = buildProcessName(absRepo, safeFilePath);
            const processInfo = await getBgrunProcess(processName);
            const { stdoutPath, stderrPath } = getScriptLogPaths(absRepo, safeFilePath);
            const lineCount = Number.isFinite(lines) ? Math.max(20, Math.min(500, Number(lines))) : 120;

            return Response.json({
                success: true,
                processName,
                filePath: safeFilePath,
                status: processInfo?.status || 'not-found',
                pid: processInfo?.pid || null,
                ports: processInfo?.ports || [],
                stdoutPath: relativeRepoPath(absRepo, stdoutPath),
                stderrPath: relativeRepoPath(absRepo, stderrPath),
                stdout: tailTextFile(stdoutPath, lineCount),
                stderr: tailTextFile(stderrPath, lineCount),
            });
        } catch (error: any) {
            console.error('api:repo:script-output:error', error);
            return new Response(`Error: ${error.message}`, { status: 500 });
        }
    });
}