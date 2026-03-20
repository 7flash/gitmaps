#!/bin/bash
# GitMaps Browser Smoke Test
# Requires: browser-start, browser-nav, browser-eval, browser-screenshot
# Usage: bash smoke-test.sh [repo-path]

REPO="${1:-C:/Code/gitmaps}"
PORT=3335
URL="http://localhost:$PORT"

echo "🔍 GitMaps Smoke Test"
echo "  Repo: $REPO"
echo "  URL: $URL"
echo ""

# 1. Navigate to landing
echo "1️⃣ Loading landing page..."
browser-nav "$URL" 2>/dev/null
sleep 2

# 2. Verify landing elements
echo "2️⃣ Checking landing page..."
LANDING=$(browser-eval '(function() {
  return JSON.stringify({
    title: document.querySelector("h1,h2")?.textContent?.trim(),
    select: !!document.querySelector("select"),
    repos: document.querySelectorAll("option").length - 1
  });
})()' 2>/dev/null)
echo "   $LANDING"

# 3. Load repo
echo "3️⃣ Loading repo: $REPO"
browser-eval "(function() {
  const s = document.querySelector('select');
  s.value = '$REPO';
  s.dispatchEvent(new Event('change', { bubbles: true }));
})()" 2>/dev/null
sleep 5

# 4. Verify canvas loaded
echo "4️⃣ Checking canvas state..."
CANVAS=$(browser-eval '(function() {
  const cards = document.querySelectorAll("[class*=file-card], [class*=file-pill]");
  const commits = document.querySelectorAll("[class*=commit-row], .commit-entry");
  const slug = document.querySelector("[class*=slug]")?.textContent?.trim();
  const fileCount = document.querySelector("[class*=file-count], .toolbar-item")?.textContent;
  return JSON.stringify({
    cards: cards.length,
    commits: commits.length,
    slug: slug || "none",
    status: cards.length > 0 ? "✅ PASS" : "❌ FAIL"
  });
})()' 2>/dev/null)
echo "   $CANVAS"

# 5. Screenshot
echo "5️⃣ Taking screenshot..."
SHOT=$(browser-screenshot 2>/dev/null)
echo "   📸 $SHOT"

echo ""
echo "Done!"
