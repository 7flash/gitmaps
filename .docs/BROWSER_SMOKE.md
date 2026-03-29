# Browser Smoke Helper

## Recommended workflow

Use the browser-tools smoke commands in this order:

1. **Fast preflight** — run this first after editing any smoke helper files:

```bash
bun run smoke:browser-tools:check
```

2. **Single repo-load smoke** — run this when you want a focused browser-tools check for route hydration + canvas bootstrap on one repo:

```bash
bun run smoke:browser-tools:load
```

3. **Full browser-tools smoke** — run this when you want the real browser session plus repo switching assertions:

```bash
bun run smoke:browser-tools
```

4. **Puppeteer smoke** — use this when you want the simpler non-browser-tools fallback path:

```bash
bun run smoke:browser
```

### Quick shorthand

- changed helper files only → `bun run smoke:browser-tools:check`
- changed single-repo load/bootstrap behavior → `bun run smoke:browser-tools:load`
- changed browser-tools switching behavior / broader route assertions → `bun run smoke:browser-tools`
- want a simple end-to-end fallback → `bun run smoke:browser`

## Primary smoke flow

Use the Puppeteer-based local smoke script:

```bash
cd C:/Code/gitmaps
bun run smoke:browser
```

It will:
1. open `http://localhost:3335/`
2. wait for `#repoSelect`
3. trigger `__new__` local repo flow with `C:/Code/gitmaps`
4. wait for landing overlay to hide
5. wait for `#fileCount > 0`
6. print a JSON summary

### Primary flow examples

Default repo:

```bash
bun run smoke:browser
```

Custom repo:

```bash
bun scripts/browser-smoke-local.ts http://localhost:3335/ C:/Code/jsx-ai
```

## Browser-tools single repo-load smoke

Use the dedicated browser-tools repo-load helper when you want one focused local repo load/assertion path:

```bash
bun run smoke:browser-tools:load
```

This path:
- opens the app in browser-tools Chrome
- loads one local repo through the prompt path
- verifies canonical slug route hydration
- verifies file count / commit count / runtime repo path
- now uses the same shared assembly helper infrastructure as repo-switch smoke

### Single repo-load examples

Default repo:

```bash
bun run smoke:browser-tools:load
```

Explicit URL + repo:

```bash
bash scripts/browser-repo-load-smoke.sh http://localhost:3335/ C:/Code/gitmaps
```

Load a different repo:

```bash
bash scripts/browser-repo-load-smoke.sh http://localhost:3335/ C:/Code/jsx-ai
```

## Browser-tools shell flow

A browser-tools repo-switch helper is also available:

```bash
bun run smoke:browser-tools
```

This path now:
- auto-dismisses Chrome's profile picker via `Guest mode`
- recovers from stale/unhealthy `:9222` sessions by restarting the dedicated browser-tools Chrome debug process
- loads two repos in the same browser session
- verifies the second switch with backend-derived expected slug / file-count / commit-count assertions

### Browser-tools repo-switch examples

Default two-repo switch:

```bash
bun run smoke:browser-tools
```

Explicit URL + first repo + second repo:

```bash
bash scripts/browser-smoke-local.sh http://localhost:3335/ C:/Code/gitmaps C:/Code/jsx-ai
```

Switch to a different second repo:

```bash
bash scripts/browser-smoke-local.sh http://localhost:3335/ C:/Code/gitmaps C:/Code/melina.js
```

Tune retries/timeouts for a slow machine:

```bash
BROWSER_READY_RETRIES=12 \
NAV_RETRIES=6 \
TIMEOUT_SECONDS=90 \
  bash scripts/browser-smoke-local.sh http://localhost:3335/ C:/Code/gitmaps C:/Code/jsx-ai
```

### Screenshot examples

Save a success screenshot for repo-switch smoke:

```bash
SCREENSHOT_ON_SUCCESS=1 \
SCREENSHOT_PATH=C:/Code/gitmaps/.docs/browser-smoke.png \
  bun run smoke:browser-tools
```

Save a success screenshot for single repo-load smoke:

```bash
SCREENSHOT_ON_SUCCESS=1 \
SCREENSHOT_PATH=C:/Code/gitmaps/.docs/browser-load.png \
  bun run smoke:browser-tools:load
```

Keep failure screenshots in a named location:

```bash
SCREENSHOT_PATH=C:/Code/gitmaps/.docs/browser-switch.png \
  bash scripts/browser-smoke-local.sh http://localhost:3335/ C:/Code/gitmaps C:/Code/jsx-ai
```

- `SCREENSHOT_PATH` — target artifact path for saved screenshots
- `SCREENSHOT_ON_SUCCESS=1` — save a screenshot after a passing run
- `SCREENSHOT_ON_FAILURE=1` — save `*.failure.png` on errors, enabled by default

