/**
 * Flow 14: Categories — create / rename / delete (archive when in use) in Settings, filter payments by category
 * Risk: a category change does not persist (or delete/archive is not reflected), or the payments
 *       category filter shows rows from other categories — user misreads what is due.
 * Real boundaries: auth, /categories API, /bills/payments API, payments list filtering.
 * Each test uses a fresh isolated user.
 */
import { test, expect } from '@playwright/test';
import {
  API,
  categoryIdByName,
  createBillViaApi,
  getCsrfHeader,
  loginNewUser,
  syncPaymentsViaApi,
} from './helpers';

test('create, rename and delete an unused custom category in Settings', async ({ page }) => {
  const name = `E2E Cat ${Date.now()}`;
  const renamed = `${name} Renamed`;

  await loginNewUser(page);
  await page.goto('/dashboard/settings');
  await page.getByRole('tab', { name: 'Categories', exact: true }).click();

  // Step: create
  await page.getByRole('button', { name: 'Add category', exact: true }).click();
  await page.getByPlaceholder('e.g. Hobbies').fill(name);
  await page.getByRole('button', { name: 'rose', exact: true }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText(name, { exact: true })).toBeVisible();

  // Step: rename — categories are listed A-Z and "E2E…" sorts before every default, so its row is first
  await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
  await page.getByRole('textbox').last().fill(renamed);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText(renamed, { exact: true })).toBeVisible();
  await expect(page.getByText(name, { exact: true })).not.toBeVisible();

  // Step: delete — no bill uses it, so it is removed for good
  await page.getByRole('button', { name: 'Delete', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText(renamed, { exact: true })).toBeVisible(); // Cancel keeps it

  await page.getByRole('button', { name: 'Delete', exact: true }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete category', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByText(renamed, { exact: true })).not.toBeVisible();

  // Assert: persisted server-side
  await page.reload();
  await page.getByRole('tab', { name: 'Categories', exact: true }).click();
  await expect(page.getByText(renamed, { exact: true })).not.toBeVisible();
});

test('deleting a category used by a bill archives it instead', async ({ page }) => {
  const stamp = Date.now();
  const name = `E2E Used Cat ${stamp}`;

  await loginNewUser(page);
  const res = await page.request.post(`${API}/categories`, {
    data: { name, color: 'rose' },
    headers: { 'Content-Type': 'application/json', ...(await getCsrfHeader(page)) },
  });
  expect(res.ok()).toBeTruthy();
  await createBillViaApi(page, `E2E Used Cat Bill ${stamp}`, await categoryIdByName(page, name));

  await page.goto('/dashboard/settings');
  await page.getByRole('tab', { name: 'Categories', exact: true }).click();

  // A category a bill uses offers Archive (visible label), not Delete; unused ones offer Delete
  await expect(page.getByRole('button', { name: 'Archive', exact: true })).toHaveCount(1);
  await expect(page.getByText('Archive', { exact: true })).toBeVisible();
  await expect(page.getByText('Delete', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Archive', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByText('archived', { exact: true })).not.toBeVisible(); // Cancel archives nothing
  await page.getByRole('button', { name: 'Archive', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Archive category', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();

  // Kept, flagged as archived, and can be restored
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  await expect(page.getByText('archived', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Unarchive', exact: true })).toBeVisible();
});

test('category filter on payments shows only the selected category', async ({ page }) => {
  const stamp = Date.now();
  const customCategory = `E2E Filter Cat ${stamp}`;
  const defaultBill = `E2E Default Cat Bill ${stamp}`;
  const customBill = `E2E Custom Cat Bill ${stamp}`;

  await loginNewUser(page);
  const res = await page.request.post(`${API}/categories`, {
    data: { name: customCategory, color: 'rose' },
    headers: { 'Content-Type': 'application/json', ...(await getCsrfHeader(page)) },
  });
  expect(res.ok()).toBeTruthy();
  const customId = await categoryIdByName(page, customCategory);

  await createBillViaApi(page, defaultBill); // utilities
  await createBillViaApi(page, customBill, customId);
  await syncPaymentsViaApi(page);

  await page.goto('/dashboard/payments');
  await expect(page.getByText(defaultBill)).toBeVisible();
  await expect(page.getByText(customBill)).toBeVisible();

  // Step: filter to the custom category only
  await page.getByRole('button', { name: 'All categories' }).click();
  await page.getByRole('checkbox', { name: customCategory }).check({ force: true });

  // Assert: only the custom-category payment remains
  await expect(page.getByText(customBill)).toBeVisible();
  await expect(page.getByText(defaultBill)).not.toBeVisible();
});
