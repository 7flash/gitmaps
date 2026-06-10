import { measure } from 'measure-fn';
import simpleGit from 'simple-git';
import { readFileSync } from 'fs';
import { validateRepoPath } from '../validate-path';
import { resolveRepoPath } from '../resolve-repo-path';
import { resolveInsideRepo } from '../path-safety';

const WORKING_TREE_HASH = '__working__';
const EMPTY_TREE_HASH = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

interface DiffLine { type: string; content: string }
interface DiffHunk {
    oldStart: number;
    oldCount: number;
    newStart: number;
    newCount: number;
    context: string;
    lines: DiffLine[];
}

type ChangedFile = {
    path: string;
    name: string;
    type: 'file';
    status: string;
    content: string | null;
    hunks: DiffHunk[];
    contentError: string | null;
    lines: number;
    oldPath?: string | null;
    similarity?: number | null;
    staged?: boolean;
    unstaged?: boolean;
};

type NameStatusEntry = {
    path: string;
    oldPath: string | null;
    status: string;
    similarity: number | null;
    staged?: boolean;
    unstaged?: boolean;
};

export async function POST(req: Request) {
    return measure('api:repo:files', async () => {
        try {
            const { path: requestedPath, commit } = await req.json();

            if (!requestedPath || !commit) {
                return new Response('Repository path and commit are required', { status: 400 });
            }

            const resolved = resolveRepoPath(requestedPath);
            const repoPath = resolved.repoPath;

            const blocked = validateRepoPath(repoPath);
            if (blocked) return blocked;

            const git = simpleGit(repoPath);

            if (commit === WORKING_TREE_HASH) {
                // Compatibility behavior for Workdir/Current: render every tracked
                // Git file as a full-content file card. Do not return a diff here.
                // Older UI paths still call /api/repo/files for __working__, so
                // returning [] for a clean repo makes the canvas falsely say
                // "no changes". Historical commits below remain diff-only.
                const files = await getWorkingTreeSnapshotFiles(git);
                return Response.json({
                    files,
                    total: files.length,
                    totalChanged: 0,
                    mode: 'workdir-full-content',
                    repoPath,
                    requestedPath: resolved.inputPath,
                    correctedPath: resolved.corrected,
                    pathResolution: resolved.resolution,
                });
            }

            const parent = await getPrimaryParentOrEmptyTree(git, commit);
            const files = await getCommitDiffFiles(git, parent, commit);
            return Response.json({ files, totalChanged: files.length, diffBase: parent, diffCompare: commit, repoPath, requestedPath: resolved.inputPath, correctedPath: resolved.corrected, pathResolution: resolved.resolution });
        } catch (error: any) {
            console.error('api:repo:files:error', error);
            return new Response(`Error: ${error.message}`, { status: 500 });
        }
    });
}

async function getPrimaryParentOrEmptyTree(git: ReturnType<typeof simpleGit>, commit: string): Promise<string> {
    try {
        const row = (await git.raw(['rev-list', '--parents', '-n', '1', commit])).trim();
        const parts = row.split(/\s+/).filter(Boolean);
        return parts[1] || EMPTY_TREE_HASH;
    } catch {
        return `${commit}~1`;
    }
}

async function getCommitDiffFiles(git: ReturnType<typeof simpleGit>, base: string, commit: string): Promise<ChangedFile[]> {
    const rawNameStatus = await git.raw(['diff', '--name-status', '-M30%', base, commit, '--']);
    const entries = parseNameStatus(rawNameStatus);
    const files: ChangedFile[] = [];

    for (const entry of entries) {
        files.push(await buildDiffFile(git, base, commit, entry));
    }

    return files;
}

async function getWorkingTreeSnapshotFiles(git: ReturnType<typeof simpleGit>): Promise<ChangedFile[]> {
    const raw = await git.raw(['ls-files', '-z']);
    return raw
        .split('\0')
        .map((filePath) => filePath.trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b))
        .map((filePath) => ({
            path: unquoteGitPath(filePath),
            name: unquoteGitPath(filePath).split('/').pop() || unquoteGitPath(filePath),
            type: 'file' as const,
            status: 'workdir',
            viewMode: 'workdir' as any,
            isWorkingContent: true as any,
            content: null,
            hunks: undefined as any,
            contentError: null,
            lines: 0,
        }));
}

