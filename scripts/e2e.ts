// Loads dist/ into Chromium, opens a local test page and checks what the extension did.
// Needs: npm run build, the Laya server running, and `npx playwright install chromium`.
// Usage: npm run e2e
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '..');
const dist = join(root, 'dist');
const page = readFileSync(join(root, 'test/fixtures/e2e.html'));

const server = createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(page);
}).listen(0);
const port = (server.address() as { port: number }).port;

const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'adb-e2e-')), {
  channel: 'chromium',
  headless: true,
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
});

const failures: string[] = [];
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(name);
};

try {
  let [worker] = context.serviceWorkers();
  worker ??= await context.waitForEvent('serviceworker');
  console.log(`extension loaded: ${worker.url().split('/')[2]}`);

  const tab = await context.newPage();
  await tab.goto(`http://127.0.0.1:${port}/`);
  await tab.waitForTimeout(1500);

  const hiddenAttr = (sel: string) => tab.$eval(sel, (el) => el.getAttribute('data-adb-hidden'));
  const visible = (sel: string) => tab.$eval(sel, (el) => getComputedStyle(el).display !== 'none');

  check('cookie banner hidden', (await hiddenAttr('#consent')) === 'cookie_consent');
  check('reject button clicked, not accept', (await tab.evaluate(() => (window as any).__choice)) === 'reject');
  check('article stays visible', await visible('#story'));
  check('site header stays visible', await visible('header'));

  // The late popup needs the Laya model (~1-3 s on CPU).
  await tab.waitForFunction(() => document.getElementById('late-popup')?.hasAttribute('data-adb-hidden'), null, { timeout: 30_000 }).then(
    () => check('late signup popup hidden by the model', true),
    async () => check('late signup popup hidden by the model', false, `attr=${await hiddenAttr('#late-popup')}`),
  );

  const extensionId = worker.url().split('/')[2];
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options/index.html`);
  await options.waitForFunction(() => (document.querySelector('input[name="layaUrl"]') as HTMLInputElement)?.value !== '');
  check('options page loads settings', (await options.inputValue('input[name="layaUrl"]')) === 'http://localhost:8002');
  if (process.env.E2E_SCREENSHOTS) {
    await options.setViewportSize({ width: 800, height: 1400 });
    await options.screenshot({ path: join(process.env.E2E_SCREENSHOTS, 'options.png'), fullPage: true });
    const popup = await context.newPage();
    await popup.setViewportSize({ width: 320, height: 420 });
    await popup.goto(`chrome-extension://${extensionId}/popup/index.html`);
    await popup.waitForTimeout(500);
    await popup.screenshot({ path: join(process.env.E2E_SCREENSHOTS, 'popup.png') });
  }
} finally {
  await context.close();
  server.close();
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('\nall checks passed');
