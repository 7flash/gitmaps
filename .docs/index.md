# GitMaps Docs Index

## Current Status
- Project: `gitmaps`
- Updated: `2026-05-21`
- Goal: local spatial Git/code explorer that probes from `http://localhost:3335` upward and picks the first free port

## Current Findings
- The cloned repo did not run out of the box.
- The CLI previously hard-forced port `3335`, then later delegated too much to `tradjs` and could fall back to `3000` unexpectedly.
- Preview surfaces could still get stuck on placeholder text because two paths were incomplete:
  - the repo tree stream only emitted bounded `previewContent` for a narrow subset of text files
  - file cards ignored `previewContent` and only rendered inline code after a full file-content fetch
- Dependency wiring was broken:
  - `tradjs` pointed at `link:../melina.js`, which Bun resolved through a global link instead of the local repo.
  - `xydraw@0.2.0` was wired as a workspace-only/root dependency even though GitMaps uses bundled relative imports, which broke `bunx` package-style execution.
- Two source files in upstream `HEAD` are truncated and cause syntax errors:
  - `app/lib/export-canvas.ts`
  - `app/lib/onboarding-tutorial.ts`

## Active Work
- Switch `tradjs` dependency to a stable local `file:` reference.
- Publish against npm `tradjs` and remove the unnecessary root `xydraw` dependency so the packaged CLI can install cleanly from npm.
- Let GitMaps itself probe from `3335` upward unless `--port` is explicitly provided.
- Stream bounded inline preview text with tree metadata so visible cards can render real content immediately instead of permanent placeholders.
- Render streamed `previewContent` directly inside file cards so cards stop waiting on explicit file-content fetches just to show code.
- Remove card-body inner scroll behavior and render full file text directly in cards.
- Change selected-commit rendering from `parent(commit) -> commit` to `commit -> current working state`.
- Repair the truncated source files with minimal complete implementations.
- Run `bun install`, `bun run dev`, and verify startup both with an explicit port and with auto-port fallback.

## Next Steps
- Finish `bunx gitmaps` validation once npm `latest` points at the fixed release.
- Verify the repo-open path in the browser now renders real preview text instead of placeholder-only cards, both in normal cards and low-zoom previews.
- Verify selected-commit mode now shows a live diff from the chosen commit to the current repo state, using current file content with green/red diff lines.
- Start the larger no-scroll virtual-sections rewrite from [.docs/prds/01-virtual-sections-no-scroll-canvas.md](C:/Code/gitmaps/.docs/prds/01-virtual-sections-no-scroll-canvas.md:1).
