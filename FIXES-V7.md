# GitMaps Fixed Code v7

This patch changes the root standalone UI behavior to match the requested model:

- The repo path input is the source of truth; the repository dropdown is hidden.
- `?repo=C:/Code/game` and manually typed paths still load through `/api/repo/load`.
- The top `Current` / `Workdir` row now shows **all tracked Git files with full current file content**.
- Workdir no longer calls `/api/repo/files`, so a clean repo no longer renders `no changed files`.
- Historical commits still render **only the Git diff for that commit against its parent**.
- `/api/repo/tree` lists tracked Git files for Workdir using `git ls-files -z`; ignored/untracked files are intentionally skipped.

Note: this zip is still reconstructed from the uploaded project scan, so unrelated missing/truncated modules from the scan may remain incomplete.
