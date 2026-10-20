/**
 * Flow 33: Bill form puts Name, Amount and Currency on one line
 * Risk: the currency picker drops under the amount (or the fields wrap), so the form
 *       looks broken and the three related fields are scattered.
 * Real boundaries: auth, Bills page, New Bill form, bill edit form.
 * Each test uses a fresh isolated user.
 */
import { test, expect, type Page } from '@playwright/test';
import { loginNewUser, createBillViaApi } from './helpers';

async function expectOneLine(page: Page) {
  const name = await page.getByRole('textbox', { name: /^Name/ }).boundingBox();
  const amount = await page.getByRole('textbox', { name: 'Amount', exact: true }).boundingBox();
  const currency = await page.getByRole('button', { name: 'Currency', exact: true }).boundingBox();
  expect(name && amount && currency).toBeTruthy();
  const [n, a, c] = [name!, amount!, currency!];
  expect(Math.abs(n.y - a.y)).toBeLessThan(2);
  expect(Math.abs(n.y - c.y)).toBeLessThan(2);
  expect(n.x + n.width).toBeLessThanOrEqual(a.x);
  expect(a.x + a.width).toBeLessThanOrEqual(c.x);
}

test('New Bill form: Name, Amount and Currency share one line on desktop', async ({ page }) => {
  await loginNewUser(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/dashboard/bills');
  await page.getByRole('button', { name: 'New Bill' }).click();
  await expectOneLine(page);
});

test('Edit Bill form: Name, Amount and Currency share one line', async ({ page }) => {
  const billName = `E2E Layout ${Date.now()}`;
  await loginNewUser(page);
  await createBillViaApi(page, billName);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/dashboard/bills');
  await page.getByText(billName, { exact: true }).hover();
  await page.getByRole('button', { name: 'Edit' }).click();
  await expectOneLine(page);
});
