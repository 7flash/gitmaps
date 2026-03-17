import { showToast } from './utils';

let cachedCommit = 'unknown';
let cachedCommitDate = '';

export function getVersion(): string {
  return cachedCommit;
}

export function getVersionDate(): string {
  return cachedCommitDate;
}

async function fetchVersion(): Promise<{ commit: string; commitDate: string }> {
  const metaCommit = document.querySelector('meta[name="gitmaps-build-commit"]')?.getAttribute('content') || '';
  const metaDate = document.querySelector('meta[name="gitmaps-build-date"]')?.getAttribute('content') || '';

  if (metaCommit) {
    cachedCommit = metaCommit;
    cachedCommitDate = metaDate;
    return { commit: cachedCommit, commitDate: cachedCommitDate };
  }

  try {
    const response = await fetch('/api/build-info', { cache: 'no-store' });
    if (!response.ok) throw new Error(await response.text());
    const data = await response.json();
    cachedCommit = data.commit || 'unknown';
    cachedCommitDate = data.commitDate || '';
    return { commit: cachedCommit, commitDate: cachedCommitDate };
  } catch {
    return { commit: cachedCommit, commitDate: cachedCommitDate };
  }
}

export async function renderVersionBadge(): Promise<void> {
  const existing = document.getElementById('versionBadge');
  if (existing) existing.remove();

  const badge = document.createElement('button');
  badge.id = 'versionBadge';
  badge.type = 'button';
  badge.style.cssText = `
    position: fixed;
    top: 12px;
    right: 12px;
    padding: 6px 12px;
    background: rgba(15, 23, 42, 0.88);
    border: 1px solid rgba(124, 58, 237, 0.32);
    border-radius: 8px;
    font-size: 10px;
    color: rgba(167, 139, 250, 0.9);
    font-family: 'JetBrains Mono', monospace;
    z-index: 10002;
    backdrop-filter: blur(8px);
    cursor: pointer;
    transition: all 0.2s;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22);
  `;
  badge.innerHTML = `
    <span style="opacity:0.64">GitMaps</span>
    <span style="margin:0 6px">·</span>
    <span id="versionBadgeCommit" style="color:#c4b5fd">loading...</span>
  `;
  badge.title = 'Loading build version...';

  badge.addEventListener('click', async () => {
    if (!cachedCommit || cachedCommit === 'unknown') {
      showToast('Build commit not available yet', 'error');
      return;
    }
    await navigator.clipboard.writeText(cachedCommit);
    showToast(`Copied commit ${cachedCommit}`, 'success');
  });

  badge.addEventListener('mouseenter', () => {
    badge.style.background = 'rgba(15, 23, 42, 0.96)';
    badge.style.borderColor = 'rgba(124, 58, 237, 0.62)';
  });
  badge.addEventListener('mouseleave', () => {
    badge.style.background = 'rgba(15, 23, 42, 0.88)';
    badge.style.borderColor = 'rgba(124, 58, 237, 0.32)';
  });

  document.body.appendChild(badge);

  const { commit, commitDate } = await fetchVersion();
  const commitEl = document.getElementById('versionBadgeCommit');
  if (commitEl) commitEl.textContent = commit;
  badge.title = commitDate
    ? `GitMaps ${commit}\nBuilt from commit on ${commitDate}\nClick to copy commit hash`
    : `GitMaps ${commit}\nClick to copy commit hash`;
}
