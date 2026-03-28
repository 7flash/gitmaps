import type { CanvasContext } from './context';
import { handoffRepoLoad } from './repo-handoff';

export function getCurrentRouteSlug(pathname = window.location.pathname): string {
  return decodeURIComponent(pathname.replace(/^\//, ''));
}

export function resolveMappedRepoPath(slug: string): string {
  return localStorage.getItem(`gitcanvas:slug:${slug}`) || slug;
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
