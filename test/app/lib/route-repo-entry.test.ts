import { describe, expect, mock, test } from 'bun:test';
import { getCurrentRouteSlug, handlePopstateRepoEntry, resolveMappedRepoPath } from '../../../app/lib/route-repo-entry';
import { setupDomTest } from '../../../app/lib/test-dom';

describe('route repo entry helper', () => {
  test('reads the current decoded route slug', () => {
    const handle = setupDomTest({ url: 'http://localhost:3335/team/platform/tools/gitmaps' });
    try {
      expect(getCurrentRouteSlug()).toBe('team/platform/tools/gitmaps');
    } finally {
      handle.cleanup();
    }
  });

  test('resolves mapped repo path from localStorage', () => {
    const handle = setupDomTest();
    try {
      localStorage.setItem('gitcanvas:slug:team/platform/tools/gitmaps', 'C:/Code/gitmaps');
      expect(resolveMappedRepoPath('team/platform/tools/gitmaps')).toBe('C:/Code/gitmaps');
    } finally {
      handle.cleanup();
    }
  });

  test('popstate handoff uses onRepoReady seam for mapped slug routes', () => {
    const handle = setupDomTest({
      url: 'http://localhost:3335/team/platform/tools/gitmaps',
      html: '<select id="repoSelect"><option value="">Select</option><option value="C:/Code/gitmaps">gitmaps</option></select>',
    });

    try {
      localStorage.setItem('gitcanvas:slug:team/platform/tools/gitmaps', 'C:/Code/gitmaps');
      const onRepoReady = mock(() => undefined);
      const updateFavoriteStar = mock(() => undefined);
      const showLandingPlaceholder = mock(() => undefined);
      const ctx = { onRepoReady } as any;

      const resolvedPath = handlePopstateRepoEntry(ctx, {
        currentRepoPath: '',
        showLandingPlaceholder,
        updateFavoriteStar,
      });

      expect(resolvedPath).toBe('C:/Code/gitmaps');
      expect((document.getElementById('repoSelect') as HTMLSelectElement).value).toBe('C:/Code/gitmaps');
      expect(onRepoReady).toHaveBeenCalledWith('C:/Code/gitmaps');
      expect(updateFavoriteStar).toHaveBeenCalledWith('C:/Code/gitmaps');
      expect(showLandingPlaceholder).not.toHaveBeenCalled();
    } finally {
      handle.cleanup();
    }
  });

  test('popstate shows landing when route is empty', () => {
    const handle = setupDomTest({ url: 'http://localhost:3335/' });
    try {
      const showLandingPlaceholder = mock(() => undefined);
      const updateFavoriteStar = mock(() => undefined);

      const resolvedPath = handlePopstateRepoEntry({} as any, {
        currentRepoPath: '',
        showLandingPlaceholder,
        updateFavoriteStar,
      });

      expect(resolvedPath).toBeNull();
      expect(showLandingPlaceholder).toHaveBeenCalledTimes(1);
      expect(updateFavoriteStar).not.toHaveBeenCalled();
    } finally {
      handle.cleanup();
    }
  });

  test('popstate is a no-op when route resolves to the current repo', () => {
    const handle = setupDomTest({ url: 'http://localhost:3335/gitmaps' });
    try {
      const onRepoReady = mock(() => undefined);
      const showLandingPlaceholder = mock(() => undefined);
      const updateFavoriteStar = mock(() => undefined);

      const resolvedPath = handlePopstateRepoEntry({ onRepoReady } as any, {
        currentRepoPath: 'gitmaps',
        showLandingPlaceholder,
        updateFavoriteStar,
      });

      expect(resolvedPath).toBe('gitmaps');
      expect(onRepoReady).not.toHaveBeenCalled();
      expect(showLandingPlaceholder).not.toHaveBeenCalled();
      expect(updateFavoriteStar).not.toHaveBeenCalled();
    } finally {
      handle.cleanup();
    }
  });
});
