(async function() {
  const expected = __EXPECTED_REPO__;
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

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  const snapshot = () => ({
    repoValue: document.getElementById('repoSelect')?.value || '',
    fileCount: document.getElementById('fileCount')?.textContent || '',
    commitCount: document.getElementById('commitCount')?.textContent || '',
    pathname: window.location.pathname,
    runtimeRepoPath: window.__GITCANVAS_REPO_PATH__ || '',
    zoom: document.getElementById('stickyZoomValue')?.textContent || document.getElementById('zoomValue')?.textContent || '',
    perfVisible: (document.getElementById('perf-overlay')?.style.display || '') !== 'none',
    perfFps: document.getElementById('perf-fps')?.textContent || '',
    perfDom: document.getElementById('perf-dom')?.textContent || '',
    perfCards: document.getElementById('perf-cards')?.textContent || '',
    perfRenderBudget: document.getElementById('perf-render-budget')?.textContent || '',
    lowZoomCards: document.querySelectorAll('.file-pill').length,
    lowZoomCanvases: document.querySelectorAll('.file-pill canvas').length,
    lowZoomDomPreviewNodes: document.querySelectorAll('.file-pill-preview').length,
  });

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

  if (!document.getElementById('perf-overlay') || document.getElementById('perf-overlay')?.style.display === 'none') {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'P', shiftKey: true, bubbles: true }));
  }

  await waitFor(() => {
    const overlay = document.getElementById('perf-overlay');
    return overlay && overlay.style.display === 'block';
  }, 5000, 100);

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
    if (lowZoomCards > 0 || Number.isFinite(zoomNumber) && zoomNumber <= 20) break;
  }

  await waitFor(() => document.querySelectorAll('.file-pill').length > 0, 8000, 150);
  await sleep(1800);

  const result = snapshot();
  if (result.lowZoomCards <= 0) throw new Error('Low-zoom cards did not appear');
  if (result.lowZoomCanvases <= 0) throw new Error('Low-zoom canvas previews did not appear');
  if (result.lowZoomDomPreviewNodes !== 0) throw new Error('Found old DOM low-zoom preview nodes');
  if (!result.perfFps || result.perfFps === '--') throw new Error('Perf overlay FPS metric did not populate');
  if (!result.perfDom || result.perfDom === '--') throw new Error('Perf overlay DOM metric did not populate');

  return JSON.stringify({
    ok: true,
    expected,
    lowZoom: result,
  });
})()