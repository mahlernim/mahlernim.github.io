import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

async function createHousehold(page: Page, reading = '1258.4'): Promise<void> {
  await page.goto('/ttokttok/app/');
  await page.getByLabel('계량기 누적 숫자 m³', { exact: true }).fill(reading);
  await page.getByRole('button', { name: '첫 기록 저장', exact: true }).click();
  await expect(page.getByText('기기에 저장됨', { exact: false }).first()).toBeVisible();
  await page.getByRole('button', { name: '기록', exact: true }).click();
  await page.getByRole('button', { name: '수정', exact: true }).click();
  const dialog = page.locator('#entry-dialog');
  await dialog.getByLabel('날짜', { exact: true }).fill('2025-01-01');
  await dialog.getByRole('button', { name: '저장', exact: true }).click();
  await page.getByRole('button', { name: '오늘', exact: true }).click();
}

async function saveReading(page: Page, reading: string): Promise<void> {
  await page.getByRole('button', { name: '지침 기록', exact: true }).click();
  const dialog = page.locator('#entry-dialog');
  await dialog.getByLabel('누적 숫자 m³', { exact: true }).fill(reading);
  await dialog.getByRole('button', { name: '저장', exact: true }).click();
}

test('a failed IndexedDB write leaves the entered reading in the open dialog', async ({ page }) => {
  await createHousehold(page);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    Object.defineProperty(window, '__ttokttokOriginalPut', { value: original });
    IDBObjectStore.prototype.put = function () {
      throw new DOMException('quota exhausted', 'QuotaExceededError');
    };
  });

  await saveReading(page, '1260.5');
  const dialog = page.locator('#entry-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('누적 숫자 m³', { exact: true })).toHaveValue('1260.5');
  await expect(page.getByText('저장하지 못했습니다. 초안을 유지했습니다.', { exact: true })).toBeVisible();
});

test('a cross-tab conflict merges independent billing-period additions after draft recovery', async ({ browser }) => {
  const context: BrowserContext = await browser.newContext();
  const first = await context.newPage();
  await createHousehold(first);
  const second = await context.newPage();
  await second.goto('/ttokttok/app/');

  await first.getByRole('button', { name: '기록', exact: true }).click();
  await second.getByRole('button', { name: '기록', exact: true }).click();
  const secondPeriodCard = second.locator('section.card').filter({ hasText: '청구 사용 기간' });
  await secondPeriodCard.getByRole('button', { name: '기간 추가', exact: true }).click();
  const secondDialog = second.locator('#entry-dialog');
  await secondDialog.getByLabel('시작일', { exact: true }).fill('2025-02-01');
  await secondDialog.getByLabel('종료일', { exact: true }).fill('2025-02-28');
  await secondDialog.getByLabel('사용량 m³', { exact: true }).fill('29');

  const firstPeriodCard = first.locator('section.card').filter({ hasText: '청구 사용 기간' });
  await firstPeriodCard.getByRole('button', { name: '기간 추가', exact: true }).click();
  const firstDialog = first.locator('#entry-dialog');
  await firstDialog.getByLabel('시작일', { exact: true }).fill('2025-01-01');
  await firstDialog.getByLabel('종료일', { exact: true }).fill('2025-01-31');
  await firstDialog.getByLabel('사용량 m³', { exact: true }).fill('31');
  await firstDialog.getByRole('button', { name: '저장', exact: true }).click();
  await expect(first.getByText('기기에 저장됨', { exact: false }).first()).toBeVisible();
  await secondDialog.getByRole('button', { name: '저장', exact: true }).click();
  await expect(second.getByText('초안 다시 저장', { exact: true })).toBeVisible();
  await expect(second.getByText('저장하지 못한 초안이 있어요.', { exact: false })).toBeVisible();

  await second.getByRole('button', { name: '최신 기록 불러오기', exact: true }).click();
  await second.getByRole('button', { name: '초안 다시 저장', exact: true }).click();
  await expect(second.getByText('기기에 저장됨', { exact: false }).first()).toBeVisible();
  await second.reload();
  await second.getByRole('button', { name: '기록', exact: true }).click();
  for (const usage of ['29 m³', '31 m³']) {
    await expect(second.getByText(usage, { exact: true }).first()).toBeVisible();
  }
  await context.close();
});

