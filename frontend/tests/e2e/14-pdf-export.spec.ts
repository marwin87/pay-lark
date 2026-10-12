/**
 * Flow 14: PDF export from the payments page
 * Risk: the PDF button downloads an empty/corrupt file.
 * Real boundaries: auth, GET /export/pdf, browser download.
 */
import * as fs from 'fs';
import { test, expect } from '@playwright/test';
import brand from '../../messages/brand.json';
import { loginNewUser, createBillViaApi, syncPaymentsViaApi } from './helpers';

test('PDF export > Whole year downloads a real .pdf', async ({ page }) => {
  const billName = `E2E Pdf ${Date.now()}`;

  await loginNewUser(page);
  await createBillViaApi(page, billName);
  await syncPaymentsViaApi(page);

  await page.goto('/dashboard/payments');
  await expect(page.getByText(billName)).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /PDF export/i }).click();
  await page.getByRole('option', { name: new RegExp(`Whole year \\(${new Date().getFullYear()}\\)`) }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(new RegExp(`^${brand.slug}-.+-${new Date().getFullYear()}\\.pdf$`));
  const bytes = fs.readFileSync(await download.path());
  expect(bytes.subarray(0, 4).toString('latin1')).toBe('%PDF');
});
