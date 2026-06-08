(async function() {
  const expected = __EXPECTED_REPO__;
  const timeoutMs = __TIMEOUT_MS__;
  const phases = [];

  const snapshot = () => ({
    repoValue: document.getElementById('repoSelect')?.value || '',
    fileCount: document.getElementById('fileCount')?.textContent || '',
    commitCount: document.getElementById('commitCount')?.textContent || '',
    pathname: window.location.pathname,
    runtimeRepoPath: window.__GITCANVAS_REPO_PATH__ || '',
    zoom: document.getElementById('stickyZoomValue')?.textContent || document.getElementById('zoomValue')?.textContent || '',
    detailMode: document.getElementById('detailModeStateBottom')?.textContent?.trim() || '',
    lowZoomCards: document.querySelectorAll('.file-pill').length,
    fullCards: document.querySelectorAll('.file-card').length,
    lowZoomCanvasCount: document.querySelectorAll('.file-pill canvas').length,
    loadingDisplay: document.getElementById('loadingOverlay')?.style?.display || '',
    landingDisplay: document.getElementById('landingOverlay')?.style?.display || '',
  });

  const mark = (phase, extra = {}) => {
    phases.push({ phase, ...extra, snap: snapshot() });
  };

  const waitFor = async (predicate, label, maxMs = 30000, intervalMs = 100) => {
    const start = Date.now();
    while (Date.now() - start < maxMs) {
      const value = predicate();
      if (value) {
        mark(label, { waitedMs: Date.now() - start });
        return value;
      }
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(snapshot())}`);
  };

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  mark('start');
  const repoSelect = await waitFor(() => document.getElementById('repoSelect'), 'repoSelect', timeoutMs, 100);

  await waitFor(() => {
    const loading = document.getElementById('loadingOverlay');
    return !loading || loading.style.display === 'none';
  }, 'loading-hidden', timeoutMs, 250);

  await waitFor(() => {
    const landing = document.getElementById('landingOverlay');
    const fileCount = Number(document.getElementById('fileCount')?.textContent || '0');
    const commitCount = Number(document.getElementById('commitCount')?.textContent || '0');
    const runtimeRepoPath = window.__GITCANVAS_REPO_PATH__ || '';
    return landing
      && landing.style.display === 'none'
      && runtimeRepoPath === expected.path
      && fileCount === expected.fileCount
      && commitCount === expected.commitCount
      && window.location.pathname === '/' + expected.slug
      && (!repoSelect || repoSelect.value === expected.path);
  }, 'repo-ready', timeoutMs, 250);

  const modeButton = await waitFor(() => document.getElementById('toggleDetailModeBottom'), 'mode-button', 5000, 100);
  const modeState = await waitFor(() => document.getElementById('detailModeStateBottom'), 'mode-state', 5000, 100);
  if (modeState.textContent?.trim() !== 'Preview') {
    modeButton.click();
    await waitFor(() => document.getElementById('detailModeStateBottom')?.textContent?.trim() === 'Preview', 'preview-enabled', 5000, 100);
  } else {
    mark('preview-already-enabled');
  }

  const viewport = await waitFor(() => document.getElementById('canvasViewport'), 'viewport', 5000, 100);
  const rect = viewport.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  for (let i = 0; i < 22; i++) {
    viewport.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      clientX: cx,
      clientY: cy,
      deltaY: 120,
    }));
    await sleep(90);
    const lowZoomCards = document.querySelectorAll('.file-pill').length;
    const zoomText = document.getElementById('stickyZoomValue')?.textContent || '100%';
    const zoomNumber = parseInt(zoomText, 10);
    mark('zoom-step', { step: i + 1, zoomText, zoomNumber, lowZoomCards });
    if (lowZoomCards > 0 || (Number.isFinite(zoomNumber) && zoomNumber <= 20)) break;
  }

  await waitFor(() => document.querySelectorAll('.file-pill').length > 0, 'low-zoom-pills', 10000, 150);
  await sleep(800);

  const result = snapshot();
  if (result.detailMode !== 'Preview') throw new Error(`Expected Preview mode, got ${result.detailMode}`);
  if (result.lowZoomCards <= 0) throw new Error('Preview mode low-zoom pills did not appear');
  if (result.lowZoomCanvasCount <= 0) throw new Error('Preview mode pills are not canvas-backed');

  return JSON.stringify({
    ok: true,
    expected,
    preview: result,
    phases,
  });
})()