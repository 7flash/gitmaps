# Galaxy Canvas — Tasks

## ✅ Completed
- [x] 🟢 **Remote repo cloning** — Clone URL input + /api/repo/clone endpoint with shallow clone + caching
- [x] 🟢 **SaaS vs local mode** — /api/repo/mode detects NODE_ENV; SaaS hides local path picker
- [x] 🟡 **Clone UI styling** — Gradient clone button, status indicators, input styling

## 🟡 Improve
- [x] ~~🟡 **Position persistence per user**~~ — ✅ DONE. Migrated from server SQLite to localStorage keyed by `gitcanvas:positions:{repoPath}`. Debounced 300ms saves.
- [x] ~~🟡 **Clone progress streaming**~~ — ✅ DONE. `/api/repo/clone-stream` SSE endpoint spawns `git clone --progress` and streams phase-aware progress. Client shows animated progress bar.
- [x] ~~🟡 **Landing page improvement**~~ — ✅ DONE. Added animated grid background with pulsing lines, enhanced hero section with orbital icon, "Explore Popular Repositories" section with 6 curated repos (React, Deno, Svelte, Bun, Next.js, TailwindCSS). Click-to-clone on repo cards. Wired into existing clone flow via `events.tsx`.
- [x] ~~**Featured repos — dynamic stats**~~ — ✅ DONE. Star counts fetched from GitHub API at render time via `getFeaturedRepos()`. 5-minute server-side cache. Graceful fallback to hardcoded values if API unavailable.
- [x] ~~**Onboarding flow**~~ — ✅ DONE. Interactive tutorial highlighting canvas controls after first clone, using `app/lib/onboarding.tsx`.

## 🟢 Feature
- [x] ~~🟢 **User accounts**~~ — ✅ DONE. GitHub OAuth flow.
- [x] ~~🟢 **Shared repositories**~~ — ✅ DONE. Position storage dual-mode.
- [x] ~~🟢 **Import from GitHub API**~~ — ✅ DONE. Full modal UI with search, clone.
- [x] ~~**AI-powered code explanation**~~ — ✅ DONE. Click a file card and ask the AI about it. Sends file content + connections context to Gemini for architecture analysis.
- [x] ~~**Share canvas layouts**~~ — ✅ DONE. Export/import canvas state as a shareable URL parameters. Layout payloads are base64-encoded to share viewports, hidden files, card positions and sizes instantly.
- [x] ~~**Diff visualization on canvas**~~ — ✅ DONE. When navigating commits, show visual diffs directly on cards (added/removed lines highlighted in green/red).
- [x] ~~**Replayable Onboarding**~~ — ✅ DONE. Added a "?" button to the top toolbar that replays the interactive onboarding tour.
- [x] ~~**Local Drag-and-Drop**~~ — ✅ DONE. Support dragging a local directory drop to upload it mapping files to canvas without Git clone.
- [x] ~~**Canvas search / find**~~ — ✅ DONE. Upgraded `Ctrl+F` global search from simple path-matching to deep content-matching across all active files. Implemented inline snippet previews with highlighting and scroll-to-line navigation.
- [x] ~~**Commit tree visualization**~~ — ✅ DONE. Implemented a visual Git commit/branch graph overlay, replacing the simple standard commit dropdown menu for better project archaeology. Added topological lane sorting and SVG drawing inside the commit timeline.
- [x] ~~**Multi-select & bulk operations**~~ — ✅ DONE. Dragging a selection box over multiple cards brings up the Arrange toolbar. Bulk actions (collapse, resize) already work. Wired up "Explain with AI" to automatically ingest *only* the selected file cards into the AI context for batch processing.
- [x] ~~**File hover preview in zoomed-out mode**~~ — ✅ DONE. When zoomed out to pill/LOD mode (<35% zoom), hovering over a pill card shows a full-fidelity file card preview popup. The preview clones the exact card component (syntax highlighting, diff markers, status badges) and forces DOM rendering even when canvas-text mode is active. Debounced 180ms with smooth fade animation.
- [x] ~~**Inline file editing**~~ — ✅ DONE. Edit tab in file preview modal with textarea, Ctrl+S save via POST /api/repo/file-save, cursor tracking, modified/saved status indicators. Path traversal protection.