test('meter replacement and a corrected billing period retain prior history', async ({ page }) => {
  await createHousehold(page);
  await page.getByRole('button', { name: '기록', exact: true }).click();

  await page.getByRole('button', { name: '교체 기록 시작', exact: true }).click();
  const replacement = page.locator('#entry-dialog');
  await replacement.getByLabel('새 계량기 번호', { exact: true }).fill('meter-2');
  await replacement.getByLabel('누적 숫자 m³', { exact: true }).fill('10');
  await replacement.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByText('10 m³', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('1,258.4 m³', { exact: true }).first()).toBeVisible();

  const periodCard = page.locator('section.card').filter({ hasText: '청구 사용 기간' });
  await periodCard.getByRole('button', { name: '기간 추가', exact: true }).click();
  const periodDialog = page.locator('#entry-dialog');
  await periodDialog.getByLabel('시작일', { exact: true }).fill('2025-01-01');
  await periodDialog.getByLabel('종료일', { exact: true }).fill('2025-01-31');
  await periodDialog.getByLabel('사용량 m³', { exact: true }).fill('50');
  await periodDialog.getByRole('button', { name: '저장', exact: true }).click();
  await expect(periodCard.getByText('50 m³', { exact: true })).toBeVisible();

  await periodCard.getByRole('button', { name: '수정', exact: true }).click();
  await periodDialog.getByLabel('사용량 m³', { exact: true }).fill('55');
  await periodDialog.getByRole('button', { name: '저장', exact: true }).click();
  await expect(periodCard.getByText('55 m³', { exact: true })).toBeVisible();
  await expect(periodCard.getByText('50 m³', { exact: true })).toHaveCount(0);
});

test('the example data is isolated from stored household records', async ({ page }) => {
  await createHousehold(page);
  await page.getByRole('button', { name: '설정', exact: true }).click();
  await page.getByRole('button', { name: '예시 기록 보기', exact: true }).click();
  await expect(page.getByText('예시 기록을 보고 있어요', { exact: true })).toBeVisible();
  await expect(page.getByText('1,261.4 m³', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: '내 기록으로 돌아가기', exact: true }).click();
  await expect(page.getByText('1,258.4 m³', { exact: true }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByText('1,258.4 m³', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('1,261.4 m³', { exact: true })).toHaveCount(0);
});

test('a real waiting update preserves typed input until the user saves and applies it', async ({ page }) => {
  await page.goto('/ttokttok/app/');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  const script = await readFile(resolve(import.meta.dirname, '../../../../ttokttok/app/service-worker.js'), 'utf8');
  await page.route('**/service-worker.js?test-version=2', route => route.fulfill({
    contentType: 'application/javascript',
    body: `${script}\n// Test-only byte change that creates a waiting worker.`,
  }));
  await page.evaluate(async () => {
    await navigator.serviceWorker.register('/ttokttok/app/service-worker.js?test-version=2', { scope: '/ttokttok/app/' });
  });
  const reading = page.getByLabel('계량기 누적 숫자 m³', { exact: true });
  await reading.fill('1258.4');
  await expect(page.getByRole('button', { name: '새로 적용', exact: true })).toBeVisible();
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: '새로 적용', exact: true }).click();
  await expect(reading).toHaveValue('1258.4');
  await expect(page.getByRole('button', { name: '첫 기록 저장', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '첫 기록 저장', exact: true }).click();
  await expect(page.getByText('기기에 저장됨', { exact: false }).first()).toBeVisible();
  await page.getByRole('button', { name: '새로 적용', exact: true }).click();
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByText('1,258.4 m³', { exact: true }).first()).toBeVisible();
});
