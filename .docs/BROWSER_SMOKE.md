# Browser Smoke Helper

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

## Browser-tools shell flow

A browser-tools shell helper is also available:

```bash
bun run smoke:browser-tools
```

This path now:
- auto-dismisses Chrome's profile picker via `Guest mode`
- recovers from stale/unhealthy `:9222` sessions by restarting the dedicated browser-tools Chrome debug process
- loads two repos in the same browser session
- verifies the second switch with backend-derived expected slug / file-count / commit-count assertions

### Browser-tools examples

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

Save a success screenshot:

```bash
SCREENSHOT_ON_SUCCESS=1 \
SCREENSHOT_PATH=C:/Code/gitmaps/.docs/browser-smoke.png \
  bun run smoke:browser-tools
```

Keep failure screenshots in a named location:

```bash
SCREENSHOT_PATH=C:/Code/gitmaps/.docs/browser-switch.png \
  bash scripts/browser-smoke-local.sh http://localhost:3335/ C:/Code/gitmaps C:/Code/jsx-ai
```

- `SCREENSHOT_PATH` — target artifact path for saved screenshots
- `SCREENSHOT_ON_SUCCESS=1` — save a screenshot after a passing run
- `SCREENSHOT_ON_FAILURE=1` — save `*.failure.png` on errors, enabled by default

## Extracted helper layout

The browser-tools smoke path is split into reusable helpers under `scripts/lib/`:

- `scripts/lib/browser-tools-common.sh` — browser startup, restart, screenshot, and failure helpers
- `scripts/lib/browser-smoke-expectations.py` — backend-derived expected slug / commit-count / file-count lookup
- `scripts/lib/browser-smoke-flow.js` — in-browser repo-load / repo-switch assertions
- `scripts/browser-smoke-local.sh` — thin wrapper that wires everything together

### Which file to edit

- change Chrome startup/recovery/screenshot behavior → `scripts/lib/browser-tools-common.sh`
- change backend expected repo metadata lookup → `scripts/lib/browser-smoke-expectations.py`
- change in-browser assertions or repo-switch flow → `scripts/lib/browser-smoke-flow.js`
- change CLI args / top-level orchestration → `scripts/browser-smoke-local.sh`

## Expected output

```json
{
  "ok": true,
  "first": {
    "repoValue": "C:/Code/gitmaps",
    "fileCount": "228",
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
