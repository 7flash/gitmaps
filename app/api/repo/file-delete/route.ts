import { measure } from 'measure-fn';
import { validateRepoPath } from '../validate-path';
import * as path from 'path';
import * as fs from 'fs';
import { resolveInsideRepo } from '../path-safety';
import simpleGit from 'simple-git';

export async function POST(req: Request) {
    return measure('api:repo:file-delete', async () => {
        try {
            const { path: repoPath, filePath, gitRm } = await req.json();

            if (!repoPath || !filePath) {
                return new Response('Repository path and file path are required', { status: 400 });
            }

            const blocked = validateRepoPath(repoPath);
            if (blocked) return blocked;

            // Resolve absolute path and ensure it's within the repo
            const { absPath, absRepo, safeRelPath } = resolveInsideRepo(repoPath, filePath);

            // Check file exists
            if (!fs.existsSync(absPath)) {
                return new Response('File not found', { status: 404 });
            }

            if (gitRm) {
                // Use git rm to stage the deletion
                const git = simpleGit(repoPath);
                await git.rm(safeRelPath);
            } else {
                // Just delete the file
                fs.unlinkSync(absPath);
            }

            // Clean up empty parent directories
            let dir = path.dirname(absPath);
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
                path: safeRelPath,
                gitRm: !!gitRm,
            });
        } catch (error: any) {
            console.error('api:repo:file-delete:error', error);
            return new Response(`Error: ${error.message}`, { status: 500 });
        }
    });
}