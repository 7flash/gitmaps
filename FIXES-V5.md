# GitMaps fixed code v5

This version fixes the v4 behavior where the standalone UI only rendered changed files.

## v5 changes

- The UI now calls both:
  - `POST /api/repo/tree` to get every file for the selected repo/commit.
  - `POST /api/repo/files` to get the selected commit/workdir diff.
- The canvas merges both lists:
  - Changed files render first and show only the git diff hunks.
  - Unchanged files still render as movable/selectable cards with an `unchanged` badge and no full file content.
  - Deleted files that are not present in the selected commit tree still render as diff-only cards.
- `/api/repo/tree` now accepts `commit`:
  - `commit: "__working__"` lists current tracked + untracked files.
  - Any real commit hash lists files from that commit via `git ls-tree`.
- The canvas dynamically grows in height so files beyond the first few rows are scrollable.

## Usage

```bash
bun install
bun run dev
```

Open a repo directly:

```text
http://localhost:3335/?repo=C:\Code\game
```

## Notes

This zip is still reconstructed from the uploaded project scan. Some original app modules were missing/truncated in the scan, so the standalone root app in `app/client` is the reliable path. Apply these files over your real repo if you want to preserve original modules.
