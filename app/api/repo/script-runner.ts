import path from 'path';
import fs from 'fs';
import { createHash } from 'crypto';

export function normalizeRepoFilePath(filePath: string): string {
    return filePath.replace(/\\/g, '/').replace(/^\/+/, '');
}

export function isRunnableTsFile(filePath: string): boolean {
    return filePath.endsWith('.ts') && !filePath.endsWith('.d.ts');
}

export function buildProcessName(repoPath: string, filePath: string): string {
    const repoName = path.basename(repoPath).replace(/[^a-zA-Z0-9_-]+/g, '-').toLowerCase() || 'repo';
    const fileName = path.basename(filePath, '.ts').replace(/[^a-zA-Z0-9_-]+/g, '-').toLowerCase() || 'script';
    const digest = createHash('sha1').update(`${repoPath}:${filePath}`).digest('hex').slice(0, 8);
    return `gitmaps-run-${repoName}-${fileName}-${digest}`;
}

export function buildProcessDigest(repoPath: string, filePath: string): string {
    return createHash('sha1').update(`${repoPath}:${filePath}`).digest('hex').slice(0, 8);
}

export function getScriptLogPaths(repoPath: string, filePath: string) {
    const normalizedFilePath = normalizeRepoFilePath(filePath);
    const goutDir = path.join(repoPath, '.gout', path.dirname(normalizedFilePath));
    const fileBase = path.basename(normalizedFilePath);
    return {
        outputDir: path.join(repoPath, '.gout'),
        goutDir,
        stdoutPath: path.join(goutDir, `${fileBase}.stdout.log`),
        stderrPath: path.join(goutDir, `${fileBase}.stderr.log`),
    };
}

export function ensureWithinRepo(repoPath: string, filePath: string): string {
    const normalizedFilePath = normalizeRepoFilePath(filePath);
    const absRepo = path.resolve(repoPath);
    const absFile = path.resolve(repoPath, normalizedFilePath);
    if (!absFile.startsWith(absRepo)) {
        throw new Error('File path must be within the repository');
    }
    return normalizedFilePath;
}

export function writeWrapperScript(repoPath: string, filePath: string, digest: string): { command: string; wrapperPath: string } {
    const isWindows = process.platform === 'win32';
    const wrapperName = `run-${digest}${isWindows ? '.cmd' : '.sh'}`;
    const wrapperPath = path.join(repoPath, '.gout', wrapperName);

    if (filePath.includes('"')) {
        throw new Error('Script path cannot contain double quotes');
    }

    fs.mkdirSync(path.dirname(wrapperPath), { recursive: true });

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

export function tailTextFile(filePath: string, lineCount = 120): string {
    if (!fs.existsSync(filePath)) return '';
    const text = fs.readFileSync(filePath, 'utf8');
    const lines = text.split(/\r?\n/);
    return lines.slice(Math.max(0, lines.length - lineCount)).join('\n');
}

export function relativeRepoPath(repoPath: string, absolutePath: string): string {
    return path.relative(repoPath, absolutePath).replace(/\\/g, '/');
}

export async function getBgrunProcess(name: string): Promise<any | null> {
    const proc = Bun.spawnSync(['bgrun', '--json'], {
        stdout: 'pipe',
        stderr: 'pipe',
    });
    if (proc.exitCode !== 0) return null;
    const text = proc.stdout.toString().trim();
    if (!text) return null;
    try {
        const items = JSON.parse(text);
        return Array.isArray(items) ? items.find((item) => item.name === name) || null : null;
    } catch {
        return null;
    }
}