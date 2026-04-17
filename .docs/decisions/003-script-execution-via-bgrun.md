# ADR-003: Execute repo TypeScript files via bgrun with per-repo .gout logs

## Status
**Accepted** — 2026-04-17

## Context
The user wants to select any `.ts` file in GitMaps and run it directly from the canvas. The execution should:

1. use `bgrun` rather than ad-hoc process spawning,
2. be restartable and inspectable as a named background process,
3. write stdout/stderr into a `.gout` directory inside the repo root,
4. avoid mixing logs into GitMaps' own logs or global temp directories.

This needs both a UI affordance and a server-side execution path. It also introduces generated runtime artifacts that must not be committed.

## Options Evaluated

### Option A — Spawn `bun <file>` directly from GitMaps without bgrun
- **Pros:** Smallest implementation surface.
- **Cons:** No process registry, no restart semantics, no durable naming, no standard log management.

### Option B — Use bgrun with logs under a global user directory
- **Pros:** Reuses bgrun process management fully.
- **Cons:** Separates execution artifacts from the repo, makes script-specific outputs harder to discover, and breaks the user's requirement that logs live beside the repo.

### Option C — Use bgrun with deterministic process names and repo-local `.gout` stdout/stderr files
- **Pros:** Matches the requested UX, keeps logs discoverable per repo, preserves process management and restart behavior, and isolates generated artifacts in one hidden repo-local directory.
- **Cons:** Requires path sanitization, explicit `.gitignore` coverage, and a naming convention for repeated runs.

## Decision
**Option C**.

GitMaps should:
- expose a context-menu action for runnable `.ts` files,
- call a server route that launches the script through `bgrun`,
- use a deterministic process name derived from repo + relative file path,
- store stdout/stderr in `repo/.gout/...`, mirroring the file path enough to stay understandable,
- treat re-running the same script as restarting/replacing the same named background process.

## Consequences
- `.gout/` must be gitignored so runtime logs never get committed.
- Script execution should remain disabled in production/SaaS mode because it is inherently local-machine behavior.
- Deterministic names mean one running process per script path, which is the intended default; concurrent duplicate runs of the exact same file are not supported unless the model changes later.
