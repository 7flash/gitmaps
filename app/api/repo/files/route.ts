import { measure } from 'measure-fn';
import simpleGit from 'simple-git';
import path from 'path';
import { validateRepoPath } from '../validate-path';

const WORKING_TREE_HASH = '__working__';

interface DiffLine { type: string; content: string }
interface DiffHunk { oldStart: number; oldCount: number; newStart: number; newCount: number; context: string; lines: DiffLine[] }

type WorkingTreeEntry = {
    path: string;
    oldPath?: string | null;
    indexStatus: string;
    workTreeStatus: string;
    status: string;
    staged: boolean;
    unstaged: boolean;
};

export async function POST(req: Request) {
    return measure('api:repo:files', async () => {
        try {
            const { path: repoPath, commit } = await req.json();

            if (!repoPath || !commit) {
                return new Response('Repository path and commit are required', { status: 400 });
            }

            const blocked = validateRepoPath(repoPath);
            if (blocked) return blocked;

            const git = simpleGit(repoPath);

            if (commit === WORKING_TREE_HASH) {
                const files = await getWorkingTreeFiles(git, repoPath);
                return Response.json({ files, totalChanged: files.length });
            }

            const files = await getCommitFiles(git, commit);
            return Response.json({ files, totalChanged: files.length });
        } catch (error: any) {
            console.error('api:repo:files:error', error);
            return new Response(`Error: ${error.message}`, { status: 500 });
        }
    });
}

async function getCommitFiles(git: ReturnType<typeof simpleGit>, commit: string) {
    // Get files CHANGED in this specific commit
    // -M detects renames, -C detects copies
    // Use --root for initial commits that have no parent
    let diffResult = '';
    try {
        diffResult = await git.raw(['diff-tree', '--no-commit-id', '--name-status', '-M30%', '-r', commit]);
    } catch (e) { /* ignore */ }
    // If empty (root commit), try with --root
    if (!diffResult.trim()) {
        try {
            diffResult = await git.raw(['diff-tree', '--root', '--no-commit-id', '--name-status', '-M30%', '-r', commit]);
        } catch (e) { /* ignore */ }
    }

    const changedFiles = [];
    const lines = diffResult.trim().split('\n').filter(Boolean);

    for (const line of lines) {
        const parts = line.split('\t');
        const statusCode = parts[0];
        if (!statusCode || parts.length < 2) continue;

        const isRename = statusCode.startsWith('R');
        const isCopy = statusCode.startsWith('C');

        let filePath: string;
        let oldPath: string | null = null;
        let fileStatus: string;
        let similarity: number | null = null;

        if (isRename || isCopy) {
            oldPath = parts[1];
            filePath = parts[2];
            fileStatus = isRename ? 'renamed' : 'copied';
            similarity = parseInt(statusCode.substring(1)) || null;
        } else {
            filePath = parts[1];
            fileStatus = statusCode === 'A' ? 'added'
                : statusCode === 'D' ? 'deleted'
                    : statusCode === 'M' ? 'modified'
                        : statusCode;
        }

        changedFiles.push(await buildChangedFileFromCommit(git, commit, filePath, fileStatus, oldPath, similarity));
    }

    return changedFiles;
}

async function buildChangedFileFromCommit(
    git: ReturnType<typeof simpleGit>,
    commit: string,
    filePath: string,
    fileStatus: string,
    oldPath: string | null,
    similarity: number | null,
) {
    const name = filePath.split('/').pop()!;
    let content = null;
    let hunks: DiffHunk[] = [];
    let error = null;

    if (fileStatus === 'added') {
        try { content = await git.show([`${commit}:${filePath}`]); } catch (e: any) { error = e.message; }
    } else if (fileStatus === 'deleted') {
        try { content = await git.show([`${commit}~1:${filePath}`]); } catch (e: any) { error = e.message; }
    } else if (fileStatus === 'modified') {
        try {
            const rawDiff = await git.raw(['diff', '-U3', `${commit}~1`, commit, '--', filePath]);
            hunks = parseHunks(rawDiff);
        } catch (e: any) { error = e.message; }
        try { content = await git.show([`${commit}:${filePath}`]); } catch (e: any) { /* ignore */ }
    } else if (fileStatus === 'renamed' || fileStatus === 'copied') {
        try {
            const rawDiff = await git.raw([
                'diff', '-U3', '-M',
                `${commit}~1`, commit,
                '--', oldPath!, filePath
            ]);
            hunks = parseHunks(rawDiff);
        } catch (e: any) { error = e.message; }
        try { content = await git.show([`${commit}:${filePath}`]); } catch (e: any) { /* ignore */ }
    }

    return {
        path: filePath,
        name,
        type: 'file',
        status: fileStatus,
        content,
        hunks,
        contentError: error,
        lines: content ? content.split('\n').length : 0,
        ...(oldPath ? { oldPath } : {}),
        ...(similarity != null ? { similarity } : {}),
    };
}

