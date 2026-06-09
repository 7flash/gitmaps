import { fileName } from './utils';

export const ROUTE_PREFIX = '~repo';

export function decodeMaybeEncoded(value: string): string {
  let current = value || '';
  for (let i = 0; i < 3; i++) {
    try {
      const decoded = decodeURIComponent(current);
      if (decoded === current) break;
      current = decoded;
    } catch {
      break;
    }
  }
  return current;
}

export function normalizeRepoPathForUi(value: string): string {
  return decodeMaybeEncoded(String(value || '').trim())
    .replace(/^file:\/\//i, '')
    .replace(/^"|"$/g, '');
}

export function getRepoPathFromLocation(location: Location = window.location): string {
  const params = new URLSearchParams(location.search);
  const queryRepo = params.get('repo') || params.get('path');
  if (queryRepo) return normalizeRepoPathForUi(queryRepo);

  const rawPath = location.pathname.replace(/^\//, '');
  if (!rawPath) return '';
  const decodedPath = decodeMaybeEncoded(rawPath);
  if (decodedPath.startsWith(`${ROUTE_PREFIX}/`)) {
    return normalizeRepoPathForUi(decodedPath.slice(ROUTE_PREFIX.length + 1));
  }

  // Accept direct encoded absolute paths like /C%3A%5CCode%5Cgame or /%2FUsers%2Figor%2Frepo.
  if (/^[a-zA-Z]:[\\/]/.test(decodedPath) || decodedPath.startsWith('/')) {
    return normalizeRepoPathForUi(decodedPath);
  }

  return '';
}

export function repoUrl(path: string): string {
  const clean = normalizeRepoPathForUi(path);
  return `/?repo=${encodeURIComponent(clean)}`;
}

export function syncRepoUrl(path: string): void {
  const clean = normalizeRepoPathForUi(path);
  if (!clean) return;
  const next = repoUrl(clean);
  if (`${window.location.pathname}${window.location.search}` !== next) {
    window.history.pushState({ repoPath: clean }, fileName(clean), next);
  }
}
