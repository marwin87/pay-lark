import * as fs from 'fs';
import type { Page } from '@playwright/test';

export const API = process.env.E2E_API_URL ?? 'http://localhost:8010';
const E2E_USERS_FILE = '/tmp/e2e-users.json';

type TrackedUser = { email: string; password: string };

function readTrackedUsers(): TrackedUser[] {
  return fs.existsSync(E2E_USERS_FILE)
    ? (JSON.parse(fs.readFileSync(E2E_USERS_FILE, 'utf-8')) as TrackedUser[])
    : [];
}

function writeTrackedUsers(users: TrackedUser[]): void {
  fs.writeFileSync(E2E_USERS_FILE, JSON.stringify(users));
}

/**
 * Registers `email`/`password` for globalTeardown, which logs in as that user and
 * deletes the account via DELETE /auth/users/me (the endpoint needs the password,
 * and a token captured at registration goes stale when the password changes).
 * loginNewUser calls this for you; call it directly only when a test creates a user
 * outside that helper (e.g. re-registering an email after deleting the original).
 */
export function trackUser(email: string, password: string): void {
  const existing = readTrackedUsers();
  existing.push({ email, password });
  writeTrackedUsers(existing);
}

/**
 * Call after a test changes a tracked user's email or password, so teardown can
 * still log in as them.
 */
export function updateTrackedUser(email: string, changes: Partial<TrackedUser>): void {
  writeTrackedUsers(readTrackedUsers().map((u) => (u.email === email ? { ...u, ...changes } : u)));
}

/**
 * Stops tracking a user for teardown deletion. Call this right after a test
 * deletes its own account (e.g. via the Delete Account dialog, or a direct
 * API call) — otherwise globalTeardown tries to log in as an account that's
 * already gone and logs a confusing warning.
 */
export function untrackUser(email: string): void {
  writeTrackedUsers(readTrackedUsers().filter((u) => u.email !== email));
}

/**
 * Registers a fresh user via the backend API and returns their credentials.
 * Because page.request shares the browser context's cookie jar, the
 * access_token and auth_logged_in cookies set by the register endpoint are
 * immediately available to the page — no UI login required.
 *
 * The credentials are tracked so globalTeardown can delete the user after the
 * suite finishes — see untrackUser above for tests that delete the account
 * themselves, and updateTrackedUser for tests that change email or password.
 */
export async function loginNewUser(page: Page): Promise<{ email: string; password: string }> {
  const email = `e2e-${Date.now()}@test.com`;
  const password = 'testpass123'; // pragma: allowlist secret

  const res = await page.request.post(`${API}/auth/register`, {
    data: { email, password },
    headers: { 'Content-Type': 'application/json' },
  });

  if (!res.ok()) {
    throw new Error(`Registration failed: ${res.status()} — ${await res.text()}`);
  }

  trackUser(email, password);

  return { email, password };
}

/**
 * Reads the csrf_token cookie the backend set on this page's context, so
 * direct page.request.* calls (which bypass the frontend's apiFetch wrapper
 * and its automatic X-CSRF-Token header) can still pass the double-submit
 * CSRF check on cookie-authenticated mutating requests.
 */
export async function getCsrfHeader(page: Page): Promise<Record<string, string>> {
  const cookies = await page.context().cookies();
  const csrf = cookies.find((c) => c.name === 'csrf_token');
  return csrf ? { 'X-CSRF-Token': csrf.value } : {};
}

/**
 * Looks up the id of one of the current user's seeded default categories by
 * slug. Bills are keyed by category_id (per-user categories), not a slug.
 */
async function categoryIdBySlug(page: Page, slug: string): Promise<number> {
  const res = await page.request.get(`${API}/categories`);
  if (!res.ok()) {
    throw new Error(`Fetch categories failed: ${res.status()} — ${await res.text()}`);
  }
  const categories: Array<{ id: number; slug: string }> = await res.json();
  const match = categories.find((c) => c.slug === slug);
  if (!match) {
    throw new Error(`No category with slug "${slug}" found`);
  }
  return match.id;
}

/**
 * Looks up the id of one of the current user's categories (default or custom)
 * by its display name.
 */
export async function categoryIdByName(page: Page, name: string): Promise<number> {
  const res = await page.request.get(`${API}/categories`);
  if (!res.ok()) {
    throw new Error(`Fetch categories failed: ${res.status()} — ${await res.text()}`);
  }
  const categories: Array<{ id: number; name: string }> = await res.json();
  const match = categories.find((c) => c.name === name);
  if (!match) {
    throw new Error(`No category named "${name}" found`);
  }
  return match.id;
}

/**
 * Creates a bill via the backend API. Requires an authenticated page context
 * (call loginNewUser first). Defaults to the seeded "utilities" category.
 */
export async function createBillViaApi(
  page: Page,
  name: string,
  categoryId?: number,
  opts: { currency?: string; amount?: string } = {},
): Promise<number> {
  const category_id = categoryId ?? (await categoryIdBySlug(page, 'utilities'));
  const res = await page.request.post(`${API}/bills`, {
    data: {
      name,
      category_id,
      frequency: 'monthly',
      amount: opts.amount ?? '99.99',
      currency: opts.currency ?? 'PLN',
      due_day: 15,
    },
    headers: { 'Content-Type': 'application/json', ...(await getCsrfHeader(page)) },
  });

  if (!res.ok()) {
    throw new Error(`Create bill failed: ${res.status()} — ${await res.text()}`);
  }

  const bill = await res.json();
  // New bills are drafts; most specs need live payments.
  const activated = await page.request.post(`${API}/bills/${bill.id}/activate`, {
    headers: await getCsrfHeader(page),
  });
  if (!activated.ok()) {
    throw new Error(`Activate bill failed: ${activated.status()} — ${await activated.text()}`);
  }
  return bill.id as number;
}

/**
 * Syncs payment instances for the current month via API, so rows appear on
 * the payments page without needing a UI interaction.
 */
export async function syncPaymentsViaApi(page: Page): Promise<void> {
  const month = new Date().toISOString().slice(0, 7);
  await page.request.post(`${API}/bills/sync-instances?month=${month}`, {
    headers: await getCsrfHeader(page),
  });
}
