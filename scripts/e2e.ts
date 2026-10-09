// Loads dist/ into Chromium, opens a local test page and checks what the extension did.
// Needs: npm run build, the Laya server running, and `npx playwright install chromium`.
// Usage: npm run e2e            (Laya at http://localhost:8002; override with LAYA_URL=...)
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '..');
const layaUrl = process.env.LAYA_URL ?? 'http://localhost:8002';
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
  const extensionId = worker.url().split('/')[2];
  console.log(`extension loaded: ${extensionId}`);

  // A fresh install opens Settings and defaults to Jev without a key: point it at Laya first.
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options/index.html`);
  await options.waitForFunction(() => (document.querySelector('input[name="layaUrl"]') as HTMLInputElement)?.value !== '');
  check('fresh install defaults to Jev', (await options.inputValue('input[name="provider"]:checked')) === 'jev');
  check('Jev key hint shown when no key is set', await options.isVisible('#jev-key-hint'));
  const message = (msg: object) => options.evaluate((m) => chrome.runtime.sendMessage(m), msg);
  const current = (await message({ type: 'getSettings' })) as Record<string, any>;
  const saved = (await message({ type: 'saveSettings', settings: { ...current, provider: 'laya', laya: { ...current.laya, baseUrl: layaUrl } } })) as {
    ok: boolean;
  };
  check(`switch to Laya at ${layaUrl}`, saved.ok);

  const tab = await context.newPage();
  await tab.goto(`http://127.0.0.1:${port}/`);
  await tab.waitForTimeout(1500);

  const hiddenAttr = (sel: string) => tab.$eval(sel, (el) => el.getAttribute('data-adb-hidden'));
  const visible = (sel: string) => tab.$eval(sel, (el) => getComputedStyle(el).display !== 'none');

  check('cookie banner hidden', (await hiddenAttr('#consent')) === 'cookie_consent');
  check('reject button clicked, not accept', (await tab.evaluate(() => (window as any).__choice)) === 'reject');
  check('article stays visible', await visible('#story'));
  check('site header stays visible', await visible('header'));

  // The late overlay needs the Laya model (~1-3 s on CPU).
  await tab.waitForFunction(() => document.getElementById('nl7')?.hasAttribute('data-adb-hidden'), null, { timeout: 30_000 }).then(
    async () => {
      // Its markup has no tell-tale names, so only a model verdict can hide it.
      const stats = (await worker.evaluate(
        (tabId) => chrome.tabs.sendMessage(tabId, { type: 'pageStats' }),
        (await worker.evaluate(async (u) => (await chrome.tabs.query({ url: `${u}*` }))[0]?.id, `http://127.0.0.1:${port}/`)) as number,
      )) as { bySource: Record<string, number>; modelCalls: number };
      check('late promo overlay hidden by the model', (stats.bySource.model ?? 0) >= 1, JSON.stringify(stats.bySource));
    },
    async () => check('late promo overlay hidden by the model', false, `attr=${await hiddenAttr('#nl7')}`),
  );

  await options.reload();
  await options.waitForFunction(() => (document.querySelector('input[name="layaUrl"]') as HTMLInputElement)?.value !== '');
  check('options page shows saved settings', (await options.inputValue('input[name="layaUrl"]')) === layaUrl);

  // Exclude list: excluding the site stops all hiding there; removing it brings hiding back.
  const added = (await message({ type: 'excludeSite', site: `http://127.0.0.1:${port}/some/page` })) as { excluded: string[] };
  check('exclude adds the normalised host', added.excluded.includes('127.0.0.1'), JSON.stringify(added.excluded));
  await tab.reload();
  await tab.waitForTimeout(1500);
  check('excluded site: cookie banner left alone', (await hiddenAttr('#consent')) === null);
  const removed = (await message({ type: 'includeSite', site: '127.0.0.1' })) as { excluded: string[] };
  check('remove takes the host off the list', !removed.excluded.includes('127.0.0.1'));
  await tab.reload();
  await tab.waitForTimeout(1500);
  check('after removal: cookie banner hidden again (from cache)', !(await visible('#consent')) && (await hiddenAttr('#consent')) === 'cookie_consent');
  if (process.env.E2E_SCREENSHOTS) await message({ type: 'excludeSite', site: 'dashboard.ngrok.com' });

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
