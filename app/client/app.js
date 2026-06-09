(() => {
  'use strict';

  const WORKING = '__working__';
  const RECENT_KEY = 'gitmaps:v5:recentRepos';
  const GLOBAL_FONT_KEY = 'gitmaps:v5:font:global';
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
  };

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
    return `gitmaps:v5:positions:${state.repoPath}:${state.currentCommit}`;
  }

  function loadPositions() {
    try { state.positions = JSON.parse(localStorage.getItem(positionKey()) || '{}') || {}; }
    catch { state.positions = {}; }
  }

  function savePositions() {
    localStorage.setItem(positionKey(), JSON.stringify(state.positions));
  }

  function fileFontKey(path) {
    return `gitmaps:v5:font:file:${state.repoPath}:${path}`;
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
    els.canvas.innerHTML = '<div class="empty-state">Loading repository files and commit diffs…</div>';

    try {
      const [treeData, diffData] = await Promise.all([
        postJson('/api/repo/tree', { path: state.repoPath, commit: hash, includeAll: hash === WORKING }),
        postJson('/api/repo/files', { path: state.repoPath, commit: hash }),
      ]);
      state.allFiles = Array.isArray(treeData?.files) ? treeData.files : [];
      const diffFiles = Array.isArray(diffData?.files) ? diffData.files : [];
      state.changedFileCount = diffFiles.length;
      state.files = mergeTreeAndDiffs(state.allFiles, diffFiles);
      renderFiles();
      const active = els.commitList.querySelector(`[data-hash="${CSS.escape(hash)}"]`);
      active?.scrollIntoView({ block: 'nearest' });
      toast(`Rendered ${state.files.length} files · ${state.changedFileCount} changed`);
    } catch (err) {
      console.error(err);
      els.canvas.innerHTML = `<div class="error-state">${escapeHtml(err.message)}</div>`;
      toast(`Failed to load files/diff: ${err.message}`, true);
    }
  }

  function defaultPosition(index) {
    const cols = 3;
    const gapX = 560;
    const gapY = 500;
    return { x: 40 + (index % cols) * gapX, y: 40 + Math.floor(index / cols) * gapY };
  }

  function resizeCanvasToFit(count) {
    const cols = 3;
    const rows = Math.max(1, Math.ceil((count || 1) / cols));
    const width = Math.max(5200, 80 + cols * 560);
    const height = Math.max(3600, 80 + rows * 500);
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
    if (!state.files.length) {
      els.canvas.innerHTML = '<div class="empty-state">No files found in this repository/commit. Workdir scans the folder tree; commits show files tracked by that commit.</div>';
      return;
    }

    resizeCanvasToFit(state.files.length);
    state.files.forEach((file, index) => {
      const pos = state.positions[file.path] || defaultPosition(index);
      const card = document.createElement('article');
      card.className = 'file-card';
      card.dataset.path = file.path;
      card.style.left = `${pos.x}px`;
      card.style.top = `${pos.y}px`;
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
        <section class="file-body">${renderDiff(file)}</section>
      `;
      els.canvas.appendChild(card);
    });
    refreshSelection();
  }

  function renderDiff(file) {
    if (file.contentError) return `<div class="error-state">${escapeHtml(file.contentError)}</div>`;
    if (!file.isChanged && file.status === 'unchanged') {
      const meta = [];
      if (file.ext) meta.push(`.${file.ext}`);
      if (Number.isFinite(file.size) && file.size > 0) meta.push(`${file.size} bytes`);
      if (file.lines) meta.push(`${file.lines} lines`);
      return `<div class="unchanged-note"><strong>No diff in this selection.</strong><br>${escapeHtml(meta.join(' · ') || 'File exists in this repo/commit.')}</div>`;
    }
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
    return '<div class="empty-state">No textual diff for this file.</div>';
  }

  function getCard(path) {
    return els.canvas.querySelector(`.file-card[data-path="${CSS.escape(path)}"]`);
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
    for (const card of els.canvas.querySelectorAll('.file-card')) {
      card.classList.toggle('selected', state.selected.has(card.dataset.path));
    }
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
      const pos = { x: 40 + (index % cols) * 560, y: 40 + Math.floor(index / cols) * 500 };
      state.positions[path] = pos;
      const card = getCard(path);
      if (card) {
        card.style.left = `${pos.x}px`;
        card.style.top = `${pos.y}px`;
      }
    });
    savePositions();
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
      event.preventDefault();
      event.stopPropagation();
      if (!state.selected.has(path)) selectOnly(path);
      showContextMenu(event.clientX, event.clientY, path);
    }, true);

    document.addEventListener('pointerdown', (event) => {
      if (!event.target.closest?.('#contextMenu')) hideContextMenu();
    });
  }

  function showContextMenu(x, y, path) {
    const count = selectedPathsOr(path).length;
    els.contextMenu.innerHTML = `
      <button data-action="grid">Arrange ${count} selected in grid</button>
      <button data-action="select-all">Select all visible files</button>
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

  window.addEventListener('popstate', () => {
    const repoPath = getRepoFromLocation();
    if (repoPath && repoPath !== state.repoPath) loadRepo(repoPath, { sync: false });
  });

  async function init() {
    installToolbar();
    installPointerInteractions();
    installContextMenu();
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