async function getWorkingTreeDiffFiles(git: ReturnType<typeof simpleGit>, repoPath: string): Promise<ChangedFile[]> {
    const rawNameStatus = await git.raw(['diff', '--name-status', '-M30%', 'HEAD', '--']).catch(() => '');
    const entries = parseNameStatus(rawNameStatus);
    const byPath = new Map(entries.map((entry) => [entry.path, entry]));

    const porcelain = await git.raw(['status', '--porcelain=v1', '--untracked-files=all']);
    const statusEntries = parseWorkingTreeStatus(porcelain);
    for (const statusEntry of statusEntries) {
        const existing = byPath.get(statusEntry.path);
        if (existing) {
            existing.staged = statusEntry.staged;
            existing.unstaged = statusEntry.unstaged;
            continue;
        }
        byPath.set(statusEntry.path, statusEntry);
    }

    const files: ChangedFile[] = [];
    for (const entry of byPath.values()) {
        if (entry.status === 'added' && entry.staged !== true) {
            files.push(await buildUntrackedFileDiff(repoPath, entry));
        } else {
            files.push(await buildDiffFile(git, 'HEAD', WORKING_TREE_HASH, entry));
        }
    }
    return files;
}

function parseNameStatus(raw: string): NameStatusEntry[] {
    const entries: NameStatusEntry[] = [];
    for (const line of raw.split('\n')) {
        if (!line.trim()) continue;
        const parts = line.split('\t');
        const statusCode = parts[0];
        if (!statusCode || parts.length < 2) continue;

        const isRename = statusCode.startsWith('R');
        const isCopy = statusCode.startsWith('C');
        const similarity = (isRename || isCopy) ? parseInt(statusCode.slice(1), 10) || null : null;
        const oldPath = (isRename || isCopy) ? parts[1] : null;
        const filePath = (isRename || isCopy) ? parts[2] : parts[1];
        if (!filePath) continue;

        entries.push({
            path: unquoteGitPath(filePath),
            oldPath: oldPath ? unquoteGitPath(oldPath) : null,
            status: isRename ? 'renamed'
                : isCopy ? 'copied'
                    : statusCode === 'A' ? 'added'
                        : statusCode === 'D' ? 'deleted'
                            : statusCode === 'M' ? 'modified'
                                : statusCode,
            similarity,
        });
    }
    return entries;
}

function parseWorkingTreeStatus(raw: string): NameStatusEntry[] {
    const entries: NameStatusEntry[] = [];

    for (const line of raw.split('\n')) {
        if (!line.trim() || line.length < 3) continue;

        const indexStatus = line[0] || ' ';
        const workTreeStatus = line[1] || ' ';
        let rawPath = line.slice(3).trim();
        let oldPath: string | null = null;
        let filePath = rawPath;

        if (rawPath.includes(' -> ')) {
            const parts = rawPath.split(' -> ');
            oldPath = unquoteGitPath(parts[0]);
            filePath = parts[1];
        }

        const staged = indexStatus !== ' ' && indexStatus !== '?';
        const unstaged = workTreeStatus !== ' ' && workTreeStatus !== '?';

        let status = 'modified';
        if (indexStatus === '?' && workTreeStatus === '?') status = 'added';
        else if (indexStatus === 'D' || workTreeStatus === 'D') status = 'deleted';
        else if (indexStatus === 'R' || workTreeStatus === 'R') status = 'renamed';
        else if (indexStatus === 'C' || workTreeStatus === 'C') status = 'copied';
        else if (indexStatus === 'A' || workTreeStatus === 'A') status = 'added';

        entries.push({
            path: unquoteGitPath(filePath),
            oldPath,
            status,
            similarity: null,
            staged,
            unstaged,
        });
    }

    return entries;
}

