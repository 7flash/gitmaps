# ADR-001: Layout JSX Corruption Recovery Strategy

## Status
**Accepted** — 2026-03-18

## Context
`app/layout.tsx` (1300+ lines of JSX) had multiple corruption points committed across several git commits — truncated tags, duplicate blocks, garbled attribute values. The corruption affected 3 files:

- `app/layout.tsx` — 5 corruption sites (missing `</svg>`, merged CSS properties, duplicate blocks)
- `app/lib/repo.tsx` — 1 duplicate trailing block
- `app/lib/virtual-files.ts` — truncated function + missing export

The corruption was baked into git history as far back as commit `01567a3`, meaning `git stash` / `git checkout` couldn't restore clean versions.

## Options Evaluated

| Option | Pros | Cons |
|--------|------|------|
| A. Revert to last known working commit | Clean slate | Loses all features added since corruption was introduced |
| B. Manual surgical fixes using clean commit as reference | Preserves all work; targeted | Requires cross-referencing multiple git commits to find correct code |
| C. Rewrite layout.tsx from scratch | No residual corruption | 1300 lines of complex JSX; high risk of regressions |

## Decision
**Option B** — surgical fixes referencing commit `37cce42` as the last clean version for the modal/toolbar section, while fixing the sidebar section (which had no clean reference) by reconstructing proper JSX nesting.

Recovery method:
1. Follow Bun's JSX parser errors one at a time (each fix reveals the next error)
2. Cross-reference `git show <clean-commit>:app/layout.tsx` for correct structure
3. For `virtual-files.ts` truncation (never committed complete), reconstruct the `drawConnectionLine` function from its obvious SVG line-drawing pattern and add the missing `processFileForVirtualCards` export

## Consequences
- Server now returns 200 with full client bundle
- Corruption was in committed history — future `git bisect` will hit broken commits between `01567a3` and the fix commits
- Large monolithic JSX files (1300+ lines) are fragile — should consider splitting layout into smaller components
