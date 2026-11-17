import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const card = (page: Page, name: string) =>
  page.getByRole('button', { name: `View ${name} details`, exact: true });
const nav = (page: Page, name: RegExp) =>
  page.getByRole('navigation').filter({ visible: true }).getByRole('button', { name });
async function privacy(page: Page) {
  await page
    .getByRole('button', { name: /Privacy.*(data|your data)/i })
    .filter({ visible: true })
    .click();
}
async function filters(page: Page) {
  const toggle = page.getByRole('button', { name: /^Filters/ });
  if (await toggle.isVisible()) await toggle.click();
}

test('save and pass persist, stay excluded through filters, and can be cleared independently', async ({
  page,
}) => {
  await page.goto('/');
  await expect(card(page, 'Grove Robotics')).toBeVisible();
  await page.getByRole('button', { name: 'Save company', exact: true }).click();
  await expect(card(page, 'Sol Current')).toBeVisible();
  await page.getByRole('button', { name: 'Pass for now' }).click();
  await expect(card(page, 'Canopy Health')).toBeVisible();
  await page.reload();
  await expect(card(page, 'Canopy Health')).toBeVisible();
  await filters(page);
  await page
    .getByRole('combobox', { name: 'Filter by city' })
    .filter({ visible: true })
    .selectOption('Bakersfield');
  await expect(card(page, 'Mesa Studio')).toBeVisible();
  await page.reload();
  await expect(card(page, 'Mesa Studio')).toBeVisible();
  await nav(page, /Saved/).click();
  await expect(card(page, 'Grove Robotics')).toBeVisible();
  await nav(page, /Passed/).click();
  await expect(card(page, 'Sol Current')).toBeVisible();
  await privacy(page);
  await page.getByRole('button', { name: 'Clear passed companies', exact: true }).click();
  await expect(page.getByText('0 hidden from your discovery deck')).toBeVisible();
  await expect(page.getByText('1 company in your collection')).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await nav(page, /Discover/).click();
  await expect(card(page, 'Sol Current')).toBeVisible();
  await privacy(page);
  await page.getByRole('button', { name: 'Clear all local data' }).click();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.reload();
  await expect(card(page, 'Grove Robotics')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('launchscout.preferences.v1'))).toBeNull();
});

test('details disclose sample stats and missing sources; editable drafts are ephemeral and never sent', async ({
  page,
  context,
}) => {
  const external: string[] = [];
  page.on('request', (request) => {
    if (!request.url().startsWith('http://127.0.0.1:5173')) external.push(request.url());
  });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await card(page, 'Grove Robotics').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Not verified', { exact: true })).toBeVisible();
  await expect(dialog.getByText(/No public sources are attached/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Make an outreach draft' }).click();
  await page.getByRole('textbox', { name: 'Subject', exact: true }).fill('My reviewed subject');
  await page.getByRole('textbox', { name: 'Your message', exact: true }).fill('My own words.');
  await page.getByRole('button', { name: 'Copy draft' }).click();
  await expect(page.getByRole('status')).toHaveText('Draft copied. Review it before using.');
  expect((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n')).toBe(
    'Subject: My reviewed subject\n\nMy own words.',
  );
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await card(page, 'Grove Robotics').click();
  await page.getByRole('tab', { name: 'Outreach draft' }).click();
  await expect(page.getByRole('textbox', { name: 'Your message', exact: true })).toHaveValue(
    /DEMO/,
  );
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('My own words.');
  expect(external).toEqual([]);
});

test('industry and opportunity filters intersect, empty states recover, and passes stay hidden', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Pass for now' }).click();
  await filters(page);
  await page
    .getByRole('combobox', { name: 'Filter by industry' })
    .filter({ visible: true })
    .selectOption('AgTech');
  await page
    .getByRole('combobox', { name: 'Filter by opportunity' })
    .filter({ visible: true })
    .selectOption('Full-time');
  await expect(page.getByRole('heading', { name: 'No companies match just yet.' })).toBeVisible();
  await page.getByRole('button', { name: 'Reset filters', exact: true }).last().click();
  await expect(card(page, 'Sol Current')).toBeVisible();
  await page
    .getByRole('combobox', { name: 'Filter by city' })
    .filter({ visible: true })
    .selectOption('Visalia');
  await page
    .getByRole('combobox', { name: 'Filter by industry' })
    .filter({ visible: true })
    .selectOption('Software');
  await page
    .getByRole('combobox', { name: 'Filter by opportunity' })
    .filter({ visible: true })
    .selectOption('Internship');
  await expect(card(page, 'Citrus Signal')).toBeVisible();
});

test('undo, restore, and complete-deck recovery keep company states consistent', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Save company', exact: true }).click();
  await page.getByRole('button', { name: 'Undo last action', exact: true }).click();
  await expect(card(page, 'Grove Robotics')).toBeVisible();
  await page.getByRole('button', { name: 'Pass for now' }).click();
  await nav(page, /Passed/).click();
  await page.getByRole('button', { name: 'Return to Discover' }).click();
  await nav(page, /Discover/).click();
  await expect(card(page, 'Grove Robotics')).toBeVisible();
  for (let i = 0; i < 20; i++) await page.getByRole('button', { name: 'Pass for now' }).click();
  await expect(
    page.getByRole('heading', { name: 'You’ve explored the whole neighborhood.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Undo last action', exact: true }).click();
  await expect(card(page, 'Willow Connect')).toBeVisible();
});

test('malformed preferences recover and blocked storage leaves the app usable', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem('launchscout.preferences.v1', '{broken-json'),
  );
  await page.goto('/');
  await expect(card(page, 'Grove Robotics')).toBeVisible();
  await page.getByRole('button', { name: 'Save company', exact: true }).click();
  await expect(card(page, 'Sol Current')).toBeVisible();
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('Blocked', 'SecurityError');
    };
  });
  await page.reload();
  await page.getByRole('button', { name: 'Save company', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Browser storage is unavailable');
  await nav(page, /Saved/).click();
  await expect(
    page.getByRole('region', { name: 'Saved companies' }).getByRole('article'),
  ).toHaveCount(1);
});

