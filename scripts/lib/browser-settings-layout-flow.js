(async function() {
  const expected = __EXPECTED_REPO__;
  const timeoutMs = __TIMEOUT_MS__;
  const targetCardWidth = __TARGET_CARD_WIDTH__;

  const waitFor = async (predicate, maxMs = 30000, intervalMs = 100) => {
    const start = Date.now();
    while (Date.now() - start < maxMs) {
      const value = predicate();
      if (value) return value;
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    throw new Error('Timed out waiting for condition');
  };

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  const DEFAULT_CARD_AREA = 540 * 700;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const aspectForWidth = (widthPx) => clamp((widthPx * widthPx) / DEFAULT_CARD_AREA, 0.45, 1.8);
  const widthForAspect = (aspect) => Math.round(Math.sqrt(DEFAULT_CARD_AREA * aspect));

  const applySettingsViaModal = async () => {
    const openButton = await waitFor(() => document.getElementById('openSettings') || document.getElementById('openSettingsBottom'));
    openButton.click();

    const modal = await waitFor(() => document.getElementById('settingsModal'));
    const slider = await waitFor(() => modal.querySelector('#settingCardAspectRatio'));
    const valueEl = await waitFor(() => modal.querySelector('#cardAspectRatioValue'));
    const targetAspect = aspectForWidth(targetCardWidth);
    const expectedWidth = widthForAspect(targetAspect);

    slider.value = String(targetAspect);
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    slider.dispatchEvent(new Event('change', { bubbles: true }));

    await waitFor(() => getComputedStyle(document.documentElement).getPropertyValue('--card-width').trim() === `${expectedWidth}px`, 5000, 100);
    await waitFor(() => valueEl.textContent.trim() === `${targetAspect.toFixed(2)}:1`, 5000, 100);

    const raw = localStorage.getItem('gitcanvas:settings');
    const parsed = raw ? JSON.parse(raw) : {};

    const closeButton = modal.querySelector('#closeSettings');
    if (closeButton) closeButton.click();
    await waitFor(() => !document.getElementById('settingsModal'), 5000, 100);

    return parsed;
  };

  const snapshot = () => ({
    repoValue: document.getElementById('repoSelect')?.value || '',
    fileCount: document.getElementById('fileCount')?.textContent || '',
    commitCount: document.getElementById('commitCount')?.textContent || '',
    pathname: window.location.pathname,
    runtimeRepoPath: window.__GITCANVAS_REPO_PATH__ || '',
    zoom: document.getElementById('stickyZoomValue')?.textContent || document.getElementById('zoomValue')?.textContent || '',
    lowZoomCards: document.querySelectorAll('.file-pill').length,
    fullCards: document.querySelectorAll('.file-card').length,
    cardWidthVar: getComputedStyle(document.documentElement).getPropertyValue('--card-width').trim(),
    buildBadge: document.getElementById('versionBadge')?.textContent?.replace(/\s+/g, ' ').trim() || '',
  });

  const settings = await applySettingsViaModal();
  const repoSelect = await waitFor(() => document.getElementById('repoSelect'));
  await waitFor(() => Array.from(repoSelect.options).some(opt => opt.value === '__new__'));

  window.prompt = () => expected.path;
  repoSelect.value = '__new__';
  repoSelect.dispatchEvent(new Event('change', { bubbles: true }));

  await waitFor(() => {
    const loading = document.getElementById('loadingOverlay');
    return !loading || loading.style.display === 'none';
  }, timeoutMs, 250);

  await waitFor(() => {
    const landing = document.getElementById('landingOverlay');
    const fileCount = Number(document.getElementById('fileCount')?.textContent || '0');
    const commitCount = Number(document.getElementById('commitCount')?.textContent || '0');
    const runtimeRepoPath = window.__GITCANVAS_REPO_PATH__ || '';
    return landing
      && landing.style.display === 'none'
      && repoSelect.value === expected.path
      && runtimeRepoPath === expected.path
      && fileCount === expected.fileCount
      && commitCount === expected.commitCount
      && window.location.pathname === '/' + expected.slug;
  }, timeoutMs, 250);

  const viewport = await waitFor(() => document.getElementById('canvasViewport'));
  const rect = viewport.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  for (let i = 0; i < 18; i++) {
    viewport.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      clientX: cx,
      clientY: cy,
      deltaY: 120,
    }));
    await sleep(80);
    const lowZoomCards = document.querySelectorAll('.file-pill').length;
    const zoomText = document.getElementById('stickyZoomValue')?.textContent || '100%';
    const zoomNumber = parseInt(zoomText, 10);
    if (lowZoomCards > 0 || (Number.isFinite(zoomNumber) && zoomNumber <= 20)) break;
  }

  await waitFor(() => document.querySelectorAll('.file-pill').length > 0, 8000, 150);
  await sleep(1000);

  const result = snapshot();

  const expectedAspect = aspectForWidth(targetCardWidth);
  const expectedWidth = widthForAspect(expectedAspect);
  if (result.cardWidthVar !== `${expectedWidth}px`) {
    throw new Error(`Expected --card-width to be ${expectedWidth}px, got ${result.cardWidthVar}`);
  }
  if (!result.buildBadge.includes(`v`) || !result.buildBadge.includes('@')) {
    throw new Error(`Build badge missing version/commit: ${result.buildBadge}`);
  }
  if (result.lowZoomCards <= 0) {
    throw new Error('Low-zoom pill cards did not appear');
  }
  if (Number(result.fileCount || 0) !== expected.fileCount) {
    throw new Error(`Expected file count ${expected.fileCount}, got ${result.fileCount}`);
  }

  return JSON.stringify({
    ok: true,
    expected,
    settings,
    layout: result,
  });
})()
