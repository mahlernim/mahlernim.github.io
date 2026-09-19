import { test, expect, type Page } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve } from 'node:path';

const repositoryRoot = resolve(process.cwd(), '../..');
const contentTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

type TestStaticServer = { origin: string; close: () => Promise<void> };

async function startStaticServer(): Promise<TestStaticServer> {
  const server: Server = createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname);
    const filePath = resolve(repositoryRoot, pathname.replace(/^[/\\]+/, ''), pathname.endsWith('/') ? 'index.html' : '');
    const pathFromRoot = relative(repositoryRoot, filePath);
    if (pathFromRoot.startsWith('..') || isAbsolute(pathFromRoot)) {
      response.writeHead(403, { 'cache-control': 'no-store' });
      response.end();
      return;
    }
    try {
      const body = await readFile(filePath);
      response.writeHead(200, {
        'cache-control': 'no-store',
        'content-type': contentTypes[extname(filePath)] ?? 'application/octet-stream',
      });
      response.end(body);
    } catch {
      response.writeHead(404, { 'cache-control': 'no-store' });
      response.end();
    }
  });
  await new Promise<void>((resolveServer, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolveServer());
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('The test static server did not bind to a TCP port.');
  }
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>(resolveServer => server.close(() => resolveServer()));
    },
  };
}

async function setup(page: Page, origin?: string) {
  await page.goto(origin ? `${origin}/ttokttok/app/` : '/ttokttok/app/');
  await page.getByLabel('계량기 누적 숫자 m³', { exact: true }).fill('1258.4');
  await page.getByRole('button', { name: '첫 기록 저장', exact: true }).click();
  await expect(page.getByText('기기에 저장됨', { exact: false }).first()).toBeVisible();
}

test('both installation choices stay visible at narrow widths and on iPad', async ({ page }) => {
  for (const width of [320, 390, 820, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/ttokttok/');
    await expect(page.getByRole('link', { name: /Android 앱.*권장/ }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: '웹에서 시작하기', exact: true }).first()).toBeVisible();
    if (width < 800) {
      await expect(page.locator('.sticky-cta').getByRole('link', { name: 'Android 앱 · 권장', exact: true })).toBeVisible();
      await expect(page.locator('.sticky-cta').getByRole('link', { name: '웹에서 시작하기', exact: true })).toBeVisible();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.goto('/ttokttok/app/');
  await expect(page.getByRole('link', { name: /Android 앱.*권장/ }).first()).toBeVisible();
});

test('keyboard users can reach the web workspace and returning users see their entry point', async ({ page }) => {
  await page.goto('/ttokttok/');
  const web = page.getByRole('link', { name: '웹에서 시작하기', exact: true }).first();
  await web.focus();
  await web.press('Enter');
  await expect(page.getByRole('button', { name: '첫 기록 저장', exact: true })).toBeVisible();
  await page.getByLabel('계량기 누적 숫자 m³', { exact: true }).fill('1258.4');
  await page.getByRole('button', { name: '첫 기록 저장', exact: true }).press('Enter');
  await expect(page.getByText('기기에 저장됨').first()).toBeVisible();
  await page.goto('/ttokttok/');
  await expect(page.getByRole('link', { name: '내 기록 이어보기', exact: true }).first()).toBeVisible();
});

test('records survive reload and ordinary interactions send no personal data', async ({ page }) => {
  const requests: {url:string,method:string,body:string|null}[] = [];
  page.on('request', request => requests.push({ url: request.url(), method: request.method(), body: request.postData() }));
  await setup(page);
  await page.reload();
  await expect(page.getByText('1,258.4 m³', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: '첫 기록 저장', exact: true })).toHaveCount(0);
  expect(requests.every(request => request.method === 'GET' && request.body === null && new URL(request.url).origin === 'http://127.0.0.1:4173')).toBe(true);
  expect(requests.some(request => request.url.includes('1258'))).toBe(false);
});

test('backup restores in an empty browser and corrupt input leaves records intact', async ({ page, browser }) => {
  await setup(page);
  await page.locator('[data-tab="settings"]').click();
  const pending = page.waitForEvent('download');
  await page.locator('[data-action="download-backup"]').click();
  const download = await pending;
  const payload = await readFile((await download.path())!);
  const exported = JSON.parse(payload.toString());
  expect(exported.schema).toBe(4);
  expect(exported.credentials).toBeUndefined();
  expect(exported.observations[0].reading).toBe(1258.4);
  const clean = await browser.newContext();
  const other = await clean.newPage();
  await other.goto('http://127.0.0.1:4173/ttokttok/app/');
  await other.locator('[data-tab="settings"]').click();
  await other.locator('input[type="file"]').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: payload });
  await other.locator('[data-action="confirm-import"]').click();
  await other.locator('[data-tab="today"]').click();
  await expect(other.getByText('1,258.4 m³', { exact: true }).first()).toBeVisible();
  await other.locator('[data-tab="settings"]').click();
  await other.locator('input[type="file"]').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{"schema":999}') });
  await other.reload();
  await other.locator('[data-tab="today"]').click();
  await expect(other.getByText('1,258.4 m³', { exact: true }).first()).toBeVisible();
  await clean.close();
});

test('offline shell opens records and registration stays inside app route', async ({ page, context }) => {
  const server = await startStaticServer();
  try {
    await setup(page, server.origin);
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    const scopes = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map(reg => new URL(reg.scope).pathname));
    expect(scopes).toEqual(['/ttokttok/app/']);

    await page.goto(`${server.origin}/ttokttok/`);
    expect(await page.evaluate(() => navigator.serviceWorker.controller)).toBeNull();
    await page.goto(`${server.origin}/ttokttok/app/`);
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

    // WebKit's Playwright offline emulation can fail before a controlling worker handles navigation.
    // Closing this isolated server verifies the same real offline condition in every browser project.
    await server.close();
    await page.reload();
    await expect(page.getByText('1,258.4 m³', { exact: true }).first()).toBeVisible();
  } finally {
    await server.close().catch(() => {});
  }
});

test('provider handoffs and generic calendars cannot submit or include personal data', async ({ page, request }) => {
  await setup(page);
  await page.locator('[data-tab="providers"]').click();
  const links = await page.locator('a[target="_blank"]').evaluateAll(elements => elements.map(element => ({ href: (element as HTMLAnchorElement).href, rel: (element as HTMLAnchorElement).rel })));
  expect(links.length).toBeGreaterThan(20);
  expect(links.every(link => link.href.startsWith('https://') && link.rel.includes('noopener'))).toBe(true);
  await page.locator('[data-tab="settings"]').click();
  const response = await request.get('/ttokttok/app/calendar/sun-1900.ics');
  const ics = await response.text();
  expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=SU');
  expect(ics).toContain('BEGIN:VALARM');
  expect(ics).not.toContain('1258');
  expect(ics).not.toContain('customerNumber');
});
