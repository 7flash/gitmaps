import type { CanvasContext } from './context';
import { loadSavedPositions } from './positions';
import { restoreViewport, updateCanvasTransform, updateZoomUI } from './canvas';
import { initLayers, renderLayersUI } from './layers';
import { handoffRepoLoad, syncRepoSelection } from './repo-handoff';
import { decodeRepoPathFromRouteSlug, getRepoPathFromUrlSearch, isLikelyLocalRepoPath, encodeRepoPathForRoute } from './repo-route';

export interface InitialRouteParts {
  rawPath: string;
  pathSlug: string;
  hashSlug: string;
  queryRepoPath: string;
  urlSlug: string;
}

export function getInitialRouteParts(
  pathname = window.location.pathname,
  hash = window.location.hash,
  search = window.location.search,
): InitialRouteParts {
  const encodedPathSlug = pathname.replace(/^\//, '').replace(/^galaxy-canvas\/?/, '');
  const rawPath = decodeURIComponent(encodedPathSlug);
  const pathSlug = decodeRepoPathFromRouteSlug(encodedPathSlug || rawPath);
  const hashSlug = decodeURIComponent(hash.replace('#', ''));
  const queryRepoPath = getRepoPathFromUrlSearch(search) || '';
  return {
    rawPath,
    pathSlug,
    hashSlug,
    queryRepoPath,
    urlSlug: queryRepoPath || pathSlug || hashSlug,
  };
}

export function isGithubOwnerRepoSlug(slug: string): boolean {
  return /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(slug) && !slug.includes('\\') && !slug.includes(':');
}

export async function resolveInitialRepoPath(
  urlSlug: string,
  options: {
    fetchImpl?: typeof fetch;
    onCloneStart?: (slug: string) => void;
  } = {},
): Promise<string | null> {
  if (!urlSlug) return null;

  if (!isGithubOwnerRepoSlug(urlSlug)) {
    const routedPath = decodeRepoPathFromRouteSlug(urlSlug);
    const cached = localStorage.getItem(`gitcanvas:slug:${urlSlug}`) || localStorage.getItem(`gitcanvas:slug:${routedPath}`);
    if (cached) return cached;
    if (isLikelyLocalRepoPath(routedPath)) return routedPath;
    return routedPath;
  }

  const cached = localStorage.getItem(`gitcanvas:slug:${urlSlug}`);
  if (cached) return cached;

  const fetchImpl = options.fetchImpl || fetch;

  try {
    const resolveRes = await fetchImpl('/api/repo/resolve-slug', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: urlSlug }),
    });
    if (resolveRes.ok) {
      const resolveData = await resolveRes.json();
      if (resolveData?.path) {
        localStorage.setItem(`gitcanvas:slug:${urlSlug}`, resolveData.path);
        return resolveData.path;
      }
    }
  } catch {
    // Fall through to clone path below.
  }

  options.onCloneStart?.(urlSlug);
  const cloneRes = await fetchImpl('/api/repo/clone', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: `https://github.com/${urlSlug}.git`,
    }),
  });

  if (!cloneRes.ok) {
    const err = await cloneRes.json().catch(() => ({ error: 'Clone failed' }));
    throw new Error(err.error || 'Clone failed');
  }

  const cloneData = await cloneRes.json();
  localStorage.setItem(`gitcanvas:slug:${urlSlug}`, cloneData.path);
  return cloneData.path;
}

export function hideInitialRouteLanding() {
  const landing = document.getElementById('landingOverlay');
  if (landing) landing.style.display = 'none';
}

export function migrateLegacyHashRoute(hashSlug: string) {
  window.history.replaceState(null, '', encodeRepoPathForRoute(hashSlug));
}

export function showInitialRouteCloneStart(slug: string) {
  hideInitialRouteLanding();

  const loadingEl = document.getElementById('loadingProgress');
  if (loadingEl) {
    loadingEl.style.display = 'flex';
    const msgEl = loadingEl.querySelector('.loading-message');
    if (msgEl) {
      msgEl.textContent = `Cloning ${slug} from GitHub...`;
    }
  }
}

export async function handleInitialRouteError(err: any, options?: {
  reportError?: (err: any) => void;
  showToast?: (message: string, type: string) => void;
}) {
  const reportError = options?.reportError || ((error) => {
    console.error(`[gitmaps] Failed to hydrate initial route:`, error);
  });

  reportError(err);

  if (options?.showToast) {
    options.showToast(`Failed to load route: ${err.message}`, 'error');
    return null;
  }

  const { showToast } = await import('./utils');
  showToast(`Failed to load route: ${err.message}`, 'error');
  return null;
}

export async function bootstrapInitialRouteUi(
  ctx: CanvasContext,
  resolvedPath: string,
  options: {
    disposed?: boolean;
    applySharedLayout: () => Promise<void>;
    syncSelection?: (path: string) => void;
    loadPositions?: (ctx: CanvasContext) => Promise<void>;
    initRouteLayers?: (ctx: CanvasContext) => void;
    renderRouteLayers?: (ctx: CanvasContext) => void;
    restoreRouteViewport?: (ctx: CanvasContext) => void;
    updateRouteCanvasTransform?: (ctx: CanvasContext) => void;
    updateRouteZoomUi?: (ctx: CanvasContext) => void;
  },
) {
  const syncSelection = options.syncSelection || syncRepoSelection;
  const loadPositions = options.loadPositions || loadSavedPositions;
  const initRouteLayers = options.initRouteLayers || initLayers;
  const renderRouteLayers = options.renderRouteLayers || renderLayersUI;
  const restoreRouteViewport = options.restoreRouteViewport || restoreViewport;
  const updateRouteCanvasTransform = options.updateRouteCanvasTransform || updateCanvasTransform;
  const updateRouteZoomUi = options.updateRouteZoomUi || updateZoomUI;

  syncSelection(resolvedPath);
  ctx.actor.send({ type: 'LOAD_REPO', path: resolvedPath });
  ctx.snap().context.repoPath = resolvedPath;
  await loadPositions(ctx);
  if (options.disposed) return;
  await options.applySharedLayout();
  initRouteLayers(ctx);
  renderRouteLayers(ctx);
  restoreRouteViewport(ctx);
  updateRouteCanvasTransform(ctx);
  updateRouteZoomUi(ctx);
}

export async function hydrateInitialRouteRepo(
  ctx: CanvasContext,
  options: {
    disposed?: boolean;
    resolveRepoPath?: (slug: string) => Promise<string | null>;
    showLandingPlaceholder: () => void;
    hideLanding: () => void;
    migrateLegacyHashRoute?: (hashSlug: string) => void;
    bootstrapRepoUi: (path: string) => Promise<void>;
    updateFavoriteStar: (path: string) => void;
  },
) {
  const { pathSlug, hashSlug, urlSlug } = getInitialRouteParts();

  if (!urlSlug) {
    options.showLandingPlaceholder();
    return null;
  }

  if (hashSlug && !pathSlug) {
    options.migrateLegacyHashRoute?.(hashSlug);
  }

  const resolveRepoPath = options.resolveRepoPath || ((slug: string) => resolveInitialRepoPath(slug));
  const resolvedPath = await resolveRepoPath(urlSlug);
  if (!resolvedPath) return null;

  options.hideLanding();
  syncRepoSelection(resolvedPath);
  await options.bootstrapRepoUi(resolvedPath);

  if (!options.disposed) {
    handoffRepoLoad(ctx, resolvedPath);
    options.updateFavoriteStar(resolvedPath);
  }

  return resolvedPath;
}