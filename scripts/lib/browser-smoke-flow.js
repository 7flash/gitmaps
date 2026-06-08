(async function() {
  const first = __FIRST_EXPECTATIONS__;
  const second = __SECOND_EXPECTATIONS__;
  const timeoutMs = __TIMEOUT_MS__;

  const waitFor = async (predicate, maxMs = 30000, intervalMs = 100) => {
    const start = Date.now();
    while (Date.now() - start < maxMs) {
      const value = predicate();
      if (value) return value;
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    throw new Error('Timed out waiting for condition');
  };

  const snapshot = () => ({
    repoValue: document.getElementById('repoSelect')?.value || '',
    fileCount: document.getElementById('fileCount')?.textContent || '',
    commitCount: document.getElementById('commitCount')?.textContent || '',
    commitInfo: document.getElementById('currentCommitInfo')?.textContent || '',
    timelineHasContent: ((document.getElementById('timelineContainer')?.textContent) || '').trim().length > 0,
    pathname: window.location.pathname,
    runtimeRepoPath: window.__GITCANVAS_REPO_PATH__ || '',
  });

  const waitForRepoLoad = async (expected, previousPathname = '') => {
    await waitFor(() => {
      const loading = document.getElementById('loadingOverlay');
      return !loading || loading.style.display === 'none';
    }, timeoutMs, 250);

    await waitFor(() => {
      const landing = document.getElementById('landingOverlay');
      const repoSelect = document.getElementById('repoSelect');
      const fileCount = Number(document.getElementById('fileCount')?.textContent || '0');
      const commitCount = Number(document.getElementById('commitCount')?.textContent || '0');
      const runtimeRepoPath = window.__GITCANVAS_REPO_PATH__ || '';
      const pathnameChanged = !previousPathname || window.location.pathname !== previousPathname;
      return landing
        && landing.style.display === 'none'
        && repoSelect
        && repoSelect.value === expected.path
        && runtimeRepoPath === expected.path
        && fileCount === expected.fileCount
        && commitCount === expected.commitCount
        && window.location.pathname === '/' + expected.slug
        && pathnameChanged;
    }, timeoutMs, 250);
  };

  const loadRepoViaPrompt = async (expected) => {
    const repoSelect = await waitFor(() => document.getElementById('repoSelect'));
    const previousPathname = window.location.pathname;
    await waitFor(() => Array.from(repoSelect.options).some(opt => opt.value === '__new__'));
    window.prompt = () => expected.path;
    repoSelect.value = '__new__';
    repoSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await waitForRepoLoad(expected, previousPathname);
    return snapshot();
  };

  const firstSnapshot = await loadRepoViaPrompt(first);
  const secondSnapshot = await loadRepoViaPrompt(second);

  if (secondSnapshot.repoValue !== second.path) {
    throw new Error('Second repo did not win the switch: ' + JSON.stringify({ firstSnapshot, secondSnapshot, first, second }));
  }
  if (firstSnapshot.repoValue === secondSnapshot.repoValue) {
    throw new Error('Repo switch did not change repo value: ' + JSON.stringify({ firstSnapshot, secondSnapshot, first, second }));
  }
  if (firstSnapshot.pathname === secondSnapshot.pathname) {
    throw new Error('Repo switch did not change pathname: ' + JSON.stringify({ firstSnapshot, secondSnapshot, first, second }));
  }

  return JSON.stringify({
    ok: true,
    first: firstSnapshot,
    second: secondSnapshot,
    expectedFirst: first,
    expectedSecond: second,
  });
})()