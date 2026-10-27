/**
 * Flow 38: On desktop the month can be moved a whole year at a time
 * Risk: the year-jump arrows are missing, jump by the wrong amount, or drop the month,
 *       leaving the user clicking "Previous month" twelve times to reach last year.
 * Real boundaries: auth, the dashboard and payments month navigation.
 * Each test uses a fresh isolated user.
 */
import { test, expect } from '@playwright/test';
import { loginNewUser } from './helpers';

const now = new Date();
const year = now.getFullYear();
const monthName = new Intl.DateTimeFormat('en', { month: 'long' }).format(now);

for (const [name, path] of [
  ['payments', '/dashboard/payments'],
  ['dashboard', '/dashboard'],
] as const) {
  test(`${name} month jumps a year at a time and keeps the month`, async ({ page }) => {
    await loginNewUser(page);
    await page.goto(path);

    const title = (y: number) => page.getByRole('heading', { level: 2, name: new RegExp(`${monthName} ${y}`, 'i') });
    await expect(title(year)).toBeVisible();

    await page.getByRole('button', { name: 'Next year' }).click();
    await expect(title(year + 1)).toBeVisible();

    await page.getByRole('button', { name: 'Previous year' }).click();
    await page.getByRole('button', { name: 'Previous year' }).click();
    await expect(title(year - 1)).toBeVisible();
  });
}
