import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import research from '../src/research-data/kern-county.json' with { type: 'json' };
import { getVerifiedPublicEmail, safeExternalUrl, safePublicContactUrl } from '../src/urls';

const nav = (page: Page, name: RegExp) =>
  page.getByRole('navigation').filter({ visible: true }).getByRole('button', { name });

async function workspace(page: Page, ai = false) {
  await page.route('**/api/resume/status', (route) => route.fulfill({ json: { available: ai } }));
  await page.goto('/');
  await nav(page, /resume/i).click();
  await page.getByRole('checkbox', { name: 'Enable resume workspace' }).check();
}

async function installProbe(page: Page) {
  await page.addInitScript(() => {
    (window as Window & { __securityProbe?: string }).__securityProbe = 'clean';
  });
}

async function probeValue(page: Page) {
  return page.evaluate(() => (window as Window & { __securityProbe?: string }).__securityProbe);
}

const maliciousMarkdown = `# Alex Demo

 café — 東京 · alex@example.com

- React and SQL
- TypeScript

<script>window.__securityProbe = 'script'</script>
<img src="https://example.com/tracker.png" onerror="window.__securityProbe = 'html-image'">
<svg onload="window.__securityProbe = 'svg'"></svg>
<iframe src="https://example.com/frame"></iframe>

![Remote image](https://example.com/private.png)
![SVG data image](data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+)
[Misleading label](JaVaScRiPt:window.__securityProbe='markdown-link')
[External link](https://example.com/tracker)
<https://example.com/autolink>
`;

function trackExternalRequests(page: Page, baseURL: string | undefined) {
  const external: string[] = [];
  const appOrigin = new URL(baseURL!).origin;
  page.on('request', (request) => {
    if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== appOrigin)
      external.push(request.url());
  });
  return external;
}

type SecurityFixture = {
  companies: Array<{
    name: string;
    description: string;
    publicLinks: { contact: string | null };
    sources: Array<Record<string, unknown> & { label: string; url: string }>;
    openings: Array<Record<string, unknown>>;
  }>;
  programs: unknown[];
  ecosystemResources: unknown[];
  verificationQueue: unknown[];
};

test('company URL policy accepts only normalized HTTPS and single-recipient public contacts', () => {
  expect(safeExternalUrl(' HTTPS://Example.COM/careers?team=students#apply ')).toBe(
    'https://example.com/careers?team=students#apply',
  );
  expect(safeExternalUrl('https://example.com')).toBe('https://example.com/');
  expect(safeExternalUrl('https://example.com/naïve')).toBe('https://example.com/na%C3%AFve');

  const rejected = [
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'java\nscript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    '//example.com/careers',
    '/relative/careers',
    'https:example.com',
    'https://user:password@example.com/',
    'https://example.com@evil.example/',
    'https://',
    'not a URL',
    `https://example.com/${'a'.repeat(5000)}`,
  ];
  for (const value of rejected) expect(safeExternalUrl(value)).toBeNull();
  expect(safeExternalUrl(null)).toBeNull();
  expect(safeExternalUrl(42)).toBeNull();

  expect(getVerifiedPublicEmail('mailto:Student+test@example.com?subject=Ignored')).toBe(
    'Student+test@example.com',
  );
  expect(safePublicContactUrl('mailto:Student+test@example.com?body=Discard%20this')).toBe(
    'mailto:Student%2Btest%40example.com',
  );
  expect(safePublicContactUrl('https://Example.com/contact')).toBe('https://example.com/contact');
  expect(getVerifiedPublicEmail('mailto:person@example.com%0ABcc:other@example.com')).toBeNull();
  expect(safePublicContactUrl('javascript:alert(1)')).toBeNull();
  expect(safePublicContactUrl('mailto:not-an-email')).toBeNull();
});

test('imported Markdown stays readable without executable HTML, links, images, or tracking requests', async ({
  page,
  baseURL,
}) => {
  await installProbe(page);
  await workspace(page);
  const external = trackExternalRequests(page, baseURL);
  const popups: string[] = [];
  const downloads: string[] = [];
  page.on('popup', (popup) => popups.push(popup.url()));
  page.on('download', (download) => downloads.push(download.suggestedFilename()));

  await page.getByLabel('Or paste / correct the extracted text').fill(maliciousMarkdown);
  await page.getByRole('button', { name: 'Create Markdown', exact: true }).click();
  await page.getByRole('tab', { name: 'Reading preview' }).click();

  const preview = page.locator('.markdown-preview');
  await expect(preview.getByRole('heading', { name: 'Alex Demo' })).toBeVisible();
  await expect(preview).toContainText('café — 東京 · alex@example.com');
  await expect(preview.locator('li').filter({ hasText: 'React and SQL' })).toBeVisible();
  await expect(preview).toContainText('Misleading label');
  await expect(
    preview.locator(
      'a, img, script, iframe, svg, object, embed, video, audio, form, input, button, link, meta, style',
    ),
  ).toHaveCount(0);
  expect(await probeValue(page)).toBe('clean');
  expect(external).toEqual([]);
  expect(popups).toEqual([]);
  expect(downloads).toEqual([]);
});

