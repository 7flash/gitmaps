import { measure } from 'measure-fn';
import simpleGit from 'simple-git';
import { statSync, openSync, readSync, closeSync } from 'fs';
import path from 'path';
import { validateRepoPath } from '../validate-path';
import { resolveRepoPath } from '../resolve-repo-path';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BINARY_EXTS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'svg', 'webp',
  'mp3', 'mp4', 'wav', 'ogg', 'avi', 'mov',
  'zip', 'tar', 'gz', 'rar', '7z',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt',
  'exe', 'dll', 'so', 'dylib',
  'woff', 'woff2', 'ttf', 'eot', 'otf',
  'lock',
]);

const COMMON_IGNORES = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.cache',
  'coverage', '.turbo', '__pycache__', '.tsbuildinfo',
]);

const SAMPLE_BYTES = 8192;
const MAX_SAMPLE_FILE_SIZE = 1024 * 1024; // 1MB
const MAX_INLINE_PREVIEW_LINES = 120;
const MAX_INLINE_PREVIEW_CHARS = 4000;
const STREAM_BATCH_SIZE = 50;
const WORKING_TREE_HASH = '__working__';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shouldQuickIgnore(filePath: string): boolean {
  const parts = filePath.split(/[/\\]/);
  return parts.some((p) => COMMON_IGNORES.has(p));
}

function readFileHeadSync(fullPath: string, maxBytes: number): Buffer | null {
  let fd: number | null = null;
  try {
    fd = openSync(fullPath, 'r');
    const buf = Buffer.allocUnsafe(maxBytes);
    const bytesRead = readSync(fd, buf, 0, maxBytes, 0);
    return buf.subarray(0, bytesRead);
  } catch (err: any) {
    return null;
  } finally {
    if (fd != null) {
      try { closeSync(fd); } catch { /* ignore */ }
    }
  }
}

async function listGitFiles(repoPath: string): Promise<string[]> {
  const git = simpleGit(repoPath);
  // Workdir intentionally lists tracked Git files only. Ignored/untracked files
  // are not canvas cards unless they have been added to Git.
  const raw = await git.raw(['ls-files', '-z']);
  return raw
    .split('\0')
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => !shouldQuickIgnore(p));
}


async function listCommitFiles(repoPath: string, commit: string): Promise<string[]> {
  const git = simpleGit(repoPath);
  const raw = await git.raw(['ls-tree', '-r', '--name-only', '-z', commit]);
  return raw
    .split('\0')
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => !shouldQuickIgnore(p));
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

type FileMetadata = {
  path: string;
  name: string;
  ext: string;
  type: 'file';
  content: null;
  previewContent?: string;
  lines: number;
  size: number;
  isBinary: boolean;
  metaError?: string;
};

function getFileMetadata(repoPath: string, filePath: string): FileMetadata {
  const name = path.basename(filePath);
  const ext = path.extname(name).toLowerCase().replace('.', '');
  const isBinary = BINARY_EXTS.has(ext);

  let size = 0;
  let lines = 0;
  let previewContent: string | undefined;
  let metaError: string | undefined;

  try {
    const fullPath = path.join(repoPath, filePath);
    const stats = statSync(fullPath);
    size = stats.size;

    if (!isBinary && size > 0 && size < MAX_SAMPLE_FILE_SIZE) {
      const sample = readFileHeadSync(fullPath, Math.min(size, SAMPLE_BYTES));
      if (sample) {
        const text = sample.toString('utf8');
        const newlines = (text.match(/\n/g) || []).length;
        lines = newlines + 1;
        // Estimate total lines if file is larger than sample
        if (size > SAMPLE_BYTES) {
          lines = Math.floor(lines * (size / SAMPLE_BYTES));
        }
        previewContent = text
          .split('\n')
          .slice(0, MAX_INLINE_PREVIEW_LINES)
          .join('\n')
          .slice(0, MAX_INLINE_PREVIEW_CHARS);
      }
    }
  } catch (err: any) {
    metaError = err?.message;
  }

  return {
    path: filePath,
    name,
    ext,
    type: 'file',
    content: null,
    ...(previewContent !== undefined ? { previewContent } : {}),
    lines,
    size,
    isBinary,
    ...(metaError ? { metaError } : {}),
  };
}


async function getCommitFileMetadata(repoPath: string, commit: string, filePath: string): Promise<FileMetadata> {
  const git = simpleGit(repoPath);
  const name = path.basename(filePath);
  const ext = path.extname(name).toLowerCase().replace('.', '');
  const isBinary = BINARY_EXTS.has(ext);

  let size = 0;
  let metaError: string | undefined;

  try {
    const sizeRaw = await git.raw(['cat-file', '-s', `${commit}:${filePath}`]);
    size = parseInt(sizeRaw.trim(), 10) || 0;
  } catch (err: any) {
    metaError = err?.message;
  }

  return {
    path: filePath,
    name,
    ext,
    type: 'file',
    content: null,
    lines: 0,
    size,
    isBinary,
    ...(metaError ? { metaError } : {}),
  };
}

// ---------------------------------------------------------------------------
// POST Handler
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  return measure('api:repo:tree', async () => {
    try {
      const body = await req.json();
      const resolved = resolveRepoPath(body.path);
      const repoPath = resolved.repoPath;
      const commit = typeof body.commit === 'string' ? body.commit : WORKING_TREE_HASH;
      const stream = body.stream === true;
      if (!body.path) return new Response('Path required', { status: 400 });
      const blocked = validateRepoPath(repoPath);
      if (blocked) return blocked;

      const git = simpleGit(repoPath);
      const isRepo = await git.checkIsRepo().catch(() => false);

      let finalFilePaths: string[];
      const useCommitTree = isRepo && commit && commit !== WORKING_TREE_HASH;
      
      if (useCommitTree) {
        finalFilePaths = await measure('tree:listCommitFiles', async () => await listCommitFiles(repoPath, commit));
      } else {
        // Workdir should show current tracked Git files, even when the repo is
        // clean. Full text is loaded by the client through /api/repo/file-content.
        finalFilePaths = await measure('tree:listGitFiles', async () => await listGitFiles(repoPath));
      }

      if (stream) {
        const total = finalFilePaths.length;
        const encoder = new TextEncoder();

        const readable = new ReadableStream({
          start(controller) {
            // Send header
            controller.enqueue(encoder.encode(JSON.stringify({ total }) + '\n'));

            let cursor = 0;
            const pump = () => {
              const end = Math.min(cursor + STREAM_BATCH_SIZE, total);
              const batch: FileMetadata[] = [];
              
              for (; cursor < end; cursor++) {
                batch.push(getFileMetadata(repoPath, finalFilePaths[cursor]));
              }

              controller.enqueue(encoder.encode(JSON.stringify({ files: batch, loaded: cursor }) + '\n'));

              if (cursor < total) {
                setTimeout(pump, 0);
              } else {
                controller.close();
              }
            };
            pump();
          },
        });

        return new Response(readable, {
          headers: { 'Content-Type': 'application/x-ndjson' },
        });
      }

      const files = useCommitTree
        ? await Promise.all(finalFilePaths.map((fp) => getCommitFileMetadata(repoPath, commit, fp)))
        : finalFilePaths.map((fp) => getFileMetadata(repoPath, fp));
      return Response.json({ files, total: files.length, commit, repoPath, requestedPath: resolved.inputPath, correctedPath: resolved.corrected, pathResolution: resolved.resolution });

    } catch (error: any) {
      console.error('api:repo:tree:error', error);
      return new Response(`Error: ${error.message}`, { status: 500 });
    }
  });
}