import puppeteer from 'puppeteer';

const url = process.argv[2] || 'http://localhost:3335/';
const repoPath = process.argv[3] || 'C:/Code/gitmaps';
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS || '120000');

const browser = await puppeteer.launch({ headless: true });
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(timeoutMs);
  await page.goto(url, { waitUntil: 'networkidle2' });

  await page.waitForSelector('#repoSelect');

  await page.evaluate((path) => {
    const repoSelect = document.getElementById('repoSelect') as HTMLSelectElement | null;
    if (!repoSelect) throw new Error('repoSelect not found');
    window.prompt = () => path;
    repoSelect.value = '__new__';
    repoSelect.dispatchEvent(new Event('change', { bubbles: true }));
  }, repoPath);

  await page.waitForFunction(() => {
    const landing = document.getElementById('landingOverlay') as HTMLElement | null;
    return !!landing && landing.style.display === 'none';
  }, { timeout: timeoutMs });

  await page.waitForFunction(() => {
    const fileCount = document.getElementById('fileCount');
    return Number(fileCount?.textContent || '0') > 0;
  }, { timeout: timeoutMs });

  const result = await page.evaluate(() => {
    const repoSelect = document.getElementById('repoSelect') as HTMLSelectElement | null;
    const fileCount = document.getElementById('fileCount')?.textContent || '';
    const commitCount = document.getElementById('commitCount')?.textContent || '';
    const timelineText = document.getElementById('timelineContainer')?.textContent || '';
    const commitInfo = document.getElementById('currentCommitInfo')?.textContent || '';
    const landing = document.getElementById('landingOverlay') as HTMLElement | null;

    return {
      ok: true,
      repoValue: repoSelect?.value || '',
      fileCount,
      commitCount,
      commitInfo,
      timelineHasContent: timelineText.trim().length > 0,
      landingHidden: landing?.style.display === 'none',
      pathname: window.location.pathname,
    };
  });

  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}