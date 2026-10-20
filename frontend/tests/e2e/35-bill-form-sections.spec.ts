/**
 * Flow 35: Bill form guides the user — three sections, category up front, live summary
 * Risk: the user can't tell what is required or what their choices lead to, and saves
 *       a bill with the wrong schedule.
 * Real boundaries: auth, Bills page, New Bill form.
 * Each test uses a fresh isolated user.
 */
import { test, expect } from '@playwright/test';
import { loginNewUser } from './helpers';

async function openNewBill(page: import('@playwright/test').Page) {
  await loginNewUser(page);
  await page.goto('/dashboard/bills');
  await page.getByRole('button', { name: 'New Bill' }).click();
}

test('sections are named and ordered: what you pay, when, extras', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openNewBill(page);

  const what = await page.getByText('What do you pay?', { exact: true }).boundingBox();
  const category = await page.getByLabel('Category').boundingBox();
  const when = await page.getByText('When is it paid?', { exact: true }).boundingBox();
  const days = await page.getByLabel('Payment days').boundingBox();
  const extras = await page.getByText('Extras', { exact: true }).boundingBox();
  expect(what && category && when && days && extras).toBeTruthy();
  expect(what!.y).toBeLessThan(category!.y);
  expect(category!.y).toBeLessThan(when!.y); // category is part of "what", before the schedule
  expect(when!.y).toBeLessThan(days!.y);
  expect(days!.y).toBeLessThan(extras!.y);
});

test('end month and notes live in a collapsed Extras block', async ({ page }) => {
  await openNewBill(page);
  await expect(page.getByLabel('Notes')).toBeHidden();
  await page.getByText('End date and notes', { exact: true }).click();
  await expect(page.getByLabel('Notes')).toBeVisible();
  await expect(page.getByLabel('Last payment month (optional)')).toBeVisible();
});

test('summary follows the form and lists the next payments', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openNewBill(page);
  const summary = page.getByRole('region', { name: 'Summary' });

  await page.getByRole('textbox', { name: /^Name/ }).fill('Electricity E2E');
  await page.getByRole('textbox', { name: 'Amount', exact: true }).fill('99,99');
  await expect(summary).toContainText('Electricity E2E');
  await expect(summary).toContainText('99,99');
  await expect(summary.getByRole('listitem')).toHaveCount(3); // monthly: next three payments

  await page.getByRole('button', { name: 'One-off', exact: true }).click();
  await expect(summary.getByRole('listitem')).toHaveCount(1);
});

test('on a phone the Save button stays on screen while the form scrolls', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 700 });
  await openNewBill(page);
  const save = page.getByRole('button', { name: 'Save', exact: true });
  const box = await save.boundingBox();
  const bottomNav = await page.getByRole('navigation').last().boundingBox(); // fixed tab bar
  expect(box && bottomNav).toBeTruthy();
  expect(box!.y + box!.height).toBeLessThanOrEqual(bottomNav!.y); // not hidden under the tab bar
});
