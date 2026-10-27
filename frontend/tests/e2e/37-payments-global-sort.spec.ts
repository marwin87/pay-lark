/**
 * Flow 37: Payments can be sorted paid/unpaid first across all categories
 * Risk: the "(all categories)" sort only reorders inside each category (like the older
 *       Paid first / Unpaid first), so a paid payment in a late category stays buried
 *       below unpaid ones from earlier categories.
 *       Collapse all stays visible but disabled there, as there are no groups to collapse.
 * Real boundaries: auth, POST /categories, POST /bills, POST /bills/payments/:id/pay,
 *       the payments page "Sort by" filter and its session persistence.
 * Each test uses a fresh isolated user.
 */
import { test, expect, type Page } from '@playwright/test';
import { API, createBillViaApi, getCsrfHeader, loginNewUser, syncPaymentsViaApi } from './helpers';

async function addCategory(page: Page, name: string): Promise<number> {
  const res = await page.request.post(`${API}/categories`, {
    data: { name, color: 'rose' },
    headers: { 'Content-Type': 'application/json', ...(await getCsrfHeader(page)) },
  });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).id as number;
}

async function payByBillName(page: Page, billName: string) {
  const list = (await (await page.request.get(`${API}/bills/payments`)).json()) as Array<{
    id: number;
    bill_name: string;
  }>;
  const target = list.find((p) => p.bill_name === billName);
  expect(target).toBeTruthy();
  const res = await page.request.post(`${API}/bills/payments/${target!.id}/pay`, {
    data: {},
    headers: { 'Content-Type': 'application/json', ...(await getCsrfHeader(page)) },
  });
  expect(res.ok()).toBeTruthy();
}

async function chooseSort(page: Page, option: string) {
  await page.getByRole('button', { name: 'Sort by' }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

async function top(page: Page, text: string): Promise<number> {
  const box = await page.getByText(text, { exact: true }).boundingBox();
  expect(box).not.toBeNull();
  return box!.y;
}

test('"(all categories)" sorts paid/unpaid first across categories and survives a reload', async ({ page }) => {
  await loginNewUser(page);
  const stamp = Date.now();
  // Category A-Z puts "A-Cat" first, so the unpaid bill there outranks the paid one in "B-Cat"
  // unless the sort really ignores categories.
  const catA = await addCategory(page, `A-Cat ${stamp}`);
  const catB = await addCategory(page, `B-Cat ${stamp}`);
  const unpaid = `E2E Alpha ${stamp}`;
  const paid = `E2E Bravo ${stamp}`;
  await createBillViaApi(page, unpaid, catA);
  await createBillViaApi(page, paid, catB);
  await syncPaymentsViaApi(page);
  await payByBillName(page, paid);

  await page.goto('/dashboard/payments');
  await expect(page.getByText(unpaid, { exact: true })).toBeVisible();

  // Step: within-category sort keeps category order — unpaid (A-Cat) above paid (B-Cat)
  await chooseSort(page, 'Paid first');
  expect(await top(page, unpaid)).toBeLessThan(await top(page, paid));
  const collapseAll = page.getByRole('button', { name: 'Collapse all' });
  await expect(collapseAll).toBeEnabled();

  // Step: global paid first — the paid bill from B-Cat jumps above the unpaid one from A-Cat
  await chooseSort(page, 'Paid first (all categories)');
  await expect(page.getByRole('button', { name: 'Sort by' })).toHaveText('Paid first (all categories)');
  expect(await top(page, paid)).toBeLessThan(await top(page, unpaid));
  await expect(collapseAll).toBeVisible();
  await expect(collapseAll).toBeDisabled();

  // Step: each row carries its category, since headers are gone
  await expect(page.getByText(`B-Cat ${stamp}`, { exact: true })).toBeVisible();
  await expect(page.getByText(`A-Cat ${stamp}`, { exact: true })).toBeVisible();

  // Step: the choice survives a reload
  await page.reload();
  await expect(page.getByRole('button', { name: 'Sort by' })).toHaveText('Paid first (all categories)');
  expect(await top(page, paid)).toBeLessThan(await top(page, unpaid));
  await expect(collapseAll).toBeDisabled();

  // Step: global unpaid first flips the order back
  await chooseSort(page, 'Unpaid first (all categories)');
  expect(await top(page, unpaid)).toBeLessThan(await top(page, paid));
  await expect(collapseAll).toBeDisabled();

  // Step: back to a grouped sort re-enables it
  await chooseSort(page, 'Category A-Z');
  await expect(collapseAll).toBeEnabled();
});
