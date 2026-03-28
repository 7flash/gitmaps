import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { Window } from 'happy-dom';
import { addRecentRepo, getRecentRepos, renderRecentCommitsUI } from './recent-commits';
import { setCanvasContext } from './context';
import { installFetchMock, setupDomTest } from './test-dom';

describe('recent commits sidebar', () => {
  let window: Window;

  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    const handle = setupDomTest({
      url: 'http://localhost:3335/',
      html: `
        <div id="recentCommits" style="display:none">
          <div id="recentCommitsList"></div>
        </div>
        <button id="pullBtn">Pull</button>
      `,
    });
    window = handle.window;
    cleanup = handle.cleanup;
  });

  afterEach(() => {
    setCanvasContext(null);
    cleanup?.();
  });

  test('normalizes legacy localStorage entries and removes malformed ones', () => {
    localStorage.setItem(
      'gitcanvas:recentRepos',
      JSON.stringify([
        'C:/Code/alpha',
        { path: 'C:/Code/beta', loadedAt: 'bad', commitCount: 3 },
        { nope: true },
        '[object HTMLDivElement]',
      ]),
    );

    const repos = getRecentRepos();
    expect(repos.map((repo) => repo.path)).toEqual(['C:/Code/alpha', 'C:/Code/beta']);
    expect(repos[0]?.commitCount).toBe(0);
    expect(repos[1]?.commitCount).toBe(3);
  });

  test('renders stable metadata instead of undefined/NaN values', () => {
    localStorage.setItem(
      'gitcanvas:recentRepos',
      JSON.stringify([{ path: 'C:/Code/epstein-files' }]),
    );

    renderRecentCommitsUI();

    const text = document.getElementById('recentCommitsList')?.textContent || '';
    expect(text).toContain('epstein-files');
    expect(text).toContain('0 commits · Just now');
    expect(text).not.toContain('undefined');
    expect(text).not.toContain('NaN');
  });

  test('addRecentRepo persists object format and rerenders list', () => {
    addRecentRepo('C:/Code/gitmaps', 12);

    const stored = JSON.parse(localStorage.getItem('gitcanvas:recentRepos') || '[]');
    expect(stored[0]?.path).toBe('C:/Code/gitmaps');
    expect(stored[0]?.commitCount).toBe(12);

    const text = document.getElementById('recentCommitsList')?.textContent || '';
    expect(text).toContain('gitmaps');
    expect(text).toContain('12 commits');
  });

  test('clicking a recent repo starts the repo reload flow for that path', async () => {
    const ctx = {
      actor: { send: mock(() => undefined) },
      snap: () => ({ context: { repoPath: '', zoom: 1, offsetX: 0, offsetY: 0, commits: [] }, value: { view: 'allfiles' } }),
      fileCards: new Map(),
      deferredCards: new Map(),
      changedFilePaths: new Set(),
      positions: new Map(),
      hiddenFiles: new Set(),
      allFilesData: [],
      commitFilesData: [],
      canvas: document.createElement('div'),
      canvasViewport: document.createElement('div'),
      svgOverlay: null,
      loadingOverlay: null,
    } as any;
    setCanvasContext(ctx);

    const fetchMock = mock(async (input: string) => {
      expect(input).toBe('/api/repo/load');
      return new Response('boom', { status: 500 });
    });
    const fetchHandle = installFetchMock(fetchMock as any);

    addRecentRepo('C:/Code/gitmaps', 12);

    const item = document.querySelector('[data-path="C:/Code/gitmaps"]') as HTMLButtonElement;
    expect(item).toBeTruthy();

    try {
      item.click();
      await Promise.resolve();
      await Promise.resolve();
    } finally {
      fetchHandle.restore();
    }

    expect(ctx.actor.send).toHaveBeenCalledWith({ type: 'LOAD_REPO', path: 'C:/Code/gitmaps' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(String(fetchMock.mock.calls[0]?.[1]?.body)).toContain('C:/Code/gitmaps');
  });
});
