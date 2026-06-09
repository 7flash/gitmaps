# FIXES V9

This patch fixes the Workdir/Current behavior in both render paths.

## Intended behavior

- Workdir / Current renders **all tracked Git files** (`git ls-files`).
- Workdir / Current renders **full current file content**, not diffs.
- A clean repo must never show “no changed files” as the whole canvas state.
- Historical commits still render **only the diff for that commit against its parent**.

## What changed

### `app/api/repo/files/route.ts`

`commit === "__working__"` now returns every tracked file as a full-content/snapshot file record instead of returning only changed files. This is a compatibility fallback for any older UI code that still asks `/api/repo/files` for Workdir.

The file records intentionally omit `hunks`, so card renderers treat them as normal source files and call `/api/repo/file-content` to load full text.

Historical commits are unchanged: they still return commit diffs only.

### `app/lib/plain-canvas/app.ts`

The older plain-canvas code path now calls `/api/repo/tree` via `streamTree()` when Workdir is selected. It streams every tracked Git file and forces full-content loading by removing `previewContent`/`hunks` from each Workdir card.

The old message:

```text
Working tree is clean — no changed files to show.
```

was removed.

### `app/client/app.js`

The standalone v8 path already used `/api/repo/tree` for Workdir. It remains compatible with this patch.

## Test manually

Open a clean repo:

```text
http://localhost:3335/?repo=C:/Code/geeksy
```

Select `Current` / `Workdir`.

Expected:

- The canvas shows cards for all tracked files.
- Visible cards lazy-load full source text.
- It does not say “no changed files.”

Select a historical commit.

Expected:

- The canvas shows only files changed by that commit.
- Cards show diffs against that commit's parent.
