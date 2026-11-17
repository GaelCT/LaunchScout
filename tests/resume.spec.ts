import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import JSZip from 'jszip';
import { readFile } from 'node:fs/promises';

const sample =
  'Taylor Demo\n\nEducation\nExample University, 2026\n\nProjects\nBuilt a garden scheduling app using React.\n\nSkills\nReact, TypeScript, SQL';
const nav = (page: Page, name: RegExp) =>
  page.getByRole('navigation').filter({ visible: true }).getByRole('button', { name });
async function workspace(page: Page, ai = false) {
  await page.route('**/api/resume/status', (route) => route.fulfill({ json: { available: ai } }));
  await page.goto('/');
  await nav(page, /resume/i).click();
  await page.getByRole('checkbox', { name: 'Enable resume workspace' }).check();
}
async function paste(page: Page) {
  await page.getByLabel('Or paste / correct the extracted text').fill(sample);
  await page.getByRole('button', { name: 'Create Markdown', exact: true }).click();
}

function pdfBuffer() {
  const stream =
    'BT /F1 12 Tf 72 720 Td (Taylor Demo - React developer) Tj 0 -20 Td (Education: Example University 2026) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}

test('resume workspace is opt-in and does not request AI on entry', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/resume/')) requests.push(request.url());
  });
  await page.goto('/');
  await nav(page, /resume/i).click();
  await expect(page.getByRole('textbox', { name: 'Resume Markdown' })).toBeDisabled();
  await expect(page.getByLabel('Import resume file')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Download Markdown' })).toBeDisabled();
  expect(requests).toEqual([]);
});

