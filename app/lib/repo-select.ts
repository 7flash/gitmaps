import { getRecentRepos, type RecentRepo } from './recent-commits';
import { getRepoPathFromLocation, getRepoPathFromUrlSearch, normalizeRepoPath as normalizeRouteRepoPath } from './repo-route';

export interface RepoSelectItem {
  path: string;
  name?: string;
}

export function normalizeRepoPath(repoPath: string): string {
  return normalizeRouteRepoPath(repoPath);
}

function getShortRepoName(repoPath: string): string {
  return normalizeRepoPath(repoPath).split('/').filter(Boolean).pop() || repoPath;
}

export function populateRepoSelect(
  repoSelect: HTMLSelectElement,
  recentRepos: Array<RecentRepo | RepoSelectItem | string> = getRecentRepos(),
  options: { hashPath?: string } = {},
) {
  while (repoSelect.options.length > 1) repoSelect.remove(1);

  const routedRepoPath = normalizeRepoPath(getRepoPathFromLocation(window.location) || '');
  const mergedRepos = routedRepoPath ? [routedRepoPath, ...recentRepos] : recentRepos;

  for (const repo of mergedRepos) {
    const rawRepoPath = typeof repo === 'string' ? repo : repo.path || '';
    const repoPath = normalizeRepoPath(rawRepoPath);
    if (!repoPath) continue;

    const opt = document.createElement('option');
    opt.value = repoPath;
    opt.textContent = typeof repo === 'string'
      ? getShortRepoName(repoPath)
      : repo.name || getShortRepoName(repoPath);
    opt.title = rawRepoPath;
    repoSelect.add(opt);
  }

  const newOpt = document.createElement('option');
  newOpt.value = '__new__';
  newOpt.textContent = '＋ Open new repo...';
  newOpt.id = 'optNewLocal';
  repoSelect.add(newOpt);

  const routedPath = getRepoPathFromLocation(window.location) || getRepoPathFromUrlSearch(window.location.search) || '';
  const routeOrHash = routedPath || (() => { try { return decodeURIComponent(location.hash.slice(1)); } catch { return location.hash.slice(1); } })();
  const hashPath = normalizeRepoPath(options.hashPath ?? routeOrHash);
  const knownPaths = mergedRepos.map((repo) => normalizeRepoPath(typeof repo === 'string' ? repo : repo.path || ''));
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
  const currentPaths = new Set(recentRepos.map((repo) => normalizeRepoPath(typeof repo === 'string' ? repo : repo.path || '')));

  for (const repo of discoveredRepos) {
    const repoPath = normalizeRepoPath(repo.path);
    if (!repoPath || currentPaths.has(repoPath)) continue;
    onNewRepo?.(repoPath);

    const opt = document.createElement('option');
    opt.value = repoPath;
    opt.textContent = repo.name || getShortRepoName(repoPath);
    opt.title = repo.path;

    const newOpt = repoSelect.querySelector('option[value="__new__"]');
    if (newOpt) repoSelect.insertBefore(opt, newOpt);
    else repoSelect.add(opt);
  }
}