# GitMaps fixed v4

This version stops relying on the partially reconstructed TradJS root page from the scan and serves a self-contained root app from `app/client/*`.

## Start

```bash
bun install
bun run dev
```

Open any of these:

```text
http://localhost:3335/?repo=C:\Code\game
http://localhost:3335/?repo=C%3A%5CCode%5Cgame
http://localhost:3335/~repo/C%3A%5CCode%5Cgame
http://localhost:3335/?repo=/Users/you/Code/game
```

## Fixed behavior

- Query-string repo paths like `?repo=C:\Code\game` are loaded on initial page load.
- Selecting a repo from the dropdown updates the URL to `/?repo=<encoded path>`.
- History shows actual commits as clickable rows, not just a count.
- `Current` / workdir shows the git diff against `HEAD`.
- Selecting a normal commit shows that commit's diff against its first parent.
- File cards render diffs only, not full file contents.
- Cards have independently scrollable bodies.
- Left-drag on empty canvas marquee-selects files.
- Ctrl/Meta/Shift-click toggles multi-selection.
- Dragging a selected card header moves all selected cards.
- `Grid` arranges selected cards, or all cards if nothing is selected.
- Right-click on any card/body opens a context menu.
- Global font size and per-file font size persist in localStorage.

## Files changed/added in v4

- `server.ts` replaced with a standalone Bun server that dispatches `/api/*` to existing route files and serves the root SPA for all non-API paths.
- `app/client/index.html` added.
- `app/client/styles.css` added.
- `app/client/app.js` added.
- Existing fixed API route `app/api/repo/files/route.ts` is retained so commit views are diffs against the previous commit.

## Why this is different from v2/v3

The uploaded scan did not include the root page that renders the real app shell. Earlier zips patched helper modules, but the running UI was still missing the direct root-page wiring. v4 makes root loading explicit and self-contained.
