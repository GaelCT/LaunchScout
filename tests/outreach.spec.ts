import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import research from '../src/research-data/kern-county.json' with { type: 'json' };

const first = research.companies[0];
const publicEmailCompany = research.companies.find((company) =>
  company.publicLinks.contact?.startsWith('mailto:'),
)!;

async function openDraft(page: Page, company = first) {
  await page.addInitScript((id) => {
    localStorage.setItem('launchscout.preferences.v1', JSON.stringify({ saved: [id] }));
  }, company.id);
  await page.goto('/');
  await page
    .getByRole('navigation')
    .filter({ visible: true })
    .getByRole('button', { name: /Saved/ })
    .click();
  await page.getByRole('button', { name: `View ${company.name} details`, exact: true }).click();
  await page.getByRole('button', { name: 'Make an outreach draft' }).click();
}

async function emailLink(page: Page) {
  const href = await page.getByRole('link', { name: 'Open email draft' }).getAttribute('href');
  expect(href).toBeTruthy();
  return new URL(href!);
}

test('mailto handoff encodes edited text and leaves an unknown recipient blank', async ({
  page,
  context,
  baseURL,
}) => {
  const external: string[] = [];
  const appOrigin = new URL(baseURL!).origin;
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== appOrigin) external.push(request.url());
  });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openDraft(page);
  const subject = 'Coffee & C++? #1 — naïve + 100%';
  const body = 'Hello team,\n\nI like C++ & robotics? #1 + 100%\n谢谢';
  await page.getByRole('textbox', { name: 'Subject', exact: true }).fill(subject);
  await page.getByRole('textbox', { name: 'Your message', exact: true }).fill(body);
  const link = await emailLink(page);
  expect(link.protocol).toBe('mailto:');
  expect(link.pathname).toBe('');
  expect([...link.searchParams.keys()]).toEqual(['subject', 'body']);
  expect(link.searchParams.get('subject')).toBe(subject);
  expect(link.searchParams.get('body')).toBe(body.replace(/\n/g, '\r\n'));
  await page.getByRole('button', { name: 'Copy draft' }).click();
  await expect(page.getByRole('status')).toHaveText('Draft copied. Review it before using.');
  expect((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n')).toBe(
    `Subject: ${subject}\n\n${body}`,
  );
  expect(external).toEqual([]);
});

test('mailto handoff prefills the JSON public email and includes it in copy fallback', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openDraft(page, publicEmailCompany);
  const recipient = publicEmailCompany.publicLinks.contact!.slice('mailto:'.length);
  const link = await emailLink(page);
  expect(decodeURIComponent(link.pathname)).toBe(recipient);
  expect(link.searchParams.get('subject')).toContain(publicEmailCompany.name);
  await page.getByRole('button', { name: 'Copy draft' }).click();
  await expect(page.getByRole('status')).toHaveText('Draft copied. Review it before using.');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(`To: ${recipient}`);
});

test('mailto handoff applies all three goals explicitly and preserves edits until applied', async ({
  page,
}) => {
  await openDraft(page);
  const subject = page.getByRole('textbox', { name: 'Subject', exact: true });
  const body = page.getByRole('textbox', { name: 'Your message', exact: true });
  await expect(subject).toHaveValue(`Student internship inquiry — ${first.name}`);
  await expect(body).toHaveValue(/internship opportunities/);
  await subject.fill('My own edited subject');
  await page.getByRole('combobox', { name: 'Outreach goal' }).selectOption('coffee_chat');
  await expect(subject).toHaveValue('My own edited subject');
  await page.getByRole('button', { name: 'Apply choices to draft' }).click();
  await expect(subject).toHaveValue(`Coffee chat request — ${first.name}`);
  await expect(body).toHaveValue(/15-minute coffee chat/);
  await page.getByRole('combobox', { name: 'Outreach goal' }).selectOption('desired_role');
  await page
    .getByRole('textbox', { name: 'Role you’re interested in' })
    .fill('C++ & robotics intern');
  await page.getByRole('button', { name: 'Apply choices to draft' }).click();
  await expect(subject).toHaveValue(`Interest in C++ & robotics intern — ${first.name}`);
  await expect(body).toHaveValue(/C\+\+ & robotics intern/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('mailto handoff keeps manual-copy text available if clipboard permission fails', async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: async () => {
          throw new Error('Synthetic clipboard denial');
        },
      },
      configurable: true,
    }),
  );
  await openDraft(page);
  await page
    .getByRole('textbox', { name: 'Your message', exact: true })
    .fill('My manually copyable message.');
  await page.getByRole('button', { name: 'Copy draft' }).click();
  await expect(page.getByRole('status')).toHaveText(
    'Clipboard unavailable. Select and copy the text manually.',
  );
  await expect(page.getByRole('textbox', { name: 'Your message', exact: true })).toHaveValue(
    'My manually copyable message.',
  );
});
