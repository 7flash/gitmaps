import { describe, expect, mock, test } from 'bun:test';
import { showLandingPlaceholder } from './landing-reset';
import { setupDomTest } from './test-dom';

describe('landing reset helper', () => {
  test('clears repo ui and resets shared canvas state back to landing mode', () => {
    const handle = setupDomTest({
      html: `
        <div id="landingOverlay" style="display:none"></div>
        <select id="repoSelect"><option value="">Select</option><option value="C:/Code/gitmaps" selected>gitmaps</option></select>
        <div id="fileCount">42</div>
        <div id="commitCount">9</div>
        <div id="currentCommitInfo">commit info</div>
        <div id="timelineContainer">timeline</div>
        <div id="changedFilesList">changed</div>
        <div id="changedFilesPanel" style="display:flex"></div>
        <div id="connectionsPanel" style="display:flex"></div>
        <div id="arrangeToolbar" style="display:flex"></div>
        <button id="toggleConnections" class="active"></button>
        <button id="showHidden" style="display:block"></button>
        <span id="hiddenCount">7</span>
        <div id="commitProgressBar" style="display:flex"></div>
      `,
    });

    try {
      const snapshot = { context: { repoPath: 'C:/Code/gitmaps' } };
      const ctx = {
        actor: { send: mock(() => undefined) },
        snap: () => snapshot,
        fileCards: new Map([['a.ts', document.createElement('div')]]),
        deferredCards: new Map([['b.ts', { x: 0, y: 0, size: null, isChanged: false, file: {} }]]),
        allFilesData: [{ path: 'a.ts' }],
        commitFilesData: [{ path: 'b.ts' }],
        changedFilePaths: new Set(['a.ts']),
      } as any;

      const clearWorkspace = mock(() => undefined);
      const clearCanvasUi = mock(() => undefined);
      const hideLoading = mock(() => undefined);
      const updateCanvas = mock(() => undefined);
      const updateZoom = mock(() => undefined);
      const updateFavorite = mock(() => undefined);
      const updateRepoStatus = mock(() => undefined);
      const updateCommitStatus = mock(() => undefined);
      const updateFileStatus = mock(() => undefined);
      const updateSelectedStatus = mock(() => undefined);

      showLandingPlaceholder(ctx, {
        clearWorkspace,
        clearCanvasUi,
        hideLoading,
        updateCanvas,
        updateZoom,
        updateFavorite,
        updateRepoStatus,
        updateCommitStatus,
        updateFileStatus,
        updateSelectedStatus,
      });

      expect(document.body.classList.contains('landing-placeholder-visible')).toBe(true);
      expect(ctx.actor.send).toHaveBeenCalledWith({ type: 'RESET_APP_STATE' });
      expect(clearWorkspace).toHaveBeenCalledWith(ctx);
      expect(clearCanvasUi).toHaveBeenCalledWith(ctx);
      expect(snapshot.context.repoPath).toBe('');
      expect(ctx.fileCards.size).toBe(0);
      expect(ctx.deferredCards.size).toBe(0);
      expect(ctx.allFilesData).toEqual([]);
      expect(ctx.commitFilesData).toEqual([]);
      expect(Array.from(ctx.changedFilePaths)).toEqual([]);
      expect((document.getElementById('landingOverlay') as HTMLElement).style.display).toBe('flex');
      expect((document.getElementById('repoSelect') as HTMLSelectElement).value).toBe('');
      expect(document.getElementById('fileCount')?.textContent).toBe('0');
      expect(document.getElementById('commitCount')?.textContent).toBe('0');
      expect(document.getElementById('currentCommitInfo')?.textContent).toContain('No commit selected');
      expect(document.getElementById('timelineContainer')?.textContent).toContain('Load a repository');
      expect(document.getElementById('changedFilesList')?.textContent).toBe('');
      expect((document.getElementById('changedFilesPanel') as HTMLElement).style.display).toBe('none');
      expect((document.getElementById('connectionsPanel') as HTMLElement).style.display).toBe('none');
      expect((document.getElementById('arrangeToolbar') as HTMLElement).style.display).toBe('none');
      expect(document.getElementById('toggleConnections')?.classList.contains('active')).toBe(false);
      expect((document.getElementById('showHidden') as HTMLElement).style.display).toBe('none');
      expect(document.getElementById('hiddenCount')?.textContent).toBe('0');
      expect((document.getElementById('commitProgressBar') as HTMLElement).style.display).toBe('none');
      expect(localStorage.getItem('gitcanvas:changedFilesPanelClosed')).toBe('true');
      expect(hideLoading).toHaveBeenCalledWith(ctx);
      expect(updateCanvas).toHaveBeenCalledWith(ctx);
      expect(updateZoom).toHaveBeenCalledWith(ctx);
      expect(updateFavorite).toHaveBeenCalledWith('');
      expect(updateRepoStatus).toHaveBeenCalledWith('', '', '');
      expect(updateCommitStatus).toHaveBeenCalledWith('');
      expect(updateFileStatus).toHaveBeenCalledWith(0);
      expect(updateSelectedStatus).toHaveBeenCalledWith(0);
    } finally {
      handle.cleanup();
    }
  });
});
