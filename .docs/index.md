# GitMaps Docs Index

## Current Status
- Project: `gitmaps`
- Updated: `2026-05-21`
- Goal: local spatial Git/code explorer running on `http://localhost:3335`

## Current Findings
- The cloned repo did not run out of the box.
- Dependency wiring was broken:
  - `tradjs` pointed at `link:../melina.js`, which Bun resolved through a global link instead of the local repo.
  - `xydraw@0.2.0` was wired as a workspace-only/root dependency even though GitMaps uses bundled relative imports, which broke `bunx` package-style execution.
- Two source files in upstream `HEAD` are truncated and cause syntax errors:
  - `app/lib/export-canvas.ts`
  - `app/lib/onboarding-tutorial.ts`

## Active Work
- Switch `tradjs` dependency to a stable local `file:` reference.
- Publish against npm `tradjs` and remove the unnecessary root `xydraw` dependency so the packaged CLI can install cleanly from npm.
- Repair the truncated source files with minimal complete implementations.
- Run `bun install`, `bun run dev`, and verify `http://localhost:3335`.

## Next Steps
- Finish local boot validation on port `3335`.
- Smoke-test the main canvas route and one repo load.
- If other runtime issues remain, document them in `.docs/TASKS.md`.
