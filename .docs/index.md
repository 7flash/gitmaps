# GitMaps Docs Index

## Current Status
- Project: `gitmaps`
- Updated: `2026-05-25`
- Published npm version: `1.1.35`
- Goal: spatial code explorer with low-zoom previews, commit-vs-current diffs, and no inner file-card scroll panes

## What Changed Recently
- Right-click file actions are now settings-driven (JSON) and can run tools like `patch-resolve` per file type
- File-action output now opens in the same file preview modal flow, so users can review and copy output immediately
- File cards no longer use individual inner scroll areas
- Selected-commit mode now compares `selected commit -> current working tree`, not `parent(commit) -> commit`
- Placeholder-only low-zoom previews were fixed by streaming and consuming bounded `previewContent`
- Low-zoom previews now sample lines based on zoom level instead of trying to draw every line
- Port probing is explicit instead of silently falling back to random `tradjs` defaults

## Current Known Reality
- Local repo runtime is the most reliable validation path
- Published npm releases are working, but Bun can temporarily hold onto stale `bunx` cache state
- For browser verification during handoff, prefer a known clean local port from the repo runtime instead of assuming `bunx latest` is already uncached

## Handoff Priorities
1. Start the larger no-scroll virtual-sections rewrite.
2. Keep low-zoom rendering cheap by sampling/decimating text instead of reintroducing nested scroll containers.
3. Continue reducing large-repo DOM pressure and unnecessary rerendering.
4. Validate fresh `bunx gitmaps` behavior after cache propagation, not only local repo runs.

## PRDs
- [01-local-runtime-recovery.md](C:/Code/gitmaps/.docs/prds/01-local-runtime-recovery.md)
- [01-virtual-sections-no-scroll-canvas.md](C:/Code/gitmaps/.docs/prds/01-virtual-sections-no-scroll-canvas.md)
- [02-context-file-actions-and-preview.md](C:/Code/gitmaps/.docs/prds/02-context-file-actions-and-preview.md)

## Decisions (ADRs)
- [001-layout-corruption-recovery.md](C:/Code/gitmaps/.docs/decisions/001-layout-corruption-recovery.md)
- [002-notes-over-connections.md](C:/Code/gitmaps/.docs/decisions/002-notes-over-connections.md)
- [003-script-execution-via-bgrun.md](C:/Code/gitmaps/.docs/decisions/003-script-execution-via-bgrun.md)
- [004-file-actions-from-context-menu.md](C:/Code/gitmaps/.docs/decisions/004-file-actions-from-context-menu.md)

## Task Tracker
- [.docs/TASKS.md](C:/Code/gitmaps/.docs/TASKS.md)

## Key Source Links
- [cli.ts](C:/Code/gitmaps/cli.ts:1)
- [server.ts](C:/Code/gitmaps/server.ts:1)
- [app/api/repo/files/route.ts](C:/Code/gitmaps/app/api/repo/files/route.ts:1)
- [app/api/repo/tree/route.ts](C:/Code/gitmaps/app/api/repo/tree/route.ts:1)
- [app/lib/cards.tsx](C:/Code/gitmaps/app/lib/cards.tsx:1)
- [app/lib/low-zoom-preview.ts](C:/Code/gitmaps/app/lib/low-zoom-preview.ts:1)
- [app/lib/viewport-culling.ts](C:/Code/gitmaps/app/lib/viewport-culling.ts:1)
