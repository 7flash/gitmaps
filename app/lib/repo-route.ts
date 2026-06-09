/**
 * Repo route helpers.
 *
 * Supports all of these local forms:
 *   /?repo=C:\Code\game
 *   /?repo=C%3A%5CCode%5Cgame
 *   /~repo/C%3A%5CCode%5Cgame
 *   /~repo/%2FUsers%2Figor%2Fgame
 *   /%2FUsers%2Figor%2Fgame
 */
export const LOCAL_REPO_ROUTE_PREFIX = '~repo';

function decodeMaybe(value: string): string {
  let out = String(value || '');
  for (let i = 0; i < 3; i++) {
    try {
      const next = decodeURIComponent(out);
      if (next === out) break;
      out = next;
    } catch {
      break;
    }
  }
  return out;
}

export function normalizeRepoPath(repoPath: string): string {
  return decodeMaybe(String(repoPath || '').trim())
    .replace(/^file:\/\//i, '')
    .replace(/^['"]|['"]$/g, '');
}

export function encodeRepoPathForRoute(repoPath: string): string {
  const clean = normalizeRepoPath(repoPath);
  return `/${LOCAL_REPO_ROUTE_PREFIX}/${encodeURIComponent(clean)}`;
}

export function repoQueryUrl(repoPath: string): string {
  const clean = normalizeRepoPath(repoPath);
  return `/?repo=${encodeURIComponent(clean)}`;
}

export function syncRepoPathToUrl(repoPath: string, replace = false): void {
  if (typeof window === 'undefined') return;
  const clean = normalizeRepoPath(repoPath);
  if (!clean) return;
  const next = repoQueryUrl(clean);
  const current = `${window.location.pathname}${window.location.search}`;
  if (current === next) return;
  const method = replace ? 'replaceState' : 'pushState';
  window.history[method]({ repoPath: clean }, clean.split(/[\\/]/).filter(Boolean).pop() || clean, next);
}

export function decodeRepoPathFromRouteSlug(slug: string): string {
  const clean = normalizeRepoPath(slug);
  if (!clean) return '';

  const prefixed = `${LOCAL_REPO_ROUTE_PREFIX}/`;
  if (clean.startsWith(prefixed)) {
    return normalizeRepoPath(clean.slice(prefixed.length));
  }

  if (/^%2f/i.test(slug) || /^%5c/i.test(slug)) return normalizeRepoPath(slug);
  return clean;
}

export function getRepoPathFromUrlSearch(search = window.location.search): string | null {
  const raw = String(search || '').replace(/^\?/, '');
  if (!raw) return null;

  // URLSearchParams already decodes once, but keep a manual fallback for raw
  // Windows backslashes that users type directly in the address bar.
  try {
    const params = new URLSearchParams(raw);
    const repo = params.get('repo') || params.get('path');
    if (repo) return normalizeRepoPath(repo);
  } catch { }

  const match = raw.match(/(?:^|&)(?:repo|path)=([^&]*)/i);
  return match ? normalizeRepoPath(match[1].replace(/\+/g, '%20')) : null;
}

export function getRepoPathFromLocation(location: Location = window.location): string | null {
  const fromQuery = getRepoPathFromUrlSearch(location.search);
  if (fromQuery) return fromQuery;

  const rawPath = String(location.pathname || '').replace(/^\//, '').replace(/^galaxy-canvas\/?/, '');
  if (!rawPath) return null;
  const decoded = decodeRepoPathFromRouteSlug(rawPath);

  if (decoded.startsWith(`${LOCAL_REPO_ROUTE_PREFIX}/`)) return decodeRepoPathFromRouteSlug(decoded);
  if (isLikelyLocalRepoPath(decoded)) return decoded;
  return decoded || null;
}

export function isLikelyLocalRepoPath(value: string): boolean {
  const clean = normalizeRepoPath(value);
  return (
    clean.startsWith('/') ||
    /^[a-zA-Z]:[\\/]/.test(clean) ||
    clean.startsWith('~') ||
    clean.startsWith('.')
  );
}
