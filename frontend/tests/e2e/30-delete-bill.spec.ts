/**
 * Flow 30: Only a bill with nothing paid can be deleted (drafts, and paused bills without a paid payment)
 * Risk: a bill with paid history offers Delete (history lost, or the API refuses after
 *       the click), or a bill whose payments are all unpaid cannot be removed and
 *       clutters the list forever.
 * Real boundaries: auth, POST /bills, /activate, /archive, DELETE /bills/:id,
 * GET /bills/payments, the Bills page.
 */
import { test, expect } from '@playwright/test';
import {
  API,
  activateViaApi,
  createDraftViaApi,
  getCsrfHeader,
  loginNewUser,
  pauseViaApi,
  payFirstPaymentViaApi,
} from './helpers';

test('a draft can be deleted, and has no Pause', async ({ page }) => {
  const name = `E2E Draft ${Date.now()}`;
  const row = page.getByText(name, { exact: true });
  await loginNewUser(page);
  await createDraftViaApi(page, name);

  await page.goto('/dashboard/bills');
  await expect(row).toBeVisible();
  await expect(page.getByRole('button', { name: 'Generate payments' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Delete bill?' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Delete bill' }).click();

  await expect(page.getByRole('status')).toContainText(`“${name}” deleted`);
  await expect(row).toHaveCount(0);
  await page.reload();
  await expect(row).toHaveCount(0);
});

test('cancelling the delete dialog keeps the bill', async ({ page }) => {
  const name = `E2E Keep ${Date.now()}`;
  await loginNewUser(page);
  await createDraftViaApi(page, name);

  await page.goto('/dashboard/bills');
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
});

test('Generate payments, Pause: nothing paid, so the bill and its unpaid payments can be deleted', async ({ page }) => {
  const name = `E2E Live ${Date.now()}`;
  const row = page.getByText(name, { exact: true });
  await loginNewUser(page);
  const id = await createDraftViaApi(page, name);
  await activateViaApi(page, id);
  await pauseViaApi(page, id);

  await page.goto('/dashboard/bills');
  await page.getByRole('button', { name: /Show paused/ }).first().click();
  await expect(row).toBeVisible();
  await expect(page.getByText('Nothing was paid, so it can be deleted.')).toBeVisible();

  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete bill' }).click();
  await expect(page.getByRole('status')).toContainText(`“${name}” deleted`);
  await expect(row).toHaveCount(0);

  // Its payments went with it.
  const payments = await page.request.get(`${API}/bills/payments`);
  expect(((await payments.json()) as Array<{ bill_id: number }>).filter((p) => p.bill_id === id)).toHaveLength(0);
});

test('a paused bill with a paid payment keeps its history: no Delete, and the server refuses too', async ({ page }) => {
  const name = `E2E Paid ${Date.now()}`;
  const row = page.getByText(name, { exact: true });
  await loginNewUser(page);
  const id = await createDraftViaApi(page, name);
  await activateViaApi(page, id);
  await payFirstPaymentViaApi(page);
  await pauseViaApi(page, id);

  await page.goto('/dashboard/bills');
  await page.getByRole('button', { name: /Show paused/ }).first().click();
  await expect(row).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
  await expect(page.getByText('Nothing was paid, so it can be deleted.')).toHaveCount(0);
  // The tile says why instead.
  await expect(page.getByText('Can’t be deleted: at least one payment was paid.')).toBeVisible();

  const res = await page.request.delete(`${API}/bills/${id}`, { headers: await getCsrfHeader(page) });
  expect(res.status()).toBe(409);
});

test('a paused bill that never had a payment explains why it can be deleted, and is deleted', async ({ page }) => {
  const name = `E2E Empty ${Date.now()}`;
  const row = page.getByText(name, { exact: true });
  await loginNewUser(page);
  // Annual bill whose first period is still ahead: live, but with no payment yet.
  const month = new Date().getUTCMonth() + 1;
  const id = await createDraftViaApi(page, name, { frequency: 'annual', due_month: (month % 12) + 1 });
  await activateViaApi(page, id);
  await pauseViaApi(page, id);

  // No payment exists for it at all.
  const payments = await page.request.get(`${API}/bills/payments`);
  expect(((await payments.json()) as Array<{ bill_id: number }>).filter((p) => p.bill_id === id)).toHaveLength(0);

  await page.goto('/dashboard/bills');
  await page.getByRole('button', { name: /Show paused/ }).first().click();
  await expect(row).toBeVisible();
  await expect(page.getByText('Nothing was paid, so it can be deleted.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible();

  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete bill' }).click();
  await expect(page.getByRole('status')).toContainText(`“${name}” deleted`);
  await expect(row).toHaveCount(0);

  const after = await page.request.get(`${API}/bills?include_archived=true`);
  expect((await after.json()) as unknown[]).toHaveLength(0);
});

test('on a phone the draft tile keeps its three buttons the same height and inside the tile', async ({ page }) => {
  const name = `E2E Phone ${Date.now()}`;
  await page.setViewportSize({ width: 360, height: 800 });
  await loginNewUser(page);
  await createDraftViaApi(page, name);

  await page.goto('/dashboard/bills');
  const tile = page.getByTestId('bill-tile');
  await expect(tile).toBeVisible();
  const tileBox = (await tile.boundingBox())!;

  const buttons = ['Generate payments', 'Delete', 'Edit'].map((n) =>
    tile.getByRole('button', { name: n, exact: true }),
  );
  const heights: number[] = [];
  for (const b of buttons) {
    await expect(b).toBeVisible();
    const box = (await b.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(tileBox.x);
    expect(box.x + box.width).toBeLessThanOrEqual(tileBox.x + tileBox.width);
    heights.push(Math.round(box.height));
  }
  expect(new Set(heights).size).toBe(1);
});
