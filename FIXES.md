# GitMaps fixed code bundle

This bundle was reconstructed from the uploaded project scan and patched for the requested behavior.

## Important source caveat

The uploaded scan did not include every source file from the original repo. Notably, some imported modules such as `app/lib/cards`, `app/lib/repo`, `app/lib/events`, `app/lib/connections`, `app/lib/hidden-files`, and the `packages/xydraw` / `packages/galaxydraw` sources were not present in the scan. I included all files that were available and added/modified the files needed for the requested behavior, but this zip is not guaranteed to be a fully runnable replacement for the original repository unless those missing files already exist in your working copy.

## URL repo loading

Local repo paths now have a durable URL form:

```txt
http://localhost:3335/~repo/%2Fabsolute%2Fpath%2Fto%2Frepo
```

Also supported:

```txt
http://localhost:3335/?repo=/absolute/path/to/repo
http://localhost:3335/%2Fabsolute%2Fpath%2Fto%2Frepo
```

The share-link helper now emits the durable `/~repo/<encoded path>` form.

## Commit behavior

`POST /api/repo/files` now returns diff hunks for a selected commit against its primary parent. It no longer returns full file content for historic commits. Root commits are diffed against Git's empty tree.

`__working__` still represents the current worktree and is now always shown by `/api/repo/load`, even when clean. The working-tree view returns hunks against `HEAD`; untracked files are represented as synthetic added-file hunks.

## File movement/layout behavior

Existing multi-select move/grid helpers were tightened:

- Grid arrange now defines its default card dimensions correctly.
- Row/column/grid saves width and height along with x/y.
- Pill multi-drag saves under the active commit/worktree key rather than always `allfiles`.

## Font sizing

Added `app/lib/font-size.ts`:

- no selected cards: `changeCardsFontSize(ctx, delta)` changes global code font size.
- selected cards: it changes/persists individual file font sizes.
- card rendering applies per-file font size overrides when available.

## Security/reliability fixes included

- Shared `path-safety.ts` prevents `..` and repo-prefix path escapes.
- File save/delete/rename/content routes use centralized safe path resolution.
- Clone routes now accept HTTPS git URLs only and restrict hosts by `GITMAPS_ALLOWED_GIT_HOSTS` or default hosts.
- Production repo root validation now uses `path.relative` instead of string prefix checks.
- OAuth callback no longer comma-joins multiple `Set-Cookie` headers.

## Patch 2 — reported local UI fixes

Applied after testing feedback:

- `?repo=C:\Code\game` is now read directly by the plain canvas loader via `app/lib/plain-canvas/route.ts`.
- Selecting an existing repo from the dropdown now calls `history.pushState()` and keeps the URL in sync as `/?repo=<encoded path>`.
- Current workdir now shows changed-file diffs against `HEAD`; it no longer streams and renders every full file first.
- Selecting a commit now renders that commit's git diff against its first parent in each card instead of loading full file content.
- The commit history count now excludes the virtual worktree item, and the timeline container is forced visible/scrollable.
- Left-drag on the empty canvas now marquee-selects cards instead of panning. Use Space-drag or middle mouse to pan.
- Ctrl/Meta/Shift-click selects multiple cards, and dragging one selected card header moves the whole selection.
- Right-click is handled on the whole card including the scrollable file body.
- The context menu now includes selected-file/global font-size controls.

Targeted TypeScript syntax check passed for `app/lib/plain-canvas/*.ts` with `tsc --noEmit`. A full project check still fails because several unrelated scan-reconstructed files contain syntax errors from the incomplete source scan.
