# GitMaps fixed code v3

This version moves the fixes into the main canvas path, not only the fallback `plain-canvas` path.

## Fixed again in v3

- `http://localhost:3335/?repo=C:\Code\game` is parsed by the main route helpers.
- A selected repo is inserted into the dropdown if it was only provided by URL.
- Selecting/opening a repo syncs the address bar to `/?repo=<encoded path>`.
- The default canvas interaction mode is advanced: drag empty canvas to marquee-select; use Space-drag or middle mouse to pan.
- Capture-phase right-click handling opens the card context menu from card header, body, or low-zoom pill.
- Ctrl/Shift/Meta-click toggles multi-select.
- Dragging a selected card/pill moves all selected cards/pills and saves their positions.
- The timeline container is force-visible and scrollable.
- `/api/repo/files` returns a commit's diff against its parent and sends textified diff content so older card renderers do not fall back to full file content.

## Important

The uploaded project scan did not contain every original source module (`app/lib/repo`, `app/lib/cards`, `app/lib/events`, packages, etc.). This zip is still reconstructed from the scan, so if you are applying it over your real working repo, copy these changed files over your existing repo instead of replacing the whole folder blindly.

Changed/added main files:

- `app/lib/repo-route.ts`
- `app/lib/initial-route-hydration.ts`
- `app/lib/route-repo-entry.ts`
- `app/lib/repo-select.ts`
- `app/lib/repo-handoff.ts`
- `app/lib/context.ts`
- `app/lib/mount-init.ts`
- `app/lib/main-canvas-ux-fixes.ts`
- `app/api/repo/files/route.ts`

