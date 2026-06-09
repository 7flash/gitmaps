import type { CanvasContext } from './context';
import { handoffRepoLoad } from './repo-handoff';
import { decodeRepoPathFromRouteSlug, getRepoPathFromLocation, getRepoPathFromUrlSearch } from './repo-route';

export function getCurrentRouteSlug(pathname = window.location.pathname, search = window.location.search): string {
  const queryRepoPath = getRepoPathFromUrlSearch(search);
  if (queryRepoPath) return queryRepoPath;
  const fromLocation = typeof window !== 'undefined' ? getRepoPathFromLocation(window.location) : null;
  if (fromLocation) return fromLocation;
  const encodedSlug = pathname.replace(/^\//, '');
  return decodeRepoPathFromRouteSlug(encodedSlug);
}

export function resolveMappedRepoPath(slug: string): string {
  const decoded = decodeRepoPathFromRouteSlug(slug);
  return localStorage.getItem(`gitcanvas:slug:${slug}`) || localStorage.getItem(`gitcanvas:slug:${decoded}`) || decoded;
}

export function handlePopstateRepoEntry(
  ctx: CanvasContext,
  options: {
    disposed?: boolean;
    currentRepoPath?: string;
    showLandingPlaceholder: () => void;
    updateFavoriteStar: (path: string) => void;
  },
) {
  if (options.disposed) return null;

  const slug = getCurrentRouteSlug();
  if (!slug) {
    options.showLandingPlaceholder();
    return null;
  }

  const resolvedPath = resolveMappedRepoPath(slug);
  if (resolvedPath && resolvedPath !== options.currentRepoPath) {
    handoffRepoLoad(ctx, resolvedPath);
    options.updateFavoriteStar(resolvedPath);
  }

  return resolvedPath;
}