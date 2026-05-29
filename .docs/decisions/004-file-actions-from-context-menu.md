# ADR 004: Configurable File Actions from Card Context Menu

Date: 2026-05-25  
Status: Accepted

## Context
Users need a fast per-file workflow from the canvas (right-click on a file card) to run utilities like `patch-resolve` and inspect output immediately. Existing script execution supports runnable `.ts` files via bgrun, but not arbitrary per-file utility commands (e.g., markdown tooling).

## Decision
Implement a settings-driven file-action system:

1. Add `fileActionsJson` setting (JSON array) as source of truth.
2. Show matching actions in file card context menu under `Run file action`.
3. Resolve command placeholders:
   - `{file}` absolute file path
   - `{repo}` absolute repo path
   - `{rel}` repo-relative file path
4. Execute action through backend endpoint `POST /api/repo/file-action-run`.
5. Return stdout/stderr + command metadata and open result in existing file preview modal flow.

## Rationale
- Keeps workflows close to where users already operate (card context menu).
- Avoids hardcoding one tool (supports `patch-resolve` and future tools).
- Preserves existing UI behavior by reusing the current modal preview experience.

## Consequences
Positive:
- Extensible without code changes for each new script.
- Immediate visibility of command output in-app.
- Works for non-TS files, including `index.md`.

Tradeoffs:
- Shell-based execution requires careful validation and production restrictions.
- JSON settings UX is powerful but less beginner-friendly than form-based config.

## Scope Notes
- This ADR covers command execution + output presentation.
- It does not yet include per-action argument forms, presets marketplace, or saved output history.

