// Generates the extension icons and the Chrome Web Store images.
//   public/icons/icon-{16,32,48,128}.png  — committed, referenced by the manifest
//   store/*.png                            — screenshots (1280x800) and the small promo tile (440x280)
// Needs: the Laya server running (LAYA_URL, default http://localhost:8002) and Playwright's Chromium.
// Usage: npm run store-assets
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, type Page } from 'playwright';

const root = resolve(import.meta.dirname, '..');
const layaUrl = process.env.LAYA_URL ?? 'http://localhost:8002';
const storeDir = join(root, 'store');
const iconDir = join(root, 'public/icons');
mkdirSync(storeDir, { recursive: true });
mkdirSync(iconDir, { recursive: true });

const ACCENT = '#3b5bdb';
const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="28" fill="${ACCENT}"/>
  <g fill="none" stroke="#fff" stroke-width="13" stroke-linecap="round" stroke-linejoin="round">
    <path d="M30 54V30h24M74 30h24v24M98 74v24H74M54 98H30V74"/>
  </g>
  <circle cx="64" cy="64" r="13" fill="#fff"/>
</svg>`;
writeFileSync(join(root, 'store/icon.svg'), ICON_SVG);

const png = (path: string) => `data:image/png;base64,${readFileSync(path).toString('base64')}`;

async function renderHtml(page: Page, html: string, width: number, height: number, out: string) {
  await page.setViewportSize({ width, height });
  await page.setContent(html, { waitUntil: 'load' });
  await page.screenshot({ path: out, omitBackground: true });
}

const FONT = `font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;`;

// 1. Icons (plain browser, no extension needed).
{
  const browser = await chromium.launch({ channel: 'chromium' });
  const page = await browser.newPage();
  for (const size of [16, 32, 48, 128]) {
    const html = `<html><body style="margin:0;background:transparent">${ICON_SVG.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`;
    await renderHtml(page, html, size, size, join(iconDir, `icon-${size}.png`));
  }
  await browser.close();
  console.log('icons written to public/icons/');
}

// 2. Build with the icons in place.
execSync('npm run build', { cwd: root, stdio: 'ignore' });
const dist = join(root, 'dist');

// 3. Screenshots with the real extension.
const pageHtml = readFileSync(join(root, 'test/fixtures/e2e.html'));
const server = createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(pageHtml);
}).listen(0);
const port = (server.address() as { port: number }).port;
const siteUrl = `http://127.0.0.1:${port}/`;

const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'adb-store-')), {
  channel: 'chromium',
  headless: true,
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
});
const shots = mkdtempSync(join(tmpdir(), 'adb-shots-'));

