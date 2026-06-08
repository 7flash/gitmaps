import type { CanvasContext } from './context';
import {
  bootstrapInitialRouteUi,
  handleInitialRouteError,
  hideInitialRouteLanding,
  hydrateInitialRouteRepo,
  migrateLegacyHashRoute,
  resolveInitialRepoPath,
  showInitialRouteCloneStart,
} from './initial-route-hydration';
import { handlePopstateRepoEntry } from './route-repo-entry';

export async function wireMountRoutes(
  ctx: CanvasContext,
  options: {
    isDisposed: () => boolean;
    showLandingPlaceholder: () => void;
    updateFavoriteStar: (path: string) => void;
    applySharedLayout: () => Promise<void>;
    hydrateRoutes?: typeof hydrateInitialRouteRepo;
    resolveRepoPath?: typeof resolveInitialRepoPath;
    handleRouteError?: typeof handleInitialRouteError;
    bootstrapRepoUi?: typeof bootstrapInitialRouteUi;
    bindPopstate?: typeof bindMountPopstate;
  },
) {
  const hydrateRoutes = options.hydrateRoutes || hydrateInitialRouteRepo;
  const resolveRepoPath = options.resolveRepoPath || resolveInitialRepoPath;
  const handleRouteError = options.handleRouteError || handleInitialRouteError;
  const bootstrapRepoUi = options.bootstrapRepoUi || bootstrapInitialRouteUi;
  const bindPopstate = options.bindPopstate || bindMountPopstate;

  await hydrateRoutes(ctx, {
    disposed: options.isDisposed(),
    showLandingPlaceholder: options.showLandingPlaceholder,
    hideLanding: hideInitialRouteLanding,
    migrateLegacyHashRoute,
    resolveRepoPath: async (slug) => {
      try {
        return await resolveRepoPath(slug, {
          onCloneStart: showInitialRouteCloneStart,
        } as any);
      } catch (err: any) {
        return await handleRouteError(err);
      }
    },
    bootstrapRepoUi: async (resolvedPath) => {
      await bootstrapRepoUi(ctx, resolvedPath, {
        disposed: options.isDisposed(),
        applySharedLayout: options.applySharedLayout,
      } as any);
    },
    updateFavoriteStar: options.updateFavoriteStar,
  });

  bindPopstate(ctx, {
    isDisposed: options.isDisposed,
    showLandingPlaceholder: options.showLandingPlaceholder,
    updateFavoriteStar: options.updateFavoriteStar,
  });
}

export function bindMountPopstate(
  ctx: CanvasContext,
  options: {
    isDisposed: () => boolean;
    showLandingPlaceholder: () => void;
    updateFavoriteStar: (path: string) => void;
    addListener?: (type: string, handler: () => void) => void;
  },
) {
  const addListener = options.addListener || ((type: string, handler: () => void) => {
    window.addEventListener(type, handler);
  });

  addListener('popstate', () => {
    handlePopstateRepoEntry(ctx, {
      disposed: options.isDisposed(),
      currentRepoPath: ctx.snap().context.repoPath,
      showLandingPlaceholder: options.showLandingPlaceholder,
      updateFavoriteStar: options.updateFavoriteStar,
    });
  });
}