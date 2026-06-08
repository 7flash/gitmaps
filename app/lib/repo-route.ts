/**
 * Repo route helpers.
 *
 * Local filesystem paths do not round-trip cleanly as plain URL path segments:
 *   /Users/igor/project becomes pathname "/Users/igor/project" and the first
 *   slash is consumed by the web route.  Use /~repo/<encoded absolute path> for
 *   durable links, while still accepting older plain/encoded slugs.
 */
export const LOCAL_REPO_ROUTE_PREFIX = '~repo';

export function encodeRepoPathForRoute(repoPath: string): string {
  const clean = (repoPath || '').trim();
  return `/${LOCAL_REPO_ROUTE_PREFIX}/${encodeURIComponent(clean)}`;
}

export function decodeRepoPathFromRouteSlug(slug: string): string {
  const clean = (slug || '').trim();
  if (!clean) return '';

  const prefixed = `${LOCAL_REPO_ROUTE_PREFIX}/`;
  if (clean.startsWith(prefixed)) {
    return decodeURIComponent(clean.slice(prefixed.length));
  }

  // Supports URLs such as /%2FUsers%2Figor%2Frepo.
  if (clean.startsWith('%2F') || clean.startsWith('%2f')) {
    return decodeURIComponent(clean);
  }

  return clean;
}

export function getRepoPathFromUrlSearch(search = window.location.search): string | null {
  const params = new URLSearchParams(search);
  const repo = params.get('repo') || params.get('path');
  return repo ? decodeURIComponent(repo) : null;
}

export function isLikelyLocalRepoPath(value: string): boolean {
  return (
    value.startsWith('/') ||
    /^[a-zA-Z]:[\\/]/.test(value) ||
    value.startsWith('~') ||
    value.startsWith('.')
  );
}
