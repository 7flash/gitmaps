/**
 * Recent Commits — tracks and displays recently loaded repositories.
 *
 * Shows the last few repos in the sidebar and keeps legacy localStorage
 * formats from older builds from breaking the UI.
 */

const STORAGE_KEY = "gitcanvas:recentRepos";
const MAX_REPOS = 5;

export interface RecentRepo {
  path: string;
  name: string;
  loadedAt: number;
  commitCount: number;
}

function normalizeRecentRepo(entry: any): RecentRepo | null {
  if (typeof entry === "string") {
    const trimmed = entry.trim();
    if (!trimmed || trimmed.includes("[object")) return null;
    return {
      path: trimmed,
      name: trimmed.split(/[\\/]/).pop() || trimmed,
      loadedAt: 0,
      commitCount: 0,
    };
  }

  if (entry && typeof entry === "object" && typeof entry.path === "string") {
    const path = entry.path.trim();
    if (!path || path.includes("[object")) return null;
    return {
      path,
      name: typeof entry.name === "string" && entry.name.trim()
        ? entry.name.trim()
        : path.split(/[\\/]/).pop() || path,
      loadedAt: Number.isFinite(entry.loadedAt) ? entry.loadedAt : 0,
      commitCount: Number.isFinite(entry.commitCount) ? entry.commitCount : 0,
    };
  }

  return null;
}

function dedupeRecentRepos(entries: RecentRepo[]): RecentRepo[] {
  const seen = new Set<string>();
  const result: RecentRepo[] = [];

  for (const entry of entries) {
    if (seen.has(entry.path)) continue;
    seen.add(entry.path);
    result.push(entry);
  }

  return result.slice(0, MAX_REPOS);
}

function persistRecentRepos(repos: RecentRepo[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(dedupeRecentRepos(repos)));
}

export function getRecentRepos(): RecentRepo[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const normalized = parsed
      .map(normalizeRecentRepo)
      .filter(Boolean) as RecentRepo[];

    const deduped = dedupeRecentRepos(normalized);

    // Self-heal old / malformed localStorage so future renders stay clean.
    if (JSON.stringify(parsed) !== JSON.stringify(deduped)) {
      persistRecentRepos(deduped);
    }

    return deduped;
  } catch {
    return [];
  }
}

export function addRecentRepo(path: string, commitCount: number = 0): void {
  const trimmedPath = path?.trim();
  if (!trimmedPath) return;

  const repos = getRecentRepos().filter((r) => r.path !== trimmedPath);
  const name = trimmedPath.split(/[\\/]/).pop() || trimmedPath;

  repos.unshift({
    path: trimmedPath,
    name,
    loadedAt: Date.now(),
    commitCount: Number.isFinite(commitCount) ? commitCount : 0,
  });

  persistRecentRepos(repos);
  renderRecentCommitsUI();
}

export function removeRecentRepo(path: string): void {
  const repos = getRecentRepos().filter((r) => r.path !== path);
  persistRecentRepos(repos);
  renderRecentCommitsUI();
}

function renderRecentReposList(): void {
  const section = document.getElementById("recentCommits");
  const list = document.getElementById("recentCommitsList");
  if (!list) return;

  const repos = getRecentRepos();

  if (section) {
    section.style.display = repos.length ? "block" : "none";
  }

  if (!repos.length) {
    list.innerHTML =
      '<div style="font-size:11px;color:var(--text-muted);padding:8px 0">No recent commits</div>';
    return;
  }

  list.innerHTML = repos
    .map(
      (repo) => `
        <button
          class="recent-commit-item"
          data-path="${escapeHtml(repo.path)}"
          title="${escapeHtml(repo.path)}"
          style="display:block;width:100%;text-align:left;background:none;border:none;color:inherit;padding:8px 0;cursor:pointer"
        >
          <div style="font-size:12px;font-weight:600;color:var(--text-primary)">${escapeHtml(repo.name)}</div>
          <div style="font-size:11px;color:var(--text-muted)">${repo.commitCount} commit${repo.commitCount === 1 ? "" : "s"} · ${formatTimeAgo(repo.loadedAt)}</div>
        </button>
      `,
    )
    .join("");

  Array.from(list.querySelectorAll("[data-path]")).forEach((item) => {
    item.addEventListener("click", async () => {
      const path = item.dataset.path;
      if (!path) return;

      try {
        const { getCanvasContext } = require("./context");
        const { loadRepository } = require("./repo");
        const ctx = getCanvasContext();
        if (!ctx) return;
        await loadRepository(ctx, path);
      } catch (err) {
        console.error("Failed to load recent repo", err);
      }
    });
  });
}

export function renderRecentCommitsUI(): void {
  renderRecentReposList();

  const pullBtn = document.getElementById("pullBtn") as HTMLButtonElement | null;
  if (!pullBtn || pullBtn.dataset.bound === "true") return;
  pullBtn.dataset.bound = "true";

  pullBtn.addEventListener("click", async () => {
    const { showToast } = require("./utils");
    const { getCanvasContext } = require("./context");
    const ctx = getCanvasContext();

    if (!ctx || !ctx.snap().context.repoPath) {
      showToast("No repository loaded", "error");
      return;
    }

    pullBtn.disabled = true;
    pullBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5">
        <circle cx="12" cy="12" r="10" strokeDasharray="30" strokeDashoffset="0">
          <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/>
        </circle>
      </svg>
      Pulling...
    `;

    try {
      const { loadRepository } = require("./repo");
      await loadRepository(ctx, ctx.snap().context.repoPath);
      showToast("Pulled latest commits", "success");
    } catch (err: any) {
      showToast(`Pull failed: ${err.message}`, "error");
    } finally {
      pullBtn.disabled = false;
      pullBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        Pull
      `;
    }
  });
}

function escapeHtml(str: string): string {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatTimeAgo(timestamp: number): string {
  if (!timestamp || !Number.isFinite(timestamp) || timestamp <= 0) return "Just now";

  const diff = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}
