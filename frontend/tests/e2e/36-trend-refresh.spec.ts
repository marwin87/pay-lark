/**
 * Flow 36: The dashboard's "Last 12 months" chart follows the data when you come back to it
 * Risk: the chart keeps the numbers from an earlier visit, so a payment added or paid since
 *       is missing and the user trusts a wrong history.
 * Real boundaries: auth, GET /bills/payments/trend, POST /bills/payments/:id/pay, dashboard cache.
 * Each test uses a fresh isolated user.
 */
import { test, expect } from '@playwright/test';
import { API, createBillViaApi, getCsrfHeader, loginNewUser, syncPaymentsViaApi } from './helpers';

test('trend chart shows an amount paid after the dashboard was last opened', async ({ page }) => {
  await loginNewUser(page);
  await createBillViaApi(page, `E2E Trend ${Date.now()}`, undefined, { currency: 'PLN', amount: '200.00' });
  await syncPaymentsViaApi(page);

  // Step: first visit (fills the dashboard's page cache)
  await page.goto('/dashboard');
  const chart = page.getByRole('region', { name: 'Last 12 months' });
  await expect(chart.getByRole('button', { name: /PLN\s?200/ })).toBeVisible();

  // Step: the payment is paid with a different amount while the user is elsewhere
  const [first] = (await (await page.request.get(`${API}/bills/payments`)).json()) as Array<{ id: number }>;
  const res = await page.request.post(`${API}/bills/payments/${first.id}/pay`, {
    data: { paid_amount: 350 },
    headers: { 'Content-Type': 'application/json', ...(await getCsrfHeader(page)) },
  });
  expect(res.ok()).toBeTruthy();

  // Step: back to the dashboard through the menu (no full reload)
  await page.getByRole('navigation').getByRole('link', { name: 'To pay' }).click();
  await expect(page).toHaveURL(/\/dashboard\/payments/);
  await page.getByRole('navigation').getByRole('link', { name: 'Overview' }).click();

  // Assert: the chart shows what was actually paid, not the old figure
  await expect(chart.getByRole('button', { name: /PLN\s?350/ })).toBeVisible();
  await expect(chart.getByRole('button', { name: /PLN\s?200/ })).toHaveCount(0);
});
