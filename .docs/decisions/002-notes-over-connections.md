# ADR-002: Replace ad-hoc connections with persistent line notes and temporary free-draw overlays

## Status
**Accepted** — 2026-04-11

## Context
GitMaps currently has a connection system that links lines across files, but the user wants a more direct annotation workflow:

1. **Temporary free-draw mode** for sketching lines/strokes over and across file cards.
2. **Persistent line notes** attached to specific lines instead of abstract connections.
3. Notes should survive commit changes when possible by re-anchoring to the matching line content if the original line number changes.
4. Free-draw overlays are intentionally ephemeral and may disappear on reload, route changes, or commit changes.

This means the durable annotation primitive should be a note anchored to file content, while drawing should be treated as a transient canvas overlay rather than a source-of-truth data model.

## Options Evaluated

### Option A — Extend the existing connection model
- **Pros:** Reuses existing overlay and storage code.
- **Cons:** Connections are the wrong abstraction for comments/annotations, still require source/target endpoints, and do not model line-attached note content well.

### Option B — Keep connections and add notes separately
- **Pros:** Lower migration risk.
- **Cons:** Two overlapping annotation systems would confuse users and leave duplicate UI/shortcuts.

### Option C — Make line notes the durable annotation system and treat free-draw as ephemeral overlay
- **Pros:** Matches user intent, separates durable semantic data from temporary sketching, and gives a clean path to de-emphasize/remove connections later.
- **Cons:** Requires new anchoring/reconciliation logic and UI.

## Decision
**Option C**.

GitMaps should move toward:
- **Persistent notes** stored per repo/file with:
  - file path
  - original line number
  - original line text snapshot
  - note body
  - optional resolved/current line number after reconciliation
- **Commit/load reconciliation** that scans the current file content and re-attaches notes by matching the original captured line text near the old line first, then globally if needed.
- **Temporary free-draw mode** implemented as an in-memory overlay layer over the canvas viewport. It is not persisted and is cleared on reload/commit switches when layout rerenders.

## Consequences
- Notes become the main long-lived annotation primitive.
- Connections can later be hidden, deprecated, or migrated into note references.
- Re-anchoring by line text is heuristic, not perfect; duplicate identical lines may still need a nearest-line strategy.
- Free-draw stays lightweight because it avoids persistence and diff-migration complexity.
