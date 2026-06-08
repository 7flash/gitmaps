import { measure } from 'measure-fn';
import { validateRepoPath } from '../validate-path';
import * as path from 'path';
import * as fs from 'fs';
import simpleGit from 'simple-git';
import { resolveInsideRepo } from '../path-safety';

export async function POST(req: Request) {
    return measure('api:repo:file-rename', async () => {
        try {
            const { path: repoPath, oldPath, newPath } = await req.json();

            if (!repoPath || !oldPath || !newPath) {
                return new Response('Repository path, old path, and new path are required', { status: 400 });
            }

            const blocked = validateRepoPath(repoPath);
            if (blocked) return blocked;

            const oldResolved = resolveInsideRepo(repoPath, oldPath);
            const newResolved = resolveInsideRepo(repoPath, newPath);
            const normalizedOld = oldResolved.safeRelPath;
            const normalizedNew = newResolved.safeRelPath;
            const absOld = oldResolved.absPath;
            const absNew = newResolved.absPath;
            const absRepo = oldResolved.absRepo;

            // Check source exists
            if (!fs.existsSync(absOld)) {
                return new Response('Source file not found', { status: 404 });
            }

            // Check destination doesn't already exist
            if (fs.existsSync(absNew)) {
                return new Response('Destination already exists', { status: 409 });
            }

            // Ensure destination directory exists
            const destDir = path.dirname(absNew);
            if (!fs.existsSync(destDir)) {
                fs.mkdirSync(destDir, { recursive: true });
            }

            // Try git mv first, fall back to fs rename
            try {
                const git = simpleGit(repoPath);
                await git.mv(normalizedOld, normalizedNew);
            } catch {
                // git mv might fail if file is untracked — just use fs
                fs.renameSync(absOld, absNew);
            }

            // Clean up empty parent directories
            let dir = path.dirname(absOld);
            while (dir !== absRepo) {
                const relToRepo = path.relative(absRepo, dir);
                if (relToRepo.startsWith('..') || path.isAbsolute(relToRepo)) break;
                const entries = fs.readdirSync(dir);
                if (entries.length === 0) {
                    fs.rmdirSync(dir);
                    dir = path.dirname(dir);
                } else {
                    break;
                }
            }

            return Response.json({
                success: true,
                oldPath: normalizedOld,
                newPath: normalizedNew,
            });
        } catch (error: any) {
            console.error('api:repo:file-rename:error', error);
            return new Response(`Error: ${error.message}`, { status: 500 });
        }
    });
}