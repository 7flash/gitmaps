import { measure } from 'measure-fn';
import path from 'path';
import fs from 'fs';
import { createHash } from 'crypto';
import { blockInProduction, validateRepoPath } from '../validate-path';

function normalizeRepoFilePath(filePath: string): string {
    return filePath.replace(/\\/g, '/').replace(/^\/+/, '');
}

function isRunnableTsFile(filePath: string): boolean {
    return filePath.endsWith('.ts') && !filePath.endsWith('.d.ts');
}

function buildProcessName(repoPath: string, filePath: string): string {
    const repoName = path.basename(repoPath).replace(/[^a-zA-Z0-9_-]+/g, '-').toLowerCase() || 'repo';
    const fileName = path.basename(filePath, '.ts').replace(/[^a-zA-Z0-9_-]+/g, '-').toLowerCase() || 'script';
    const digest = createHash('sha1').update(`${repoPath}:${filePath}`).digest('hex').slice(0, 8);
    return `gitmaps-run-${repoName}-${fileName}-${digest}`;
}

function writeWrapperScript(repoPath: string, filePath: string, digest: string): { command: string; wrapperPath: string } {
    const isWindows = process.platform === 'win32';
    const wrapperName = `run-${digest}${isWindows ? '.cmd' : '.sh'}`;
    const wrapperPath = path.join(repoPath, '.gout', wrapperName);

    if (filePath.includes('"')) {
        throw new Error('Script path cannot contain double quotes');
    }

    if (isWindows) {
        const scriptPath = filePath.replace(/\//g, '\\');
        fs.writeFileSync(
            wrapperPath,
            `@echo off\r\ncd /d "${repoPath.replace(/"/g, '""')}"\r\nbun "${scriptPath}"\r\n`,
            'utf8',
        );
        return {
            command: `.gout\\${wrapperName}`,
            wrapperPath,
        };
    }

    fs.writeFileSync(
        wrapperPath,
        `#!/usr/bin/env sh\ncd "${repoPath.replace(/"/g, '\\"')}"\nexec bun "${filePath}"\n`,
        'utf8',
    );
    fs.chmodSync(wrapperPath, 0o755);
    return {
        command: `./.gout/${wrapperName}`,
        wrapperPath,
    };
}

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
            const absFile = path.resolve(repoPath, normalizedFilePath);
            if (!absFile.startsWith(absRepo)) {
                return new Response('File path must be within the repository', { status: 403 });
            }
            if (!fs.existsSync(absFile)) {
                return new Response('Script file not found', { status: 404 });
            }

            const goutDir = path.join(absRepo, '.gout', path.dirname(normalizedFilePath));
            fs.mkdirSync(goutDir, { recursive: true });

            const fileBase = path.basename(normalizedFilePath);
            const stdoutPath = path.join(goutDir, `${fileBase}.stdout.log`);
            const stderrPath = path.join(goutDir, `${fileBase}.stderr.log`);

            const processName = buildProcessName(absRepo, normalizedFilePath);
            const digest = createHash('sha1').update(`${absRepo}:${normalizedFilePath}`).digest('hex').slice(0, 8);
            const { command, wrapperPath } = writeWrapperScript(absRepo, normalizedFilePath, digest);

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
                wrapperPath: path.relative(absRepo, wrapperPath).replace(/\\/g, '/'),
                filePath: normalizedFilePath,
                stdoutPath: path.relative(absRepo, stdoutPath).replace(/\\/g, '/'),
                stderrPath: path.relative(absRepo, stderrPath).replace(/\\/g, '/'),
                outputDir: '.gout',
            });
        } catch (error: any) {
            console.error('api:repo:run-script:error', error);
            return new Response(`Error: ${error.message}`, { status: 500 });
        }
    });
}
