import { describe, expect, mock, test } from 'bun:test';
import {
  bootstrapInitialRouteUi,
  getInitialRouteParts,
  handleInitialRouteError,
  hideInitialRouteLanding,
  hydrateInitialRouteRepo,
  isGithubOwnerRepoSlug,
  migrateLegacyHashRoute,
  resolveInitialRepoPath,
  showInitialRouteCloneStart,
} from './initial-route-hydration';
import { installFetchMock, setupDomTest } from './test-dom';

describe('initial route hydration helper', () => {
  test('parses path and legacy hash route parts', () => {
    const handle = setupDomTest({ url: 'http://localhost:3335/galaxy-canvas/team/platform/tools/gitmaps#legacy-slug' });
    try {
      expect(getInitialRouteParts()).toEqual({
        rawPath: 'galaxy-canvas/team/platform/tools/gitmaps',
        pathSlug: 'team/platform/tools/gitmaps',
        hashSlug: 'legacy-slug',
        urlSlug: 'team/platform/tools/gitmaps',
      });
    } finally {
      handle.cleanup();
    }
  });

  test('detects cloneable GitHub owner/repo slugs', () => {
    expect(isGithubOwnerRepoSlug('7flash/gitmaps')).toBe(true);
    expect(isGithubOwnerRepoSlug('team/platform/tools/gitmaps')).toBe(false);
    expect(isGithubOwnerRepoSlug('C:/Code/gitmaps')).toBe(false);
  });

  test('uses cached mapped path for non-github slugs', async () => {
    const handle = setupDomTest();
    try {
      localStorage.setItem('gitcanvas:slug:team/platform/tools/gitmaps', 'C:/Code/gitmaps');
      await expect(resolveInitialRepoPath('team/platform/tools/gitmaps')).resolves.toBe('C:/Code/gitmaps');
    } finally {
      handle.cleanup();
    }
  });

  test('resolves github slug via resolve-slug api before cloning', async () => {
    const handle = setupDomTest();
    const fetchMock = mock(async (input: string) => {
      expect(input).toBe('/api/repo/resolve-slug');
      return new Response(JSON.stringify({ path: 'C:/Code/gitmaps' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    });
    const fetchHandle = installFetchMock(fetchMock as any);

    try {
      await expect(resolveInitialRepoPath('7flash/gitmaps')).resolves.toBe('C:/Code/gitmaps');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(localStorage.getItem('gitcanvas:slug:7flash/gitmaps')).toBe('C:/Code/gitmaps');
    } finally {
      fetchHandle.restore();
      handle.cleanup();
    }
  });

  test('falls back to cloning when github slug cannot be resolved locally', async () => {
    const handle = setupDomTest();
    const onCloneStart = mock(() => undefined);
    const fetchMock = mock(async (input: string) => {
      if (input === '/api/repo/resolve-slug') {
        return new Response(JSON.stringify({}), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (input === '/api/repo/clone') {
        return new Response(JSON.stringify({ path: 'C:/Code/gitmaps' }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`Unexpected fetch: ${input}`);
    });
    const fetchHandle = installFetchMock(fetchMock as any);

    try {
      await expect(resolveInitialRepoPath('7flash/gitmaps', { onCloneStart })).resolves.toBe('C:/Code/gitmaps');
      expect(onCloneStart).toHaveBeenCalledWith('7flash/gitmaps');
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(localStorage.getItem('gitcanvas:slug:7flash/gitmaps')).toBe('C:/Code/gitmaps');
    } finally {
      fetchHandle.restore();
      handle.cleanup();
    }
  });

  test('hides the landing overlay for route hydration', () => {
    const handle = setupDomTest({
      html: '<div id="landingOverlay" style="display:block"></div>',
    });

    try {
      hideInitialRouteLanding();
      expect((document.getElementById('landingOverlay') as HTMLElement).style.display).toBe('none');
    } finally {
      handle.cleanup();
    }
  });

  test('migrates legacy hash routes into encoded path routes', () => {
    const handle = setupDomTest({ url: 'http://localhost:3335/#7flash/jsx-ai' });

    try {
      migrateLegacyHashRoute('7flash/jsx-ai');
      expect(window.location.pathname).toBe('/7flash%2Fjsx-ai');
    } finally {
      handle.cleanup();
    }
  });

  test('shows clone-start loading ui for github route hydration', () => {
    const handle = setupDomTest({
      html: '<div id="landingOverlay" style="display:block"></div><div id="loadingProgress" style="display:none"><span class="loading-message"></span></div>',
    });

    try {
      showInitialRouteCloneStart('7flash/gitmaps');

      expect((document.getElementById('landingOverlay') as HTMLElement).style.display).toBe('none');
      expect((document.getElementById('loadingProgress') as HTMLElement).style.display).toBe('flex');
      expect(document.querySelector('.loading-message')?.textContent).toBe('Cloning 7flash/gitmaps from GitHub...');
    } finally {
      handle.cleanup();
    }
  });

  test('reports initial route errors and shows toast through injected helpers', async () => {
    const reportError = mock(() => undefined);
    const showToast = mock(() => undefined);

    const result = await handleInitialRouteError(new Error('boom'), {
      reportError,
      showToast,
    });

    expect(result).toBeNull();
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith('Failed to load route: boom', 'error');
  });

  test('bootstraps initial route ui in a small reusable sequence', async () => {
    const handle = setupDomTest({
      html: '<select id="repoSelect"><option value="">Select</option><option value="C:/Code/gitmaps">gitmaps</option></select>',
    });

    try {
      const calls: string[] = [];
      const snapshot = { context: { repoPath: '' } };
      const ctx = {
        actor: { send: mock((event: any) => calls.push(`send:${event.type}:${event.path}`)) },
        snap: () => snapshot,
      } as any;

      await bootstrapInitialRouteUi(ctx, 'C:/Code/gitmaps', {
        applySharedLayout: mock(async () => { calls.push('applySharedLayout'); }),
        syncSelection: mock((path: string) => {
          calls.push(`syncSelection:${path}`);
          (document.getElementById('repoSelect') as HTMLSelectElement).value = path;
        }),
        loadPositions: mock(async () => { calls.push('loadPositions'); }),
        initRouteLayers: mock(() => { calls.push('initLayers'); }),
        renderRouteLayers: mock(() => { calls.push('renderLayersUI'); }),
        restoreRouteViewport: mock(() => { calls.push('restoreViewport'); }),
        updateRouteCanvasTransform: mock(() => { calls.push('updateCanvasTransform'); }),
        updateRouteZoomUi: mock(() => { calls.push('updateZoomUI'); }),
      });

      expect((document.getElementById('repoSelect') as HTMLSelectElement).value).toBe('C:/Code/gitmaps');
      expect(ctx.snap().context.repoPath).toBe('C:/Code/gitmaps');
      expect(calls).toEqual([
        'syncSelection:C:/Code/gitmaps',
        'send:LOAD_REPO:C:/Code/gitmaps',
        'loadPositions',
        'applySharedLayout',
        'initLayers',
        'renderLayersUI',
        'restoreViewport',
        'updateCanvasTransform',
        'updateZoomUI',
      ]);
    } finally {
      handle.cleanup();
    }
  });

  test('bootstrap initial route ui stops after positions when disposed', async () => {
    const handle = setupDomTest();

    try {
      const applySharedLayout = mock(async () => undefined);
      const initRouteLayers = mock(() => undefined);
      const snapshot = { context: { repoPath: '' } };
      const ctx = {
        actor: { send: mock(() => undefined) },
        snap: () => snapshot,
      } as any;

      await bootstrapInitialRouteUi(ctx, 'C:/Code/gitmaps', {
        disposed: true,
        applySharedLayout,
        loadPositions: mock(async () => undefined),
        initRouteLayers,
        renderRouteLayers: mock(() => undefined),
        restoreRouteViewport: mock(() => undefined),
        updateRouteCanvasTransform: mock(() => undefined),
        updateRouteZoomUi: mock(() => undefined),
      });

      expect(ctx.snap().context.repoPath).toBe('C:/Code/gitmaps');
      expect(applySharedLayout).not.toHaveBeenCalled();
      expect(initRouteLayers).not.toHaveBeenCalled();
    } finally {
      handle.cleanup();
    }
  });

  test('hydrates initial route through shared repo handoff seam', async () => {
    const handle = setupDomTest({
      url: 'http://localhost:3335/team/platform/tools/gitmaps',
      html: '<select id="repoSelect"><option value="">Select</option><option value="C:/Code/gitmaps">gitmaps</option></select><div id="landingOverlay"></div>',
    });

    try {
      const onRepoReady = mock(() => undefined);
      const bootstrapRepoUi = mock(async () => undefined);
      const showLandingPlaceholder = mock(() => undefined);
      const updateFavoriteStar = mock(() => undefined);
      const hideLanding = mock(() => {
        const landing = document.getElementById('landingOverlay') as HTMLElement;
        landing.style.display = 'none';
      });

      const resolvedPath = await hydrateInitialRouteRepo({ onRepoReady } as any, {
        resolveRepoPath: async () => 'C:/Code/gitmaps',
        showLandingPlaceholder,
        hideLanding,
        bootstrapRepoUi,
        updateFavoriteStar,
      });

      expect(resolvedPath).toBe('C:/Code/gitmaps');
      expect((document.getElementById('repoSelect') as HTMLSelectElement).value).toBe('C:/Code/gitmaps');
      expect(hideLanding).toHaveBeenCalledTimes(1);
      expect(bootstrapRepoUi).toHaveBeenCalledWith('C:/Code/gitmaps');
      expect(onRepoReady).toHaveBeenCalledWith('C:/Code/gitmaps');
      expect(updateFavoriteStar).toHaveBeenCalledWith('C:/Code/gitmaps');
      expect(showLandingPlaceholder).not.toHaveBeenCalled();
    } finally {
      handle.cleanup();
    }
  });

  test('shows landing on root route without trying hydration', async () => {
    const handle = setupDomTest({ url: 'http://localhost:3335/' });
    try {
      const bootstrapRepoUi = mock(async () => undefined);
      const showLandingPlaceholder = mock(() => undefined);
      const updateFavoriteStar = mock(() => undefined);

      const resolvedPath = await hydrateInitialRouteRepo({} as any, {
        showLandingPlaceholder,
        hideLanding: mock(() => undefined),
        bootstrapRepoUi,
        updateFavoriteStar,
      });

      expect(resolvedPath).toBeNull();
      expect(showLandingPlaceholder).toHaveBeenCalledTimes(1);
      expect(bootstrapRepoUi).not.toHaveBeenCalled();
      expect(updateFavoriteStar).not.toHaveBeenCalled();
    } finally {
      handle.cleanup();
    }
  });
});