## 🟡 Open Tasks
- [x] ~~**File editing: syntax highlighting**~~ — ✅ DONE. CodeMirror 6 replaces textarea. Custom dark theme, language support for JS/TS/JSX/TSX/CSS/HTML/JSON/MD/Python/YAML. Line numbers, fold gutters, bracket matching, search, cursor tracking.
- [x] ~~**File editing: git integration**~~ — ✅ DONE. After saving, inline commit section slides in with pre-filled message, POST /api/repo/git-commit stages + commits, shows commit hash.
- [x] ~~**File editing: unsaved changes warning**~~ — ✅ DONE. Confirm dialog when closing modal or switching tabs with unsaved edits.
- [x] ~~**File editing: create new file**~~ — ✅ DONE. Ctrl+N opens dialog. Smart templates per extension. Auto-creates dirs and opens in edit mode.
- [x] ~~**File operations: delete file**~~ — ✅ DONE. Context menu "🗑️ Delete file" with confirmation dialogs. POST /api/repo/file-delete with optional git rm. Auto-cleans empty dirs. Removes card from canvas.
- [x] ~~**File operations: rename/move**~~ — ✅ DONE. Context menu "✏️ Rename / Move" with prompt. POST /api/repo/file-rename uses git mv (preserves history) with fs.rename fallback. Re-keys all internal maps.
- [x] ~~**Go-to-definition**~~ — ✅ DONE. Import paths in Full view are clickable (dashed underline). Click navigates to target file's card on canvas with green pulse highlight. Resolves relative paths with extension/index fallbacks. Ctrl+Click also works.
- [x] ~~**Code minimap in editor**~~ — ✅ DONE. Custom `ViewPlugin` minimap extension in `code-editor.ts`. 60px canvas-rendered minimap with heuristic syntax coloring (keywords/strings/comments/numbers), HiDPI support, draggable viewport indicator with purple accent, auto-updates on scroll/edit. Zero dependencies.
- [x] ~~**Multi-tab editor**~~ — ✅ DONE. Tab bar with file icons, names, close buttons. Ctrl+Tab/Ctrl+Shift+Tab cycling, middle-click close, scroll position per tab. Go-to-definition opens as new tab.
- [x] ~~**File breadcrumb navigation**~~ — ✅ DONE. Clickable directory segments in modal header. Click opens dropdown with sibling files/dirs. Drill into subdirs. Opens files as new tabs.
- [x] ~~**Git blame view**~~ — ✅ DONE. "Blame" tab with porcelain API. Color-coded authors, grouped commits, relative timestamps, author legend, cached data.
- [x] ~~**File diff between tabs**~~ — ✅ DONE. `tab-diff.ts` (210 lines) with LCS-based diff algorithm, side-by-side synced scroll, change markers (+/−), glassmorphic overlay. Auto-diffs 2 tabs, picker for 3+. "⇄ Diff" button in tab bar.
- [x] ~~**Symbol outline panel**~~ — ✅ Already existed. `symbol-outline.ts` (213 lines) extracts functions/classes/interfaces/types/enums from JS/TS/Python/CSS/JSON/Markdown. Rendered in file modal with color-coded icons and click-to-scroll.
- [x] ~~**Keyboard shortcuts overlay**~~ — ✅ Already existed. `shortcuts-panel.ts` implements `?` hotkey with glassmorphism cheat sheet.
- [x] ~~**Remove comment feature**~~ — ✅ DONE. Stripped pr-review.ts and all references from canvas-text.ts, page.client.tsx. Comment popups no longer interfere with connections.
- [x] ~~**URL routing: path-based**~~ — ✅ DONE. Changed from `#slug` hash to `/slug` path routing. Dynamic `[slug]/page.tsx` route. Legacy hash URLs auto-migrate. `popstate` replaces `hashchange`.
- [x] ~~**Remove SQLite tables**~~ — ✅ DONE. Deleted `/api/connections` and `/api/positions` SQLite routes. Connections now use localStorage keyed by repo path (`gitcanvas:connections:{repoPath}`).
- [x] ~~**Landing page: dimensional metaphor**~~ — ✅ DONE. Redesigned to tell the 4D story: 1D (Lines) → 2D (Canvas/transclusion) → 3D (Layers/z-axis) → Connections (knots) → 4D (Git/time). Plus "AI code review at scale" pitch section.
- [x] ~~**Default layer renamed**~~ — ✅ DONE. "All Files (Default)" → "Main". Context menu "Remove from Layer" → "↩ Move to Main".
- [x] ~~**Delete api/repo/browse**~~ — ✅ DONE. Unused endpoint removed.
- [x] ~~**File preview: 120-line limit**~~ — ✅ DONE. Preview popup now renders with `isExpanded=true` to show ALL lines, not just the first 120.

