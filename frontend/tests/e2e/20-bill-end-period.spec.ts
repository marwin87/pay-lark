/**
 * Flow 20: Fixed-term bill — no payment is generated after the last month
 * Risk: paying the last instalment still auto-creates next month's instance, so a
 *       finished bill keeps showing a false "to pay" row (and reminders).
 * Real boundaries: auth, POST /bills (end_period), POST /bills/payments/:id/pay,
 *                  POST /bills/sync-instances, GET /bills/payments.
 * Each test uses a fresh isolated user → exactly one bill.
 */
import { test, expect } from '@playwright/test';
import { API, loginNewUser, getCsrfHeader } from './helpers';

test('paying the last instalment of a fixed-term bill creates no further payment', async ({ page }) => {
  const billName = `E2E Installment ${Date.now()}`;
  const now = new Date();
  const currentMonth = now.toISOString().slice(0, 7);
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const nextMonth = next.toISOString().slice(0, 7);

  await loginNewUser(page);

  // Step: create a monthly bill whose last month is the current one
  await page.goto('/dashboard/bills');
  await page.getByRole('button', { name: 'New Bill' }).click();
  await page.getByLabel('Name').fill(billName);
  await page.getByLabel('Amount').fill('89.99');
  await page.getByLabel('Category').click();
  await page.getByRole('option', { name: 'Utilities' }).click();
  // End month via the month/year picker (opens on the current year); shows "---" until set
  const endPicker = page.getByLabel('Last payment month (optional)');
  await expect(endPicker).toHaveText('---');
  await endPicker.click();
  // Earlier months than the current one can't be picked (January is disabled after January)
  if (now.getMonth() > 0) {
    await expect(page.getByRole('button', { name: 'Jan', exact: true })).toBeDisabled();
  }
  const monthShort = new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' }).format(now);
  await page.getByRole('button', { name: monthShort, exact: true }).click();
  await expect(endPicker).not.toHaveText('---');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(billName, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Generate payments' }).click();

  // Step: pay the (only, last) instalment on the payments page
  await page.goto('/dashboard/payments');
  await expect(page.getByText(billName, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Mark as Paid' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Mark as Paid' }).click();
  await expect(page.getByLabel('Revert payment')).toBeVisible();

  // Assert: even an explicit sync for next month generates nothing
  const sync = await page.request.post(`${API}/bills/sync-instances?month=${nextMonth}`, {
    headers: await getCsrfHeader(page),
  });
  expect(sync.ok()).toBeTruthy();
  const res = await page.request.get(`${API}/bills/payments?month=${nextMonth}`);
  expect(await res.json()).toEqual([]);

  // Assert: end month persisted on the template
  const bills = await (await page.request.get(`${API}/bills`)).json();
  expect(bills[0].end_period).toBe(currentMonth);

  // Assert: the edit form shows the saved end month (not "---")
  await page.goto('/dashboard/bills');
  await page.getByText(billName, { exact: true }).hover();
  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(page.getByLabel('Last payment month (optional)')).toContainText(
    String(now.getUTCFullYear()),
  );
});

test('every-3-months bill warns when the end month is off its schedule', async ({ page }) => {
  const now = new Date();
  test.skip(now.getMonth() === 11, 'needs a month after the current one in the same year');

  await loginNewUser(page);
  await page.goto('/dashboard/bills');
  await page.getByRole('button', { name: 'New Bill' }).click();
  await page.locator('#bill-interval').click();
  await page.getByRole('option', { name: '3 months' }).click();

  // End = the month after the start (default start = current month) → not on a 3-month cycle
  await page.getByLabel('Last payment month (optional)').click();
  const nextShort = new Intl.DateTimeFormat('en', { month: 'short' }).format(
    new Date(now.getFullYear(), now.getMonth() + 1, 1),
  );
  await page.getByRole('button', { name: nextShort, exact: true }).click();

  // The last payment falls back to the start month, and the user is told right away
  await expect(page.getByText(/The cycle skips that month/)).toBeVisible();
});

test('a bill with an end month shows its last payment month on the Bills tile', async ({ page }) => {
  const withEnd = `E2E Tile End ${Date.now()}`;
  const withoutEnd = `E2E Tile Open ${Date.now()}`;

  await loginNewUser(page);
  const categoryId = (await (await page.request.get(`${API}/categories`)).json())[0].id;
  for (const [name, end_period] of [[withEnd, '2099-12'], [withoutEnd, undefined]] as const) {
    const res = await page.request.post(`${API}/bills`, {
      data: { name, category_id: categoryId, frequency: 'monthly', amount: '50.00', currency: 'PLN', due_day: 15, end_period },
      headers: { 'Content-Type': 'application/json', ...(await getCsrfHeader(page)) },
    });
    expect(res.ok()).toBeTruthy();
  }

  await page.goto('/dashboard/bills');
  await expect(page.getByText(withEnd)).toBeVisible();
  await expect(page.getByText(withoutEnd)).toBeVisible();
  // Only the bill with an end month carries the text (new user, two bills)
  await expect(page.getByText(/^Last payment: /)).toHaveCount(1);
  await expect(page.getByText('Last payment: December 2099')).toBeVisible();
});

test('the final instalment is labelled "Last payment" on the payments page', async ({ page }) => {
  const billName = `E2E Last ${Date.now()}`;
  const currentMonth = new Date().toISOString().slice(0, 7);

  await loginNewUser(page);
  const res = await page.request.post(`${API}/bills`, {
    data: {
      name: billName,
      category_id: (await (await page.request.get(`${API}/categories`)).json())[0].id,
      frequency: 'monthly',
      amount: '50.00',
      currency: 'PLN',
      due_day: 15,
      end_period: currentMonth,
    },
    headers: { 'Content-Type': 'application/json', ...(await getCsrfHeader(page)) },
  });
  expect(res.ok()).toBeTruthy();
  // A new bill is a draft: activate it so its payments exist
  const activated = await page.request.post(`${API}/bills/${(await res.json()).id}/activate`, {
    headers: await getCsrfHeader(page),
  });
  expect(activated.ok()).toBeTruthy();

  await page.goto('/dashboard/payments');
  await expect(page.getByText(billName, { exact: true })).toBeVisible();
  await expect(page.getByText('Last payment', { exact: true })).toBeVisible();
});
