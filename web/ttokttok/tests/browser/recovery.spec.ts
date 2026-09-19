import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

// These browser tests exercise IndexedDB and import behavior only. They do not
// establish any physical iPhone Safari or Home Screen result.
async function setup(page: Page, reading = '1258.4'): Promise<void> {
  await page.goto('/ttokttok/app/');
  await page.getByLabel('계량기 누적 숫자 m³', { exact: true }).fill(reading);
  await page.getByRole('button', { name: '첫 기록 저장', exact: true }).click();
  await expect(page.getByText('기기에 저장됨', { exact: false }).first()).toBeVisible();
}

async function exportedPayload(page: Page): Promise<Buffer> {
  await page.getByRole('button', { name: '설정', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.locator('[data-action="download-backup"]').click();
  return readFile((await (await download).path())!);
}

test('same-browser IndexedDB clear followed by JSON restore returns household records', async ({ page }) => {
  await setup(page);
  const payload = await exportedPayload(page);
  await page.close();

  const cleared = await page.context().newPage();
  await cleared.goto('/ttokttok/app/');
  await cleared.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase('ttokttok-web-v1');
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('blocked'));
    });
  });
  await cleared.reload();
  await expect(cleared.getByRole('button', { name: '첫 기록 저장', exact: true })).toBeVisible();
  await cleared.getByRole('button', { name: '설정', exact: true }).click();
  await cleared.locator('input[type="file"]').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: payload });
  await cleared.locator('[data-action="confirm-import"]').click();
  await cleared.getByRole('button', { name: '오늘', exact: true }).click();
  await expect(cleared.getByText('1,258.4 m³', { exact: true }).first()).toBeVisible();
});

test('malformed and oversized imports leave the visible household record unchanged', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: '설정', exact: true }).click();
  const input = page.locator('input[type="file"]');
  await input.setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{') });
  await expect(page.getByText('유효한 똑똑 JSON 백업 파일이 아닙니다.', { exact: true })).toBeVisible();
  await input.setInputFiles({ name: 'large.json', mimeType: 'application/json', buffer: Buffer.alloc(2 * 1024 * 1024 + 1, 0x20) });
  await expect(page.getByText('2MB 이하의 JSON 백업 파일만 가져올 수 있어요.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '오늘', exact: true }).click();
  await expect(page.getByText('1,258.4 m³', { exact: true }).first()).toBeVisible();
});

test('calendar weekday and hour survive portable backup roundtrip', async ({ page, browser }) => {
  await setup(page);
  await page.getByRole('button', { name: '설정', exact: true }).click();
  const calendar = page.locator('form[data-form="calendar"]');
  await calendar.locator('select[name="day"]').selectOption('3');
  await calendar.locator('select[name="hour"]').selectOption('7');
  await calendar.getByRole('button', { name: '링크 만들기', exact: true }).click();
  const payload = await exportedPayload(page);

  const isolated = await browser.newContext();
  const restored = await isolated.newPage();
  await restored.goto('http://127.0.0.1:4173/ttokttok/app/');
  await restored.getByRole('button', { name: '설정', exact: true }).click();
  await restored.locator('input[type="file"]').setInputFiles({ name: 'calendar.json', mimeType: 'application/json', buffer: payload });
  await restored.locator('[data-action="confirm-import"]').click();
  await expect(restored.locator('form[data-form="calendar"] select[name="day"]')).toHaveValue('3');
  await expect(restored.locator('form[data-form="calendar"] select[name="hour"]')).toHaveValue('7');
  await isolated.close();
});

test('backup reminder is shown only for an unexported changed revision after thirty days', async ({ page }) => {
  await setup(page);
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('ttokttok-web-v1'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('state', 'readwrite'); const store = tx.objectStore('state'); const get = store.get('household');
      get.onsuccess = () => { const value = get.result; value.preferences.lastExportAt = Date.now() - 31 * 86400000; value.preferences.exportRevision = value.revision; store.put(value, 'household'); };
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  await page.reload();
  await expect(page.getByText('소중한 기록을 파일로 보관하세요.', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '지침 기록', exact: true }).click();
  const dialog = page.locator('#entry-dialog');
  await dialog.getByLabel('누적 숫자 m³', { exact: true }).fill('1260');
  await dialog.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByText('소중한 기록을 파일로 보관하세요.', { exact: true })).toBeVisible();
});

test('a failed write can be retried after IndexedDB put is restored', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    Object.defineProperty(window, '__recoveryOriginalPut', { value: original, configurable: true });
    IDBObjectStore.prototype.put = function () { throw new DOMException('quota', 'QuotaExceededError'); };
  });
  await page.getByRole('button', { name: '지침 기록', exact: true }).click();
  const dialog = page.locator('#entry-dialog');
  await dialog.getByLabel('누적 숫자 m³', { exact: true }).fill('1260');
  await dialog.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByText('저장하지 못한 초안이 있어요.', { exact: false })).toBeVisible();
  await page.evaluate(() => { IDBObjectStore.prototype.put = (window as any).__recoveryOriginalPut; });
  await page.getByRole('button', { name: '초안 다시 저장', exact: true }).click();
  await expect(page.getByText('기기에 저장됨', { exact: false }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByText('1,260 m³', { exact: true }).first()).toBeVisible();
});