try {
  let [worker] = context.serviceWorkers();
  worker ??= await context.waitForEvent('serviceworker');
  const id = worker.url().split('/')[2];

  const options = await context.newPage();
  await options.goto(`chrome-extension://${id}/options/index.html`);
  await options.waitForFunction(() => (document.querySelector('input[name="layaUrl"]') as HTMLInputElement)?.value !== '');
  const message = (msg: object) => options.evaluate((m) => chrome.runtime.sendMessage(m), msg);
  const settings = (await message({ type: 'getSettings' })) as Record<string, any>;
  await message({ type: 'saveSettings', settings: { ...settings, provider: 'laya', laya: { ...settings.laya, baseUrl: layaUrl } } });

  // Before / after on the demo news page.
  const tab = await context.newPage();
  await tab.setViewportSize({ width: 620, height: 640 });
  await message({ type: 'excludeSite', site: '127.0.0.1' });
  await tab.goto(siteUrl);
  await tab.waitForTimeout(2000);
  await tab.screenshot({ path: join(shots, 'before.png') });
  await message({ type: 'includeSite', site: '127.0.0.1' });
  await tab.reload();
  await tab.waitForFunction(() => document.getElementById('nl7')?.hasAttribute('data-adb-hidden'), null, { timeout: 30_000 });
  await tab.screenshot({ path: join(shots, 'after.png') });

  // Popup, pointed at the demo tab (in a real popup the active tab is the page).
  const tabId = (await worker.evaluate(async (u) => (await chrome.tabs.query({ url: `${u}*` }))[0]?.id, siteUrl)) as number;
  const popup = await context.newPage();
  await popup.addInitScript(
    ({ tabId, url }) => {
      chrome.tabs.query = (async () => [{ id: tabId, url, active: true }]) as unknown as typeof chrome.tabs.query;
    },
    { tabId, url: siteUrl },
  );
  await popup.setViewportSize({ width: 320, height: 520 });
  await popup.goto(`chrome-extension://${id}/popup/index.html`);
  await popup.waitForTimeout(800);
  await popup.evaluate(() => ((document.getElementById('excluded') as HTMLDetailsElement).open = true));
  await popup.screenshot({ path: join(shots, 'popup.png'), fullPage: true });

  // Settings page.
  await options.setViewportSize({ width: 1280, height: 800 });
  await options.reload();
  await options.waitForTimeout(500);
  await options.evaluate(() => (document.querySelector('input[name="provider"][value="jev"]') as HTMLInputElement).click());
  await options.screenshot({ path: join(storeDir, 'screenshot-3-settings.png') });

  // Compose store images.
  const compose = context.pages()[0] ?? (await context.newPage());
  const frame = (src: string, label: string, tone: string) => `
    <figure style="margin:0;display:grid;gap:12px;justify-items:center">
      <figcaption style="font-size:20px;font-weight:600;color:${tone}">${label}</figcaption>
      <img src="${src}" style="width:540px;border-radius:12px;box-shadow:0 12px 40px rgba(20,30,80,.25)">
    </figure>`;
  await renderHtml(
    compose,
    `<html><body style="margin:0;${FONT}background:linear-gradient(135deg,#eef1ff,#f7f7f5);width:1280px;height:800px;display:grid;place-items:center">
      <div style="display:grid;gap:28px;justify-items:center">
        <h1 style="margin:0;font-size:34px;color:#1d1d1b">Read the page, not the popups</h1>
        <div style="display:flex;gap:48px">${frame(png(join(shots, 'before.png')), 'Without', '#c92a2a')}${frame(png(join(shots, 'after.png')), 'With Focal', '#2b8a3e')}</div>
      </div></body></html>`,
    1280,
    800,
    join(storeDir, 'screenshot-1-before-after.png'),
  );
  await renderHtml(
    compose,
    `<html><body style="margin:0;${FONT}background:${ACCENT};width:1280px;height:800px;display:flex;align-items:center;justify-content:center;gap:72px">
      <div style="color:#fff;max-width:520px">
        <h1 style="font-size:40px;margin:0 0 16px">Know what was hidden</h1>
        <p style="font-size:22px;line-height:1.5;margin:0;opacity:.92">Counts by category, the model's status, a one-click <b>Disable on this site</b>, and your exclude list — right from the toolbar.</p>
      </div>
      <img src="${png(join(shots, 'popup.png'))}" style="width:400px;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.35)">
    </body></html>`,
    1280,
    800,
    join(storeDir, 'screenshot-2-popup.png'),
  );
  await renderHtml(
    compose,
    `<html><body style="margin:0;${FONT}background:linear-gradient(135deg,${ACCENT},#5c7cfa);width:440px;height:280px;display:flex;align-items:center;gap:22px;padding:0 30px;box-sizing:border-box;color:#fff">
      ${ICON_SVG.replace('<svg ', '<svg width="96" height="96" style="flex:none;filter:drop-shadow(0 6px 14px rgba(0,0,0,.25))" ').replace(`fill="${ACCENT}"`, 'fill="#2f49b8"')}
      <div><div style="font-size:40px;font-weight:700;line-height:1">Focal</div><div style="font-size:18px;font-weight:600;margin-top:4px;opacity:.95">AI Distraction Blocker</div>
      <div style="font-size:16px;margin-top:8px;opacity:.92">Hides ads, cookie banners and popups with an AI decision model</div></div>
    </body></html>`,
    440,
    280,
    join(storeDir, 'promo-small-440x280.png'),
  );
  console.log('store images written to store/');
} finally {
  await context.close();
  server.close();
}