async function buildDiffFile(
    git: ReturnType<typeof simpleGit>,
    base: string,
    compare: string,
    entry: NameStatusEntry,
): Promise<ChangedFile> {
    const name = entry.path.split('/').pop() || entry.path;
    let hunks: DiffHunk[] = [];
    let error: string | null = null;

    try {
        const pathArgs = entry.oldPath ? [entry.oldPath, entry.path] : [entry.path];
        const compareArgs = compare === WORKING_TREE_HASH
            ? ['diff', '-U3', '-M30%', base, '--', ...pathArgs]
            : ['diff', '-U3', '-M30%', base, compare, '--', ...pathArgs];
        const rawDiff = await git.raw(compareArgs);
        hunks = parseHunks(rawDiff);
    } catch (e: any) {
        error = e.message;
    }

    return {
        path: entry.path,
        name,
        type: 'file',
        status: entry.status,
        content: formatHunksForPreview(hunks),
        hunks,
        contentError: error,
        lines: countHunkDisplayLines(hunks),
        ...(entry.oldPath ? { oldPath: entry.oldPath } : {}),
        ...(entry.similarity != null ? { similarity: entry.similarity } : {}),
        ...(entry.staged !== undefined ? { staged: entry.staged } : {}),
        ...(entry.unstaged !== undefined ? { unstaged: entry.unstaged } : {}),
    };
}

async function buildUntrackedFileDiff(repoPath: string, entry: NameStatusEntry): Promise<ChangedFile> {
    const name = entry.path.split('/').pop() || entry.path;
    let hunks: DiffHunk[] = [];
    let error: string | null = null;

    try {
        const { absPath } = resolveInsideRepo(repoPath, entry.path);
        const content = readFileSync(absPath, 'utf8');
        hunks = synthesizeAddedFileHunks(content);
    } catch (e: any) {
        error = e.message;
    }

    return {
        path: entry.path,
        name,
        type: 'file',
        status: 'added',
        content: formatHunksForPreview(hunks),
        hunks,
        contentError: error,
        lines: countHunkDisplayLines(hunks),
        staged: !!entry.staged,
        unstaged: entry.unstaged !== false,
    };
}

function synthesizeAddedFileHunks(content: string): DiffHunk[] {
    const lines = content.split('\n');
    return [{
        oldStart: 0,
        oldCount: 0,
        newStart: 1,
        newCount: lines.length,
        context: '',
        lines: lines.map((line) => ({ type: 'add', content: line })),
    }];
}

function formatHunksForPreview(hunks: DiffHunk[]): string | null {
    if (!hunks.length) return null;
    const output: string[] = [];
    for (const hunk of hunks) {
        output.push(`@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@${hunk.context ? ` ${hunk.context}` : ''}`);
        for (const line of hunk.lines) {
            const prefix = line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' ';
            output.push(prefix + line.content);
        }
    }
    return output.join('\n');
}

function countHunkDisplayLines(hunks: DiffHunk[]): number {
    return hunks.reduce((sum, hunk) => sum + hunk.lines.length + 1, 0);
}

function unquoteGitPath(value: string): string {
    const trimmed = value.trim();
    if (!(trimmed.startsWith('"') && trimmed.endsWith('"'))) return trimmed;
    try {
        return JSON.parse(trimmed);
    } catch {
        return trimmed.slice(1, -1);
    }
}

function parseHunks(rawDiff: string): DiffHunk[] {
    const allLines = rawDiff.split('\n');
    const hunks: DiffHunk[] = [];
    let currentHunk: DiffHunk | null = null;

    for (const line of allLines) {
        const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)/);
        if (hunkMatch) {
            if (currentHunk) hunks.push(currentHunk);
            currentHunk = {
                oldStart: parseInt(hunkMatch[1]),
                oldCount: parseInt(hunkMatch[2] || '1'),
                newStart: parseInt(hunkMatch[3]),
                newCount: parseInt(hunkMatch[4] || '1'),
                context: hunkMatch[5]?.trim() || '',
                lines: [],
            };
            continue;
        }

        if (line.startsWith('diff ') || line.startsWith('index ') ||
            line.startsWith('---') || line.startsWith('+++') ||
            line.startsWith('similarity ') || line.startsWith('rename ') ||
            line.startsWith('copy ') || line.startsWith('new file mode') ||
            line.startsWith('deleted file mode') || line.startsWith('old mode') ||
            line.startsWith('new mode')) continue;

        if (!currentHunk) continue;

        if (line.startsWith('+')) {
            currentHunk.lines.push({ type: 'add', content: line.substring(1) });
        } else if (line.startsWith('-')) {
            currentHunk.lines.push({ type: 'del', content: line.substring(1) });
        } else if (line.startsWith('\\')) {
            // skip "\ No newline at end of file"
        } else {
            currentHunk.lines.push({ type: 'ctx', content: line.startsWith(' ') ? line.substring(1) : line });
        }
    }

    if (currentHunk) hunks.push(currentHunk);
    return hunks;
}
