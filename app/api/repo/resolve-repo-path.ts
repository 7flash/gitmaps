import path from 'path';
import { existsSync, statSync, readdirSync } from 'fs';

function decodeMaybe(value: string): string {
  let out = String(value || '').trim().replace(/^['"]|['"]$/g, '');
  out = out.replace(/^file:\/\/\/?/i, '');
  out = out.replace(/\+/g, '%20');
  for (let i = 0; i < 3; i++) {
    try {
      const next = decodeURIComponent(out);
      if (next === out) break;
      out = next;
    } catch {
      break;
    }
  }
  return out.trim();
}

function normalizeInputPath(value: string): string {
  const decoded = decodeMaybe(value);
  if (!decoded) return '';
  // On Windows, path.normalize converts C:/Code/repo into C:\Code\repo.
  // On POSIX, it leaves drive-letter paths as relative-looking strings; that is
  // fine because only Windows can actually open C:/... directly.
  return path.normalize(decoded);
}

function isDirectory(candidate: string): boolean {
  try {
    return existsSync(candidate) && statSync(candidate).isDirectory();
  } catch {
    return false;
  }
}

function hasGitMarker(candidate: string): boolean {
  return existsSync(path.join(candidate, '.git'));
}

function runGitTopLevel(candidate: string): string | null {
  try {
    const proc = Bun.spawnSync(['git', '-C', candidate, 'rev-parse', '--show-toplevel'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    if (proc.exitCode !== 0) return null;
    const top = proc.stdout.toString().trim();
    return top || null;
  } catch {
    return null;
  }
}

function findSingleNestedRepo(candidate: string): string | null {
  try {
    const entries = readdirSync(candidate, { withFileTypes: true });
    const repos: string[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const child = path.join(candidate, entry.name);
      if (hasGitMarker(child) || runGitTopLevel(child)) repos.push(child);
      if (repos.length > 1) return null;
    }
    return repos[0] || null;
  } catch {
    return null;
  }
}

export type ResolvedRepoPath = {
  inputPath: string;
  repoPath: string;
  canonicalPath: string;
  corrected: boolean;
  resolution: 'exact' | 'git-toplevel' | 'nested-child';
};

export function resolveRepoPath(input: string): ResolvedRepoPath {
  const inputPath = normalizeInputPath(input);
  if (!inputPath) throw new Error('Repository path is required');

  if (!isDirectory(inputPath)) {
    throw new Error(`Folder not found: ${inputPath}`);
  }

  if (hasGitMarker(inputPath)) {
    const top = runGitTopLevel(inputPath) || inputPath;
    return {
      inputPath,
      repoPath: inputPath,
      canonicalPath: top,
      corrected: top !== inputPath,
      resolution: top === inputPath ? 'exact' : 'git-toplevel',
    };
  }

  const top = runGitTopLevel(inputPath);
  if (top) {
    return {
      inputPath,
      repoPath: top,
      canonicalPath: top,
      corrected: top !== inputPath,
      resolution: 'git-toplevel',
    };
  }

  const nested = findSingleNestedRepo(inputPath);
  if (nested) {
    const nestedTop = runGitTopLevel(nested) || nested;
    return {
      inputPath,
      repoPath: nestedTop,
      canonicalPath: nestedTop,
      corrected: true,
      resolution: 'nested-child',
    };
  }

  throw new Error(`Not a valid git repository: ${inputPath}`);
}
