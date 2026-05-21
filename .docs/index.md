# GitMaps Docs Index

## Current Status
- Project: `gitmaps`
- Updated: `2026-05-21`
- Goal: local spatial Git/code explorer that prefers `http://localhost:3335` when requested, but otherwise can boot on any available port

## Current Findings
- The cloned repo did not run out of the box.
- The CLI previously hard-forced port `3335`, which caused immediate startup failure if that port was already in use.
- Dependency wiring was broken:
  - `tradjs` pointed at `link:../melina.js`, which Bun resolved through a global link instead of the local repo.
  - `xydraw@0.2.0` was wired as a workspace-only/root dependency even though GitMaps uses bundled relative imports, which broke `bunx` package-style execution.
- Two source files in upstream `HEAD` are truncated and cause syntax errors:
  - `app/lib/export-canvas.ts`
  - `app/lib/onboarding-tutorial.ts`

## Active Work
- Switch `tradjs` dependency to a stable local `file:` reference.
- Publish against npm `tradjs` and remove the unnecessary root `xydraw` dependency so the packaged CLI can install cleanly from npm.
- Let the CLI fall back to any available port unless `--port` is explicitly provided.
- Repair the truncated source files with minimal complete implementations.
- Run `bun install`, `bun run dev`, and verify startup both with an explicit port and with auto-port fallback.

## Next Steps
- Finish local boot validation on port `3335`.
- Smoke-test the main canvas route and one repo load.
- If other runtime issues remain, document them in `.docs/TASKS.md`.