## 🔴 Priority: Fix
- [x] ~~**File preview: popup visibility**~~ — ✅ DONE. Root cause: cards in pill mode have `display:none`, cloning them produced zero-size popup. Added `display:block` to cloned card.
- [x] ~~**File preview: scrollable content**~~ — ✅ DONE. Popup stays stationary (no cursor-chasing), wheel events forwarded from viewport to popup when preview is visible.
- [x] ~~**Changed files panel empty**~~ — ✅ DONE. Fixed JSX Fragment rendering issue breaking `jsx-dom` render behavior, and wired up `ctx` injection correctly.
- [x] ~~**Connections creation UX**~~ — ✅ DONE. Restored missing Connections Panel to layout and added explicit `Alt+Click` instructional text to improve discoverability.
- [x] ~~**Wheel event hijacking**~~ — ✅ DONE. `onViewportWheel` in `file-preview.ts` used to intercept wheel events over pills; disabled it so two-finger trackpad panning on canvas works perfectly.
- [x] ~~**G hotkey overlaps in zoomed-out mode**~~ — ✅ DONE. Grid arrangement now accounts for `display: none` or short pill heights by defaulting to `580x700`.
- [x] ~~**Ctrl+A select all files**~~ — ✅ DONE. `events.tsx` natively selects all mounted DOM elements (`fileCards`) and all `deferredCards` within the active view.

