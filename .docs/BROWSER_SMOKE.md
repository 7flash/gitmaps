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

Optional args:

```bash
bun scripts/browser-smoke-local.ts http://localhost:3335/ C:/Code/jsx-ai
```

## Browser-tools shell flow

A browser-tools shell helper is also available:

```bash
bun run smoke:browser-tools
```

This path now handles the local Chrome profile-picker case by auto-clicking `Guest mode`, and it can recover from stale/unhealthy `:9222` sessions by restarting the dedicated browser-tools Chrome debug process before retrying `browser-nav`.

Optional screenshot env vars:

```bash
SCREENSHOT_ON_SUCCESS=1 \
SCREENSHOT_PATH=C:/Code/gitmaps/.docs/browser-smoke.png \
  bun run smoke:browser-tools
```

- `SCREENSHOT_PATH` — target artifact path for saved screenshots
- `SCREENSHOT_ON_SUCCESS=1` — save a screenshot after a passing run
- `SCREENSHOT_ON_FAILURE=1` — save `*.failure.png` on errors (enabled by default)

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
": "/gitmaps"
}
```
