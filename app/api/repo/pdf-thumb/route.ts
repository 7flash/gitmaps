import path from 'path';
import { existsSync } from 'fs';
import { validateRepoPath } from '../validate-path';

/**
 * GET /api/repo/pdf-thumb?path=REPO&file=FILE&page=0&width=600
 *
 * Converts a PDF page to a PNG thumbnail using Bun's native sharp or
 * falls back to pdftoppm (poppler-utils) if available.
 * Returns the image directly as image/png.
 */
export async function GET(req: Request) {
    const url = new URL(req.url);
    const repoPath = url.searchParams.get('path') || '';
    const filePath = url.searchParams.get('file') || '';
    const page = parseInt(url.searchParams.get('page') || '0', 10);
    const width = parseInt(url.searchParams.get('width') || '800', 10);

    if (!repoPath || !filePath) {
        return new Response('path and file params required', { status: 400 });
    }

    const blocked = validateRepoPath(repoPath);
    if (blocked) return blocked;

    // Prevent path traversal
    if (filePath.includes('..') || filePath.startsWith('/')) {
        return new Response('Invalid file path', { status: 400 });
    }

    const fullPath = path.join(repoPath, filePath);
    if (!existsSync(fullPath)) {
        return new Response('File not found', { status: 404 });
    }

    // Cache key based on file path + modification time
    const file = Bun.file(fullPath);
    const cacheKey = `pdf-thumb:${fullPath}:${file.size}:p${page}:w${width}`;

    // Try pdftoppm (poppler-utils) — most reliable cross-platform PDF renderer
    try {
        const proc = Bun.spawnSync([
            'pdftoppm',
            '-png',
            '-f', String(page + 1),
            '-l', String(page + 1),
            '-scale-to-x', String(width),
            '-scale-to-y', '-1',
            '-singlefile',
            fullPath,
            '-',
        ], {
            stdout: 'pipe',
            stderr: 'pipe',
            timeout: 15000,
        });

        if (proc.exitCode === 0 && proc.stdout.length > 0) {
            return new Response(proc.stdout, {
                headers: {
                    'Content-Type': 'image/png',
                    'Cache-Control': 'public, max-age=86400',
                },
            });
        }

        // pdftoppm outputs to stdout with `-` but some versions need a prefix
        // Try alternative invocation
        const proc2 = Bun.spawnSync([
            'pdftoppm',
            '-png',
            '-f', String(page + 1),
            '-l', String(page + 1),
            '-scale-to-x', String(width),
            '-scale-to-y', '-1',
            '-singlefile',
            fullPath,
        ], {
            stdout: 'pipe',
            stderr: 'pipe',
            timeout: 15000,
        });

        if (proc2.exitCode === 0 && proc2.stdout.length > 0) {
            return new Response(proc2.stdout, {
                headers: {
                    'Content-Type': 'image/png',
                    'Cache-Control': 'public, max-age=86400',
                },
            });
        }
    } catch (_) {
        // pdftoppm not available
    }

    // Fallback: try magick (ImageMagick)
    try {
        const proc = Bun.spawnSync([
            'magick',
            '-density', '150',
            `${fullPath}[${page}]`,
            '-resize', `${width}x`,
            'png:-',
        ], {
            stdout: 'pipe',
            stderr: 'pipe',
            timeout: 30000,
        });

        if (proc.exitCode === 0 && proc.stdout.length > 0) {
            return new Response(proc.stdout, {
                headers: {
                    'Content-Type': 'image/png',
                    'Cache-Control': 'public, max-age=86400',
                },
            });
        }
    } catch (_) {
        // magick not available
    }

    // No PDF renderer available — return a helpful placeholder
    return new Response('PDF preview requires poppler-utils (pdftoppm) or ImageMagick (magick). Install one to enable PDF thumbnails.', {
        status: 501,
        headers: { 'Content-Type': 'text/plain' },
    });
}