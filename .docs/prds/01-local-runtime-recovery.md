# PRD: GitMaps Local Runtime Recovery

## Goal
Make a fresh `git clone` of `gitmaps` actually boot locally on `http://localhost:3335/` again.

## Problems Observed
- `bun install` could not resolve the old `melina`/`xydraw` setup from the repo as cloned.
- `tradjs` resolution was incorrectly pinned to a global Bun link instead of the local framework repo.
- `xydraw` was wired as a root dependency even though the app imports its bundled canvas package by relative path, which broke package-style installation needlessly.
- Two source files in upstream `HEAD` were truncated and caused parse failures before the app could even start.

## Required Outcomes
- Local development can still use the repo normally, but the published package must depend on npm `tradjs`, not a parent-folder link.
- The app boots on port `3335`.
- Export UI and onboarding no longer crash parsing.
- Runtime recovery is documented in `.docs`.

## Non-Goals
- Full TypeScript cleanup of the whole repo.
- Publishing a new npm version in this step.
- Rewriting the canvas architecture.

## Acceptance Criteria
- `npm install` succeeds in a fresh clone.
- `bun run dev` starts the app.
- `http://localhost:3335/` responds successfully.
- `.docs/index.md`, `.docs/TASKS.md`, and this PRD describe the current state and remaining Bun-installer issue.