async function getWorkingTreeFiles(git: ReturnType<typeof simpleGit>, repoPath: string) {
    const porcelain = await git.raw(['status', '--porcelain=v1', '--untracked-files=all']);
    const entries = parseWorkingTreeStatus(porcelain);
    const changedFiles = [];

    for (const entry of entries) {
        changedFiles.push(await buildChangedFileFromWorkingTree(git, repoPath, entry));
    }

    return changedFiles;
}

function parseWorkingTreeStatus(raw: string): WorkingTreeEntry[] {
    const entries: WorkingTreeEntry[] = [];

    for (const line of raw.split('\n')) {
        if (!line.trim()) continue;
        if (line.length < 3) continue;

        const indexStatus = line[0];
        const workTreeStatus = line[1];
        let rawPath = line.slice(3).trim();
        let oldPath: string | null = null;
        let filePath = rawPath;

        if (rawPath.includes(' -> ')) {
            const parts = rawPath.split(' -> ');
            oldPath = parts[0];
            filePath = parts[1];
        }

        const staged = indexStatus !== ' ' && indexStatus !== '?';
        const unstaged = workTreeStatus !== ' ' && workTreeStatus !== '?';

        let status = 'modified';
        if (indexStatus === '?' && workTreeStatus === '?') {
            status = 'added';
        } else if (indexStatus === 'D' || workTreeStatus === 'D') {
            status = 'deleted';
        } else if (indexStatus === 'R' || workTreeStatus === 'R') {
            status = 'renamed';
        } else if (indexStatus === 'C' || workTreeStatus === 'C') {
            status = 'copied';
        } else if (indexStatus === 'A' || workTreeStatus === 'A') {
            status = 'added';
        }

        entries.push({
            path: filePath,
            oldPath,
            indexStatus,
            workTreeStatus,
            status,
            staged,
            unstaged,
        });
    }

    return entries;
}

async function buildChangedFileFromWorkingTree(
    git: ReturnType<typeof simpleGit>,
    repoPath: string,
    entry: WorkingTreeEntry,
) {
    const filePath = entry.path;
    const name = filePath.split('/').pop()!;
    let content = null;
    let hunks: DiffHunk[] = [];
    let error = null;

    try {
        if (entry.status === 'added') {
            content = await readWorkingTreeFile(repoPath, filePath);
        } else if (entry.status === 'deleted') {
            const headPath = entry.oldPath || filePath;
            try {
                content = await git.show([`HEAD:${headPath}`]);
            } catch (e: any) {
                error = e.message;
            }
        } else {
            try {
                const diffArgs = entry.oldPath
                    ? ['diff', '-U3', '-M', 'HEAD', '--', entry.oldPath, filePath]
                    : ['diff', '-U3', 'HEAD', '--', filePath];
                const rawDiff = await git.raw(diffArgs);
                hunks = parseHunks(rawDiff);
            } catch (e: any) {
                error = e.message;
            }
            try {
                content = await readWorkingTreeFile(repoPath, filePath);
            } catch (e: any) {
                if (!error) error = e.message;
            }
        }
    } catch (e: any) {
        error = e.message;
    }

    return {
        path: filePath,
        name,
        type: 'file',
        status: entry.status,
        content,
        hunks,
        contentError: error,
        lines: content ? content.split('\n').length : 0,
        staged: entry.staged,
        unstaged: entry.unstaged,
        ...(entry.oldPath ? { oldPath: entry.oldPath } : {}),
    };
}

async function readWorkingTreeFile(repoPath: string, filePath: string): Promise<string> {
    const fullPath = path.join(repoPath, ...filePath.split('/'));
    return await Bun.file(fullPath).text();
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
                lines: []
            };
            continue;
        }

        if (line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++')
            || line.startsWith('similarity ') || line.startsWith('rename ') || line.startsWith('copy ')) continue;

        if (!currentHunk) continue;

        if (line.startsWith('+')) {
            currentHunk.lines.push({ type: 'add', content: line.substring(1) });
        } else if (line.startsWith('-')) {
            currentHunk.lines.push({ type: 'del', content: line.substring(1) });
        } else if (line.startsWith('\\')) {
            // "\ No newline at end of file" — skip
        } else {
            currentHunk.lines.push({ type: 'ctx', content: line.startsWith(' ') ? line.substring(1) : line });
        }
    }

    if (currentHunk) hunks.push(currentHunk);
    return hunks;
}
