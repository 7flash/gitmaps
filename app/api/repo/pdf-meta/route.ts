import path from 'path';
import { existsSync } from 'fs';
import { validateRepoPath } from '../validate-path';

function parsePdfInfoPageCount(output: string): number | null {
  const match = output.match(/^Pages:\s+(\d+)/mi);
  if (!match) return null;
  const value = parseInt(match[1], 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const repoPath = url.searchParams.get('path') || '';
  const filePath = url.searchParams.get('file') || '';

  if (!repoPath || !filePath) {
    return Response.json({ error: 'path and file params required' }, { status: 400 });
  }

  const blocked = validateRepoPath(repoPath);
  if (blocked) return blocked;

  if (filePath.includes('..') || filePath.startsWith('/')) {
    return Response.json({ error: 'Invalid file path' }, { status: 400 });
  }

  const fullPath = path.join(repoPath, filePath);
  if (!existsSync(fullPath)) {
    return Response.json({ error: 'File not found' }, { status: 404 });
  }

  try {
    const info = Bun.spawnSync(['pdfinfo', fullPath], {
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 15000,
    });

    if (info.exitCode === 0) {
      const pageCount = parsePdfInfoPageCount(new TextDecoder().decode(info.stdout));
      return Response.json({ pageCount });
    }
  } catch {
    // pdfinfo unavailable
  }

  try {
    const identify = Bun.spawnSync(['magick', 'identify', fullPath], {
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 20000,
    });

    if (identify.exitCode === 0) {
      const lines = new TextDecoder().decode(identify.stdout)
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      const pageCount = lines.length > 0 ? lines.length : null;
      return Response.json({ pageCount });
    }
  } catch {
    // magick unavailable
  }

  return Response.json({ pageCount: null });
}
