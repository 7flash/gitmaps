import { measure } from 'measure-fn';
import simpleGit from 'simple-git';
import { readdirSync, statSync, readFileSync } from 'fs';
import path from 'path';
import { validateRepoPath } from '../validate-path';

const BINARY_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'svg', 'webp', 'mp3', 'mp4', 'wav', 'ogg', 'avi', 'mov', 'zip', 'tar', 'gz', 'rar', '7z', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'exe', 'dll', 'so', 'dylib', 'woff', 'woff2', 'ttf', 'eot', 'otf', 'lock']);
const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'svg', 'webp']);
const PDF_EXTS = new Set(['pdf']);
const MAX_READ_SIZE = 2 * 1024 * 1024;

// Hardcoded common ignores for performance (avoid git check-ignore for obvious junk)
const COMMON_IGNORES = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.cache', 'coverage', '.turbo', '__pycache__', '.tsbuildinfo']);

function shouldQuickIgnore(path: string): boolean {
    const parts = path.split(/[/\\]/);
    return parts.some(p => COMMON_IGNORES.has(p));
}

export async function POST(req: Request) {
    return measure('api:repo:tree', async () => {
        try {
            const body = await req.json();
            const repoPath = body.path;
            const stream = body.stream === true;
            const includeAll = body.includeAll === true;

            if (!repoPath) {
                return new Response('Repository path is required', { status: 400 });
            }

            const blocked = validateRepoPath(repoPath);
            if (blocked) return blocked;

            const git = simpleGit(repoPath);
            const isRepo = await git.checkIsRepo().catch(() => false);

            // Recursively scan filesystem for all files
            function scanDir(dir: string, prefix: string): string[] {
                const results: string[] = [];
                try {
                    const entries = readdirSync(dir);
                    for (const entry of entries) {
                        if (COMMON_IGNORES.has(entry)) continue;
                        const fullPath = path.join(dir, entry);
                        const relativePath = prefix ? `${prefix}/${entry}` : entry;
                        try {
                            const stats = statSync(fullPath);
                            if (stats.isDirectory()) {
                                results.push(...scanDir(fullPath, relativePath));
                            } else if (stats.isFile()) {
                                results.push(relativePath);
                            }
                        } catch (e: any) {
                            console.warn(`[tree:scanDir] stat error: ${fullPath}: ${e.message}`);
                        }
                    }
                } catch (e: any) {
                    console.warn(`[tree:scanDir] readdir error: ${dir}: ${e.message}`);
                }
                return results;
            }

            // Filter files using git check-ignore (respects .gitignore)
            async function filterByGitIgnore(paths: string[]): Promise<string[]> {
                if (paths.length === 0) return [];

                // First pass: quick filter of common ignores
                let filtered = paths.filter(p => !shouldQuickIgnore(p));

                if (filtered.length === 0) return [];

                try {
                    // Use git check-ignore with --stdin to get ignored files
                    const stdin = filtered.join('\n') + '\n';
                    const result = await git.raw(['check-ignore', '--stdin'], { stdin });
                    // Output is the list of ignored files (one per line)
                    const ignoredPaths = result.trim().split('\n').filter(p => p);
                    const ignoredSet = new Set(ignoredPaths);
                    return filtered.filter(p => !ignoredSet.has(p));
                } catch (e) {
                    // If git check-ignore fails, return all filtered paths
                    console.warn('[tree] git check-ignore failed, using quick filter only');
                    return filtered;
                }
            }

            let filePaths: string[];

            if (!isRepo || includeAll) {
                // Not a git repo or explicit all-files mode: scan filesystem, no gitignore filtering
                filePaths = scanDir(repoPath, '');
            } else {
                // For git repos, get tracked + untracked files, then filter by .gitignore
                const trackedResult = await git.raw(['ls-files']);
                const untrackedResult = await git.raw(['ls-files', '--others', '--exclude-standard']);

                const trackedPaths = trackedResult.trim().split('\n').filter(p => p);
                const untrackedPaths = untrackedResult.trim().split('\n').filter(p => p);

                // Combine and filter using git check-ignore
                const allPaths = [...new Set([...trackedPaths, ...untrackedPaths])];
                filePaths = await filterByGitIgnore(allPaths);
            }

            function readFile(filePath: string) {
                const parts = filePath.split('/');
                const name = parts[parts.length - 1];
                const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';

                let content = null;
                let lines = 0;
                let size = 0;
                let isBinary = BINARY_EXTS.has(ext);
                const isImage = IMAGE_EXTS.has(ext);
                const isPdf = PDF_EXTS.has(ext);

                if (!isBinary) {
                    try {
                        const fullPath = path.join(repoPath, filePath);
                        const file = Bun.file(fullPath);
                        size = file.size;

                        // Skip reading content for very large files
                        if (size > MAX_READ_SIZE) {
                            isBinary = true;
                        } else {
                            const raw = readFileSync(fullPath, 'utf-8');
                            size = raw.length;
                            const allLines = raw.split('\n');
                            lines = allLines.length;
                            if (allLines.length > 10000) {
                                content = allLines.slice(0, 10000).join('\n');
                            } else {
                                content = raw;
                            }
                        }
                    } catch (e) {
                        content = null;
                    }
                } else {
                    // For binary files, at least get the file size
                    try {
                        const fullPath = path.join(repoPath, filePath);
                        size = Bun.file(fullPath).size;
                    } catch (_) {}
                }

                return { path: filePath, name, ext, type: 'file', content, lines, size, isBinary, isImage, isPdf };
            }

            // ── Streaming mode: NDJSON with total header ──
            if (stream) {
                const total = filePaths.length;
                const BATCH_SIZE = 20;
                const encoder = new TextEncoder();

                const readable = new ReadableStream({
                    start(controller) {
                        // First line: total count
                        controller.enqueue(encoder.encode(JSON.stringify({ total }) + '\n'));

                        let i = 0;
                        function nextBatch() {
                            const end = Math.min(i + BATCH_SIZE, total);
                            const batch: any[] = [];
                            for (; i < end; i++) {
                                batch.push(readFile(filePaths[i]));
                            }
                            controller.enqueue(encoder.encode(JSON.stringify({ files: batch, loaded: i }) + '\n'));

                            if (i < total) {
                                // Yield to event loop between batches
                                setTimeout(nextBatch, 0);
                            } else {
                                controller.close();
                            }
                        }
                        nextBatch();
                    }
                });

                return new Response(readable, {
                    headers: {
                        'Content-Type': 'application/x-ndjson',
                        'Cache-Control': 'no-cache',
                    }
                });
            }

            // ── Legacy non-streaming mode ──
            const files = filePaths.map(readFile);
            return Response.json({ files, total: files.length });
        } catch (error: any) {
            console.error('api:repo:tree:error', error);
            return new Response(`Error: ${error.message}`, { status: 500 });
        }
    });
}
