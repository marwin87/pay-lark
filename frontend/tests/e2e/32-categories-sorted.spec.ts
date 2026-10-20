/**
 * Flow 32: Categories are listed A-Z in Settings and in the bill form's Category dropdown, with no "default" badge
 * Risk: categories show in creation order, so a new or renamed category lands at the bottom
 *       and the user can't find it.
 * Real boundaries: auth, /categories API, Settings > Categories tab, bill edit form.
 * Each test uses a fresh isolated user.
 */
import { test, expect } from '@playwright/test';
import { API, createBillViaApi, getCsrfHeader, loginNewUser } from './helpers';

async function addCategories(page: import('@playwright/test').Page, names: string[]) {
  for (const name of names) {
    const res = await page.request.post(`${API}/categories`, {
      data: { name, color: 'rose' },
      headers: { 'Content-Type': 'application/json', ...(await getCsrfHeader(page)) },
    });
    expect(res.ok()).toBeTruthy();
  }
}

test('Settings lists categories A-Z, including newly created ones', async ({ page }) => {
  const stamp = Date.now();
  const first = `Aaa E2E ${stamp}`;
  const last = `Zzz E2E ${stamp}`;

  await loginNewUser(page);
  await addCategories(page, [last, first]); // created out of order on purpose

  await page.goto('/dashboard/settings');
  await page.getByRole('tab', { name: 'Categories', exact: true }).click();
  await expect(page.getByText(first, { exact: true })).toBeVisible();

  const text = await page.getByRole('tabpanel').innerText();
  const order = [first, 'Education', 'Housing', 'Loans', 'Other', last].map((n) => text.indexOf(n));
  expect(order.every((i) => i >= 0)).toBeTruthy();
  expect(order).toEqual([...order].sort((a, b) => a - b));
});

test('bill form Category dropdown lists categories A-Z, including newly created ones', async ({ page }) => {
  const stamp = Date.now();
  const billName = `E2E Sorted ${stamp}`;

  await loginNewUser(page);
  await createBillViaApi(page, billName);
  await addCategories(page, [`Zzz E2E ${stamp}`, `Aaa E2E ${stamp}`]);

  await page.goto('/dashboard/bills');
  await page.getByText(billName, { exact: true }).hover();
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Category').click();

  const labels = (await page.getByRole('option').allTextContents()).filter((l) => l !== '—');
  expect(labels.length).toBeGreaterThan(10);
  expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b, 'en')));
});

test('Settings does not mark any category as "default"', async ({ page }) => {
  await loginNewUser(page);
  await page.goto('/dashboard/settings');
  await page.getByRole('tab', { name: 'Categories', exact: true }).click();
  await expect(page.getByText('Education', { exact: true })).toBeVisible();
  await expect(page.getByText('default', { exact: true })).toHaveCount(0);
});

test('Settings explains when a category is archived instead of deleted', async ({ page }) => {
  await loginNewUser(page);
  await page.goto('/dashboard/settings');
  await page.getByRole('tab', { name: 'Categories', exact: true }).click();
  await expect(page.getByText(/archived instead of deleted/)).toBeVisible();
});

test('category row puts Delete/Archive before Edit', async ({ page }) => {
  await loginNewUser(page);
  await page.goto('/dashboard/settings');
  await page.getByRole('tab', { name: 'Categories', exact: true }).click();
  const remove = await page.getByRole('button', { name: 'Delete', exact: true }).first().boundingBox();
  const edit = await page.getByRole('button', { name: 'Edit', exact: true }).first().boundingBox();
  expect(remove && edit && remove.x < edit.x).toBeTruthy();
});