test('layout stays within viewport and dialog supports Escape', async ({ page }) => {
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await card(page, 'Grove Robotics').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(card(page, 'Grove Robotics')).toBeFocused();
});

test('swipe and keyboard actions move cards and preserve keyboard focus', async ({ page }) => {
  await page.goto('/');
  const first = card(page, 'Grove Robotics');
  const box = (await first.boundingBox())!;
  await page.mouse.move(box.x + 50, box.y + 70);
  await page.mouse.down();
  await page.mouse.move(box.x + 160, box.y + 70, { steps: 5 });
  await page.mouse.up();
  await expect(card(page, 'Sol Current')).toBeVisible();
  await card(page, 'Sol Current').focus();
  await page.keyboard.press('ArrowLeft');
  await expect(card(page, 'Canopy Health')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(card(page, 'Fieldnote Labs')).toBeFocused();
  await nav(page, /Saved/).click();
  await expect(card(page, 'Grove Robotics')).toBeVisible();
  await expect(card(page, 'Canopy Health')).toBeVisible();
});

test('dark theme survives reloads and privacy reset clears the appearance preference', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Switch to dark theme' })
    .filter({ visible: true })
    .click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Save company', exact: true }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(card(page, 'Sol Current')).toBeVisible();
  await privacy(page);
  await page.getByRole('button', { name: 'Clear appearance preference' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByText('1 company in your collection')).toBeVisible();
  await page.getByRole('button', { name: 'Clear all local data' }).click();
  expect(await page.evaluate(() => localStorage.getItem('launchscout.preferences.v1'))).toBeNull();
});

test('saving rotates right and passing rotates left while decisions persist immediately', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  for (const [action, name, direction] of [
    ['Save company', 'Sol Current', 1],
    ['Pass for now', 'Canopy Health', -1],
  ] as const) {
    await page.getByRole('button', { name: action, exact: true }).click();
    await expect(card(page, name)).toBeVisible();
    const transform = await page.evaluate(() => {
      const ghost = document.querySelector('.card-flight')!;
      const animation = ghost.getAnimations()[0];
      animation.pause();
      animation.currentTime = 180;
      const matrix = new DOMMatrixReadOnly(getComputedStyle(ghost).transform);
      return { x: matrix.m41, rotation: matrix.m12 };
    });
    expect(transform.x * direction).toBeGreaterThan(0);
    expect(transform.rotation * direction).toBeGreaterThan(0);
    expect(
      await page.evaluate(() => JSON.parse(localStorage.getItem('launchscout.preferences.v1')!)),
    ).toMatchObject({ saved: ['grove'] });
    await page.evaluate(() => document.querySelector('.card-flight')!.getAnimations()[0].finish());
    await expect(page.locator('.card-flight')).toHaveCount(0);
  }
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('launchscout.preferences.v1')!).rejected,
    ),
  ).toEqual(['sol']);
});

test('a short drag tilts and returns without deciding or opening details', async ({ page }) => {
  await page.goto('/');
  const first = card(page, 'Grove Robotics');
  const box = (await first.boundingBox())!;
  await page.mouse.move(box.x + 50, box.y + 70);
  await page.mouse.down();
  await page.mouse.move(box.x + 90, box.y + 70, { steps: 5 });
  await expect(page.locator('.company-card')).toHaveClass(/is-dragging/);
  await expect(page.getByText('KEEP', { exact: true })).toBeVisible();
  await page.mouse.up();
  await expect(page.locator('.company-card')).not.toHaveClass(/is-dragging/);
  await expect(first).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('launchscout.preferences.v1'))).toBeNull();
});

test('reduced motion skips the departure but still saves the company', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Save company', exact: true }).click();
  await expect(card(page, 'Sol Current')).toBeVisible();
  await expect(page.locator('.card-flight')).toHaveCount(0);
  await nav(page, /Saved/).click();
  await expect(card(page, 'Grove Robotics')).toBeVisible();
});
