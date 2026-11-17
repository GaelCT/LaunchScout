import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import research from '../src/research-data/kern-county.json' with { type: 'json' };

const card = (page: Page, name: string) =>
  page.getByRole('button', { name: `View ${name} details`, exact: true });
const filter = (page: Page, name: string) =>
  page.getByRole('combobox', { name: `Filter by ${name}`, exact: true }).filter({ visible: true });
async function openFilters(page: Page) {
  const toggle = page.getByRole('button', { name: /^Filters/ });
  if (await toggle.isVisible()) await toggle.click();
}

test('the dated JSON snapshot supplies company cards without promoting programs or unverified leads', async ({
  page,
}) => {
  await page.addInitScript(
    (ids) => {
      localStorage.setItem('launchscout.preferences.v1', JSON.stringify({ saved: ids }));
    },
    research.companies.map((company) => company.id),
  );
  await page.goto('/');
  await expect(page.locator('.demo-notice')).toContainText(research.dataset.sourceSnapshotDate);
  await expect(page.locator('.demo-notice')).toContainText('role status may have changed');
  await page
    .getByRole('navigation')
    .filter({ visible: true })
    .getByRole('button', { name: /Saved/ })
    .click();
  const saved = page.getByRole('region', { name: 'Saved companies' });
  await expect(saved.getByRole('article')).toHaveCount(research.companies.length);
  for (const company of research.companies) await expect(card(page, company.name)).toBeVisible();
  for (const record of [
    ...research.programs,
    ...research.ecosystemResources,
    ...research.verificationQueue,
  ]) {
    await expect(card(page, record.name)).toHaveCount(0);
  }
});

test('company type, city, and secondary industry filters intersect and persist after reload', async ({
  page,
}) => {
  await page.goto('/');
  await openFilters(page);
  await filter(page, 'company type').selectOption('Public Employer');
  await filter(page, 'city').selectOption('Wasco');
  await filter(page, 'industry').selectOption('IT');
  await expect(card(page, 'City of Wasco')).toBeVisible();
  await page.reload();
  await openFilters(page);
  await expect(filter(page, 'company type')).toHaveValue('Public Employer');
  await expect(filter(page, 'city')).toHaveValue('Wasco');
  await expect(filter(page, 'industry')).toHaveValue('IT');
  await expect(card(page, 'City of Wasco')).toBeVisible();
  // Wasco's recorded internship is closed; its existence must not qualify it as an open role.
  await filter(page, 'role type').selectOption('Internship');
  await expect(page.getByRole('heading', { name: 'No companies match just yet.' })).toBeVisible();
  await page.getByRole('button', { name: 'Reset filters', exact: true }).last().click();
  await expect(card(page, research.companies[0].name)).toBeVisible();
});

test('role details preserve the JSON status, requirements, application link, and closed-role warning', async ({
  page,
}) => {
  const employer = research.companies.find((company) => company.id === 'stratolaunch')!;
  const opening = employer.openings[0];
  await page.goto('/');
  await openFilters(page);
  await filter(page, 'city').selectOption('Mojave');
  await card(page, employer.name).click();
  const dialog = page.getByRole('dialog');
  const role = dialog
    .locator('.role-snapshot')
    .filter({ has: page.getByRole('heading', { name: opening.title, exact: true }) });
  await expect(role).toContainText('Listed open at report check');
  await expect(role).toContainText(opening.experienceRequirements!);
  await expect(role).toContainText(opening.educationRequirements!);
  await expect(role.getByRole('link', { name: 'View role / application' })).toHaveAttribute(
    'href',
    opening.applicationUrl!,
  );
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await filter(page, 'city').selectOption('Wasco');
  await card(page, 'City of Wasco').click();
  await expect(dialog.locator('.role-snapshot')).toContainText('Closed at report check');
  await expect(dialog.locator('.role-snapshot')).toContainText('Summer 2026 IT Internship');
});

test('legacy fictional IDs are removed while valid JSON preferences survive', async ({ page }) => {
  const [savedCompany, passedCompany] = research.companies;
  await page.addInitScript(
    ({ savedId, passedId }) => {
      localStorage.setItem(
        'launchscout.preferences.v1',
        JSON.stringify({
          saved: ['grove', savedId, savedId, passedId],
          rejected: ['sol', passedId],
          filters: { city: 'Bakersfield', industry: '', opportunity: '' },
          theme: 'dark',
        }),
      );
    },
    { savedId: savedCompany.id, passedId: passedCompany.id },
  );
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem('launchscout.preferences.v1')!)),
    )
    .toEqual({
      saved: [savedCompany.id],
      rejected: [passedCompany.id],
      filters: { city: 'Bakersfield', companyType: '', industry: '', opportunity: '' },
      theme: 'dark',
    });
  await expect(card(page, savedCompany.name)).toHaveCount(0);
  await expect(card(page, passedCompany.name)).toHaveCount(0);
});