test('the no-key workflow offers a downloadable offline Python parser', async ({ page }) => {
  await workspace(page);
  await expect(page.getByText('Local parsing. No API key needed.')).toBeVisible();
  await page.getByText('Prefer a local Python script?', { exact: true }).click();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Python parser', exact: true }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('parse_resume.py');
  const script = await readFile((await download.path())!, 'utf8');
  expect(script).toContain('def parse_resume');
  expect(script).not.toContain('import openai');
  await expect(page.getByRole('link', { name: 'PDF dependency list' })).toHaveAttribute(
    'href',
    '/tools/requirements.txt',
  );
  await paste(page);
  await page.getByRole('checkbox', { name: /accurately represents my experience/ }).check();
  await expect(page.getByRole('button', { name: 'Download Markdown' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Clean up with AI' })).toBeDisabled();
});

test('paste, edit, review, preview and download work locally; reload clears the resume', async ({
  page,
}) => {
  await workspace(page);
  await paste(page);
  const editor = page.getByRole('textbox', { name: 'Resume Markdown' });
  await expect(editor).toHaveValue(/# Taylor Demo/);
  await expect(page.getByRole('button', { name: 'Download Markdown' })).toBeDisabled();
  await page.getByRole('checkbox', { name: /accurately represents my experience/ }).check();
  await editor.fill('# Taylor Demo\n\n## Skills\nReact, TypeScript\n');
  await expect(
    page.getByRole('checkbox', { name: /accurately represents my experience/ }),
  ).not.toBeChecked();
  await page.getByRole('tab', { name: 'Reading preview' }).click();
  await expect(
    page.locator('.markdown-preview').getByRole('heading', { name: 'Taylor Demo' }),
  ).toBeVisible();
  await page.getByRole('checkbox', { name: /accurately represents my experience/ }).check();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Markdown' }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('resume.md');
  expect(await readFile((await download.path())!, 'utf8')).toContain(
    '## Skills\nReact, TypeScript',
  );
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('Taylor Demo');
  await nav(page, /Discover/).click();
  await nav(page, /resume/i).click();
  await expect(editor).toHaveValue(/Taylor Demo/);
  await page.reload();
  await nav(page, /resume/i).click();
  await expect(editor).toHaveValue('');
});

test('PDF and DOCX resumes are actually extracted in the browser', async ({ page }) => {
  await workspace(page);
  await page.getByLabel('Import resume file').setInputFiles({
    name: 'fictional-resume.pdf',
    mimeType: 'application/pdf',
    buffer: pdfBuffer(),
  });
  await expect(page.getByRole('textbox', { name: 'Resume Markdown' })).toHaveValue(
    /Taylor Demo - React developer/,
  );
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    'word/document.xml',
    '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Jordan Example</w:t></w:r></w:p><w:p><w:r><w:t>Skills: Python and SQL</w:t></w:r></w:p></w:body></w:document>',
  );
  await page.getByLabel('Import resume file').setInputFiles({
    name: 'fictional-resume.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: await zip.generateAsync({ type: 'nodebuffer' }),
  });
  await expect(page.getByRole('textbox', { name: 'Resume Markdown' })).toHaveValue(
    /Jordan Example/,
  );
  await expect(page.getByLabel('Or paste / correct the extracted text')).toHaveValue(
    /Python and SQL/,
  );
});

test('invalid imports preserve the existing resume and Markdown preview does not fetch images or run HTML', async ({
  page,
}) => {
  await workspace(page);
  await paste(page);
  await page.getByLabel('Import resume file').setInputFiles({
    name: 'wrong.exe',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('wrong'),
  });
  await expect(page.getByRole('alert')).toContainText('Use PDF, DOCX, TXT, or Markdown');
  await expect(page.getByRole('textbox', { name: 'Resume Markdown' })).toHaveValue(/Taylor Demo/);
  const external: string[] = [];
  page.on('request', (request) => {
    if (request.url().startsWith('https://')) external.push(request.url());
  });
  await page
    .getByRole('textbox', { name: 'Resume Markdown' })
    .fill(
      '# Safe preview\n\n<script>window.evil = true</script>\n\n![image](https://example.com/private.png)\n\n[Link](https://example.com)',
    );
  await page.getByRole('tab', { name: 'Reading preview' }).click();
  await expect(
    page.locator('.markdown-preview img, .markdown-preview script, .markdown-preview a'),
  ).toHaveCount(0);
  expect(external).toEqual([]);
  await page.getByLabel('Import resume file').setInputFiles({
    name: 'broken.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('not a pdf'),
  });
  await expect(page.getByRole('alert')).toContainText('PDF could not be read');
});

test('AI needs explicit consent, sends reviewed source only and never changes the original', async ({
  page,
}) => {
  await workspace(page, true);
  await paste(page);
  let sent: { text: string; consent: boolean } | null = null;
  await page.route('**/api/resume/normalize', async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({
      json: {
        markdown: '# Taylor Demo\n\n## Skills\nReact, TypeScript, SQL',
        warnings: ['Check the education date.'],
      },
    });
  });
  await expect(page.getByRole('button', { name: 'Clean up with AI' })).toBeDisabled();
  await page.getByRole('checkbox', { name: /accurately represents my experience/ }).check();
  const editedSource = sample.replace('Taylor Demo', 'Redacted name');
  await page.getByLabel('Or paste / correct the extracted text').fill(editedSource);
  expect(sent).toBeNull();
  await page.getByRole('checkbox', { name: /I agree to send the extracted text/ }).check();
  await page.getByRole('button', { name: 'Clean up with AI' }).click();
  await expect(page.getByText(/AI-assisted formatting/)).toBeVisible();
  expect(sent).toEqual({ text: editedSource, consent: true });
  await expect(page.getByText('Check the education date.')).toBeVisible();
  await expect(
    page.getByRole('checkbox', { name: /accurately represents my experience/ }),
  ).not.toBeChecked();
  await page.getByText('View original extracted text (unchanged)', { exact: true }).click();
  await expect(page.locator('.original-text pre')).toHaveText(sample);
});

test('a provider error preserves the current Markdown and original source', async ({ page }) => {
  await workspace(page, true);
  await paste(page);
  const previous = await page.getByRole('textbox', { name: 'Resume Markdown' }).inputValue();
  await page.route('**/api/resume/normalize', (route) =>
    route.fulfill({ status: 503, json: { error: 'AI cleanup is temporarily unavailable.' } }),
  );
  await page.getByRole('checkbox', { name: /I agree to send the extracted text/ }).check();
  await page.getByRole('button', { name: 'Clean up with AI' }).click();
  await expect(page.getByRole('alert')).toHaveText(/temporarily unavailable/);
  await expect(page.getByRole('textbox', { name: 'Resume Markdown' })).toHaveValue(previous);
  await expect(page.getByLabel('Or paste \/ correct the extracted text')).toHaveValue(sample);
});

test('deleting during AI cleanup prevents late results from restoring private content', async ({
  page,
}) => {
  await workspace(page, true);
  await paste(page);
  let started = false;
  let finish!: () => void;
  const gate = new Promise<void>((resolve) => {
    finish = resolve;
  });
  await page.route('**/api/resume/normalize', async (route) => {
    started = true;
    await gate;
    await route
      .fulfill({ json: { markdown: '# Late private content', warnings: [] } })
      .catch(() => {});
  });
  await page.getByRole('checkbox', { name: /I agree to send the extracted text/ }).check();
  await page.getByRole('button', { name: 'Clean up with AI' }).click();
  await expect.poll(() => started).toBe(true);
  await page.getByRole('button', { name: 'Delete resume', exact: true }).click();
  finish();
  await expect(page.getByRole('textbox', { name: 'Resume Markdown' })).toHaveValue('');
  await page.getByRole('checkbox', { name: 'Enable resume workspace' }).check();
  await expect(page.getByRole('textbox', { name: 'Resume Markdown' })).toHaveValue('');
  await expect(
    page.getByRole('checkbox', { name: /I agree to send the extracted text/ }),
  ).not.toBeChecked();
});

test('privacy clear-all removes the session resume and consent', async ({ page }) => {
  await workspace(page);
  await paste(page);
  await page
    .getByRole('button', { name: /Privacy.*data/i })
    .filter({ visible: true })
    .click();
  await page.getByRole('button', { name: 'Clear all local data' }).click();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await expect(page.getByRole('textbox', { name: 'Resume Markdown' })).toHaveValue('');
  await expect(page.getByRole('checkbox', { name: 'Enable resume workspace' })).not.toBeChecked();
});

test('API rejects unconsented and cross-origin submissions before any provider call', async ({
  request,
}) => {
  const missingConsent = await request.post('/api/resume/normalize', {
    headers: { Origin: 'http://127.0.0.1:5173' },
    data: { text: sample },
  });
  expect(missingConsent.status()).toBe(400);
  const foreign = await request.post('/api/resume/normalize', {
    headers: { Origin: 'https://example.com' },
    data: { text: sample, consent: true },
  });
  expect(foreign.status()).toBe(403);
});
