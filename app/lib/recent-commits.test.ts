import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { Window } from 'happy-dom';
import { addRecentRepo, getRecentRepos, removeRecentRepo, renderRecentCommitsUI } from './recent-commits';
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
        <select id="repoSelect">
          <option value="">Choose</option>
          <option value="C:/Code/gitmaps">gitmaps</option>
          <option value="C:/Code/jsx-ai">jsx-ai</option>
        </select>
        <button id="pullBtn">Pull</button>
      `,
    });
    window = handle.window;
    cleanup = handle.cleanup;
  });

  afterEach(() => {
    try {
      (mock as any).restore?.();
    } catch {}
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

  test('recent repos section shows and hides as the list fills and empties', () => {
    const section = document.getElementById('recentCommits') as HTMLDivElement;

    renderRecentCommitsUI();
    expect(section.style.display).toBe('none');

    addRecentRepo('C:/Code/gitmaps', 12);
    expect(section.style.display).toBe('block');
    expect(document.getElementById('recentCommitsList')?.textContent || '').toContain('gitmaps');

    addRecentRepo('C:/Code/jsx-ai', 5);
    expect(section.style.display).toBe('block');

    removeRecentRepo('C:/Code/gitmaps');
    expect(section.style.display).toBe('block');
    expect(document.getElementById('recentCommitsList')?.textContent || '').toContain('jsx-ai');
    expect(document.getElementById('recentCommitsList')?.textContent || '').not.toContain('gitmaps');

    removeRecentRepo('C:/Code/jsx-ai');
    expect(section.style.display).toBe('none');
    expect(document.getElementById('recentCommitsList')?.textContent || '').toContain('No recent commits');
  });

  test('normalization back to empty hides the recent repos section', () => {
    const section = document.getElementById('recentCommits') as HTMLDivElement;

    localStorage.setItem(
      'gitcanvas:recentRepos',
      JSON.stringify([{ path: '   ' }, '[object HTMLDivElement]', { nope: true }]),
    );

    renderRecentCommitsUI();

    expect(section.style.display).toBe('none');
    expect(document.querySelectorAll('[data-path]').length).toBe(0);
    expect(document.getElementById('recentCommitsList')?.textContent || '').toContain('No recent commits');
  });

  test('re-adding an existing repo moves it to the front without duplicates', () => {
    const section = document.getElementById('recentCommits') as HTMLDivElement;

    addRecentRepo('C:/Code/gitmaps', 12);
    addRecentRepo('C:/Code/jsx-ai', 5);
    addRecentRepo('C:/Code/gitmaps', 13);

    const repos = getRecentRepos();
    expect(section.style.display).toBe('block');
    expect(repos.map((repo) => repo.path)).toEqual(['C:/Code/gitmaps', 'C:/Code/jsx-ai']);
    expect(repos[0]?.commitCount).toBe(13);

    const stored = JSON.parse(localStorage.getItem('gitcanvas:recentRepos') || '[]');
    expect(stored.map((repo: any) => repo.path)).toEqual(['C:/Code/gitmaps', 'C:/Code/jsx-ai']);

    const renderedButtons = Array.from(document.querySelectorAll('[data-path]')) as HTMLButtonElement[];
    expect(renderedButtons.map((item) => item.dataset.path)).toEqual(['C:/Code/gitmaps', 'C:/Code/jsx-ai']);
    expect(renderedButtons.filter((item) => item.dataset.path === 'C:/Code/gitmaps')).toHaveLength(1);
  });

  test('adding more than five repos keeps only the newest five in storage and UI order', () => {
    const section = document.getElementById('recentCommits') as HTMLDivElement;
    const repoPaths = [
      'C:/Code/repo-1',
      'C:/Code/repo-2',
      'C:/Code/repo-3',
      'C:/Code/repo-4',
      'C:/Code/repo-5',
      'C:/Code/repo-6',
    ];

    repoPaths.forEach((path, index) => addRecentRepo(path, index + 1));

    const expectedPaths = [
      'C:/Code/repo-6',
      'C:/Code/repo-5',
      'C:/Code/repo-4',
      'C:/Code/repo-3',
      'C:/Code/repo-2',
    ];

    const repos = getRecentRepos();
    expect(section.style.display).toBe('block');
    expect(repos).toHaveLength(5);
    expect(repos.map((repo) => repo.path)).toEqual(expectedPaths);
    expect(repos.map((repo) => repo.commitCount)).toEqual([6, 5, 4, 3, 2]);

    const stored = JSON.parse(localStorage.getItem('gitcanvas:recentRepos') || '[]');
    expect(stored).toHaveLength(5);
    expect(stored.map((repo: any) => repo.path)).toEqual(expectedPaths);

    const renderedButtons = Array.from(document.querySelectorAll('[data-path]')) as HTMLButtonElement[];
    expect(renderedButtons).toHaveLength(5);
    expect(renderedButtons.map((item) => item.dataset.path)).toEqual(expectedPaths);
    expect(document.getElementById('recentCommitsList')?.textContent || '').not.toContain('repo-1');
  });

  test('invalid recent repo JSON clears stale rendered items back to the empty state', () => {
    const section = document.getElementById('recentCommits') as HTMLDivElement;

    addRecentRepo('C:/Code/gitmaps', 12);
    expect(section.style.display).toBe('block');
    expect(document.querySelectorAll('[data-path]')).toHaveLength(1);

    localStorage.setItem('gitcanvas:recentRepos', '{not valid json');
    renderRecentCommitsUI();

    expect(getRecentRepos()).toEqual([]);
    expect(section.style.display).toBe('none');
    expect(document.querySelectorAll('[data-path]')).toHaveLength(0);
    expect(document.getElementById('recentCommitsList')?.textContent || '').toContain('No recent commits');
  });

  test('non-array recent repo payload clears stale rendered items back to the empty state', () => {
    const section = document.getElementById('recentCommits') as HTMLDivElement;

    addRecentRepo('C:/Code/jsx-ai', 5);
    expect(section.style.display).toBe('block');
    expect(document.querySelectorAll('[data-path]')).toHaveLength(1);

    localStorage.setItem('gitcanvas:recentRepos', JSON.stringify({ path: 'C:/Code/gitmaps' }));
    renderRecentCommitsUI();

    expect(getRecentRepos()).toEqual([]);
    expect(section.style.display).toBe('none');
    expect(document.querySelectorAll('[data-path]')).toHaveLength(0);
    expect(document.getElementById('recentCommitsList')?.textContent || '').toContain('No recent commits');
  });

  test('clicking Pull without an active repo shows an error toast without entering loading state', async () => {
    const ctx = {
      snap: () => ({ context: { repoPath: '' } }),
    } as any;
    setCanvasContext(ctx);

    renderRecentCommitsUI();

    const pullBtn = document.getElementById('pullBtn') as HTMLButtonElement;
    expect(pullBtn.disabled).toBeFalse();
    expect((pullBtn.textContent || '').trim()).toBe('Pull');

    pullBtn.click();
    await Promise.resolve();

    expect(pullBtn.disabled).toBeFalse();
    expect((pullBtn.textContent || '').trim()).toBe('Pull');
    expect(document.querySelector('.toast.error')?.textContent || '').toContain('No repository loaded');
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

    const repoSelect = document.getElementById('repoSelect') as HTMLSelectElement;
    repoSelect.value = '';

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

    expect(repoSelect.value).toBe('C:/Code/gitmaps');
    expect(ctx.actor.send).toHaveBeenCalledWith({ type: 'LOAD_REPO', path: 'C:/Code/gitmaps' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(String(fetchMock.mock.calls[0]?.[1]?.body)).toContain('C:/Code/gitmaps');
  });

  test('clicking a recent repo uses onRepoReady when provided', async () => {
    const onRepoReady = mock(() => undefined);
    const ctx = {
      onRepoReady,
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

    const repoSelect = document.getElementById('repoSelect') as HTMLSelectElement;
    repoSelect.value = '';

    addRecentRepo('C:/Code/jsx-ai', 5);

    const item = document.querySelector('[data-path="C:/Code/jsx-ai"]') as HTMLButtonElement;
    expect(item).toBeTruthy();

    item.click();
    await Promise.resolve();

    expect(repoSelect.value).toBe('C:/Code/jsx-ai');
    expect(onRepoReady).toHaveBeenCalledWith('C:/Code/jsx-ai');
    expect(ctx.actor.send).not.toHaveBeenCalled();
  });

  test('rerendering the recent repo list preserves click-through behavior for newly rendered entries', async () => {
    const onRepoReady = mock(() => undefined);
    const ctx = {
      onRepoReady,
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

    const repoSelect = document.getElementById('repoSelect') as HTMLSelectElement;
    repoSelect.value = '';

    addRecentRepo('C:/Code/gitmaps', 12);
    renderRecentCommitsUI();
    addRecentRepo('C:/Code/jsx-ai', 5);
    renderRecentCommitsUI();

    const item = document.querySelector('[data-path="C:/Code/jsx-ai"]') as HTMLButtonElement;
    expect(item).toBeTruthy();

    item.click();
    await Promise.resolve();

    expect(repoSelect.value).toBe('C:/Code/jsx-ai');
    expect(onRepoReady).toHaveBeenCalledTimes(1);
    expect(onRepoReady).toHaveBeenCalledWith('C:/Code/jsx-ai');
    expect(ctx.actor.send).not.toHaveBeenCalled();
  });

  test('clicking a recent repo stays inert when there is no canvas context', async () => {
    const repoSelect = document.getElementById('repoSelect') as HTMLSelectElement;
    repoSelect.value = '';

    const fetchMock = mock(async () => new Response('{}'));
    const fetchHandle = installFetchMock(fetchMock as any);

    addRecentRepo('C:/Code/gitmaps', 12);

    const item = document.querySelector('[data-path="C:/Code/gitmaps"]') as HTMLButtonElement;
    expect(item).toBeTruthy();

    try {
      item.click();
      await Promise.resolve();
    } finally {
      fetchHandle.restore();
    }

    expect(repoSelect.value).toBe('');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('malformed recent entries render empty state with no clickable repo path', () => {
    localStorage.setItem(
      'gitcanvas:recentRepos',
      JSON.stringify([{ path: '   ' }, '[object HTMLDivElement]', { nope: true }]),
    );

    renderRecentCommitsUI();

    expect(document.querySelectorAll('[data-path]').length).toBe(0);
    expect(document.getElementById('recentCommitsList')?.textContent || '').toContain('No recent commits');
    expect((document.getElementById('recentCommits') as HTMLDivElement | null)?.style.display).toBe('none');
  });

  test('clicking Pull with an active repo shows loading state, calls loadRepository, and restores the button on success', async () => {
    let resolveLoad!: () => void;
    const loadPromise = new Promise<void>((resolve) => {
      resolveLoad = resolve;
    });
    const loadRepositoryMock = mock(() => loadPromise);
    const originalRepoModule = require('./repo');
    mock.module('./repo', () => ({
      ...originalRepoModule,
      loadRepository: loadRepositoryMock,
    }));

    const ctx = {
      snap: () => ({ context: { repoPath: 'C:/Code/gitmaps' } }),
    } as any;
    setCanvasContext(ctx);

    renderRecentCommitsUI();

    const pullBtn = document.getElementById('pullBtn') as HTMLButtonElement;

    try {
      pullBtn.click();
      await Promise.resolve();

      expect(loadRepositoryMock).toHaveBeenCalledWith(ctx, 'C:/Code/gitmaps');
      expect(pullBtn.disabled).toBeTrue();
      expect((pullBtn.textContent || '').includes('Pulling...')).toBeTrue();

      resolveLoad();
      await Promise.resolve();
      await Promise.resolve();

      expect(pullBtn.disabled).toBeFalse();
      expect((pullBtn.textContent || '').trim()).toBe('Pull');
      expect(document.querySelector('.toast.success')?.textContent || '').toContain('Pulled latest commits');
    } finally {
      (mock as any).restore?.();
    }
  });

  test('clicking Pull with an active repo restores the button and shows an error toast when loadRepository rejects', async () => {
    let rejectLoad!: (error: Error) => void;
    const loadPromise = new Promise<void>((_, reject) => {
      rejectLoad = reject;
    });
    const loadRepositoryMock = mock(() => loadPromise);
    const originalRepoModule = require('./repo');
    mock.module('./repo', () => ({
      ...originalRepoModule,
      loadRepository: loadRepositoryMock,
    }));

    const ctx = {
      snap: () => ({ context: { repoPath: 'C:/Code/gitmaps' } }),
    } as any;
    setCanvasContext(ctx);

    renderRecentCommitsUI();

    const pullBtn = document.getElementById('pullBtn') as HTMLButtonElement;

    try {
      pullBtn.click();
      await Promise.resolve();

      expect(loadRepositoryMock).toHaveBeenCalledWith(ctx, 'C:/Code/gitmaps');
      expect(pullBtn.disabled).toBeTrue();
      expect((pullBtn.textContent || '').includes('Pulling...')).toBeTrue();

      rejectLoad(new Error('network down'));
      await Promise.resolve();
      await Promise.resolve();

      expect(pullBtn.disabled).toBeFalse();
      expect((pullBtn.textContent || '').trim()).toBe('Pull');
      expect(document.querySelector('.toast.error')?.textContent || '').toContain('Pull failed: network down');
    } finally {
      (mock as any).restore?.();
    }
  });

  test('repeated renderRecentCommitsUI calls do not double-bind the Pull button handler', async () => {
    const loadRepositoryMock = mock(async () => undefined);
    const originalRepoModule = require('./repo');
    mock.module('./repo', () => ({
      ...originalRepoModule,
      loadRepository: loadRepositoryMock,
    }));

    const ctx = {
      snap: () => ({ context: { repoPath: 'C:/Code/gitmaps' } }),
    } as any;
    setCanvasContext(ctx);

    renderRecentCommitsUI();
    renderRecentCommitsUI();
    renderRecentCommitsUI();

    const pullBtn = document.getElementById('pullBtn') as HTMLButtonElement;

    try {
      pullBtn.click();
      await Promise.resolve();
      await Promise.resolve();

      expect(pullBtn.dataset.bound).toBe('true');
      expect(loadRepositoryMock).toHaveBeenCalledTimes(1);
      expect(loadRepositoryMock).toHaveBeenCalledWith(ctx, 'C:/Code/gitmaps');
      expect(pullBtn.disabled).toBeFalse();
      expect((pullBtn.textContent || '').trim()).toBe('Pull');
      expect(document.querySelector('.toast.success')?.textContent || '').toContain('Pulled latest commits');
    } finally {
      (mock as any).restore?.();
    }
  });

  test('replacing the Pull button DOM node and rerendering binds the handler exactly once on the new element', async () => {
    const loadRepositoryMock = mock(async () => undefined);
    const originalRepoModule = require('./repo');
    mock.module('./repo', () => ({
      ...originalRepoModule,
      loadRepository: loadRepositoryMock,
    }));

    const ctx = {
      snap: () => ({ context: { repoPath: 'C:/Code/gitmaps' } }),
    } as any;
    setCanvasContext(ctx);

    renderRecentCommitsUI();

    const originalPullBtn = document.getElementById('pullBtn') as HTMLButtonElement;
    const replacement = document.createElement('button');
    replacement.id = 'pullBtn';
    replacement.textContent = 'Pull';
    originalPullBtn.replaceWith(replacement);

    renderRecentCommitsUI();

    const reboundPullBtn = document.getElementById('pullBtn') as HTMLButtonElement;

    try {
      expect(reboundPullBtn).toBeTruthy();
      expect(reboundPullBtn).not.toBe(originalPullBtn);
      expect(reboundPullBtn.dataset.bound).toBe('true');

      reboundPullBtn.click();
      await Promise.resolve();
      await Promise.resolve();

      expect(loadRepositoryMock).toHaveBeenCalledTimes(1);
      expect(loadRepositoryMock).toHaveBeenCalledWith(ctx, 'C:/Code/gitmaps');
      expect(reboundPullBtn.disabled).toBeFalse();
      expect((reboundPullBtn.textContent || '').trim()).toBe('Pull');
      expect(document.querySelector('.toast.success')?.textContent || '').toContain('Pulled latest commits');
    } finally {
      (mock as any).restore?.();
    }
  });

  test('rerendering the recent repo list does not break the already-bound Pull button behavior', async () => {
    const loadRepositoryMock = mock(async () => undefined);
    const originalRepoModule = require('./repo');
    mock.module('./repo', () => ({
      ...originalRepoModule,
      loadRepository: loadRepositoryMock,
    }));

    const ctx = {
      snap: () => ({ context: { repoPath: 'C:/Code/gitmaps' } }),
    } as any;
    setCanvasContext(ctx);

    renderRecentCommitsUI();
    const pullBtn = document.getElementById('pullBtn') as HTMLButtonElement;

    addRecentRepo('C:/Code/gitmaps', 12);
    addRecentRepo('C:/Code/jsx-ai', 5);

    try {
      expect(pullBtn.dataset.bound).toBe('true');
      expect(document.querySelectorAll('[data-path]')).toHaveLength(2);

      pullBtn.click();
      await Promise.resolve();
      await Promise.resolve();

      expect(loadRepositoryMock).toHaveBeenCalledTimes(1);
      expect(loadRepositoryMock).toHaveBeenCalledWith(ctx, 'C:/Code/gitmaps');
      expect(pullBtn.disabled).toBeFalse();
      expect((pullBtn.textContent || '').trim()).toBe('Pull');
      expect(document.querySelector('.toast.success')?.textContent || '').toContain('Pulled latest commits');
    } finally {
      (mock as any).restore?.();
    }
  });

  test('pull-button and click-through behavior both survive the same recent-list rerender sequence', async () => {
    const onRepoReady = mock((path: string) => {
      currentRepoPath = path;
    });
    let currentRepoPath = 'C:/Code/gitmaps';
    const loadRepositoryMock = mock(async () => undefined);
    const originalRepoModule = require('./repo');
    mock.module('./repo', () => ({
      ...originalRepoModule,
      loadRepository: loadRepositoryMock,
    }));

    const ctx = {
      onRepoReady,
      actor: { send: mock(() => undefined) },
      snap: () => ({
        context: { repoPath: currentRepoPath, zoom: 1, offsetX: 0, offsetY: 0, commits: [] },
        value: { view: 'allfiles' },
      }),
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

    renderRecentCommitsUI();
    const pullBtn = document.getElementById('pullBtn') as HTMLButtonElement;

    addRecentRepo('C:/Code/gitmaps', 12);
    renderRecentCommitsUI();
    addRecentRepo('C:/Code/jsx-ai', 5);
    renderRecentCommitsUI();

    const item = document.querySelector('[data-path="C:/Code/jsx-ai"]') as HTMLButtonElement;

    try {
      expect(pullBtn.dataset.bound).toBe('true');
      expect(item).toBeTruthy();
      expect(document.querySelectorAll('[data-path]')).toHaveLength(2);

      item.click();
      await Promise.resolve();

      expect(onRepoReady).toHaveBeenCalledTimes(1);
      expect(onRepoReady).toHaveBeenCalledWith('C:/Code/jsx-ai');
      expect((document.getElementById('repoSelect') as HTMLSelectElement).value).toBe('C:/Code/jsx-ai');

      pullBtn.click();
      await Promise.resolve();
      await Promise.resolve();

      expect(loadRepositoryMock).toHaveBeenCalledTimes(1);
      expect(loadRepositoryMock).toHaveBeenCalledWith(ctx, 'C:/Code/jsx-ai');
      expect(pullBtn.disabled).toBeFalse();
      expect((pullBtn.textContent || '').trim()).toBe('Pull');
      expect(document.querySelector('.toast.success')?.textContent || '').toContain('Pulled latest commits');
      expect(ctx.actor.send).not.toHaveBeenCalled();
    } finally {
      (mock as any).restore?.();
    }
  });

  test('multiple rerender and click cycles keep using fresh recent-repo handlers without duplicate handoffs', async () => {
    const onRepoReady = mock((path: string) => {
      currentRepoPath = path;
    });
    let currentRepoPath = '';
    const ctx = {
      onRepoReady,
      actor: { send: mock(() => undefined) },
      snap: () => ({
        context: { repoPath: currentRepoPath, zoom: 1, offsetX: 0, offsetY: 0, commits: [] },
        value: { view: 'allfiles' },
      }),
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

    const repoSelect = document.getElementById('repoSelect') as HTMLSelectElement;
    repoSelect.value = '';

    addRecentRepo('C:/Code/gitmaps', 12);
    let firstCycleItem = document.querySelector('[data-path="C:/Code/gitmaps"]') as HTMLButtonElement;
    expect(firstCycleItem).toBeTruthy();

    firstCycleItem.click();
    await Promise.resolve();

    expect(onRepoReady).toHaveBeenCalledTimes(1);
    expect(onRepoReady).toHaveBeenNthCalledWith(1, 'C:/Code/gitmaps');
    expect(repoSelect.value).toBe('C:/Code/gitmaps');

    addRecentRepo('C:/Code/jsx-ai', 5);
    renderRecentCommitsUI();

    const secondCycleItem = document.querySelector('[data-path="C:/Code/jsx-ai"]') as HTMLButtonElement;
    expect(secondCycleItem).toBeTruthy();
    expect(secondCycleItem).not.toBe(firstCycleItem);

    secondCycleItem.click();
    await Promise.resolve();

    expect(onRepoReady).toHaveBeenCalledTimes(2);
    expect(onRepoReady).toHaveBeenNthCalledWith(2, 'C:/Code/jsx-ai');
    expect(repoSelect.value).toBe('C:/Code/jsx-ai');

    addRecentRepo('C:/Code/gitmaps', 13);
    renderRecentCommitsUI();

    const thirdCycleItem = document.querySelector('[data-path="C:/Code/gitmaps"]') as HTMLButtonElement;
    expect(thirdCycleItem).toBeTruthy();
    expect(thirdCycleItem).not.toBe(firstCycleItem);

    thirdCycleItem.click();
    await Promise.resolve();

    expect(onRepoReady).toHaveBeenCalledTimes(3);
    expect(onRepoReady).toHaveBeenNthCalledWith(3, 'C:/Code/gitmaps');
    expect(repoSelect.value).toBe('C:/Code/gitmaps');
    expect(currentRepoPath).toBe('C:/Code/gitmaps');
    expect(ctx.actor.send).not.toHaveBeenCalled();
  });

  test('removing a recent repo after repeated rerenders clears stale entries and preserves remaining click-through behavior', async () => {
    const onRepoReady = mock((path: string) => {
      currentRepoPath = path;
    });
    let currentRepoPath = '';
    const ctx = {
      onRepoReady,
      actor: { send: mock(() => undefined) },
      snap: () => ({
        context: { repoPath: currentRepoPath, zoom: 1, offsetX: 0, offsetY: 0, commits: [] },
        value: { view: 'allfiles' },
      }),
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

    const repoSelect = document.getElementById('repoSelect') as HTMLSelectElement;
    repoSelect.value = '';

    addRecentRepo('C:/Code/gitmaps', 12);
    addRecentRepo('C:/Code/jsx-ai', 5);
    renderRecentCommitsUI();

    const firstJsxItem = document.querySelector('[data-path="C:/Code/jsx-ai"]') as HTMLButtonElement;
    expect(firstJsxItem).toBeTruthy();

    firstJsxItem.click();
    await Promise.resolve();

    expect(onRepoReady).toHaveBeenCalledTimes(1);
    expect(onRepoReady).toHaveBeenLastCalledWith('C:/Code/jsx-ai');
    expect(repoSelect.value).toBe('C:/Code/jsx-ai');

    addRecentRepo('C:/Code/gitmaps', 13);
    renderRecentCommitsUI();
    removeRecentRepo('C:/Code/jsx-ai');
    renderRecentCommitsUI();

    expect(document.querySelector('[data-path="C:/Code/jsx-ai"]')).toBeNull();

    const remainingItem = document.querySelector('[data-path="C:/Code/gitmaps"]') as HTMLButtonElement;
    expect(remainingItem).toBeTruthy();
    expect(document.querySelectorAll('[data-path]')).toHaveLength(1);
    expect(getRecentRepos().map((repo) => repo.path)).toEqual(['C:/Code/gitmaps']);

    remainingItem.click();
    await Promise.resolve();

    expect(onRepoReady).toHaveBeenCalledTimes(2);
    expect(onRepoReady).toHaveBeenNthCalledWith(2, 'C:/Code/gitmaps');
    expect(repoSelect.value).toBe('C:/Code/gitmaps');
    expect(currentRepoPath).toBe('C:/Code/gitmaps');
    expect(ctx.actor.send).not.toHaveBeenCalled();
  });

  test('after rerenders and recent-repo removal, Pull uses the surviving clicked entry as the active repo path', async () => {
    const loadRepositoryMock = mock(async () => undefined);
    const originalRepoModule = require('./repo');
    mock.module('./repo', () => ({
      ...originalRepoModule,
      loadRepository: loadRepositoryMock,
    }));

    let currentRepoPath = 'C:/Code/jsx-ai';
    const onRepoReady = mock((path: string) => {
      currentRepoPath = path;
    });
    const ctx = {
      onRepoReady,
      actor: { send: mock(() => undefined) },
      snap: () => ({
        context: { repoPath: currentRepoPath, zoom: 1, offsetX: 0, offsetY: 0, commits: [] },
        value: { view: 'allfiles' },
      }),
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

    const repoSelect = document.getElementById('repoSelect') as HTMLSelectElement;
    repoSelect.value = '';

    renderRecentCommitsUI();
    addRecentRepo('C:/Code/gitmaps', 12);
    addRecentRepo('C:/Code/jsx-ai', 5);
    renderRecentCommitsUI();
    removeRecentRepo('C:/Code/jsx-ai');
    renderRecentCommitsUI();

    const remainingItem = document.querySelector('[data-path="C:/Code/gitmaps"]') as HTMLButtonElement;
    const pullBtn = document.getElementById('pullBtn') as HTMLButtonElement;

    try {
      expect(document.querySelector('[data-path="C:/Code/jsx-ai"]')).toBeNull();
      expect(remainingItem).toBeTruthy();
      expect(pullBtn.dataset.bound).toBe('true');

      remainingItem.click();
      await Promise.resolve();

      expect(onRepoReady).toHaveBeenCalledTimes(1);
      expect(onRepoReady).toHaveBeenCalledWith('C:/Code/gitmaps');
      expect(repoSelect.value).toBe('C:/Code/gitmaps');
      expect(currentRepoPath).toBe('C:/Code/gitmaps');

      pullBtn.click();
      await Promise.resolve();
      await Promise.resolve();

      expect(loadRepositoryMock).toHaveBeenCalledTimes(1);
      expect(loadRepositoryMock).toHaveBeenCalledWith(ctx, 'C:/Code/gitmaps');
      expect(loadRepositoryMock).not.toHaveBeenCalledWith(ctx, 'C:/Code/jsx-ai');
      expect(pullBtn.disabled).toBeFalse();
      expect((pullBtn.textContent || '').trim()).toBe('Pull');
      expect(document.querySelector('.toast.success')?.textContent || '').toContain('Pulled latest commits');
      expect(ctx.actor.send).not.toHaveBeenCalled();
    } finally {
      (mock as any).restore?.();
    }
  });
});
