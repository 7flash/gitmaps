# GitMaps Fixed Code v6

This version fixes the Workdir/current-tree behavior and Windows-style repo path handling reported after v5.

## What changed from v5

### 1. Workdir now renders the full current folder tree

The v5 Workdir path used Git file listing (`git ls-files`) for `__working__`. That can return only tracked/untracked-standard files and miss ignored/generated files, and in clean repos it can look like there is nothing to render.

v6 changes `app/api/repo/tree/route.ts` so:

- `commit === "__working__"` scans the folder tree directly.
- Real commits still use `git ls-tree` so historical commits show the files from that commit.
- The UI calls `/api/repo/tree` with `includeAll: true` for Workdir.
- Diffs are still overlaid from `/api/repo/files`, so changed files show diffs and unchanged files show a card with “No diff in this selection.”

### 2. Repo paths are canonicalized before loading

Added `app/api/repo/resolve-repo-path.ts`.

It accepts paths like:

- `C:/Code/geeksy`
- `C:\Code\geeksy`
- `/Users/me/project`
- `/home/me/project`
- subdirectories inside a repo

It resolves them through `git -C <path> rev-parse --show-toplevel` so passing a subfolder inside a repo still opens the repo root. If a folder is not a repo but contains exactly one child repo, it opens that child repo and reports that it corrected the path.

### 3. URL/input state uses the canonical repo root

If the API corrects the repo path, the frontend updates:

- the input field
- the dropdown
- the URL query string
- the repo status text

## Files changed in v6

- `app/api/repo/resolve-repo-path.ts` — new canonical path resolver
- `app/api/repo/load/route.ts` — uses canonical repo path and returns it
- `app/api/repo/tree/route.ts` — Workdir scans full folder tree
- `app/api/repo/files/route.ts` — uses canonical repo path
- `app/client/app.js` — sends `includeAll` for Workdir and updates URL/input with canonical repo root

## How to test

Run:

```bash
bun run dev
```

Open:

```text
http://localhost:3335/?repo=C:/Code/geeksy
```

Expected:

1. The input/URL should stay on or update to the canonical repo root.
2. The top History item is Workdir.
3. Selecting Workdir renders every file from the current folder tree, excluding common ignored directories like `.git`, `node_modules`, `dist`, `build`, `.next`, and coverage folders.
4. Changed files show diffs against `HEAD`.
5. Unchanged files still render as cards with “No diff in this selection.”
6. Selecting an actual commit renders that commit’s tracked files and overlays the diff from its parent.

## Note about `C:/Code/game`

If `C:/Code/game` still says “Not a valid git repository,” v6 will now distinguish that from “folder not found.” It means Git itself cannot find a repo at that folder or any parent. Open a terminal and check:

```bash
git -C C:/Code/game rev-parse --show-toplevel
```

If that command fails, GitMaps cannot load that folder as a repo. If `C:/Code/game` contains one nested child repo, v6 should automatically open that child repo.
