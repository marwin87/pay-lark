import * as fs from 'fs';

const API = process.env.E2E_API_URL ?? 'http://localhost:8010';
const E2E_USERS_FILE = '/tmp/e2e-users.json';

export default async function globalTeardown(): Promise<void> {
  if (!fs.existsSync(E2E_USERS_FILE)) return;

  const users = JSON.parse(fs.readFileSync(E2E_USERS_FILE, 'utf-8')) as Array<{
    email: string;
    password: string;
  }>;
  const json = { 'Content-Type': 'application/json' };

  for (const { email, password } of users) {
    try {
      // DELETE /auth/users/me needs the password, and a registration-time token may
      // be stale by now (password change/reset revoke it), so log in fresh.
      const login = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: json,
        body: JSON.stringify({ email, password }),
      });
      if (!login.ok) {
        console.warn(`[teardown] Could not log in as ${email}: HTTP ${login.status}`);
        continue;
      }
      // The JWT is cookie-only now (not in the body); take it from Set-Cookie.
      const access_token = login.headers
        .getSetCookie()
        .find((c) => c.startsWith('access_token='))
        ?.split(';')[0]
        .slice('access_token='.length);
      if (!access_token) {
        console.warn(`[teardown] No access_token cookie for ${email}`);
        continue;
      }
      const res = await fetch(`${API}/auth/users/me`, {
        method: 'DELETE',
        headers: { ...json, Authorization: `Bearer ${access_token}` },
        body: JSON.stringify({ current_password: password }),
      });
      if (!res.ok && res.status !== 404) {
        console.warn(`[teardown] Failed to delete ${email}: HTTP ${res.status}`);
      }
    } catch (err) {
      console.warn(`[teardown] Error deleting ${email}:`, err);
    }
  }

  fs.unlinkSync(E2E_USERS_FILE);
}
