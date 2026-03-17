import { measure } from 'measure-fn';
import simpleGit from 'simple-git';
import path from 'path';
import { validateRepoPath } from '../validate-path';

function extractCanonicalForgeSlug(remoteUrl?: string | null): string | null {
    if (!remoteUrl) return null;

    const normalized = remoteUrl.trim().replace(/\.git$/i, '');

    const sshMatch = normalized.match(/^[^@]+@([^:]+):(.+)$/);
    const httpsMatch = normalized.match(/^(?:https?|ssh):\/\/[^/]+\/(.+)$/i);
    const pathPart = sshMatch?.[2] || httpsMatch?.[1];
    if (!pathPart) return null;

    const segments = pathPart
        .split('/')
        .map(s => s.trim())
        .filter(Boolean)
        .filter(s => s !== '-' && s !== 'scm');

    if (segments.length < 2) return null;
    if (segments.length > 5) return null;
    if (segments.some(part => /[:\\]/.test(part))) return null;

    return segments.join('/');
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

            let canonicalSlug: string | null = null;
            try {
                const remotes = await git.getRemotes(true);
                const origin = remotes.find(r => r.name === 'origin') || remotes[0];
                canonicalSlug = extractCanonicalForgeSlug(origin?.refs?.fetch || origin?.refs?.push || null);
            } catch {
                canonicalSlug = null;
            }

            return Response.json({ commits, canonicalSlug });
        } catch (error: any) {
            console.error('api:repo:load:error', error);
            return new Response(`Error: ${error.message}`, { status: 500 });
        }
    });
}
