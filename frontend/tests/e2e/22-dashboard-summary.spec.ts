/**
 * Flow 22: Dashboard month summary (card, category donut, 12-month trend)
 * Risk: amounts in different currencies get added together (or the wrong currency's
 *       totals are shown), so the user sees a meaningless "paid of total" figure.
 * Real boundaries: auth, GET /bills/payments, GET /bills/payments/trend, routing from the logo.
 */
import { test, expect } from '@playwright/test';
import { loginNewUser, createBillViaApi, syncPaymentsViaApi } from './helpers';

test('dashboard summarises each currency separately and is reachable from the logo', async ({ page }) => {
  const stamp = Date.now();

  await loginNewUser(page);
  await createBillViaApi(page, `E2E Dash PLN ${stamp}`, undefined, { currency: 'PLN', amount: '200.00' });
  await createBillViaApi(page, `E2E Dash EUR ${stamp}`, undefined, { currency: 'EUR', amount: '50.00' });
  await syncPaymentsViaApi(page);

  // Step: reach the dashboard through the logo, not by URL
  await page.goto('/dashboard/payments');
  await page.getByRole('link', { name: /Pay\s?Tracker/ }).first().click();
  await expect(page).toHaveURL(/\/dashboard$/);

  // Step: the menu marks the dashboard as the current page and leads back to it
  await page.goto('/dashboard/payments');
  await page.getByRole('navigation').getByRole('link', { name: 'Overview' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  // Step: pick EUR — only the €50 bill counts
  const currencies = page.getByRole('group', { name: 'Show summary in:' });
  await currencies.getByRole('button', { name: 'EUR' }).click();
  const card = page.getByRole('region', { name: /\d{4}/ }); // month-summary section, titled "<Month> <Year>"
  await expect(card).toContainText('€50');
  await expect(card).not.toContainText('200');

  // Step: pick PLN — only the 200 zł bill counts
  await currencies.getByRole('button', { name: 'PLN' }).click();
  await expect(card).toContainText(/PLN\s?200/);
  await expect(card).not.toContainText('€');

  // Step: the choice survives a visit to another page
  await page.getByRole('navigation').getByRole('link', { name: 'To pay' }).click();
  await expect(page).toHaveURL(/\/dashboard\/payments/);
  await page.getByRole('navigation').getByRole('link', { name: 'Overview' }).click();
  await expect(page.getByRole('group', { name: 'Show summary in:' }).getByRole('button', { name: 'PLN' })).toHaveAttribute('aria-pressed', 'true');
  await expect(card).toContainText(/PLN\s?200/);

  // Step: donut lists the bill's category and the trend chart is rendered
  await expect(page.getByRole('region', { name: 'By category' })).toContainText('Utilities');
  await expect(page.getByRole('region', { name: 'Last 12 months' })).toBeVisible();

  // Step: Settings is not among the nav links; it sits in the sidebar's lower block
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Settings' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveURL(/\/dashboard\/settings/);
});
