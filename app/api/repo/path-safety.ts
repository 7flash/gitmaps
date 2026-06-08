import path from 'path';

export function normalizeRepoFilePath(filePath: string): string {
  const normalized = String(filePath || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .trim();

  if (!normalized || normalized.includes('\0')) {
    throw new Error('Invalid file path');
  }

  const segments = normalized.split('/');
  if (segments.includes('..')) {
    throw new Error('File path must stay within the repository');
  }

  return normalized;
}

export function resolveInsideRepo(repoPath: string, filePath: string) {
  const absRepo = path.resolve(repoPath);
  const safeRelPath = normalizeRepoFilePath(filePath);
  const absPath = path.resolve(absRepo, safeRelPath);
  const relative = path.relative(absRepo, absPath);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('File path must stay within the repository');
  }

  return { absRepo, absPath, safeRelPath };
}
