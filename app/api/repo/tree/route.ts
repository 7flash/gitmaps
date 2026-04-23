import { measure } from 'measure-fn';
import simpleGit from 'simple-git';
import { readdirSync, statSync } from 'fs';
import path from 'path';
import { validateRepoPath } from '../validate-path';

const BINARY_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'svg', 'webp', 'mp3', 'mp4', 'wav', 'ogg', 'avi', 'mov', 'zip', 'tar', 'gz', 'rar', '7z', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'exe', 'dll', 'so', 'dylib', 'woff', 'woff2', 'ttf', 'eot', 'otf', 'lock']);
const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'svg', 'webp']);
const PDF_EXTS = new Set(['pdf']);
const MAX_LINES_READ = 100; // Only read first N lines for line count (not full content)

// Hardcoded common ignores for performance
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

            let filePaths: string[];

            if (!isRepo || includeAll) {
                // Not a git repo or explicit all-files mode: scan filesystem
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
                filePaths = scanDir(repoPath, '');
            } else {
                // For git repos, get tracked + untracked non-ignored files
                const [trackedResult, untrackedResult] = await Promise.all([
                    git.raw(['ls-files']),
                    git.raw(['ls-files', '--others', '--exclude-standard'])
                ]);

                const trackedPaths = trackedResult.trim().split('\n').filter(p => p);
                const untrackedPaths = untrackedResult.trim().split('\n').filter(p => p);

                // Combine tracked and untracked
                filePaths = [...new Set([...trackedPaths, ...untrackedPaths])];

                // Quick filter for common ignores
                filePaths = filePaths.filter(p => !shouldQuickIgnore(p));
            }

            // Get metadata WITHOUT reading file content to avoid OOM
            function getFileMetadata(filePath: string) {
                const parts = filePath.split('/');
                const name = parts[parts.length - 1];
                const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';

                const isBinary = BINARY_EXTS.has(ext);
                const isImage = IMAGE_EXTS.has(ext);
                const isPdf = PDF_EXTS.has(ext);

                let size = 0;
                let lines = 0;

                try {
                    const fullPath = path.join(repoPath, filePath);
                    const file = Bun.file(fullPath);
                    size = file.size;

                    // For non-binary files, estimate line count from size or read a sample
                    if (!isBinary && size > 0 && size < 1024 * 1024) {
                        // Read just the first few lines to estimate
                        const sample = file.slice(0, Math.min(size, 8192));
                        const text = sample.text();
                        const newlines = (text.match(/\n/g) || []).length;
                        lines = newlines + 1;
                        // Scale up if the file is larger than our sample
                        if (size > 8192) {
                            lines = Math.floor(lines * (size / 8192));
                        }
                    }
                } catch (e) {
                    // Silently fail for inaccessible files
                }

                return { path: filePath, name, ext, type: 'file', content: null, lines, size, isBinary, isImage, isPdf };
            }

            // ── Streaming mode: NDJSON with total header ──
            if (stream) {
                const total = filePaths.length;
                const BATCH_SIZE = 50; // Larger batches for better performance
                const encoder = new TextEncoder();

                const readable = new ReadableStream({
                    start(controller) {
                        controller.enqueue(encoder.encode(JSON.stringify({ total }) + '\n'));

                        let i = 0;
                        function nextBatch() {
                            const end = Math.min(i + BATCH_SIZE, total);
                            const batch: any[] = [];
                            for (; i < end; i++) {
                                batch.push(getFileMetadata(filePaths[i]));
                            }
                            controller.enqueue(encoder.encode(JSON.stringify({ files: batch, loaded: i }) + '\n'));

                            if (i < total) {
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
            const files = filePaths.map(getFileMetadata);
            return Response.json({ files, total: files.length });
        } catch (error: any) {
            console.error('api:repo:tree:error', error);
            return new Response(`Error: ${error.message}`, { status: 500 });
        }
    });
}
