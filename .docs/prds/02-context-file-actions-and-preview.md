# PRD 02: Right-Click File Actions with Modal Preview

Date: 2026-05-25  
Owner: GitMaps

## Problem
Users can inspect and edit files from the canvas, but cannot run file-scoped tooling (like `patch-resolve` for markdown) directly from file cards. This creates context switching to terminal and slows iterative review workflows.

## Goal
From a file card context menu, users can run configured file actions and immediately inspect output in GitMaps using the existing file preview modal.

## User Story
As a user, when I right-click `index.md`, I want to select a configured script (e.g., `patch-resolve`) and see output in a modal so I can quickly copy/use results without leaving the canvas.

## Functional Requirements
1. Settings includes `fileActionsJson` (array of action objects).
2. Context menu displays `Run file action` submenu for matching file extension rules.
3. Action execution API accepts repo path, file path, action.
4. Backend replaces placeholders `{file}`, `{repo}`, `{rel}` and executes command.
5. UI opens output in file preview modal with command + stdout + stderr.
6. Default config includes markdown action using `bunx patch-resolve "{file}"`.

## Non-Functional Requirements
- Respect production restrictions already used for script execution endpoints.
- Keep response latency acceptable for local command execution (<3s typical, tool-dependent).
- Preserve existing modal and interaction patterns.

## Out of Scope
- Action marketplace/distribution
- Per-action form wizard UI
- Historical output storage
- Batch actions across multiple files

## Success Criteria
- User can run `patch-resolve` from right-click on `.md` file.
- Output appears in preview modal in one flow, no terminal required.
- Action list can be modified by editing settings JSON.

## Delivery Notes
Implemented via:
- `app/lib/file-actions.ts`
- `app/lib/settings.ts`
- `app/lib/settings-modal.tsx`
- `app/lib/card-context-menu.tsx`
- `app/api/repo/file-action-run/route.ts`

