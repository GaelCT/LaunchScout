import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import research from '../src/research-data/kern-county.json' with { type: 'json' };
import type { Session } from '../src/auth';

const csrf = 'c'.repeat(43);
const example: Session = {
  user: {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'alex@example.com',
    emailVerified: true,
    aiEnabled: true,
  },
  csrfToken: csrf,
  expiresAt: '2099-01-01T00:00:00.000Z',
};
const entry = (page: Page, name = 'Sign in') =>
  page.getByRole('button', { name, exact: true }).filter({ visible: true });
const nav = (page: Page, name: RegExp) =>
  page.getByRole('navigation').filter({ visible: true }).getByRole('button', { name });
async function fakeAccounts(page: Page, configured = true) {
  let active: Session | null = null;
  const sent: Array<{ path: string; body: Record<string, unknown> }> = [];
  await page.route('**/api/auth/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = route.request().method() === 'GET' ? {} : route.request().postDataJSON();
    if (route.request().method() !== 'GET') sent.push({ path, body });
    if (path.endsWith('/config'))
      return route.fulfill({ json: { configured, emailEnabled: configured } });
    if (path.endsWith('/session'))
      return route.fulfill({
        status: active ? 200 : 401,
        json: active ?? { error: 'Sign in to continue.' },
      });
    if (path.endsWith('/csrf'))
      return route.fulfill({
        status: active ? 200 : 401,
        json: active ? { csrfToken: active.csrfToken } : { error: 'Sign in to continue.' },
      });
    if (path.endsWith('/login')) {
      active = { ...example, user: { ...example.user, email: String(body.email) } };
      return route.fulfill({ json: active });
    }
    if (path.endsWith('/refresh')) return route.fulfill({ json: active });
    if (path.endsWith('/logout') || path.endsWith('/account') || path.endsWith('/password')) {
      active = null;
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({
      status: 202,
      json: {
        message: path.endsWith('/confirm')
          ? 'Request confirmed. Sign in to continue.'
          : 'If this address is eligible, an email will arrive shortly.',
      },
    });
  });
  return {
    sent,
    setSession(value: Session | null) {
      active = value;
    },
  };
}
async function open(page: Page) {
  await page.goto('/');
  await entry(page).click();
}
async function signIn(page: Page, email = 'alex@example.com') {
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('fictional-long-password-123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(entry(page, 'Account')).toBeVisible();
}

test('expired access renews the same account once without losing resume edits or changing the request ID', async ({
  page,
}) => {
  const backend = await fakeAccounts(page);
  await page.route('**/api/resume/status', (route) => route.fulfill({ json: { available: true } }));
  await open(page);
  await signIn(page);
  await nav(page, /resume/i).click();
  await page.getByRole('checkbox', { name: 'Enable resume workspace' }).check();
  await page.getByRole('button', { name: 'Try a fictional example' }).click();
  const sent: Array<{ key: string | undefined; csrf: string | undefined }> = [];
  await page.route('**/api/resume/normalize', async (route) => {
    const headers = route.request().headers();
    sent.push({ key: headers['idempotency-key'], csrf: headers['x-csrf-token'] });
    if (sent.length === 1) {
      backend.setSession({ ...example, csrfToken: 'd'.repeat(43) });
      return route.fulfill({ status: 401, json: { error: 'Access expired.' } });
    }
    return route.fulfill({ json: { markdown: '# Alex Morgan\n\n## Skills\nReact', warnings: [] } });
  });
  await page.getByRole('checkbox', { name: /I agree to send the extracted text/ }).check();
  await page.getByRole('button', { name: 'Clean up with AI' }).click();
  await expect(page.getByText(/AI-assisted formatting/)).toBeVisible();
  expect(sent).toHaveLength(2);
  expect(sent[0].key).toBe(sent[1].key);
  expect(sent[1].csrf).toBe('d'.repeat(43));
  await expect(page.getByRole('textbox', { name: 'Resume Markdown' })).toHaveValue(/Alex Morgan/);
});

test('an old account request is never retried under a different restored account', async ({
  page,
}) => {
  const backend = await fakeAccounts(page);
  await page.route('**/api/resume/status', (route) => route.fulfill({ json: { available: true } }));
  await open(page);
  await signIn(page);
  await nav(page, /resume/i).click();
  await page.getByRole('checkbox', { name: 'Enable resume workspace' }).check();
  await page.getByRole('button', { name: 'Try a fictional example' }).click();
  let requests = 0;
  await page.route('**/api/resume/normalize', (route) => {
    requests++;
    backend.setSession({
      ...example,
      user: {
        ...example.user,
        id: '00000000-0000-4000-8000-000000000002',
        email: 'other@example.com',
      },
    });
    return route.fulfill({ status: 401, json: { error: 'Session changed.' } });
  });
  await page.getByRole('checkbox', { name: /I agree to send the extracted text/ }).check();
  await page.getByRole('button', { name: 'Clean up with AI' }).click();
  await expect(page.getByRole('heading', { level: 1 })).not.toHaveText(/Your story/);
  await entry(page, 'Account').click();
  await expect(page.getByText('other@example.com', { exact: true })).toBeVisible();
  expect(requests).toBe(1);
  await page.getByRole('button', { name: 'Keep exploring', exact: true }).click();
  await nav(page, /resume/i).click();
  await expect(page.getByRole('textbox', { name: 'Resume Markdown' })).toHaveValue('');
});

test('real login form validates inputs, supports keyboard focus, and keeps OAuth disabled', async ({
  page,
}) => {
  await fakeAccounts(page);
  await open(page);
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  for (const name of [/Google/, /GitHub/])
    await expect(page.getByRole('button', { name })).toBeDisabled();
  await expect(page.getByRole('button', { name: /Microsoft/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Enter a valid email address.');
  await page.getByLabel('Email address', { exact: true }).fill('alex@example.com');
  await page.getByLabel('Password', { exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Show password' })).toBeFocused();
});

test('password reveal, pending cancellation, and leaving clear credentials without late sign-in', async ({
  page,
}) => {
  const backend = await fakeAccounts(page);
  await open(page);
  await page.getByLabel('Email address', { exact: true }).fill('alex@example.com');
  await page.getByLabel('Password', { exact: true }).fill('fictional-long-password-123');
  await page.getByRole('button', { name: 'Show password' }).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text');
  let finish!: () => void;
  const gate = new Promise<void>((resolve) => {
    finish = resolve;
  });
  await page.route('**/api/auth/login', async (route) => {
    await gate;
    await route.fulfill({ json: example }).catch(() => {});
  });
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Working…' })).toBeDisabled();
  await page.getByRole('button', { name: 'Back to exploring' }).click();
  finish();
  await entry(page).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Email address', { exact: true })).toHaveValue('');
  expect(backend.sent).toEqual([]);
});

test('sign-in restores on reload while credentials and session data stay out of browser storage', async ({
  page,
}) => {
  const backend = await fakeAccounts(page);
  await open(page);
  await signIn(page);
  await page.reload();
  await expect(entry(page, 'Account')).toBeVisible();
  const storage = await page.evaluate(() =>
    JSON.stringify({ local: localStorage, session: sessionStorage, url: location.href }),
  );
  expect(storage).not.toMatch(
    /alex@example.com|fictional-long-password|csrfToken|access_token|refresh_token/,
  );
  expect(backend.sent[0].path).toBe('/api/auth/login');
  await entry(page, 'Account').click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(entry(page)).toBeVisible();
  expect(backend.sent.at(-1)?.path).toBe('/api/auth/logout');
});

test('registration and recovery send deliberate requests and clear password fields', async ({
  page,
}) => {
  const backend = await fakeAccounts(page);
  await open(page);
  await page.getByRole('button', { name: 'Create an account', exact: true }).click();
  await page.getByLabel('Email address', { exact: true }).fill('new@example.com');
  await page.getByLabel('Password', { exact: true }).fill('short');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('15–128');
  expect(backend.sent).toEqual([]);
  await page.getByLabel('Password', { exact: true }).fill('fictional-new-password-123');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('an email will arrive');
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'Back to sign in' }).click();
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await page.getByLabel('Email address', { exact: true }).fill('new@example.com');
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('status')).toContainText('an email will arrive');
  expect(backend.sent.map((r) => r.path)).toEqual([
    '/api/auth/register',
    '/api/auth/reset/request',
  ]);
});

test('email action tokens are removed from the URL and require an explicit confirmation', async ({
  page,
}) => {
  const backend = await fakeAccounts(page);
  const token = 'z'.repeat(43);
  await open(page);
  await page.evaluate((value) => {
    location.hash = '#verify=' + value;
  }, token);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Verify your email.');
  expect(page.url()).not.toContain(token);
  expect(backend.sent).toEqual([]);
  await page.getByRole('button', { name: 'Verify email', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Request confirmed');
  expect(backend.sent[0]).toEqual({ path: '/api/auth/verify/confirm', body: { token } });
});

test('account changes clear private resumes and signed-in collections do not enter guest storage', async ({
  page,
}) => {
  await fakeAccounts(page);
  await open(page);
  await signIn(page);
  await page.getByRole('button', { name: 'Save company', exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem('launchscout.preferences.v1'))).toBeNull();
  await nav(page, /resume/i).click();
  await page.getByRole('checkbox', { name: 'Enable resume workspace' }).check();
  await page.getByRole('button', { name: 'Try a fictional example' }).click();
  await entry(page, 'Account').click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await nav(page, /resume/i).click();
  await expect(page.getByRole('textbox', { name: 'Resume Markdown' })).toHaveValue('');
  await expect(page.getByRole('checkbox', { name: 'Enable resume workspace' })).not.toBeChecked();
  await nav(page, /Discover/).click();
  await expect(
    page.getByRole('button', { name: `View ${research.companies[0].name} details`, exact: true }),
  ).toBeVisible();
});

test('unconfigured accounts preserve guest workflows and both themes fit narrow screens', async ({
  page,
}) => {
  await fakeAccounts(page, false);
  await open(page);
  await expect(page.getByRole('status')).toContainText('Account service is unavailable');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await page.getByRole('button', { name: 'Keep exploring as a guest' }).click();
  await expect(entry(page)).toBeVisible();
});
