import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const signIn = (page: Page) =>
  page.getByRole('button', { name: 'Sign in', exact: true }).filter({ visible: true });
const email = (page: Page) => page.getByLabel('Email address', { exact: true });
const password = (page: Page) => page.getByLabel('Password', { exact: true });
const nav = (page: Page, name: RegExp) =>
  page.getByRole('navigation').filter({ visible: true }).getByRole('button', { name });
async function open(page: Page) {
  await page.goto('/');
  await signIn(page).click();
}

test('login preview is discoverable, keyboard accessible and has inactive provider placeholders', async ({
  page,
}) => {
  await open(page);
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  await expect(page.getByText(/This preview doesn’t create an account/)).toBeVisible();
  for (const name of [/Google/, /Microsoft/, /GitHub/, /Forgot password/, /Create an account/]) {
    await expect(page.getByRole('button', { name })).toBeDisabled();
  }
  await expect(page.getByText('Passkeys', { exact: true })).toBeVisible();
  await expect(page.getByText('Email link', { exact: true })).toBeVisible();
  await email(page).focus();
  await page.keyboard.press('Tab');
  await expect(password(page)).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Show password' })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('required and invalid email errors link to fields and move focus to the first problem', async ({
  page,
}) => {
  await open(page);
  await page.getByRole('button', { name: 'Preview sign in' }).click();
  await expect(email(page)).toHaveAttribute('aria-invalid', 'true');
  await expect(email(page)).toBeFocused();
  await expect(page.getByText('Enter a made-up password for this preview.')).toBeVisible();
  await email(page).fill('not-an-email');
  await password(page).fill('fictional-test-only');
  await page.getByRole('button', { name: 'Preview sign in' }).click();
  await expect(page.locator('#login-email-error')).toHaveText(
    'Use an email format like you@example.com.',
  );
  await expect(email(page)).toBeFocused();
  await email(page).fill('alex@example.com');
  await password(page).fill('');
  await page.getByRole('button', { name: 'Preview sign in' }).click();
  await expect(password(page)).toBeFocused();
  await expect(password(page)).toHaveAttribute('aria-describedby', 'login-password-error');
});

test('show/hide password works and leaving removes entered credentials', async ({ page }) => {
  await open(page);
  await email(page).fill('fictional@example.com');
  await password(page).fill('made-up-preview-password');
  await page.getByRole('button', { name: 'Show password' }).click();
  await expect(password(page)).toHaveAttribute('type', 'text');
  await expect(password(page)).toHaveValue('made-up-preview-password');
  await page.getByRole('button', { name: 'Hide password' }).click();
  await expect(password(page)).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Keep exploring as a guest' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  await signIn(page).click();
  await expect(email(page)).toHaveValue('');
  await expect(password(page)).toHaveValue('');
  await expect(password(page)).toHaveAttribute('type', 'password');
});

test('mock loading clears credentials, reports preview only, and makes no auth request or session', async ({
  page,
  context,
}) => {
  const authRequests: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET' || /\/api\//.test(request.url()))
      authRequests.push(request.url());
  });
  await open(page);
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.getByRole('button', { name: 'Use example details' }).click();
  await page.getByRole('button', { name: 'Preview sign in' }).click();
  await expect(page.getByRole('button', { name: 'Trying the preview…' })).toBeDisabled();
  await expect(email(page)).toBeDisabled();
  await expect(password(page)).toBeDisabled();
  await page.clock.runFor(700);
  await expect(page.getByRole('status')).toContainText('You’re still browsing as a guest.');
  await expect(page.getByRole('status')).toBeFocused();
  await expect(email(page)).toHaveValue('');
  await expect(password(page)).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Preview sign in' })).toBeEnabled();
  const state = await page.evaluate(() => ({
    local: JSON.stringify(localStorage),
    session: JSON.stringify(sessionStorage),
    url: location.href,
  }));
  expect(JSON.stringify(state)).not.toMatch(
    /alex@example.com|demo-only-password|access_token|refresh_token/,
  );
  expect(await context.cookies()).toEqual([]);
  expect(authRequests).toEqual([]);
});

test('leaving a pending preview cancels it and never restores old form state', async ({ page }) => {
  await open(page);
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.getByRole('button', { name: 'Use example details' }).click();
  await page.getByRole('button', { name: 'Preview sign in' }).click();
  await page.getByRole('button', { name: 'Back to exploring' }).click();
  await signIn(page).click();
  await page.clock.runFor(1000);
  await expect(email(page)).toHaveValue('');
  await expect(password(page)).toHaveValue('');
  await expect(page.getByRole('status')).toHaveCount(0);
});

test('login supports both themes and narrow viewports', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await email(page).fill('example@example.com');
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await expect(page.getByRole('button', { name: 'Preview sign in' })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(email(page)).toHaveValue('example@example.com');
});

test('guest saved companies and session resume remain available around the login preview', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Save company', exact: true }).click();
  await signIn(page).click();
  await page.getByRole('button', { name: 'Keep exploring as a guest' }).click();
  await nav(page, /Saved/).click();
  await expect(page.getByRole('button', { name: 'View Grove Robotics details' })).toBeVisible();
  await nav(page, /resume/i).click();
  await page.getByRole('checkbox', { name: 'Enable resume workspace' }).check();
  await page.getByRole('button', { name: 'Try a fictional example' }).click();
  await signIn(page).click();
  await page.getByRole('button', { name: 'Keep exploring as a guest' }).click();
  await nav(page, /resume/i).click();
  await expect(page.getByRole('textbox', { name: 'Resume Markdown' })).toHaveValue(/Alex Morgan/);
});
