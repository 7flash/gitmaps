import { measure } from 'measure-fn';
import simpleGit from 'simple-git';
import path from 'path';
import { readFileSync, existsSync, statSync } from 'fs';
import { validateRepoPath } from '../validate-path';

const WORKING_TREE_HASH = '__working__';
const MAX_FILES = 16;
const DEFAULT_COMMITS = 5;
const MAX_COMMITS = 10;
const MAX_CELL_BYTES = 180_000;
const MAX_RESPONSE_BYTES = 6_000_000;

type CommitColumn = {
    hash: string;
    shortHash: string;
    date: string;
    author: string;
    message: string;
    kind: 'working' | 'commit';
};

type RawVersion = {
    exists: boolean;
    binary: boolean;
    content: string | null;
    byteLength: number;
    lines: number;
    truncated: boolean;
    reason?: string;
};

export async function POST(req: Request) {
    return measure('api:repo:file-history-compare', async () => {
        try {
            const body = await req.json() as {
                path?: string;
                filePaths?: unknown;
                limit?: number;
            };

            const repoPath = body.path;
            if (!repoPath) {
                return new Response('Repository path is required', { status: 400 });
            }

            const blocked = validateRepoPath(repoPath);
            if (blocked) return blocked;

            const filePaths = normalizeFilePaths(body.filePaths);
            if (filePaths.length === 0) {
                return new Response('At least one valid file path is required', { status: 400 });
            }

            const limit = clampNumber(body.limit, DEFAULT_COMMITS, 1, MAX_COMMITS);
            const git = simpleGit(repoPath);
            const commitColumns = await findRelevantCommits(git, filePaths, limit);
            const columns: CommitColumn[] = [
                {
                    hash: WORKING_TREE_HASH,
                    shortHash: 'Current',
                    date: '',
                    author: '',
                    message: 'Working tree',
                    kind: 'working',
                },
                ...commitColumns,
            ];

            let responseBudget = MAX_RESPONSE_BYTES;
            const rows = [];

            for (const filePath of filePaths) {
                const completeCells: RawVersion[] = [];
                const displayCells: RawVersion[] = [];

                for (const column of columns) {
                    const complete = column.kind === 'working'
                        ? readWorkingVersion(repoPath, filePath)
                        : await readCommitVersion(git, column.hash, filePath);

                    const display = applyContentLimits(complete, responseBudget);
                    responseBudget = Math.max(0, responseBudget - (display.content ? Buffer.byteLength(display.content, 'utf8') : 0));
                    completeCells.push(complete);
                    displayCells.push(display);
                }

                rows.push({
                    path: filePath,
                    name: filePath.split('/').pop() || filePath,
                    cells: displayCells.map((cell, index) => ({
                        ...cell,
                        changedFromOlder: index < completeCells.length - 1
                            ? versionsDiffer(completeCells[index], completeCells[index + 1])
                            : false,
                    })),
                });
            }

            return Response.json({
                columns,
                rows,
                files: filePaths.length,
                commitCount: commitColumns.length,
                limit,
                responseTruncated: responseBudget === 0,
            });
        } catch (error: any) {
            console.error('api:repo:file-history-compare:error', error);
            return new Response(`Error: ${error.message}`, { status: 500 });
        }
    });
}

function normalizeFilePaths(value: unknown): string[] {
    if (!Array.isArray(value)) return [];

    const unique = new Set<string>();
    for (const candidate of value) {
        if (typeof candidate !== 'string') continue;

        const cleaned = candidate.replace(/\\/g, '/').replace(/^\.\/+/, '').trim();
        const segments = cleaned.split('/');
        const invalid =
            !cleaned ||
            cleaned.length > 4096 ||
            cleaned.startsWith('/') ||
            cleaned.includes('\0') ||
            segments.includes('..');

        if (!invalid) unique.add(cleaned);
        if (unique.size >= MAX_FILES) break;
    }

    return Array.from(unique);
}

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.floor(n)));
}

async function findRelevantCommits(
    git: ReturnType<typeof simpleGit>,
    filePaths: string[],
    limit: number,
): Promise<CommitColumn[]> {
    const raw = await git.raw([
        'log',
        `--max-count=${limit}`,
        '--date=iso-strict',
        '--pretty=format:%H%x1f%h%x1f%cI%x1f%cn%x1f%s%x1e',
        '--',
        ...filePaths,
    ]);

    return raw
        .split('\x1e')
        .map(record => record.trim())
        .filter(Boolean)
        .map(record => {
            const [hash, shortHash, date, author, ...messageParts] = record.split('\x1f');
            return {
                hash,
                shortHash,
                date,
                author,
                message: messageParts.join('\x1f'),
                kind: 'commit' as const,
            };
        });
}

function readWorkingVersion(repoPath: string, filePath: string): RawVersion {
    const absolutePath = path.join(repoPath, ...filePath.split('/'));
    if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
        return missingVersion();
    }

    const buffer = readFileSync(absolutePath);
    if (isBinary(buffer)) {
        return {
            exists: true,
            binary: true,
            content: null,
            byteLength: buffer.byteLength,
            lines: 0,
            truncated: false,
            reason: 'Binary file',
        };
    }

    const content = buffer.toString('utf8');
    return textVersion(content);
}

async function readCommitVersion(
    git: ReturnType<typeof simpleGit>,
    commit: string,
    filePath: string,
): Promise<RawVersion> {
    try {
        const content = await git.show([`${commit}:${filePath}`]);
        if (content.includes('\0')) {
            return {
                exists: true,
                binary: true,
                content: null,
                byteLength: Buffer.byteLength(content, 'utf8'),
                lines: 0,
                truncated: false,
                reason: 'Binary file',
            };
        }
        return textVersion(content);
    } catch {
        return missingVersion();
    }
}

function textVersion(content: string): RawVersion {
    return {
        exists: true,
        binary: false,
        content,
        byteLength: Buffer.byteLength(content, 'utf8'),
        lines: content ? content.split('\n').length : 0,
        truncated: false,
    };
}

function missingVersion(): RawVersion {
    return {
        exists: false,
        binary: false,
        content: null,
        byteLength: 0,
        lines: 0,
        truncated: false,
        reason: 'File did not exist at this point',
    };
}

function isBinary(buffer: Buffer) {
    return buffer.subarray(0, Math.min(buffer.length, 8000)).includes(0);
}

function applyContentLimits(version: RawVersion, remainingResponseBytes: number): RawVersion {
    if (!version.content) return version;

    const allowed = Math.min(MAX_CELL_BYTES, remainingResponseBytes);
    if (allowed <= 0) {
        return {
            ...version,
            content: '',
            truncated: true,
            reason: 'Response display budget reached',
        };
    }

    if (version.byteLength <= allowed) return version;

    const clipped = Buffer.from(version.content, 'utf8').subarray(0, allowed).toString('utf8');
    return {
        ...version,
        content: `${clipped}\n\n--- Version truncated for comparison view ---`,
        truncated: true,
        reason: 'Large version truncated',
    };
}

function versionsDiffer(left: RawVersion, right: RawVersion) {
    if (left.exists !== right.exists || left.binary !== right.binary) return true;
    if (!left.exists) return false;
    if (left.binary) return left.byteLength !== right.byteLength;
    return left.content !== right.content;
}