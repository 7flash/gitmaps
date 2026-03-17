import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { addRecentRepo, getRecentRepos, renderRecentCommitsUI } from './recent-commits';

describe('recent commits sidebar', () => {
  let window: Window;

  beforeEach(() => {
    window = new Window({ url: 'http://localhost:3335/' });

    (window as any).SyntaxError = SyntaxError;

    Object.assign(globalThis, {
      window,
      document: window.document,
      navigator: window.navigator,
      HTMLElement: window.HTMLElement,
      HTMLButtonElement: window.HTMLButtonElement,
      localStorage: window.localStorage,
    });

    document.body.innerHTML = `
      <div id="recentCommits" style="display:none">
        <div id="recentCommitsList"></div>
      </div>
      <button id="pullBtn">Pull</button>
    `;
  });

  afterEach(() => {
    window?.close();
    document.body.innerHTML = '';
    localStorage.clear();
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
});
