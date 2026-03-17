/**
 * Recent Commits — tracks and displays recently loaded repositories
 *
 * Shows last 5 repos with pull button to refresh from remote.
 */

const STORAGE_KEY = "gitcanvas:recentRepos";
const MAX_REPOS = 5;

export interface RecentRepo {
  path: string;
  name: string;
  loadedAt: number;
  commitCount: number;
}

export function getRecentRepos(): RecentRepo[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    // Handle mixed formats: old entries may be plain strings
    return parsed
      .map((entry: any) => {
        if (typeof entry === 'string') {
          return {
            path: entry,
            name: entry.split(/[\\/]/).pop() || entry,
            loadedAt: 0,
            commitCount: 0,
          };
        }
        if (entry && typeof entry === 'object' && entry.path) {
          return {
            path: entry.path,
            name: entry.name || entry.path.split(/[\\/]/).pop() || entry.path,
            loadedAt: entry.loadedAt || 0,
            commitCount: entry.commitCount || 0,
          };
        }
        return null;
      })
      .filter(Boolean) as RecentRepo[];
  } catch {
    return [];
  }
}

export function addRecentRepo(path: string, commitCount: number): void {
  const repos = getRecentRepos();
  const name = path.split(/[\\/]/).pop() || path;

  // Remove if already exists
  const filtered = repos.filter((r) => r.path !== path);

  // Add to front
  filtered.unshift({
    path,
    name,
    loadedAt: Date.now(),
    commitCount,
  });

  // Trim to max
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(filtered.slice(0, MAX_REPOS)),
  );
}

export function removeRecentRepo(path: string): void {
  const repos = getRecentRepos();
  const filtered = repos.filter((r) => r.path !== path);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
}

export function renderRecentCommitsUI(): void {
  // Pull button is now in the History header — just wire it up
  const pullBtn = document.getElementById("pullBtn");
  if (pullBtn) {
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
        // Reload current repository
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
}

function escapeHtml(str: string): string {
  if (!str) return "";
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}