## 🟡 Open Tasks
- [x] ~~**Migrate execAsync → Bun.$**~~ — ✅ DONE. Cleaned up `/api/repo/upload/route.ts` to use Bun's native shell execution.
- [x] ~~**Migrate child_process → Bun.spawn**~~ — ✅ DONE. `clone-stream` API now streams `git clone` progress natively through `Bun.spawn` and Web Streams.
- [x] ~~**Dependency graph view**~~ — ✅ DONE. File dependency visualization is fully implemented (force-directed layout, SVG edges with directionality, toggle shortcut). Optimized backend `/api/repo/imports` to use `Bun.file` for `HEAD`/working tree to avoid spawning 300 `git` processes concurrently, massively improving performance.
- [ ] **Production SaaS deploy** — Set up production deployment (Vercel/Fly.io/VPS). Currently only runs locally on port 3335.
- [x] ~~**Card groups: directory collapse**~~ — ✅ DONE. Refactored `card-groups.ts` to integrate smoothly with the new virtualized `CardManager` (`galaxydraw-bridge`). Fixed persistence to use the repo path instead of the empty URL hash. Materialized deferred cards correctly respect their collapsed state.
- [x] ~~**Rename galaxydraw → xydraw**~~ — ✅ DONE. Renamed app bridge/tests/CSS/package references to `xydraw`, updated local test paths, and cleaned debug artifacts from git tracking.
- [x] ~~**Repo load progress: total + remaining counts**~~ — ✅ DONE. Loading overlay now shows Total / Loaded / Remaining stats plus a clearer progress label while streaming repository files.
- [x] ~~**Root route should stay placeholder**~~ — ✅ DONE. Visiting `/` now explicitly resets canvas state and shows the landing page instead of keeping the last loaded repo visible.
- [x] ~~**Remove replay tutorial entrypoint**~~ — ✅ DONE. Removed the toolbar tutorial button and its click handler so onboarding no longer pops back into the normal workflow.
- [x] ~~**Repo load progress: render phase counts**~~ — ✅ DONE. Loading overlay now keeps file totals visible into the commit-diff/finalizing phase instead of degrading to a bare percentage.
- [x] ~~**Canonical repo slug from remote**~~ — ✅ DONE. Local repos now prefer their GitHub `owner/repo` remote slug in the URL when an origin remote is available.
- [x] ~~**Loading-state visibility polish**~~ — ✅ DONE. Sticky zoom `100%` is now hidden during landing/loading states, and commit-diff progress shows indexed file counts so users see meaningful loading info instead of ambiguous percentages.
- [x] ~~**Root route UI reset polish**~~ — ✅ DONE. Returning to `/` now clears commit/file counters, commit header, timeline state, changed-files panel, commit progress bar, and status bar labels.
- [x] ~~**Root route actor state reset**~~ — ✅ DONE. Added `RESET_APP_STATE` to the XState machine and dispatch it when returning to `/`, so internal repo/commit state now matches the cleared landing UI.
- [x] ~~**Landing reset: clear multi-repo registry**~~ — ✅ DONE. Returning to `/` now clears loaded repo tabs/zone labels and resets hidden multi-repo workspace bookkeeping.
- [x] ~~**Non-GitHub remote slug support**~~ — ✅ DONE. Canonical remote slug detection now parses HTTPS/SSH forge remotes generically and derives a router-safe `owner/repo` slug for GitLab, Codeberg, and compatible self-hosted forges.
- [x] ~~**Landing reset: clear recent active repo affordances**~~ — ✅ DONE. Landing reset now clears repo-specific toggle/panel affordances including changed-files persistence, connections toggle state, hidden-file badge, connections panel, and arrange toolbar visibility.
- [x] ~~**Deep forge namespace routing**~~ — ✅ DONE. Canonical forge slug extraction now preserves full namespace depth (up to 5 segments), and GitMaps ships matching deeper dynamic routes so nested forge group paths can round-trip cleanly.
- [x] ~~**Canonical slug verification in UI**~~ — ✅ DONE. Status bar now shows a visible `↗ slug` badge when a canonical remote slug is detected, and repo loads log the slug mapping in the console.
- [x] ~~**Catch-all route support in Melina**~~ — ✅ DONE. Melina router now supports `[...slug]`, and GitMaps now uses a real catch-all route instead of fixed-depth namespace page files.
- [x] ~~**Canonical slug source details**~~ — ✅ DONE. Status bar slug badge now includes source details in its tooltip, and console logs include forge host / remote URL context for slug detection.
- [x] ~~**Route cleanup: single dynamic strategy**~~ — ✅ DONE. Removed the legacy `[slug]` page so GitMaps now relies on a single catch-all dynamic route for repo slugs.
- [x] ~~**Slug detection tests**~~ — ✅ DONE. Added focused backend tests for HTTPS/SSH forge remotes, deep namespace handling, helper path filtering, invalid segments, and source metadata extraction in `app/api/repo/load/route.test.ts`.
- [x] ~~**Catch-all route verification tests**~~ — ✅ DONE. Added app-level routing tests using Melina's router to prove GitMaps resolves both single-segment and deep namespace slugs through `[...slug]`, while static routes still win.
- [x] ~~**Canonical slug source UX polish**~~ — ✅ DONE. Status bar now shows inline source context for canonical slugs (for example `↗ owner/repo · via github.com`) while preserving the full tooltip details.
- [x] ~~**Canonical slug badge interactions**~~ — ✅ DONE. Clicking the status-bar slug badge now copies the canonical slug, and Shift+Click copies the slug plus its source mapping.
- [x] ~~**Canonical slug badge popover**~~ — ✅ DONE. Clicking the slug badge now opens a small popover showing the canonical route, remote host, and full remote URL, with explicit copy buttons for slug/source/both.
- [x] ~~**Canonical slug badge keyboard access**~~ — ✅ DONE. The slug badge is now a real button with Enter/Space activation, ArrowDown open behavior, focus-visible styling, popover focus management, arrow-key cycling, and Escape-to-close focus restore.
- [x] ~~**Canonical slug badge a11y tests**~~ — ✅ DONE. Added focused DOM tests for Enter/Space and ArrowDown open behavior, Escape-to-close with focus restore, and keyboard cycling between slug popover controls using a headless DOM harness.
- [x] ~~**Build commit badge reflects running version**~~ — ✅ DONE. Replaced the stale hardcoded corner badge with a runtime build-info API fetch and moved the visible build commit badge to the top-right corner.
- [x] ~~**Recent commits sidebar shows undefined / NaN metadata**~~ — ✅ DONE. Normalized legacy `gitcanvas:recentRepos` entries, restored list rendering, and added focused DOM tests so malformed localStorage no longer produces `undefined commits · NaNd ago` rows.
- [x] ~~**Use local Melina during framework work**~~ — ✅ DONE. GitMaps now points at `file:../melina.js` so local router/render fixes actually affect the running app during development.
- [x] ~~**Repo load + low-zoom pill mode regression**~~ — ✅ DONE. Fixed corrupted layout JSX, restored canonical slug handling + loading overlay message import in `app/lib/repo.tsx`, and stopped CardManager materialization from mounting full cards while low-zoom pill mode is active.
- [x] ~~**Virtual files compression via transclusion**~~ — ✅ DONE. Replaced the broken fetch-based prototype with a real in-memory transclusion pipeline using already-loaded tree content, deterministic virtual-card placement beside source files, cleanup on canvas rerenders, and post-render generation so commit selection no longer wipes the cards.
- [x] ~~**Transclusion UX/threshold tuning**~~ — ✅ DONE. Tightened prefix heuristics, excluded style/layout/docs/test/dist noise from candidate ranking, weighted real source files higher, and reduced visual spam so transclusion cards now target meaningful logic files.
- [x] ~~**Transclusion interactions**~~ — ✅ DONE. Virtual cards now show better source-file/line context and clicking a transclusion card jumps/highlights the source file using the shared canvas navigation path.
- [x] ~~**Repo-load + transclusion smoke test**~~ — ✅ DONE. Added `app/lib/transclusion-smoke.test.ts` using happy-dom to verify transclusion card generation plus click-to-source navigation/highlight behavior, and wired it into the test script.
- [x] ~~**Status bar DOM test harness cleanup**~~ — ✅ DONE. Added shared `app/lib/test-dom.ts` happy-dom setup helpers and migrated status-bar, recent-commits, and transclusion smoke tests to the reusable harness.
- [x] ~~**Transclusion smoke coverage for slug hydration**~~ — ✅ DONE. Extended `app/lib/transclusion-smoke.test.ts` to assert `/gitmaps` slug-route bootstrap assumptions alongside transclusion render and click-to-source behavior.
- [x] ~~**Router contract tests across repos**~~ — ✅ DONE. Added reusable catch-all routing contract helpers plus a tiny fixture app in `app/lib/test-fixtures/router-contract/`, and verified the same contract against the real GitMaps app routes.
- [x] ~~**Repo loading overlay smoke test**~~ — ✅ DONE. Added `app/lib/loading.test.ts` covering streamed file-count progress, indexed-file commit-diff messaging, and clean overlay teardown.
- [x] ~~**User journey smoke tests**~~ — ✅ DONE. Added repo-picker coverage in `app/lib/repo-select.test.ts`, recent-repo click-through coverage in `app/lib/recent-commits.test.ts`, landing-shell assertions in `app/lib/landing-shell.test.ts`, and GitHub import modal/search coverage in `app/lib/github-import.test.ts`.
- [x] ~~**Route contract noise cleanup**~~ — ✅ DONE. `app/lib/router-contract.ts` now suppresses route-discovery measurement logs during routing tests so failures show only the relevant assertions.
- [x] ~~**GitHub import clone-path smoke coverage**~~ — ✅ DONE. `app/lib/github-import.test.ts` now covers direct URL Enter-triggered clone flow plus repo-card clone-button flow, asserting clone-stream requests, modal close, and clone status UI without live SSE dependencies.
- [x] ~~**DOM test harness parity cleanup**~~ — ✅ DONE. Expanded `app/lib/test-dom.ts` to expose common browser globals (`Element`, `CustomEvent`, form element classes, `DOMRect`, `MutationObserver`, `ResizeObserver`, `getComputedStyle`, etc.) and clean them up between tests.
- [x] ~~**GitHub import SSE completion smoke coverage**~~ — ✅ DONE. `app/lib/github-import.test.ts` now covers cached JSON success, SSE `done`, and SSE `error` clone-stream outcomes using synthetic responses.
- [ ] **Routing helper extraction upstream** — Consider moving the test-time route-discovery log suppression into Melina or a shared test utility so multi-repo routing tests stay consistent.
- [x] ~~**Shared canvas context lifecycle cleanup**~~ — ✅ DONE. Fixed `createCanvasContext()` registration, wired `page.client.tsx` mount/cleanup to set and clear the shared context consistently, and added `app/lib/context.test.ts` regression coverage.
- [ ] **DOM harness helper ergonomics** — Add optional helpers for common globals like `window.open`, `fetch`, and observer stubs so new UI smoke tests need less repetitive setup.
- [x] ~~**Clone completion flow isolation**~~ — ✅ DONE. GitHub import clone completion now hands off through a small helper in `app/lib/events.tsx`, allowing tests to inject `ctx.onRepoReady` instead of depending on real repo-load side effects.
- [x] ~~**Context source unification**~~ — ✅ DONE. `app/lib/sync-controls.tsx` now reads the shared canvas context via `app/lib/context.ts` instead of `window.__GITCANVAS_CTX__`, with focused regression coverage in `app/lib/sync-controls.test.ts`.
- [ ] **Repo-load handoff helper reuse** — Consider reusing the clone completion handoff helper in other repo-entry flows so navigation/load triggers share the same seam for tests.
- [ ] **Window context global removal** — Audit whether `window.__GITCANVAS_CTX__` is still needed anywhere; remove it if no remaining runtime consumers need that legacy access path.
- [ ] **Repo load smoke path via browser-tools scripts** — Add a small repeatable helper flow for loading a known local repo through the browser-tools harness so route hydration and canvas bootstrap can be checked without manual clicking.
- [ ] **Recent repos click-through test** — Add a DOM/integration test that verifies clicking a recent repo entry reloads the repo instead of only rendering metadata.
- [x] ~~**Repo switch race can restore previous repo after dropdown change**~~ — ✅ DONE. Hardened `app/lib/repo.tsx` so only the newest `loadRepository()` request may mutate UI/state; stale in-flight loads are ignored instead of overwriting a newer repo switch.
- [x] ~~**Large repo load path could stall or leave stale canvas state**~~ — ✅ DONE. Removed the `renderAllFilesOnCanvas()` early-return for `>=500` files, stopped `fitAllFiles()` from unculling/materializing every deferred card, and skipped initial commit-diff rendering for very large repos so repos like `epstein-files` can load without immediately choking the DOM.
- [x] ~~**Fresh-session slug route fails for already-known repos**~~ — ✅ DONE. Added `/api/repo/resolve-slug` that scans cloned repos for matching remote slugs, and client now tries resolution before falling through to clone.
- [x] ~~**Binary-heavy repo loading stalls at 85%**~~ — ✅ DONE. Root cause: tree endpoint read all non-binary files synchronously with no size limit, blocking the stream on large repos. Fix: skip reading content for files >2MB, get binary file sizes via `Bun.file()`, and increase client fetch timeout from 60s to 300s.
- [x] ~~**PDF rendering on canvas cards**~~ — ✅ DONE. PDF files now render as image thumbnails on canvas cards via `/api/repo/pdf-thumb` endpoint using `pdftoppm` (poppler-utils) or ImageMagick with graceful fallback. Cards show the first page as a preview image with lazy loading.
- [ ] **PDF multi-page navigation** — Add page controls to PDF card previews so users can browse beyond the first page.
- [ ] **Install poppler-utils in Dockerfile** — Add `pdftoppm` to the production Docker image so PDF thumbnails work in deployed environments.

