import { measure } from 'measure-fn';
import path from 'path';
import fs from 'fs';
import { blockInProduction, validateRepoPath } from '../validate-path';
import { ensureWithinRepo, normalizeRepoFilePath } from '../script-runner';

function applyPlaceholders(command: string, repoPath: string, filePath: string) {
    const absFile = path.resolve(repoPath, filePath);
    return command
        .replaceAll('{repo}', repoPath)
        .replaceAll('{file}', absFile)
        .replaceAll('{rel}', filePath);
}

export async function POST(req: Request) {
    return measure('api:repo:file-action-run', async () => {
        try {
            const blockedInProd = blockInProduction('File action execution');
            if (blockedInProd) return blockedInProd;

            const { path: repoPath, filePath, action } = await req.json();
            if (!repoPath || !filePath || !action?.command) {
                return new Response('Repository path, file path, and action.command are required', { status: 400 });
            }

            const blocked = validateRepoPath(repoPath);
            if (blocked) return blocked;

            const normalized = normalizeRepoFilePath(filePath);
            const safeFilePath = ensureWithinRepo(repoPath, normalized);
            const absFile = path.resolve(repoPath, safeFilePath);
            if (!fs.existsSync(absFile)) {
                return new Response('Target file not found', { status: 404 });
            }

            const resolvedCommand = applyPlaceholders(String(action.command), repoPath, safeFilePath);
            const proc = Bun.spawnSync(resolvedCommand, {
                cwd: repoPath,
                shell: true,
                stdout: 'pipe',
                stderr: 'pipe',
            });

            const stdout = proc.stdout.toString();
            const stderr = proc.stderr.toString();
            const output = [
                `# ${action.label || action.id || 'File Action'}`,
                `file: ${safeFilePath}`,
                `command: ${resolvedCommand}`,
                `exitCode: ${proc.exitCode ?? 0}`,
                '',
                '## stdout',
                stdout || '(empty)',
                '',
                '## stderr',
                stderr || '(empty)',
            ].join('\n');

            return Response.json({
                success: proc.exitCode === 0,
                exitCode: proc.exitCode,
                output,
                virtualPath: `.gitmaps/actions/${action.id || 'action'}/${path.basename(safeFilePath)}.preview.md`,
            });
        } catch (error: any) {
            console.error('api:repo:file-action-run:error', error);
            return new Response(`Error: ${error.message}`, { status: 500 });
        }
    });
}

