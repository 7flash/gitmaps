# GitMaps JSX Canvas renderer

## Replace/add

- Replace `app/page.tsx`
- Replace `app/page.client.tsx`
- Add `app/lib/canvas/types.ts`
- Add `app/lib/canvas/utils.ts`
- Add `app/lib/canvas/model.ts`
- Add `app/lib/canvas/api.ts`
- Add `app/lib/canvas/components.tsx`
- Add `app/lib/canvas/app.tsx`
- Append `app/globals.css.APPEND` to your existing `app/globals.css`

## Deliberate rules

- No XState.
- No injected `<style>` node.
- No `innerHTML` or markup template strings for UI.
- All rendered UI is JSX sent through `render` from `tradjs/client`.
- Only transform/position/text on existing elements is updated imperatively during pointer interaction.

## Existing APIs used

- `POST /api/repo/load`
- `POST /api/repo/tree`
- `POST /api/repo/files`
- `POST /api/repo/file-content`
- `POST /api/repo/file-history-compare`
- `POST /api/repo/upload`
- `POST /api/repo/clone-stream`
