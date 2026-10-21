/**
 * Flow 22: Dashboard month summary (card, category donut, 12-month trend)
 * Risk: amounts in different currencies get added together (or the wrong currency's
 *       totals are shown), so the user sees a meaningless "paid of total" figure.
 * Real boundaries: auth, GET /bills/payments, GET /bills/payments/trend, routing from the logo.
 */
import { test, expect } from '@playwright/test';
import { loginNewUser, createBillViaApi, syncPaymentsViaApi } from './helpers';

test('dashboard shows each currency in its own row and is reachable from the logo', async ({ page }) => {
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

  // Step: each currency has its own row, and its totals never include the other currency
  const card = page.getByRole('region', { name: /\d{4}/ }); // month-summary section, titled "<Month> <Year>"
  const eurRow = card.getByRole('button', { name: /^EUR / });
  const plnRow = card.getByRole('button', { name: /^PLN / });
  await expect(eurRow).toContainText('€50');
  await expect(eurRow).not.toContainText('200');
  await expect(plnRow).toContainText(/PLN\s?200/);
  await expect(plnRow).not.toContainText('€');

  // Step: the first row (biggest volume, PLN) starts open; the other starts folded
  await expect(plnRow).toHaveAttribute('aria-expanded', 'true');
  await expect(eurRow).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('region', { name: 'By category' })).toContainText('Utilities');
  await expect(page.getByRole('region', { name: 'Last 12 months' })).toBeVisible();

  // Step: open EUR as well, then close PLN
  await eurRow.click();
  await expect(eurRow).toHaveAttribute('aria-expanded', 'true');
  await plnRow.click();
  await expect(plnRow).toHaveAttribute('aria-expanded', 'false');

  // Step: the open rows are remembered after a visit to another page
  await page.getByRole('navigation').getByRole('link', { name: 'To pay' }).click();
  await expect(page).toHaveURL(/\/dashboard\/payments/);
  await page.getByRole('navigation').getByRole('link', { name: 'Overview' }).click();
  await expect(card.getByRole('button', { name: /^EUR / })).toHaveAttribute('aria-expanded', 'true');
  await expect(card.getByRole('button', { name: /^PLN / })).toHaveAttribute('aria-expanded', 'false');
  await expect(card.getByRole('button', { name: /^EUR / })).toContainText('€50');
  await expect(card.getByRole('button', { name: /^PLN / })).toContainText(/PLN\s?200/);

  // Step: Settings is not among the nav links; it sits in the sidebar's lower block
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Settings' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveURL(/\/dashboard\/settings/);
});
