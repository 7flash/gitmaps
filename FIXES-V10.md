# GitMaps fixed code v10

This patch fixes the remaining Workdir rendering bug and text copy behavior.

## Behavior

- Workdir / Current is now explicitly tagged as `viewMode: "workdir"`.
- Workdir cards always load and render full current file content.
- Empty `hunks: []` can no longer make Workdir cards render `No textual diff for this file.`
- Historical commits still render diff-only cards.
- Right-click inside selected source text now falls through to the browser native context menu so Copy works.
- Custom card context menu remains available from the card header or non-selected text area.

## Files changed

- `app/client/app.js`
- `app/client/styles.css`
- `app/lib/plain-canvas/app.ts`
- `app/lib/plain-canvas/cards.ts`
- `app/lib/plain-canvas/styles.ts`
- `app/lib/plain-canvas/types.ts`
- `app/api/repo/files/route.ts`
