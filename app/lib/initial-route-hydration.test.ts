import { describe, expect, mock, test } from 'bun:test';
import { getInitialRouteParts, hydrateInitialRouteRepo, isGithubOwnerRepoSlug, resolveInitialRepoPath } from './initial-route-hydration';
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
