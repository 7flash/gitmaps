import { showToast } from './utils';

let cachedVersion = '1.1.28';
let cachedCommit = '220aa78';
let cachedCommitDate = '2026-03-17';

export function getVersion(): string {
  return cachedVersion;
}

export function getVersionCommit(): string {
  return cachedCommit;
}

export function getVersionDate(): string {
  return cachedCommitDate;
}

async function fetchVersion(): Promise<{ version: string; commit: string; commitDate: string }> {
  const bootstrapVersion = (window as any).__GITMAPS_BUILD_VERSION__ || '';
  const bootstrapCommit = (window as any).__GITMAPS_BUILD_COMMIT__ || '';
  const bootstrapDate = (window as any).__GITMAPS_BUILD_DATE__ || '';

  if (bootstrapVersion || bootstrapCommit) {
    cachedVersion = bootstrapVersion || cachedVersion;
    cachedCommit = bootstrapCommit || cachedCommit;
    cachedCommitDate = bootstrapDate;
    return { version: cachedVersion, commit: cachedCommit, commitDate: cachedCommitDate };
  }

  try {
    const response = await fetch('/api/build-info', { cache: 'no-store' });
    if (!response.ok) throw new Error(await response.text());
    const data = await response.json();
    cachedVersion = data.version || cachedVersion;
    cachedCommit = data.commit || 'unknown';
    cachedCommitDate = data.commitDate || '';
    return { version: cachedVersion, commit: cachedCommit, commitDate: cachedCommitDate };
  } catch {
    return { version: cachedVersion, commit: cachedCommit, commitDate: cachedCommitDate };
  }
}

export async function renderVersionBadge(): Promise<void> {
  const existing = document.getElementById('versionBadge');
  if (existing) existing.remove();

  const badge = document.createElement('button');
  badge.id = 'versionBadge';
  badge.type = 'button';
  badge.className = 'sb-item sb-build';
  badge.innerHTML = `
    <span style="opacity:0.64">GitMaps</span>
    <span style="margin:0 6px">·</span>
    <span id="versionBadgeVersion" style="color:#e2e8f0">loading...</span>
    <span style="margin:0 6px; opacity:0.5">@</span>
    <span id="versionBadgeCommit" style="color:#c4b5fd">loading...</span>
  `;
  badge.title = 'Loading build version...';

  badge.addEventListener('click', async () => {
    if (!cachedCommit || cachedCommit === 'unknown') {
      showToast('Build commit not available yet', 'error');
      return;
    }
    const value = `v${cachedVersion} @ ${cachedCommit}`;
    await navigator.clipboard.writeText(value);
    showToast(`Copied build ${value}`, 'success');
  });

  const statusRight = document.querySelector('#status-bar .sb-right');
  if (statusRight) {
    statusRight.insertBefore(badge, statusRight.firstChild);
  } else {
    document.body.appendChild(badge);
  }

  const { version, commit, commitDate } = await fetchVersion();
  const versionEl = document.getElementById('versionBadgeVersion');
  const commitEl = document.getElementById('versionBadgeCommit');
  if (versionEl) versionEl.textContent = `v${version}`;
  if (commitEl) commitEl.textContent = commit;
  badge.title = commitDate
    ? `GitMaps v${version} @ ${commit}\nBuilt from commit on ${commitDate}\nClick to copy version + commit`
    : `GitMaps v${version} @ ${commit}\nClick to copy version + commit`;
}
