import { measure } from 'measure-fn';
import simpleGit from 'simple-git';
import path from 'path';
import { validateRepoPath } from '../validate-path';

const WORKING_TREE_HASH = '__working__';

export function extractCanonicalForgeSlugInfo(remoteUrl?: string | null): { slug: string | null; source: string } {
    if (!remoteUrl) return { slug: null, source: '' };

    const normalized = remoteUrl.trim().replace(/\.git$/i, '');

    const sshMatch = normalized.match(/^[^@]+@([^:]+):(.+)$/);
    const httpsMatch = normalized.match(/^(?:https?|ssh):\/\/([^/]+)\/(.+)$/i);
    const host = sshMatch?.[1] || httpsMatch?.[1] || '';
    const pathPart = sshMatch?.[2] || httpsMatch?.[2];
    if (!pathPart) return { slug: null, source: normalized };

    const segments = pathPart
        .split('/')
        .map(s => s.trim())
        .filter(Boolean)
        .filter(s => s !== '-' && s !== 'scm');

    if (segments.length < 2) return { slug: null, source: normalized };
    if (segments.length > 5) return { slug: null, source: normalized };
    if (segments.some(part => /[:\\]/.test(part))) return { slug: null, source: normalized };

    return {
        slug: segments.join('/'),
        source: host ? `${host} · ${normalized}` : normalized,
    };
}

export async function POST(req: Request) {
    return measure('api:repo:load', async () => {
        try {
            const { path: repoPath } = await req.json();

            if (!repoPath) {
                return new Response('Repository path is required', { status: 400 });
            }

            const blocked = validateRepoPath(repoPath);
            if (blocked) return blocked;

            const git = simpleGit(repoPath);

            // Check if it's a git repository
            const isRepo = await git.checkIsRepo();
            if (!isRepo) {
                return new Response('Not a valid git repository', { status: 400 });
            }

            // Get commit log (last 100 commits) with custom format for tree graph
            const log = await git.log({
                maxCount: 100,
                format: {
                    hash: '%H',
                    parents: '%P',
                    message: '%s',
                    author_name: '%an',
                    author_email: '%ae',
                    date: '%ai',
                    refs: '%D' // e.g. "HEAD -> main, origin/main, origin/HEAD"
                }
            });

            const commits = log.all.map(commit => ({
                hash: commit.hash,
                parents: commit.parents ? commit.parents.trim().split(' ').filter(Boolean) : [],
                message: commit.message.split('\n')[0], // First line only
                author: commit.author_name,
                email: commit.author_email,
                date: commit.date,
                refs: commit.refs ? commit.refs.split(',').map(r => r.trim()).filter(Boolean) : []
            }));

            try {
                const porcelain = await git.raw(['status', '--porcelain=v1', '--untracked-files=all']);
                const workingTreeLines = porcelain.split('\n').filter(line => line.trim());
                if (workingTreeLines.length > 0) {
                    let stagedCount = 0;
                    let unstagedCount = 0;
                    for (const line of workingTreeLines) {
                        const indexStatus = line[0] || ' ';
                        const workTreeStatus = line[1] || ' ';
                        if (indexStatus !== ' ' && indexStatus !== '?') stagedCount++;
                        if (workTreeStatus !== ' ' && workTreeStatus !== '?') unstagedCount++;
                        if (indexStatus === '?' && workTreeStatus === '?') unstagedCount++;
                    }
                    const summaryBits = [];
                    if (stagedCount > 0) summaryBits.push(`${stagedCount} staged`);
                    if (unstagedCount > 0) summaryBits.push(`${unstagedCount} unstaged`);
                    commits.unshift({
                        hash: WORKING_TREE_HASH,
                        parents: commits[0] ? [commits[0].hash] : [],
                        message: summaryBits.length > 0 ? `Working tree · ${summaryBits.join(' · ')}` : 'Working tree',
                        author: 'Uncommitted',
                        email: '',
                        date: new Date().toISOString(),
                        refs: ['WORKTREE'],
                        isVirtual: true,
                    });
                }
            } catch {
                // Ignore status failures — commit history still loads
            }

            let canonicalSlug: string | null = null;
            let canonicalSlugSource = '';
            try {
                const remotes = await git.getRemotes(true);
                const origin = remotes.find(r => r.name === 'origin') || remotes[0];
                const info = extractCanonicalForgeSlugInfo(origin?.refs?.fetch || origin?.refs?.push || null);
                canonicalSlug = info.slug;
                canonicalSlugSource = info.source;
            } catch {
                canonicalSlug = null;
                canonicalSlugSource = '';
            }

            return Response.json({ commits, canonicalSlug, canonicalSlugSource });
        } catch (error: any) {
            console.error('api:repo:load:error', error);
            return new Response(`Error: ${error.message}`, { status: 500 });
        }
    });
}