## 🔴 Priority: Performance
- [x] ~~**Canvas/WebGL text rendering**~~ — ✅ DONE. Developed `CanvasTextRenderer` to bypass DOM spans for file cards > 10,000 lines. The renderer uses virtualization to achieve stable 60 FPS panning even during large diff highlights, preserving styles and background layouts.
- [x] ~~**Viewport culling**~~ — ✅ DONE. 94% DOM reduction during normal pan/zoom.

## 🟡 Improve
- [x] ~~**Performance measurement dashboard**~~ — ✅ DONE. Live FPS with sparkline graph, DOM count, zoom %, heap memory.
- [x] ~~**Connection rendering performance**~~ — ✅ DONE. rAF coalescing.
- [x] ~~**Folding state persistence**~~ — ✅ DONE. Unified expanded state into positions system.
- [x] ~~**Minimap: update on card drag**~~ — ✅ DONE. Added `forceMinimapRebuild()` call after card/pill drag ends in both `cards.tsx` and `viewport-culling.ts`.
- [x] ~~**Minimap: proper rectangles for pills**~~ — ✅ DONE. Fixed fallback height from 200→700 when cards are hidden in pill mode.
- [x] ~~**Layer bar: show active layer**~~ — ✅ DONE. Non-active layers hidden when not hovered; active layer always visible.
- [x] ~~**G/H/V hotkeys in pill mode**~~ — ✅ DONE. Fixed `.file-card-pill` → `.file-pill` selector mismatch in `card-arrangement.ts`.
- [x] ~~**Search: jump to file instead of editor**~~ — ✅ DONE. Clicking a search result navigates to the card on canvas (with layer switch) and scrolls to the matching line.
- [x] ~~**Search: persist state**~~ — ✅ DONE. Panel hides instead of destroying on result click, restoring query/results when reopened.

## 📌 Future Ideas
- [ ] 🟢 **Shared layout sessions** — Replace current cursor tracking (broken: each user has own layout). Instead: share a link with unique session ID → recipients join read-only view of your layout.

## 📝 Architecture Notes
- **Dev server**: `bgrun --name gitmaps` on port 3335
- **Client orchestrator**: `app/page.client.tsx` → imports modules from `app/lib/`
- **State**: XState machine in `app/state/machine.js`
- **Canvas**: Direct DOM manipulation for performance (no VDOM for file cards)
- **Landing page**: `app/page.tsx` (server-rendered), styles in `app/globals.css`
- **Rendering**: Viewport culling + line-limiting for large files, VISIBLE_LINE_LIMIT=120
- **URL routing**: Path-based (`/slug`) with `[slug]/page.tsx` dynamic route. Legacy `#slug` auto-migrates.
- **Storage**: All client state in localStorage (positions, connections, layers, hidden files)
