(() => {
  'use strict';

  const WORKING = '__working__';
  const RECENT_KEY = 'gitmaps:v8:recentRepos';
  const GLOBAL_FONT_KEY = 'gitmaps:v8:font:global';
  const DEFAULT_FONT = 12;

  const state = {
    repoPath: '',
    commits: [],
    currentCommit: '',
    files: [],
    allFiles: [],
    changedFileCount: 0,
    selected: new Set(),
    positions: {},
    dragging: null,
    marquee: null,
    panning: null,
    contentCache: new Map(),
    contentLoading: new Set(),
    renderedCards: new Map(),
    fileByPath: new Map(),
    viewportScheduled: false,
    pretext: null,
    pretextReady: false,
    minimap: { dragging: false, scale: 1, offsetX: 0, offsetY: 0, bounds: null },
    globalFont: Number(localStorage.getItem(GLOBAL_FONT_KEY) || DEFAULT_FONT) || DEFAULT_FONT,
  };

  const els = {
    repoStatus: document.getElementById('repoStatus'),
    repoSelect: document.getElementById('repoSelect'),
    repoPath: document.getElementById('repoPath'),
    loadRepoBtn: document.getElementById('loadRepoBtn'),
    commitList: document.getElementById('commitList'),
    historyCount: document.getElementById('historyCount'),
    workspaceHint: document.getElementById('workspaceHint'),
    viewport: document.getElementById('canvasViewport'),
    canvas: document.getElementById('canvasContent'),
    gridBtn: document.getElementById('gridBtn'),
    selectAllBtn: document.getElementById('selectAllBtn'),
    clearSelectionBtn: document.getElementById('clearSelectionBtn'),
    globalFont: document.getElementById('globalFont'),
    contextMenu: document.getElementById('contextMenu'),
    minimap: document.getElementById('minimap'),
    minimapCanvas: document.getElementById('minimapCanvas'),
    minimapLabel: document.getElementById('minimapLabel'),
  };

  const CARD_WIDTH = 520;
  const CARD_HEIGHT = 460;
  const GRID_GAP_X = 560;
  const GRID_GAP_Y = 500;
  const VIEWPORT_OVERSCAN = 900;
  const MAX_RENDERED_CARDS = 140;

  function decodeMaybe(value) {
    let out = String(value || '');
    out = out.replace(/\+/g, '%20');
    for (let i = 0; i < 3; i++) {
      try {
        const next = decodeURIComponent(out);
        if (next === out) break;
        out = next;
      } catch {
        break;
      }
    }
    return out;
  }

  function normalizeRepoPath(value) {
    return decodeMaybe(String(value || '').trim())
      .replace(/^file:\/\/\/?/i, '')
      .replace(/^['"]|['"]$/g, '')
      .trim();
  }

  function isLikelyRepoPath(value) {
    const clean = normalizeRepoPath(value);
    return /^([a-zA-Z]:[\\/]|\\\\|\/|~\/|\.\.?[\\/])/.test(clean);
  }

  function repoName(repoPath) {
    const parts = normalizeRepoPath(repoPath).split(/[\\/]+/).filter(Boolean);
    return parts[parts.length - 1] || repoPath || 'repository';
  }

  function getRepoFromLocation() {
    const search = window.location.search || '';
    const rawSearch = search.replace(/^\?/, '');

    try {
      const params = new URLSearchParams(search);
      const repo = params.get('repo') || params.get('path');
      if (repo) return normalizeRepoPath(repo);
    } catch {}

    const rawMatch = rawSearch.match(/(?:^|&)(?:repo|path)=([^&]*)/i);
    if (rawMatch) return normalizeRepoPath(rawMatch[1]);

    let pathPart = window.location.pathname || '';
    pathPart = pathPart.replace(/^\/+/, '');
    if (!pathPart) return '';

    if (pathPart.startsWith('~repo/')) return normalizeRepoPath(pathPart.slice('~repo/'.length));

    const decodedPath = normalizeRepoPath(pathPart);
    if (isLikelyRepoPath(decodedPath)) return decodedPath;
    return '';
  }

  function syncUrl(repoPath, replace = false) {
    const clean = normalizeRepoPath(repoPath);
    if (!clean) return;
    const next = `/?repo=${encodeURIComponent(clean)}`;
    const current = `${window.location.pathname}${window.location.search}`;
    if (current === next) return;
    const method = replace ? 'replaceState' : 'pushState';
    window.history[method]({ repoPath: clean }, repoName(clean), next);
  }

  async function api(path, options = {}) {
    const res = await fetch(path, options);
    const text = await res.text();
    let data;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      const message = data?.error || data || `${res.status} ${res.statusText}`;
      throw new Error(message);
    }
    return data;
  }

  function postJson(path, body) {
    return api(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async function mapLimit(items, limit, worker) {
    const results = new Array(items.length);
    let cursor = 0;
    const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length || 1)) }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        results[index] = await worker(items[index], index);
      }
    });
    await Promise.all(workers);
    return results;
  }

  function countLines(value) {
    if (value === undefined || value === null || value === '') return 0;
    return String(value).split('\n').length;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function shortHash(hash) {
    return hash === WORKING ? 'Current' : String(hash || '').slice(0, 8);
  }

  function shortDate(date) {
    if (!date) return '';
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return String(date).slice(0, 16);
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function toast(message, error = false) {
    document.querySelector('.toast')?.remove();
    const el = document.createElement('div');
    el.className = `toast${error ? ' error' : ''}`;
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), error ? 6000 : 3200);
  }

  function getRecentRepos() {
    try {
      const raw = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
      return Array.isArray(raw) ? raw.filter(item => item && item.path) : [];
    } catch {
      return [];
    }
  }

  function addRecentRepo(repoPath) {
    const clean = normalizeRepoPath(repoPath);
    if (!clean) return;
    const compare = clean.replace(/\\/g, '/').toLowerCase();
    const repos = getRecentRepos().filter(item => normalizeRepoPath(item.path).replace(/\\/g, '/').toLowerCase() !== compare);
    repos.unshift({ path: clean, name: repoName(clean), loadedAt: Date.now() });
    localStorage.setItem(RECENT_KEY, JSON.stringify(repos.slice(0, 20)));
  }

  async function populateRepos(selectedPath = '') {
    const cleanSelected = normalizeRepoPath(selectedPath || state.repoPath || getRepoFromLocation());
    const known = new Map();
    if (cleanSelected) known.set(cleanSelected, { path: cleanSelected, name: repoName(cleanSelected) });
    for (const recent of getRecentRepos()) {
      const path = normalizeRepoPath(recent.path);
      if (path) known.set(path, { path, name: recent.name || repoName(path) });
    }

    try {
      const data = await api('/api/repo/list');
      for (const repo of data?.repos || []) {
        const path = normalizeRepoPath(repo.path);
        if (path) known.set(path, { path, name: repo.name || repoName(path) });
      }
    } catch {
      // Repo discovery is optional. Manual URL/input loading still works.
    }

    els.repoSelect.innerHTML = '<option value="">Select repo…</option>';
    for (const repo of known.values()) {
      const opt = document.createElement('option');
      opt.value = repo.path;
      opt.textContent = repo.name;
      opt.title = repo.path;
      els.repoSelect.appendChild(opt);
    }
    if (cleanSelected) {
      ensureRepoOption(cleanSelected);
      els.repoSelect.value = cleanSelected;
      els.repoPath.value = cleanSelected;
    }
  }

  function ensureRepoOption(repoPath) {
    const clean = normalizeRepoPath(repoPath);
    if (!clean) return;
    if (![...els.repoSelect.options].some(opt => opt.value === clean)) {
      const opt = document.createElement('option');
      opt.value = clean;
      opt.textContent = repoName(clean);
      opt.title = clean;
      els.repoSelect.appendChild(opt);
    }
  }

  function positionKey() {
    return `gitmaps:v8:positions:${state.repoPath}:${state.currentCommit}`;
  }

  function loadPositions() {
    try { state.positions = JSON.parse(localStorage.getItem(positionKey()) || '{}') || {}; }
    catch { state.positions = {}; }
  }

  function savePositions() {
    localStorage.setItem(positionKey(), JSON.stringify(state.positions));
  }

  function fileFontKey(path) {
    return `gitmaps:v8:font:file:${state.repoPath}:${path}`;
  }

  function getFileFont(path) {
    return Number(localStorage.getItem(fileFontKey(path)) || state.globalFont) || state.globalFont;
  }

  function setFileFont(path, value) {
    const font = Math.max(8, Math.min(28, Number(value) || state.globalFont));
    localStorage.setItem(fileFontKey(path), String(font));
    const card = getCard(path);
    if (card) card.style.setProperty('--code-font', `${font}px`);
  }

  function setGlobalFont(value) {
    state.globalFont = Math.max(8, Math.min(28, Number(value) || DEFAULT_FONT));
    localStorage.setItem(GLOBAL_FONT_KEY, String(state.globalFont));
    els.globalFont.value = String(state.globalFont);
    for (const card of document.querySelectorAll('.file-card')) {
      const path = card.dataset.path;
      if (path && !localStorage.getItem(fileFontKey(path))) {
        card.style.setProperty('--code-font', `${state.globalFont}px`);
      }
    }
  }

  async function loadRepo(repoPath, { replaceUrl = false, sync = true } = {}) {
    const clean = normalizeRepoPath(repoPath);
    if (!clean) return;

    state.repoPath = clean;
    state.currentCommit = '';
    state.files = [];
    state.allFiles = [];
    state.changedFileCount = 0;
    state.selected.clear();
    state.contentCache.clear();
    state.contentLoading.clear();
    state.renderedCards.clear();
    state.fileByPath.clear();
    els.repoStatus.textContent = `Loading ${clean}…`;
    els.workspaceHint.style.display = 'none';
    els.commitList.innerHTML = '<div class="empty-state">Loading commits…</div>';
    els.canvas.innerHTML = '';
    ensureRepoOption(clean);
    els.repoSelect.value = clean;
    els.repoPath.value = clean;
    if (sync) syncUrl(clean, replaceUrl);

    try {
      const data = await postJson('/api/repo/load', { path: clean });
      const canonical = normalizeRepoPath(data?.repoPath || clean);
      if (canonical && canonical !== state.repoPath) {
        state.repoPath = canonical;
        ensureRepoOption(canonical);
        els.repoSelect.value = canonical;
        els.repoPath.value = canonical;
        syncUrl(canonical, true);
      }
      state.commits = data?.commits || [];
      addRecentRepo(canonical || clean);
      await populateRepos(canonical || clean);
      renderCommits();
      els.repoStatus.textContent = canonical || clean;
      if (data?.correctedPath) toast(`Using repo root: ${canonical}`);
      const first = state.commits.find(c => c.hash === WORKING) || state.commits[0];
      if (first) await selectCommit(first.hash);
      else {
        els.canvas.innerHTML = '<div class="empty-state">No commits found.</div>';
      }
    } catch (err) {
      console.error(err);
      els.repoStatus.textContent = 'No repo selected';
      els.workspaceHint.style.display = 'block';
      els.commitList.innerHTML = `<div class="error-state">${escapeHtml(err.message)}</div>`;
      toast(`Failed to load repo: ${err.message}`, true);
    }
  }

  function renderCommits() {
    const actualCount = state.commits.filter(c => c.hash !== WORKING).length;
    els.historyCount.textContent = String(actualCount);
    if (!state.commits.length) {
      els.commitList.innerHTML = '<div class="empty-state">No commits found.</div>';
      return;
    }
    els.commitList.innerHTML = '';
    for (const commit of state.commits) {
      const btn = document.createElement('button');
      btn.className = `commit-item${commit.hash === state.currentCommit ? ' active' : ''}`;
      btn.dataset.hash = commit.hash;
      btn.innerHTML = `
        <div class="hash">${escapeHtml(shortHash(commit.hash))}</div>
        <div class="msg">${escapeHtml(commit.message || '(no message)')}</div>
        <div class="meta">${escapeHtml(commit.author || '')}${commit.author ? ' · ' : ''}${escapeHtml(shortDate(commit.date))}</div>
      `;
      btn.addEventListener('click', () => selectCommit(commit.hash));
      els.commitList.appendChild(btn);
    }
  }

  async function selectCommit(hash) {
    if (!state.repoPath || !hash) return;
    state.currentCommit = hash;
    state.selected.clear();
    loadPositions();
    renderCommits();

    if (hash === WORKING) {
      els.canvas.innerHTML = '<div class="empty-state">Loading tracked workdir file list…</div>';
      try {
        const treeData = await postJson('/api/repo/tree', { path: state.repoPath, commit: WORKING, trackedOnly: true });
        const treeFiles = Array.isArray(treeData?.files) ? treeData.files : [];
        state.allFiles = treeFiles;
        state.changedFileCount = 0;
        state.contentCache.clear();
        state.contentLoading.clear();
        state.files = treeFiles
          .filter(file => file?.path)
          .sort((a, b) => String(a.path).localeCompare(String(b.path)))
          .map(file => ({
            ...file,
            status: 'workdir',
            viewMode: 'workdir',
            isWorkingContent: true,
            isChanged: false,
            content: null,
            hunks: [],
            contentError: file.metaError || null,
          }));
        renderFiles();
        const active = els.commitList.querySelector(`[data-hash="${CSS.escape(hash)}"]`);
        active?.scrollIntoView({ block: 'nearest' });
        toast(`Rendered ${state.files.length} tracked workdir file shells; visible files load lazily`);
      } catch (err) {
        console.error(err);
        els.canvas.innerHTML = `<div class="error-state">${escapeHtml(err.message)}</div>`;
        toast(`Failed to load workdir files: ${err.message}`, true);
      }
      return;
    }

    els.canvas.innerHTML = '<div class="empty-state">Loading commit diff…</div>';
    try {
      const diffData = await postJson('/api/repo/files', { path: state.repoPath, commit: hash });
      const diffFiles = Array.isArray(diffData?.files) ? diffData.files : [];
      state.allFiles = [];
      state.changedFileCount = diffFiles.length;
      state.contentCache.clear();
      state.contentLoading.clear();
      state.files = diffFiles.map(file => ({ ...file, isChanged: true, diffOnly: true }));
      renderFiles();
      const active = els.commitList.querySelector(`[data-hash="${CSS.escape(hash)}"]`);
      active?.scrollIntoView({ block: 'nearest' });
      toast(`Rendered ${state.changedFileCount} changed file${state.changedFileCount === 1 ? '' : 's'} in this commit`);
    } catch (err) {
      console.error(err);
      els.canvas.innerHTML = `<div class="error-state">${escapeHtml(err.message)}</div>`;
      toast(`Failed to load commit diff: ${err.message}`, true);
    }
  }

  async function hydrateWorkingFiles(treeFiles) {
    const sorted = [...(treeFiles || [])]
      .filter(file => file?.path)
      .sort((a, b) => String(a.path).localeCompare(String(b.path)));

    return mapLimit(sorted, 8, async (meta) => {
      if (meta.isBinary) {
        return {
          ...meta,
          status: 'workdir',
          isWorkingContent: true,
          isChanged: false,
          content: null,
          contentError: 'Binary file — full text preview is not available.',
          hunks: [],
        };
      }

      try {
        const data = await postJson('/api/repo/file-content', {
          path: state.repoPath,
          commit: WORKING,
          filePath: meta.path,
        });
        const content = data?.content ?? '';
        return {
          ...meta,
          status: 'workdir',
          isWorkingContent: true,
          isChanged: false,
          content,
          hunks: [],
          contentError: null,
          lines: data?.lineCount || countLines(content) || meta.lines || 0,
          truncated: !!data?.truncated,
        };
      } catch (err) {
        return {
          ...meta,
          status: 'workdir',
          isWorkingContent: true,
          isChanged: false,
          content: meta.previewContent || null,
          hunks: [],
          contentError: err?.message || 'Could not load file content',
        };
      }
    });
  }

  function defaultPosition(index) {
    const cols = 3;
    return { x: 40 + (index % cols) * GRID_GAP_X, y: 40 + Math.floor(index / cols) * GRID_GAP_Y };
  }

  function resizeCanvasToFit(count) {
    const cols = 3;
    const rows = Math.max(1, Math.ceil((count || 1) / cols));
    const width = Math.max(5200, 80 + cols * GRID_GAP_X);
    const height = Math.max(3600, 80 + rows * GRID_GAP_Y);
    els.canvas.style.width = `${width}px`;
    els.canvas.style.height = `${height}px`;
  }

  function mergeTreeAndDiffs(treeFiles, diffFiles) {
    const diffByPath = new Map();
    for (const diff of diffFiles || []) {
      if (diff?.path) diffByPath.set(diff.path, diff);
    }

    const merged = [];
    for (const meta of treeFiles || []) {
      if (!meta?.path) continue;
      const diff = diffByPath.get(meta.path);
      if (diff) {
        merged.push({ ...meta, ...diff, isChanged: true });
        diffByPath.delete(meta.path);
      } else {
        merged.push({
          ...meta,
          status: 'unchanged',
          content: null,
          hunks: [],
          contentError: meta.metaError || null,
          lines: meta.lines || 0,
          isChanged: false,
        });
      }
    }

    // Deleted or renamed-from files may not exist in the selected tree, but their
    // deletion diff still needs a card.
    for (const diff of diffByPath.values()) {
      merged.push({ ...diff, isChanged: true, diffOnly: true });
    }

    return merged.sort((a, b) => {
      const changedDelta = Number(Boolean(b.isChanged)) - Number(Boolean(a.isChanged));
      if (changedDelta) return changedDelta;
      return String(a.path || '').localeCompare(String(b.path || ''));
    });
  }

  function renderFiles() {
    els.canvas.innerHTML = '';
    state.renderedCards.clear();
    state.fileByPath = new Map();

    if (!state.files.length) {
      els.canvas.innerHTML = '<div class="empty-state">No files found. Workdir shows tracked Git files; commits show files changed by that commit.</div>';
      drawMinimap();
      return;
    }

    resizeCanvasToFit(state.files.length);
    state.files.forEach((file, index) => {
      if (!file?.path) return;
      state.fileByPath.set(file.path, file);
      if (!state.positions[file.path]) state.positions[file.path] = defaultPosition(index);
    });
    savePositions();
    scheduleViewportUpdate(true);
    drawMinimap();
    refreshSelection();
  }

  function scheduleViewportUpdate(force = false) {
    if (force) {
      state.viewportScheduled = false;
      updateViewportCulling();
      return;
    }
    if (state.viewportScheduled) return;
    state.viewportScheduled = true;
    requestAnimationFrame(updateViewportCulling);
  }

  function updateViewportCulling() {
    state.viewportScheduled = false;
    if (!state.files.length) return;

    const view = {
      left: Math.max(0, els.viewport.scrollLeft - VIEWPORT_OVERSCAN),
      top: Math.max(0, els.viewport.scrollTop - VIEWPORT_OVERSCAN),
      right: els.viewport.scrollLeft + els.viewport.clientWidth + VIEWPORT_OVERSCAN,
      bottom: els.viewport.scrollTop + els.viewport.clientHeight + VIEWPORT_OVERSCAN,
    };

    const candidates = [];
    for (const file of state.files) {
      const pos = state.positions[file.path] || defaultPosition(0);
      const visible = pos.x + CARD_WIDTH >= view.left && pos.x <= view.right && pos.y + CARD_HEIGHT >= view.top && pos.y <= view.bottom;
      if (visible) {
        const dx = Math.max(view.left - pos.x, 0, pos.x - view.right);
        const dy = Math.max(view.top - pos.y, 0, pos.y - view.bottom);
        candidates.push({ file, pos, distance: dx * dx + dy * dy });
      }
    }

    candidates.sort((a, b) => a.distance - b.distance);
    const keep = new Set(candidates.slice(0, MAX_RENDERED_CARDS).map(item => item.file.path));

    for (const [path, card] of state.renderedCards) {
      if (!keep.has(path)) {
        card.remove();
        state.renderedCards.delete(path);
      }
    }

    for (const item of candidates.slice(0, MAX_RENDERED_CARDS)) {
      let card = state.renderedCards.get(item.file.path);
      if (!card) {
        card = createFileCard(item.file, item.pos);
        state.renderedCards.set(item.file.path, card);
        els.canvas.appendChild(card);
      } else {
        positionCard(card, item.pos);
      }
      if (isWorkdirFile(item.file)) ensureWorkingFileContent(item.file);
    }

    refreshSelection();
    updateMinimapViewport();
    updateVirtualizationLabel(candidates.length, keep.size);
  }

  function updateVirtualizationLabel(nearCount, renderedCount) {
    if (!els.minimapLabel) return;
    const loaded = state.contentCache.size;
    els.minimapLabel.textContent = `${renderedCount}/${state.files.length} cards · ${loaded} loaded`;
  }

  function createFileCard(file, pos) {
    const card = document.createElement('article');
    card.className = 'file-card';
    card.dataset.path = file.path;
    positionCard(card, pos);
    card.style.setProperty('--code-font', `${getFileFont(file.path)}px`);
    card.innerHTML = `
      <header class="file-card-header">
        <div class="file-title">
          <div class="file-name">${escapeHtml(file.name || file.path)}</div>
          <div class="file-path">${escapeHtml(file.oldPath ? `${file.oldPath} → ${file.path}` : file.path)}</div>
        </div>
        <div class="file-actions">
          <span class="badge ${escapeHtml(file.status || '')}">${escapeHtml(file.status || 'file')}</span>
          <button data-action="font-down" title="Smaller file font">A−</button>
          <button data-action="font-up" title="Larger file font">A+</button>
        </div>
      </header>
      <section class="file-body">${renderCardBody(file)}</section>
    `;
    return card;
  }

  function positionCard(card, pos) {
    card.style.left = `${pos.x}px`;
    card.style.top = `${pos.y}px`;
  }


  function isWorkdirFile(file) {
    return state.currentCommit === WORKING || file?.isWorkingContent === true || file?.viewMode === 'workdir' || file?.status === 'workdir';
  }

  function hasNativeTextSelectionInside(target) {
    const selection = window.getSelection?.();
    if (!selection || selection.isCollapsed || !String(selection.toString() || '').trim()) return false;
    const card = cardFromTarget(target);
    const anchor = selection.anchorNode;
    const focus = selection.focusNode;
    return !!card && !!anchor && !!focus && card.contains(anchor) && card.contains(focus);
  }

  function renderCardBody(file) {
    if (!isWorkdirFile(file)) return renderDiff(file);
    const cached = state.contentCache.get(file.path);
    if (cached) return renderFullContent(cached);
    if (state.contentLoading.has(file.path)) {
      return '<div class="source-note"><strong>Loading visible file content…</strong><br>Workdir uses lazy DOM text hydration.</div>';
    }
    if (file.contentError) return `<div class="source-note"><strong>${escapeHtml(file.contentError)}</strong></div>`;
    return '<div class="source-note"><strong>Visible file shell</strong><br>Content loads when this card enters the viewport.</div>';
  }

  async function ensureWorkingFileContent(file) {
    if (!file?.path || !isWorkdirFile(file)) return;
    file.isWorkingContent = true;
    file.viewMode = 'workdir';
    if (state.contentCache.has(file.path) || state.contentLoading.has(file.path)) return;

    if (file.isBinary) {
      const binary = {
        ...file,
        content: '',
        contentError: 'Binary file — full text preview is not available.',
        lines: file.lines || 0,
      };
      state.contentCache.set(file.path, binary);
      updateCardBody(file.path);
      return;
    }

    state.contentLoading.add(file.path);
    updateCardBody(file.path);
    try {
      const data = await postJson('/api/repo/file-content', {
        path: state.repoPath,
        commit: WORKING,
        filePath: file.path,
      });
      const content = data?.content ?? '';
      state.contentCache.set(file.path, {
        ...file,
        content,
        contentError: null,
        lines: data?.lineCount || countLines(content) || file.lines || 0,
        truncated: !!data?.truncated,
      });
    } catch (err) {
      state.contentCache.set(file.path, {
        ...file,
        content: file.previewContent || '',
        contentError: err?.message || 'Could not load file content',
        lines: file.lines || 0,
      });
    } finally {
      state.contentLoading.delete(file.path);
      updateCardBody(file.path);
      drawMinimap();
    }
  }

  function updateCardBody(path) {
    const card = getCard(path);
    if (!card) return;
    const file = state.fileByPath.get(path);
    const body = card.querySelector('.file-body');
    if (file && body) body.innerHTML = renderCardBody(file);
  }

  function renderDiff(file) {
    if (isWorkdirFile(file)) {
      return renderCardBody(file);
    }
    if (file.contentError) return `<div class="error-state">${escapeHtml(file.contentError)}</div>`;
    const hunks = Array.isArray(file.hunks) ? file.hunks : [];
    if (hunks.length) {
      const rows = [];
      for (const hunk of hunks) {
        rows.push(`<span class="diff-line hunk">@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@${hunk.context ? ' ' + escapeHtml(hunk.context) : ''}</span>`);
        for (const line of hunk.lines || []) {
          const cls = line.type === 'add' ? 'add' : line.type === 'del' ? 'del' : 'ctx';
          const prefix = line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' ';
          rows.push(`<span class="diff-line ${cls}">${escapeHtml(prefix + (line.content ?? ''))}</span>`);
        }
      }
      return `<pre class="diff">${rows.join('')}</pre>`;
    }
    if (file.content) {
      const rows = String(file.content).split('\n').map(line => {
        const cls = line.startsWith('+') ? 'add' : line.startsWith('-') ? 'del' : line.startsWith('@@') ? 'hunk' : 'ctx';
        return `<span class="diff-line ${cls}">${escapeHtml(line)}</span>`;
      }).join('');
      return `<pre class="diff">${rows}</pre>`;
    }
    return '<div class="empty-state">No textual diff for this commit.</div>';
  }

  function renderFullContent(file) {
    const meta = [];
    if (file.ext) meta.push(`.${file.ext}`);
    if (Number.isFinite(file.size) && file.size > 0) meta.push(`${file.size} bytes`);
    if (file.lines) meta.push(`${file.lines} lines`);

    if (file.contentError && !file.content) {
      return `<div class="source-note"><strong>${escapeHtml(file.contentError)}</strong><br>${escapeHtml(meta.join(' · ') || file.path)}</div>`;
    }

    const text = String(file.content ?? '');
    const estimated = estimatePreTextHeight(text, getFileFont(file.path));
    const truncated = file.truncated ? '<div class="source-warning">File preview was truncated by the API size limit.</div>' : '';
    const pretextBadge = state.pretextReady ? '<span class="pretext-badge">Pretext metrics</span>' : '';
    return `${truncated}${pretextBadge}<pre class="source-code pretext-code" style="min-height:${estimated}px">${escapeHtml(text || ' ')}</pre>`;
  }

  function estimatePreTextHeight(text, fontSize) {
    const lines = countLines(text);
    const lineHeight = Math.max(12, Number(fontSize) || state.globalFont) * 1.48;

    // Pretext is an optional measurement fast path. The standalone app still
    // works without a bundler or the package installed; it falls back to the
    // exact cheap calculation for monospace preformatted source text.
    if (state.pretext?.prepare && state.pretext?.layout) {
      try {
        const font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
        const prepared = state.pretext.prepare(text, font, { whiteSpace: 'pre' });
        const measured = state.pretext.layout(prepared, 100000, lineHeight);
        if (Number.isFinite(measured?.height)) return Math.ceil(measured.height + 20);
      } catch {
        // Ignore experimental measurement failures and keep the fallback stable.
      }
    }

    return Math.ceil(Math.max(1, lines) * lineHeight + 20);
  }

  function getCard(path) {
    return state.renderedCards.get(path) || null;
  }

  function cardFromTarget(target) {
    return target?.closest?.('.file-card') || null;
  }

  function cardPath(card) {
    return card?.dataset?.path || '';
  }

  function setSelected(path, value) {
    if (!path) return;
    if (value) state.selected.add(path); else state.selected.delete(path);
  }

  function selectOnly(path) {
    state.selected.clear();
    setSelected(path, true);
    refreshSelection();
  }

  function toggleSelect(path) {
    if (!path) return;
    if (state.selected.has(path)) state.selected.delete(path); else state.selected.add(path);
    refreshSelection();
  }

  function refreshSelection() {
    for (const [path, card] of state.renderedCards) {
      card.classList.toggle('selected', state.selected.has(path));
    }
    drawMinimap();
  }

  function selectedPathsOr(path) {
    if (path && !state.selected.has(path)) return [path];
    const paths = [...state.selected];
    return paths.length ? paths : (path ? [path] : []);
  }

  function arrangeGrid(paths = [...state.selected]) {
    const targets = paths.length ? paths : state.files.map(file => file.path);
    const cols = Math.max(1, Math.ceil(Math.sqrt(targets.length || 1)));
    targets.forEach((path, index) => {
      const pos = { x: 40 + (index % cols) * GRID_GAP_X, y: 40 + Math.floor(index / cols) * GRID_GAP_Y };
      state.positions[path] = pos;
      const card = getCard(path);
      if (card) positionCard(card, pos);
    });
    savePositions();
    scheduleViewportUpdate(true);
    drawMinimap();
    toast(`Arranged ${targets.length} file${targets.length === 1 ? '' : 's'} in grid`);
  }

  function installPointerInteractions() {
    let pointerMoved = false;

    els.canvas.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      hideContextMenu();
      const card = cardFromTarget(event.target);
      const header = event.target.closest?.('.file-card-header');
      const path = cardPath(card);
      const additive = event.ctrlKey || event.metaKey || event.shiftKey;
      pointerMoved = false;

      if (card && path) {
        if (event.target.closest('button,input,select,a')) return;

        if (!state.selected.has(path)) {
          if (additive) setSelected(path, true); else selectOnly(path);
        } else if (additive && !header) {
          toggleSelect(path);
          return;
        }
        refreshSelection();

        if (!header) return;

        event.preventDefault();
        event.stopPropagation();
        const selected = selectedPathsOr(path);
        const start = { x: event.clientX, y: event.clientY };
        const starts = selected.map(p => {
          const c = getCard(p);
          return { path: p, x: parseFloat(c?.style.left || '0') || 0, y: parseFloat(c?.style.top || '0') || 0 };
        });
        state.dragging = { pointerId: event.pointerId, start, starts };
        card.setPointerCapture(event.pointerId);
        return;
      }

      // Empty canvas left-drag is marquee select, never pan. Use middle mouse or Space+drag to pan.
      event.preventDefault();
      const box = document.createElement('div');
      box.className = 'selection-box';
      document.body.appendChild(box);
      state.marquee = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, box, additive };
      els.canvas.setPointerCapture(event.pointerId);
      updateMarquee(event.clientX, event.clientY);
    });

    els.canvas.addEventListener('pointermove', (event) => {
      if (state.dragging) {
        event.preventDefault();
        pointerMoved = true;
        const dx = event.clientX - state.dragging.start.x;
        const dy = event.clientY - state.dragging.start.y;
        for (const item of state.dragging.starts) {
          const card = getCard(item.path);
          if (!card) continue;
          const x = item.x + dx;
          const y = item.y + dy;
          card.style.left = `${x}px`;
          card.style.top = `${y}px`;
        }
        return;
      }

      if (state.marquee) {
        event.preventDefault();
        pointerMoved = true;
        updateMarquee(event.clientX, event.clientY);
      }
    });

    const finishPointer = (event) => {
      if (state.dragging) {
        event.preventDefault();
        for (const item of state.dragging.starts) {
          const card = getCard(item.path);
          if (!card) continue;
          state.positions[item.path] = {
            x: parseFloat(card.style.left) || 0,
            y: parseFloat(card.style.top) || 0,
          };
        }
        savePositions();
        scheduleViewportUpdate(true);
        drawMinimap();
        try { event.target.releasePointerCapture?.(state.dragging.pointerId); } catch {}
        state.dragging = null;
      }

      if (state.marquee) {
        event.preventDefault();
        const rect = marqueeRect(event.clientX, event.clientY);
        if (!state.marquee.additive) state.selected.clear();
        for (const card of els.canvas.querySelectorAll('.file-card')) {
          if (rectsIntersect(rect, card.getBoundingClientRect())) state.selected.add(card.dataset.path);
        }
        state.marquee.box.remove();
        state.marquee = null;
        refreshSelection();
      }
    };
    els.canvas.addEventListener('pointerup', finishPointer);
    els.canvas.addEventListener('pointercancel', finishPointer);

    els.canvas.addEventListener('click', (event) => {
      const card = cardFromTarget(event.target);
      const path = cardPath(card);
      if (!path || pointerMoved || event.target.closest('button')) return;
      if (event.ctrlKey || event.metaKey || event.shiftKey) toggleSelect(path);
      else selectOnly(path);
    });

    // Middle mouse or Space + left mouse pans by scrolling the viewport.
    els.viewport.addEventListener('pointerdown', (event) => {
      if (!(event.button === 1 || (event.button === 0 && keyState.space))) return;
      event.preventDefault();
      state.panning = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: els.viewport.scrollLeft, top: els.viewport.scrollTop };
      els.viewport.classList.add('panning');
      els.viewport.setPointerCapture(event.pointerId);
    });
    els.viewport.addEventListener('pointermove', (event) => {
      if (!state.panning) return;
      event.preventDefault();
      els.viewport.scrollLeft = state.panning.left - (event.clientX - state.panning.x);
      els.viewport.scrollTop = state.panning.top - (event.clientY - state.panning.y);
    });
    const finishPan = (event) => {
      if (!state.panning) return;
      try { els.viewport.releasePointerCapture(state.panning.pointerId); } catch {}
      state.panning = null;
      els.viewport.classList.remove('panning');
    };
    els.viewport.addEventListener('pointerup', finishPan);
    els.viewport.addEventListener('pointercancel', finishPan);
  }

  function updateMarquee(x, y) {
    if (!state.marquee) return;
    const rect = marqueeRect(x, y);
    Object.assign(state.marquee.box.style, {
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.right - rect.left}px`,
      height: `${rect.bottom - rect.top}px`,
    });
  }

  function marqueeRect(x, y) {
    const startX = state.marquee.startX;
    const startY = state.marquee.startY;
    return { left: Math.min(startX, x), top: Math.min(startY, y), right: Math.max(startX, x), bottom: Math.max(startY, y) };
  }

  function rectsIntersect(a, b) {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  }

  const keyState = { space: false };
  window.addEventListener('keydown', (event) => {
    const target = event.target;
    const typing = target instanceof HTMLElement && target.matches('input,textarea,select');
    if (event.code === 'Space' && !typing) {
      keyState.space = true;
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => {
    if (event.code === 'Space') keyState.space = false;
  });

  function installContextMenu() {
    els.canvas.addEventListener('contextmenu', (event) => {
      const card = cardFromTarget(event.target);
      const path = cardPath(card);
      if (!path) return;

      // Let the browser show its native menu for copying selected source text.
      // Custom card actions remain available from the card header / non-text area.
      if (event.target.closest?.('.file-body, pre, code') && hasNativeTextSelectionInside(event.target)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      if (!state.selected.has(path)) selectOnly(path);
      showContextMenu(event.clientX, event.clientY, path);
    }, true);

    document.addEventListener('pointerdown', (event) => {
      if (!event.target.closest?.('#contextMenu')) hideContextMenu();
    });
  }


  async function copyCardText(path) {
    const selected = window.getSelection?.()?.toString?.() || '';
    const text = selected.trim()
      ? selected
      : (state.contentCache.get(path)?.content ?? state.fileByPath.get(path)?.content ?? getCard(path)?.querySelector('.file-body pre')?.textContent ?? '');
    if (!text) {
      toast('No text available to copy', true);
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast(selected.trim() ? 'Copied selected text' : 'Copied file text');
    } catch {
      toast('Clipboard copy failed', true);
    }
  }

  function showContextMenu(x, y, path) {
    const count = selectedPathsOr(path).length;
    els.contextMenu.innerHTML = `
      <button data-action="grid">Arrange ${count} selected in grid</button>
      <button data-action="select-all">Select all visible files</button>
      <button data-action="copy-text">Copy selected/file text</button>
      <div class="sep"></div>
      <button data-action="global-up">Increase global font</button>
      <button data-action="global-down">Decrease global font</button>
      <button data-action="file-up">Increase selected file font</button>
      <button data-action="file-down">Decrease selected file font</button>
      <button data-action="file-reset">Reset selected file font</button>
    `;
    els.contextMenu.hidden = false;
    els.contextMenu.style.left = `${Math.min(x, window.innerWidth - 240)}px`;
    els.contextMenu.style.top = `${Math.min(y, window.innerHeight - 260)}px`;
    els.contextMenu.onclick = (event) => {
      const action = event.target.closest('button')?.dataset?.action;
      if (!action) return;
      const targets = selectedPathsOr(path);
      if (action === 'grid') arrangeGrid(targets);
      if (action === 'select-all') selectAll();
      if (action === 'copy-text') void copyCardText(path);
      if (action === 'global-up') setGlobalFont(state.globalFont + 1);
      if (action === 'global-down') setGlobalFont(state.globalFont - 1);
      if (action === 'file-up') targets.forEach(p => setFileFont(p, getFileFont(p) + 1));
      if (action === 'file-down') targets.forEach(p => setFileFont(p, getFileFont(p) - 1));
      if (action === 'file-reset') targets.forEach(p => { localStorage.removeItem(fileFontKey(p)); setFileFont(p, state.globalFont); localStorage.removeItem(fileFontKey(p)); });
      hideContextMenu();
    };
  }

  function hideContextMenu() {
    els.contextMenu.hidden = true;
  }

  function selectAll() {
    state.selected = new Set(state.files.map(file => file.path));
    refreshSelection();
  }

  function installToolbar() {
    els.loadRepoBtn.addEventListener('click', () => loadRepo(els.repoPath.value, { sync: true }));
    els.repoPath.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') loadRepo(els.repoPath.value, { sync: true });
    });
    els.repoSelect.addEventListener('change', () => {
      const value = normalizeRepoPath(els.repoSelect.value);
      if (value) loadRepo(value, { sync: true });
    });
    els.gridBtn.addEventListener('click', () => arrangeGrid());
    els.selectAllBtn.addEventListener('click', selectAll);
    els.clearSelectionBtn.addEventListener('click', () => { state.selected.clear(); refreshSelection(); });
    els.globalFont.value = String(state.globalFont);
    els.globalFont.addEventListener('change', () => setGlobalFont(els.globalFont.value));
    els.viewport.addEventListener('scroll', () => {
      scheduleViewportUpdate();
      drawMinimap();
    }, { passive: true });
    window.addEventListener('resize', () => {
      scheduleViewportUpdate();
      drawMinimap();
    });

    els.canvas.addEventListener('click', (event) => {
      const btn = event.target.closest?.('button[data-action]');
      if (!btn) return;
      const card = cardFromTarget(btn);
      const path = cardPath(card);
      if (!path) return;
      if (btn.dataset.action === 'font-up') setFileFont(path, getFileFont(path) + 1);
      if (btn.dataset.action === 'font-down') setFileFont(path, getFileFont(path) - 1);
    });
  }


  async function initPretext() {
    try {
      // Served by server.ts when @chenglou/pretext is installed. This keeps the
      // app no-build and gracefully falls back if the package is unavailable.
      const mod = await import('/vendor/pretext/layout.js');
      state.pretext = mod;
      state.pretextReady = Boolean(mod?.prepare && mod?.layout);
    } catch {
      state.pretext = null;
      state.pretextReady = false;
    }
  }

  function drawMinimap() {
    const canvas = els.minimapCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cssW = canvas.clientWidth || 220;
    const cssH = canvas.clientHeight || 160;
    const dpr = window.devicePixelRatio || 1;
    const pxW = Math.max(1, Math.floor(cssW * dpr));
    const pxH = Math.max(1, Math.floor(cssH * dpr));
    if (canvas.width !== pxW || canvas.height !== pxH) {
      canvas.width = pxW;
      canvas.height = pxH;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    ctx.fillStyle = 'rgba(7, 10, 16, .92)';
    ctx.fillRect(0, 0, cssW, cssH);
    ctx.strokeStyle = 'rgba(148, 163, 184, .25)';
    ctx.strokeRect(.5, .5, cssW - 1, cssH - 1);

    if (!state.files.length) {
      state.minimap.bounds = null;
      return;
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const file of state.files) {
      const pos = state.positions[file.path] || defaultPosition(0);
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x + CARD_WIDTH);
      maxY = Math.max(maxY, pos.y + CARD_HEIGHT);
    }
    const pad = 12;
    const worldW = Math.max(1, maxX - minX);
    const worldH = Math.max(1, maxY - minY);
    const scale = Math.min((cssW - pad * 2) / worldW, (cssH - pad * 2) / worldH);
    const offsetX = pad - minX * scale + ((cssW - pad * 2) - worldW * scale) / 2;
    const offsetY = pad - minY * scale + ((cssH - pad * 2) - worldH * scale) / 2;

    state.minimap.scale = scale;
    state.minimap.offsetX = offsetX;
    state.minimap.offsetY = offsetY;
    state.minimap.bounds = { minX, minY, maxX, maxY, cssW, cssH };

    for (const file of state.files) {
      const pos = state.positions[file.path] || defaultPosition(0);
      const x = pos.x * scale + offsetX;
      const y = pos.y * scale + offsetY;
      const w = Math.max(2, CARD_WIDTH * scale);
      const h = Math.max(2, CARD_HEIGHT * scale);
      const selected = state.selected.has(file.path);
      const loaded = state.contentCache.has(file.path) || !file.isWorkingContent;
      ctx.fillStyle = selected ? 'rgba(196, 181, 253, .9)' : loaded ? 'rgba(56, 189, 248, .55)' : 'rgba(148, 163, 184, .34)';
      ctx.fillRect(x, y, w, h);
    }

    updateMinimapViewport(ctx);
  }

  function updateMinimapViewport(existingCtx = null) {
    const canvas = els.minimapCanvas;
    if (!canvas || !state.minimap.bounds) return;
    const ctx = existingCtx || canvas.getContext('2d');
    if (!ctx) return;
    if (!existingCtx) drawMinimap();

    const { scale, offsetX, offsetY } = state.minimap;
    const x = els.viewport.scrollLeft * scale + offsetX;
    const y = els.viewport.scrollTop * scale + offsetY;
    const w = els.viewport.clientWidth * scale;
    const h = els.viewport.clientHeight * scale;
    ctx.strokeStyle = 'rgba(255, 255, 255, .95)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, Math.max(4, w), Math.max(4, h));
  }

  function installMinimap() {
    const canvas = els.minimapCanvas;
    if (!canvas) return;

    const jump = (event) => {
      const rect = canvas.getBoundingClientRect();
      const scale = state.minimap.scale || 1;
      const x = (event.clientX - rect.left - state.minimap.offsetX) / scale;
      const y = (event.clientY - rect.top - state.minimap.offsetY) / scale;
      els.viewport.scrollLeft = Math.max(0, x - els.viewport.clientWidth / 2);
      els.viewport.scrollTop = Math.max(0, y - els.viewport.clientHeight / 2);
      scheduleViewportUpdate();
      drawMinimap();
    };

    canvas.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      state.minimap.dragging = true;
      canvas.setPointerCapture(event.pointerId);
      jump(event);
    });
    canvas.addEventListener('pointermove', (event) => {
      if (!state.minimap.dragging) return;
      event.preventDefault();
      jump(event);
    });
    const finish = (event) => {
      if (!state.minimap.dragging) return;
      state.minimap.dragging = false;
      try { canvas.releasePointerCapture(event.pointerId); } catch {}
    };
    canvas.addEventListener('pointerup', finish);
    canvas.addEventListener('pointercancel', finish);
  }

  window.addEventListener('popstate', () => {
    const repoPath = getRepoFromLocation();
    if (repoPath && repoPath !== state.repoPath) loadRepo(repoPath, { sync: false });
  });

  async function init() {
    await initPretext();
    installToolbar();
    installPointerInteractions();
    installContextMenu();
    installMinimap();
    setGlobalFont(state.globalFont);
    const routed = getRepoFromLocation();
    await populateRepos(routed);
    if (routed) {
      await loadRepo(routed, { replaceUrl: true, sync: true });
    }
  }

  init().catch(err => {
    console.error(err);
    toast(err.message || 'Failed to start GitMaps', true);
  });
})();
