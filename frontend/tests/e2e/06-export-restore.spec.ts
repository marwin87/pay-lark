/**
 * Flow 6: Export → Restore → data intact
 * Risk: restore wipes data or corrupts bill count — user loses history.
 * Real boundaries: auth, GET /export/json, POST /export/restore, DB round-trip.
 * Export is done via API (to avoid file-system download handling); restore uses
 * the RestoreButton UI to test the real upload-confirm flow.
 */
import { test, expect } from '@playwright/test';
import { loginNewUser, createBillViaApi, syncPaymentsViaApi } from './helpers';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

test('restore from backup preserves bill count', async ({ page }) => {
  const billName = `E2E Export ${Date.now()}`;

  // Setup: authenticate + create a bill via API
  await loginNewUser(page);
  await createBillViaApi(page, billName);

  // Step: export backup JSON via API (bypass the browser download to avoid temp-file
  // download complexity; the restore UI is the boundary under test here)
  const apiUrl = process.env.E2E_API_URL ?? 'http://localhost:8010';
  const exportRes = await page.request.get(`${apiUrl}/export/json`);
  expect(exportRes.ok()).toBeTruthy();
  const backup = await exportRes.json();
  const billCountBefore: number = backup.bill_templates.length;
  expect(billCountBefore).toBeGreaterThan(0);

  // Save backup to a temp file so the file chooser can pick it up
  const tmpFile = path.join(os.tmpdir(), `paylark-backup-${Date.now()}.json`);
  fs.writeFileSync(tmpFile, JSON.stringify(backup));

  // Step: navigate to settings where RestoreButton lives, under the Backup tab
  await page.goto('/dashboard/settings');
  await page.getByRole('tab', { name: 'Backup', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Restore from backup' })).toBeVisible();

  // Step: click restore button — triggers hidden file input
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Restore from backup' }).click(),
  ]);
  await fileChooser.setFiles(tmpFile);

  // Confirmation dialog appears
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  // Step: confirm "Replace My Data". Success triggers window.location.reload()
  // on the same URL, so waitForURL('**/settings') would resolve immediately
  // regardless of outcome (already there) and silently mask a failed restore
  // (dialog would stay open showing an error instead of reloading) — wait for
  // the reload's load event instead, which only fires on an actual reload.
  await Promise.all([
    page.waitForEvent('load'),
    dialog.getByRole('button', { name: 'Replace My Data' }).click(),
  ]);

  // Step: re-export to verify count matches
  const afterRes = await page.request.get(`${apiUrl}/export/json`);
  const after = await afterRes.json();
  const billCountAfter: number = after.bill_templates.length;

  // Assert: bill count is identical after restore
  expect(billCountAfter).toBe(billCountBefore);

  // Assert: the specific bill is still there
  const names = after.bill_templates.map((t: { name: string }) => t.name);
  expect(names).toContain(billName);

  // Cleanup temp file
  fs.unlinkSync(tmpFile);
});

test('restoring a backup with fewer bills/payments than current shows the stale-data warning', async ({
  page,
}) => {
  const apiUrl = process.env.E2E_API_URL ?? 'http://localhost:8010';

  // Setup: one bill, synced payment, then export — this is the "stale" backup.
  await loginNewUser(page);
  await createBillViaApi(page, `E2E Stale ${Date.now()}`);
  await syncPaymentsViaApi(page);

  const staleExportRes = await page.request.get(`${apiUrl}/export/json`);
  expect(staleExportRes.ok()).toBeTruthy();
  const staleBackup = await staleExportRes.json();
  expect(staleBackup.bill_templates.length).toBe(1);

  const tmpFile = path.join(os.tmpdir(), `paylark-backup-stale-${Date.now()}.json`);
  fs.writeFileSync(tmpFile, JSON.stringify(staleBackup));

  // Add more data after the backup was taken, so current data now exceeds the backup.
  await createBillViaApi(page, `E2E Newer ${Date.now()}`);
  await syncPaymentsViaApi(page);

  await page.goto('/dashboard/settings');
  await page.getByRole('tab', { name: 'Backup', exact: true }).click();
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Restore from backup' }).click(),
  ]);
  await fileChooser.setFiles(tmpFile);

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText(
      'This backup has fewer bills and payments than the current data. Restoring will permanently delete the difference.'
    )
  ).toBeVisible();

  // Don't actually restore — cancel, since this test only verifies the warning.
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).not.toBeVisible();

  fs.unlinkSync(tmpFile);
});

test('picking a malformed backup file shows an inline error, not the comparison/confirm flow', async ({
  page,
}) => {
  await loginNewUser(page);

  const tmpFile = path.join(os.tmpdir(), `paylark-backup-malformed-${Date.now()}.json`);
  fs.writeFileSync(tmpFile, 'this is not valid JSON {{{');

  await page.goto('/dashboard/settings');
  await page.getByRole('tab', { name: 'Backup', exact: true }).click();
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Restore from backup' }).click(),
  ]);
  await fileChooser.setFiles(tmpFile);

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText("This file doesn't look like a valid backup.")
  ).toBeVisible();

  // No counts/comparison block should render for an invalid file.
  await expect(dialog.getByText('Current', { exact: true })).not.toBeVisible();
  await expect(dialog.getByText('Backup', { exact: true })).not.toBeVisible();

  fs.unlinkSync(tmpFile);
});

test('backup dialog: select/deselect all drives a partial export', async ({ page }) => {
  await loginNewUser(page);
  await page.goto('/dashboard/settings');
  await page.getByRole('tab', { name: 'Backup', exact: true }).click();
  await page.getByRole('button', { name: 'Download backup' }).click();

  const dialog = page.getByRole('dialog');
  const boxes = dialog.getByRole('checkbox');
  await expect(boxes).toHaveCount(9);
  for (const box of await boxes.all()) await expect(box).toBeChecked();

  // Deselect all disables the download; selecting one section re-enables it.
  await dialog.getByRole('button', { name: 'Deselect all' }).click();
  await expect(dialog.getByRole('button', { name: 'Download', exact: true })).toBeDisabled();
  await dialog.getByRole('checkbox', { name: 'Currency & number format' }).check({ force: true });

  const [request] = await Promise.all([
    page.waitForRequest((r) => r.url().includes('/export/json')),
    dialog.getByRole('button', { name: 'Download', exact: true }).click(),
  ]);
  expect(new URL(request.url()).searchParams.getAll('sections')).toEqual(['currency']);
});
