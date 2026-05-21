# GitMaps PRD — Virtual Sections / No-Scroll Canvas

## Goal

Replace per-file internal scrolling with a section-first canvas where large files are decomposed into reusable virtual section cards that can be shared across files and arranged independently.

## Problem

Current GitMaps still assumes each file is a scrollable card. That causes three visible issues:

1. large repos open into a wall of low-signal placeholders or heavy cards
2. moving around the canvas is expensive because each card still carries too much per-file UI state
3. repeated boilerplate across files is trapped inside file cards instead of becoming shared navigable structure

## Product Direction

The canvas should become section-centric instead of file-centric.

- A file stays a container/anchor, not the only render unit.
- Reusable sections become first-class cards.
- Shared boilerplate can point multiple files at the same extracted virtual section.
- Navigation should feel like moving across code islands, not scrolling mini-editors inside cards.

## Phase 1

### 1. File anchors

Each file gets a compact anchor card:

- filename
- path
- type/status
- section count
- inbound/outbound references

No internal scroll area.

### 2. Section extraction

For previewable text files, extract semantic sections:

- imports / header
- top-level declarations
- repeated helper blocks
- repeated generated/output blocks
- diff hunks

Each section becomes its own canvas card with stable IDs.

### 3. Shared virtual sections

If identical or near-identical sections appear across multiple files:

- store once as a shared virtual section
- render once as a separate container
- show references from all owning files

### 4. Section navigation

Users should:

- jump file -> section
- jump section -> owning files
- expand one section into full file context on demand

## Technical Direction

### Data model

Introduce a normalized intermediate structure:

- `fileAnchors`
- `fileSections`
- `virtualSharedSections`
- `sectionReferences`

### Rendering

- keep viewport culling
- render section cards independently from file anchors
- avoid mounting full file DOM for non-focused files
- keep modal/editor as the only place for full-file scroll/edit

### Performance

- low-zoom preview should use metadata/section summaries, never `"Loading..."`
- initial repo load should not require full file content for every card
- section extraction should be cached per repo + commit

## Non-Goals

- full code editing inside every canvas card
- preserving old per-file scroll as the main exploration mode
- perfect AST parsing for every language in phase 1

## Success Criteria

- opening a large repo never shows a canvas dominated by loading placeholders
- panning around a 1k+ file repo remains usable
- users can inspect repeated code once and understand all files that reference it
- full-file scroll is moved to modal/detail view, not the main map surface
