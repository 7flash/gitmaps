import { getRecentRepos, type RecentRepo } from './recent-commits';

export interface RepoSelectItem {
  path: string;
  name?: string;
}

function getShortRepoName(repoPath: string): string {
  return repoPath.replace(/\\/g, '/').split('/').filter(Boolean).pop() || repoPath;
}

export function populateRepoSelect(
  repoSelect: HTMLSelectElement,
  recentRepos: Array<RecentRepo | RepoSelectItem | string> = getRecentRepos(),
  options: { hashPath?: string } = {},
) {
  while (repoSelect.options.length > 1) repoSelect.remove(1);

  for (const repo of recentRepos) {
    const repoPath = typeof repo === 'string' ? repo : repo.path || '';
    if (!repoPath) continue;

    const opt = document.createElement('option');
    opt.value = repoPath;
    opt.textContent = typeof repo === 'string'
      ? getShortRepoName(repoPath)
      : repo.name || getShortRepoName(repoPath);
    opt.title = repoPath;
    repoSelect.add(opt);
  }

  const newOpt = document.createElement('option');
  newOpt.value = '__new__';
  newOpt.textContent = '＋ Open new repo...';
  newOpt.id = 'optNewLocal';
  repoSelect.add(newOpt);

  const hashPath = options.hashPath ?? decodeURIComponent(location.hash.slice(1));
  const knownPaths = recentRepos.map((repo) => typeof repo === 'string' ? repo : repo.path || '');
  if (hashPath && knownPaths.includes(hashPath)) {
    repoSelect.value = hashPath;
  } else if (!hashPath) {
    repoSelect.value = '';
  }
}

export function appendDiscoveredRepos(
  repoSelect: HTMLSelectElement,
  recentRepos: Array<RecentRepo | RepoSelectItem | string>,
  discoveredRepos: RepoSelectItem[],
  onNewRepo?: (repoPath: string) => void,
) {
  const currentPaths = new Set(recentRepos.map((repo) => typeof repo === 'string' ? repo : repo.path || ''));

  for (const repo of discoveredRepos) {
    if (!repo.path || currentPaths.has(repo.path)) continue;
    onNewRepo?.(repo.path);

    const opt = document.createElement('option');
    opt.value = repo.path;
    opt.textContent = repo.name || getShortRepoName(repo.path);
    opt.title = repo.path;

    const newOpt = repoSelect.querySelector('option[value="__new__"]');
    if (newOpt) repoSelect.insertBefore(opt, newOpt);
    else repoSelect.add(opt);
  }
}
