import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { setupGithubImport } from './events';
import { installFetchMock, installWindowOpenMock, setupDomTest } from './test-dom';

function makeSseResponse(chunks: string[]): Response {
  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      for (const chunk of chunks) controller.enqueue(enc.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

describe('GitHub import modal smoke', () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    const handle = setupDomTest({
      url: 'http://localhost:3335/',
      html: `
        <button id="githubImportBtn">Import GitHub</button>
        <div class="github-modal" id="githubModal">
          <div class="github-modal-backdrop"></div>
          <div class="github-modal-content">
            <button id="githubModalClose">×</button>
            <input id="githubUserInput" />
            <select id="githubSortSelect">
              <option value="updated">Recently Updated</option>
              <option value="stars">Most Stars</option>
              <option value="name">Name A→Z</option>
            </select>
            <button id="githubSearchBtn">Search</button>
            <div id="githubUrlCloneRow" style="display:none">
              <span id="githubDetectedUrl"></span>
              <button id="githubUrlCloneBtn">Clone & Open</button>
            </div>
            <div id="githubFilterRow" style="display:none">
              <input id="githubRepoFilter" />
            </div>
            <div id="githubProfile" style="display:none"></div>
            <div id="githubReposGrid"></div>
            <div id="githubPagination" style="display:none">
              <button id="githubPrevPage"></button>
              <span id="githubPageInfo"></span>
              <button id="githubNextPage"></button>
            </div>
          </div>
        </div>
        <div id="cloneStatus"></div>
        <select id="repoSelect"></select>
      `,
    });
    cleanup = handle.cleanup;
  });

  afterEach(() => {
    cleanup?.();
  });

  test('opens, searches, renders repos, and filters results', async () => {
    const fetchMock = mock(async (input: string) => {
      expect(input).toBe('/api/github/repos?user=7flash&page=1&sort=updated');
      return new Response(JSON.stringify({
        profile: {
          login: '7flash',
          name: '7flash',
          public_repos: 2,
          type: 'User',
          avatar_url: 'https://example.com/avatar.png',
          bio: 'builder',
        },
        repos: [
          {
            name: 'gitmaps',
            clone_url: 'https://github.com/7flash/gitmaps.git',
            description: 'Spatial code explorer',
            language: 'TypeScript',
            size: 2048,
            updated_at: new Date().toISOString(),
            stars: 10,
          },
          {
            name: 'jsx-ai',
            clone_url: 'https://github.com/7flash/jsx-ai.git',
            description: 'JSX interface for structured LLM calls',
            language: 'TypeScript',
            size: 512,
            updated_at: new Date().toISOString(),
            stars: 5,
          },
        ],
        page: 1,
        hasNext: true,
        hasPrev: false,
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const openMock = mock(() => null as any);
    const fetchHandle = installFetchMock(fetchMock as any);
    const openHandle = installWindowOpenMock(openMock as any);

    try {
      setupGithubImport({} as any);

      const openBtn = document.getElementById('githubImportBtn') as HTMLButtonElement;
      const modal = document.getElementById('githubModal') as HTMLElement;
      const userInput = document.getElementById('githubUserInput') as HTMLInputElement;
      const searchBtn = document.getElementById('githubSearchBtn') as HTMLButtonElement;
      const profile = document.getElementById('githubProfile') as HTMLElement;
      const grid = document.getElementById('githubReposGrid') as HTMLElement;
      const filterRow = document.getElementById('githubFilterRow') as HTMLElement;
      const filterInput = document.getElementById('githubRepoFilter') as HTMLInputElement;
      const pageInfo = document.getElementById('githubPageInfo') as HTMLElement;
      const nextBtn = document.getElementById('githubNextPage') as HTMLButtonElement;

      openBtn.click();
      expect(modal.classList.contains('active')).toBe(true);

      userInput.value = '7flash';
      searchBtn.click();
      await Promise.resolve();
      await Promise.resolve();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(localStorage.getItem('gitcanvas:lastGithubUser')).toBe('7flash');
      expect(profile.style.display).toBe('flex');
      expect(profile.textContent).toContain('@7flash');
      expect(grid.textContent).toContain('gitmaps');
      expect(grid.textContent).toContain('jsx-ai');
      expect(filterRow.style.display).toBe('flex');
      expect(pageInfo.textContent).toBe('Page 1');
      expect(nextBtn.disabled).toBe(false);

      filterInput.value = 'jsx';
      filterInput.dispatchEvent(new window.Event('input', { bubbles: true }));

      const cards = Array.from(document.querySelectorAll('.github-repo-card')) as HTMLElement[];
      const visibleNames = cards.filter(card => card.style.display !== 'none').map(card => card.dataset.name);
      expect(visibleNames).toEqual(['jsx-ai']);

      cards[0].click();
      expect(openMock).toHaveBeenCalledWith('https://github.com/7flash/gitmaps', '_blank');
    } finally {
      fetchHandle.restore();
      openHandle.restore();
    }
  });

  test('detects direct GitHub URLs and shows clone affordance', () => {
    setupGithubImport({} as any);

    const userInput = document.getElementById('githubUserInput') as HTMLInputElement;
    const urlRow = document.getElementById('githubUrlCloneRow') as HTMLElement;
    const detected = document.getElementById('githubDetectedUrl') as HTMLElement;

    userInput.value = 'https://github.com/7flash/jsx-ai';
    userInput.dispatchEvent(new window.Event('input', { bubbles: true }));

    expect(urlRow.style.display).toBe('flex');
    expect(detected.textContent).toBe('7flash/jsx-ai');
  });

  test('pressing Enter on a direct GitHub URL starts clone-stream and closes the modal', async () => {
    const fetchMock = mock(() => new Promise<Response>(() => {}));
    const fetchHandle = installFetchMock(fetchMock as any);

    try {
      setupGithubImport({} as any);

      const openBtn = document.getElementById('githubImportBtn') as HTMLButtonElement;
      const modal = document.getElementById('githubModal') as HTMLElement;
      const userInput = document.getElementById('githubUserInput') as HTMLInputElement;
      const cloneStatus = document.getElementById('cloneStatus') as HTMLElement;

      openBtn.click();
      expect(modal.classList.contains('active')).toBe(true);

      userInput.value = 'https://github.com/7flash/jsx-ai';
      userInput.dispatchEvent(new window.Event('input', { bubbles: true }));
      userInput.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await Promise.resolve();

      expect(modal.classList.contains('active')).toBe(false);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/repo/clone-stream');
      expect(String(fetchMock.mock.calls[0]?.[1]?.body)).toContain('https://github.com/7flash/jsx-ai.git');
      expect(cloneStatus.style.display).toBe('block');
      expect(cloneStatus.textContent).toContain('Cloning');
    } finally {
      fetchHandle.restore();
    }
  });

  test('repo card clone button starts clone-stream without opening the GitHub page', async () => {
    const fetchMock = mock(async (input: string) => {
      if (input.startsWith('/api/github/repos')) {
        return new Response(JSON.stringify({
          profile: {
            login: '7flash',
            name: '7flash',
            public_repos: 1,
            type: 'User',
            avatar_url: 'https://example.com/avatar.png',
          },
          repos: [
            {
              name: 'gitmaps',
              clone_url: 'https://github.com/7flash/gitmaps.git',
              description: 'Spatial code explorer',
              language: 'TypeScript',
              size: 2048,
              updated_at: new Date().toISOString(),
              stars: 10,
            },
          ],
          page: 1,
          hasNext: false,
          hasPrev: false,
        }), { headers: { 'Content-Type': 'application/json' } });
      }
      return new Promise<Response>(() => {});
    });

    const openMock = mock(() => null as any);
    const fetchHandle = installFetchMock(fetchMock as any);
    const openHandle = installWindowOpenMock(openMock as any);

    try {
      setupGithubImport({} as any);

      const openBtn = document.getElementById('githubImportBtn') as HTMLButtonElement;
      const userInput = document.getElementById('githubUserInput') as HTMLInputElement;
      const searchBtn = document.getElementById('githubSearchBtn') as HTMLButtonElement;
      const modal = document.getElementById('githubModal') as HTMLElement;
      const cloneStatus = document.getElementById('cloneStatus') as HTMLElement;

      openBtn.click();
      userInput.value = '7flash';
      searchBtn.click();
      await Promise.resolve();
      await Promise.resolve();

      const cloneBtn = document.querySelector('.github-clone-btn[data-url="https://github.com/7flash/gitmaps.git"]') as HTMLButtonElement;
      expect(cloneBtn).toBeTruthy();

      cloneBtn.click();
      await Promise.resolve();

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/repo/clone-stream');
      expect(String(fetchMock.mock.calls[1]?.[1]?.body)).toContain('https://github.com/7flash/gitmaps.git');
      expect(modal.classList.contains('active')).toBe(false);
      expect(cloneStatus.style.display).toBe('block');
      expect(cloneStatus.textContent).toContain('Cloning');
      expect(openMock).not.toHaveBeenCalled();
    } finally {
      fetchHandle.restore();
      openHandle.restore();
    }
  });

  test('cached clone response shows success and selects the cached repo path', async () => {
    const onRepoReady = mock(() => undefined);
    const ctx = {
      actor: { send: mock(() => undefined) },
      onRepoReady,
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

    const fetchMock = mock(async (input: string) => {
      if (input === '/api/repo/clone-stream') {
        return new Response(JSON.stringify({ path: 'C:/Code/gitmaps' }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (input === '/api/repo/load') {
        return new Promise<Response>(() => {});
      }
      throw new Error(`Unexpected fetch: ${input}`);
    });

    const fetchHandle = installFetchMock(fetchMock as any);

    try {
      setupGithubImport(ctx);

      const openBtn = document.getElementById('githubImportBtn') as HTMLButtonElement;
      const userInput = document.getElementById('githubUserInput') as HTMLInputElement;
      const cloneBtn = document.getElementById('githubUrlCloneBtn') as HTMLButtonElement;
      const cloneStatus = document.getElementById('cloneStatus') as HTMLElement;
      const repoSelect = document.getElementById('repoSelect') as HTMLSelectElement;

      openBtn.click();
      userInput.value = 'https://github.com/7flash/gitmaps';
      userInput.dispatchEvent(new window.Event('input', { bubbles: true }));
      cloneBtn.click();
      await Promise.resolve();
      await Promise.resolve();

      expect(cloneStatus.className).toContain('success');
      expect(cloneStatus.textContent).toContain('Updated — loading');
      expect(repoSelect.value).toBe('C:/Code/gitmaps');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(onRepoReady).toHaveBeenCalledWith('C:/Code/gitmaps');
    } finally {
      fetchHandle.restore();
    }
  });

  test('SSE clone done updates success state and selects the cloned repo path', async () => {
    const onRepoReady = mock(() => undefined);
    const ctx = {
      actor: { send: mock(() => undefined) },
      onRepoReady,
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

    const fetchMock = mock(async (input: string) => {
      if (input === '/api/repo/clone-stream') {
        return makeSseResponse([
          'event: progress\ndata: {"message":"Resolving repository","percent":25}\n\n',
          'event: done\ndata: {"path":"C:/Code/jsx-ai"}\n\n',
        ]);
      }
      if (input === '/api/repo/load') {
        return new Promise<Response>(() => {});
      }
      throw new Error(`Unexpected fetch: ${input}`);
    });

    const fetchHandle = installFetchMock(fetchMock as any);

    try {
      setupGithubImport(ctx);

      const openBtn = document.getElementById('githubImportBtn') as HTMLButtonElement;
      const userInput = document.getElementById('githubUserInput') as HTMLInputElement;
      const cloneBtn = document.getElementById('githubUrlCloneBtn') as HTMLButtonElement;
      const cloneStatus = document.getElementById('cloneStatus') as HTMLElement;
      const repoSelect = document.getElementById('repoSelect') as HTMLSelectElement;

      openBtn.click();
      userInput.value = 'https://github.com/7flash/jsx-ai';
      userInput.dispatchEvent(new window.Event('input', { bubbles: true }));
      cloneBtn.click();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(cloneStatus.className).toContain('success');
      expect(cloneStatus.textContent).toContain('Cloned — loading');
      expect(repoSelect.value).toBe('C:/Code/jsx-ai');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(onRepoReady).toHaveBeenCalledWith('C:/Code/jsx-ai');
    } finally {
      fetchHandle.restore();
    }
  });

  test('SSE clone error updates the clone status to an error state', async () => {
    const fetchMock = mock(async (input: string) => {
      if (input === '/api/repo/clone-stream') {
        return makeSseResponse([
          'event: progress\ndata: {"message":"Cloning","percent":40}\n\n',
          'event: error\ndata: {"error":"Repository not found"}\n\n',
        ]);
      }
      throw new Error(`Unexpected fetch: ${input}`);
    });

    const fetchHandle = installFetchMock(fetchMock as any);

    try {
      setupGithubImport({} as any);

      const openBtn = document.getElementById('githubImportBtn') as HTMLButtonElement;
      const userInput = document.getElementById('githubUserInput') as HTMLInputElement;
      const cloneBtn = document.getElementById('githubUrlCloneBtn') as HTMLButtonElement;
      const cloneStatus = document.getElementById('cloneStatus') as HTMLElement;

      openBtn.click();
      userInput.value = 'https://github.com/7flash/missing-repo';
      userInput.dispatchEvent(new window.Event('input', { bubbles: true }));
      cloneBtn.click();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(cloneStatus.className).toContain('error');
      expect(cloneStatus.textContent).toContain('Repository not found');
    } finally {
      fetchHandle.restore();
    }
  });
});