test('AI Markdown, warnings, and imported filenames remain inert text', async ({
  page,
  baseURL,
}) => {
  await installProbe(page);
  await workspace(page, true);
  const external = trackExternalRequests(page, baseURL);
  await page.route('**/api/resume/normalize', (route) =>
    route.fulfill({
      json: {
        markdown: maliciousMarkdown,
        warnings: [
          'Check <img src=x onerror="window.__securityProbe=\'warning\'"> before use.',
          "[Misleading warning](javascript:window.__securityProbe='warning-link')",
        ],
      },
    }),
  );

  const fileName = 'resume-<img src=x onerror="window.__securityProbe=\'filename\'">.md';
  await page.getByLabel('Import resume file').setInputFiles({
    name: fileName,
    mimeType: 'text/markdown',
    buffer: Buffer.from('# Fictional Resume\n\nReact and SQL'),
  });
  await expect(page.locator('.workbench-heading')).toContainText(fileName);
  await page.getByRole('checkbox', { name: /I agree to send the extracted text/ }).check();
  await page.getByRole('button', { name: 'Clean up with AI' }).click();
  await expect(page.locator('.resume-warnings')).toContainText('Misleading warning');
  await page.getByRole('tab', { name: 'Reading preview' }).click();

  const renderedSurfaces = page.locator('.workbench-heading, .resume-warnings, .markdown-preview');
  await expect(
    renderedSurfaces.locator('a, img, script, iframe, object, embed, [onerror], [onload]'),
  ).toHaveCount(0);
  expect(await probeValue(page)).toBe('clean');
  expect(external).toEqual([]);
});

test('provider error text cannot inject active content or replace the current resume', async ({
  page,
}) => {
  await installProbe(page);
  await workspace(page, true);
  await page.route('**/api/resume/normalize', (route) =>
    route.fulfill({
      status: 503,
      json: { error: 'Cleanup failed <img src=x onerror="window.__securityProbe=\'error\'">' },
    }),
  );
  await page
    .getByLabel('Or paste / correct the extracted text')
    .fill('Fictional resume with enough text for a cleanup request.');
  await page.getByRole('button', { name: 'Create Markdown', exact: true }).click();
  const previous = await page.getByRole('textbox', { name: 'Resume Markdown' }).inputValue();
  await page.getByRole('checkbox', { name: /I agree to send the extracted text/ }).check();
  await page.getByRole('button', { name: 'Clean up with AI' }).click();

  const error = page.getByRole('alert');
  await expect(error).toContainText('Cleanup failed');
  await expect(error.locator('img, script, iframe, [onerror]')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Resume Markdown' })).toHaveValue(previous);
  expect(await probeValue(page)).toBe('clean');
});

test('untrusted company records expose only safe links and keep drafts editable', async ({
  page,
  baseURL,
}) => {
  test.skip(
    process.env.PLAYWRIGHT_PRODUCTION === '1',
    'This fixture replaces a Vite development data module; production coverage uses the built app.',
  );
  await installProbe(page);
  const external = trackExternalRequests(page, baseURL);
  const dataset = structuredClone(research) as unknown as SecurityFixture;
  const company = dataset.companies[0];
  const source = company.sources[0];
  const opening = dataset.companies.flatMap((record) => record.openings)[0];
  company.name = 'Security Fixture <img src=x onerror="window.__securityProbe=\'company-name\'">';
  company.description =
    "Fictional description <script>window.__securityProbe = 'description'</script>";
  company.publicLinks.contact = "javascript:window.__securityProbe='contact'";
  company.sources = [
    { ...source, label: 'Unsafe source', url: "JaVaScRiPt:window.__securityProbe='source'" },
    { ...source, label: 'Safe source', url: ' HTTPS://Example.COM/careers ' },
  ];
  company.openings = [
    {
      ...opening,
      id: 'security-fixture-opening',
      title: 'Fixture role <svg onload="window.__securityProbe=\'role\'">',
      applicationUrl: "data:text/html,<script>window.__securityProbe='application'</script>",
      notes: 'Role notes <iframe src="https://example.com/role-tracker"></iframe>',
    },
  ];
  dataset.companies = [company];
  dataset.programs = [];
  dataset.ecosystemResources = [];
  dataset.verificationQueue = [];

  await page.route('**/src/research-data/kern-county.json*', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `export default ${JSON.stringify(dataset)};`,
    }),
  );
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
  await page.getByRole('button', { name: /^View Security Fixture/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Fictional description');
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect(dialog).not.toContainText('Unsafe source');
  await expect(dialog.getByRole('link', { name: 'View role / application' })).toHaveCount(0);
  await expect(dialog.getByRole('link', { name: 'Public contact route' })).toHaveCount(0);
  await expect(dialog.getByRole('link', { name: /Unsafe source/ })).toHaveCount(0);
  const safeSource = dialog.getByRole('link', { name: /Safe source/ });
  await expect(safeSource).toHaveAttribute('href', 'https://example.com/careers');
  await expect(safeSource).toHaveAttribute('target', '_blank');
  await expect(safeSource).toHaveAttribute('rel', 'noreferrer');
  await expect(
    dialog.locator('img, script, iframe, object, embed, [onerror], [onload]'),
  ).toHaveCount(0);

  await dialog.getByRole('tab', { name: 'Outreach draft' }).click();
  const draftPayload = '<img src=x onerror="window.__securityProbe=\'draft\'">';
  await page.getByRole('textbox', { name: 'Subject', exact: true }).fill(draftPayload);
  await page.getByRole('textbox', { name: 'Your message', exact: true }).fill(draftPayload);
  await expect(page.getByRole('textbox', { name: 'Subject', exact: true })).toHaveValue(
    draftPayload,
  );
  await expect(dialog.locator('img, script, iframe, [onerror], [onload]')).toHaveCount(0);
  expect(await probeValue(page)).toBe('clean');
  expect(external).toEqual([]);
});
