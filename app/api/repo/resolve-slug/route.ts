import { existsSync, readdirSync, statSync } from 'fs';
import path from 'path';
import simpleGit from 'simple-git';
import { extractCanonicalForgeSlugInfo } from '../load/route';

const CLONES_DIR = path.join(process.cwd(), 'git-canvas', 'repos');

async function findRepoByCanonicalSlug(slug: string): Promise<string | null> {
  if (!slug || !existsSync(CLONES_DIR)) return null;

  const entries = readdirSync(CLONES_DIR);
  for (const entry of entries) {
    const fullPath = path.join(CLONES_DIR, entry);
    try {
      const stat = statSync(fullPath);
      if (!stat.isDirectory()) continue;
      if (!existsSync(path.join(fullPath, '.git'))) continue;

      try {
        const git = simpleGit(fullPath);
        const remotes = await git.getRemotes(true);
        const origin = remotes.find((r) => r.name === 'origin') || remotes[0];
        const info = extractCanonicalForgeSlugInfo(origin?.refs?.fetch || origin?.refs?.push || null);
        if (info.slug === slug) {
          return fullPath.replace(/\\/g, '/');
        }
      } catch {
        // ignore invalid repos
      }
    } catch {
      // ignore bad entries
    }
  }

  return null;
}

export async function POST(req: Request) {
  try {
    const { slug } = await req.json() as { slug?: string };
    const normalizedSlug = (slug || '').trim().replace(/^\/+|\/+$/g, '');
    if (!normalizedSlug) {
      return Response.json({ error: 'slug is required' }, { status: 400 });
    }

    const resolvedPath = await findRepoByCanonicalSlug(normalizedSlug);
    return Response.json({ path: resolvedPath });
  } catch (error: any) {
    return Response.json({ error: error?.message || 'Failed to resolve slug' }, { status: 500 });
  }
}