## Browser smoke guard aggregation

Run the fast guard and self-check together:

```bash
bun run smoke:browser-tools:check
```

What it does, in order:
1. `bun run smoke:browser-tools:guard`
2. `bun run smoke:browser-tools:self-check`

Use this as the default preflight check before running the heavier browser-tools smoke flows.

## Browser smoke self-check

Validate that the extracted browser-tools smoke pieces still assemble into runnable scripts:

```bash
bun run smoke:browser-tools:self-check
```

What it checks:
- backend expectations can still be loaded for the configured repos
- placeholders in `scripts/lib/browser-smoke-flow.js` and `scripts/lib/browser-repo-load-smoke-flow.js` are fully replaced
- the assembled repo-switch and repo-load browser scripts both parse successfully

This is a fast structural check for refactors. It does not start Chrome or execute the full browser smoke flow.

## Browser smoke guard

Run a very fast syntax/existence guard for the extracted helpers:

```bash
bun run smoke:browser-tools:guard
```

What it checks:
- required shell/python/js helper files exist
- `bash -n` passes for shell wrappers/helpers
- `python -m py_compile` passes for the expectations helper
- `node --check` passes for the browser smoke JS template files

This is the earliest-failing check and is useful before the self-check or full browser run.

## Extracted helper layout

The browser-tools smoke path is split into reusable helpers under `scripts/lib/`:

- `scripts/lib/browser-tools-common.sh` — browser startup, restart, screenshot, and failure helpers
- `scripts/lib/browser-smoke-expectations.py` — backend-derived expected slug / commit-count / file-count lookup
- `scripts/lib/browser-smoke-flow.js` — in-browser repo-switch assertions
- `scripts/lib/browser-repo-load-smoke-flow.js` — in-browser single repo-load assertions
- `scripts/lib/browser-smoke-assemble.sh` — shared assembly helpers used by repo-switch smoke, repo-load smoke, and the self-check
- `scripts/browser-smoke-local.sh` — repo-switch wrapper that wires everything together
- `scripts/browser-repo-load-smoke.sh` — focused single repo-load wrapper
- `scripts/browser-smoke-self-check.sh` — lightweight structural validation for the extracted browser-tools smoke pieces
- `scripts/browser-smoke-guard.sh` — fast file-existence + syntax guard for the extracted browser smoke helpers
- `scripts/browser-smoke-check.sh` — aggregate preflight check that runs guard + self-check in order

### Which file to edit

- change Chrome startup/recovery/screenshot behavior → `scripts/lib/browser-tools-common.sh`
- change backend expected repo metadata lookup → `scripts/lib/browser-smoke-expectations.py`
- change in-browser repo-switch assertions → `scripts/lib/browser-smoke-flow.js`
- change in-browser single repo-load assertions → `scripts/lib/browser-repo-load-smoke-flow.js`
- change assembly/substitution behavior → `scripts/lib/browser-smoke-assemble.sh`
- change repo-switch orchestration → `scripts/browser-smoke-local.sh`
- change single repo-load orchestration → `scripts/browser-repo-load-smoke.sh`
- change structural validation behavior → `scripts/browser-smoke-self-check.sh`
- change syntax/existence guard behavior → `scripts/browser-smoke-guard.sh`
- change aggregated preflight order → `scripts/browser-smoke-check.sh`

## Expected output

### Single repo-load smoke

```json
{
  "ok": true,
  "loaded": {
    "repoValue": "C:/Code/gitmaps",
    "fileCount": "237",
    "commitCount": "100",
    "pathname": "/7flash/gitmaps"
  },
  "expected": {
    "path": "C:/Code/gitmaps",
    "slug": "7flash/gitmaps",
    "commitCount": 100,
    "fileCount": 237
  }
}
```

### Full browser-tools smoke

```json
{
  "ok": true,
  "first": {
    "repoValue": "C:/Code/gitmaps",
    "fileCount": "237",
    "commitCount": "100",
    "pathname": "/7flash/gitmaps"
  },
  "second": {
    "repoValue": "C:/Code/jsx-ai",
    "fileCount": "294",
    "commitCount": "23",
    "pathname": "/7flash/jsx-ai"
  }
}
```

### Self-check

```json
{
  "ok": true,
  "assembled": true,
  "repoSwitchSyntax": "ok",
  "repoLoadSyntax": "ok"
}
```

### Guard

```json
{
  "ok": true,
  "guarded": true,
  "shellSyntax": "ok",
  "pythonSyntax": "ok",
  "jsSyntax": "ok"
}
```
