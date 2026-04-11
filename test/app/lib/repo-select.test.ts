import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { appendDiscoveredRepos, populateRepoSelect } from '../../../app/lib/repo-select';
import { setupDomTest } from '../../../app/lib/test-dom';

describe('repo select smoke', () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    const handle = setupDomTest({
      url: 'http://localhost:3335/',
      html: '<select id="repoSelect"><option value="">Select a repository...</option></select>',
    });
    cleanup = handle.cleanup;
  });

  afterEach(() => {
    cleanup?.();
  });

  test('populates recent repos and preserves placeholder/new option flow', () => {
    const repoSelect = document.getElementById('repoSelect') as HTMLSelectElement;

    populateRepoSelect(repoSelect, [
      { path: 'C:/Code/gitmaps', name: 'gitmaps' },
      { path: 'C:/Code/geeksy', name: 'geeksy' },
    ] as any, { hashPath: '' });

    const options = Array.from(repoSelect.options).map((opt) => ({ value: opt.value, text: opt.textContent }));
    expect(options).toEqual([
      { value: '', text: 'Select a repository...' },
      { value: 'C:/Code/gitmaps', text: 'gitmaps' },
      { value: 'C:/Code/geeksy', text: 'geeksy' },
      { value: '__new__', text: '＋ Open new repo...' },
    ]);
    expect(repoSelect.value).toBe('');
  });

  test('appends discovered repos before the open-new option without duplicating known repos', () => {
    const repoSelect = document.getElementById('repoSelect') as HTMLSelectElement;
    const added: string[] = [];

    const recentRepos = [
      { path: 'C:/Code/gitmaps', name: 'gitmaps' },
    ];
    populateRepoSelect(repoSelect, recentRepos as any, { hashPath: '' });

    appendDiscoveredRepos(
      repoSelect,
      recentRepos as any,
      [
        { path: 'C:/Code/gitmaps', name: 'gitmaps' },
        { path: 'C:/Code/new-repo', name: 'new-repo' },
      ],
      (repoPath) => added.push(repoPath),
    );

    const values = Array.from(repoSelect.options).map((opt) => opt.value);
    expect(values).toEqual(['', 'C:/Code/gitmaps', 'C:/Code/new-repo', '__new__']);
    expect(added).toEqual(['C:/Code/new-repo']);
  });
});
