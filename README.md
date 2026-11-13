# LaunchScout

A privacy-first company discovery prototype for Bakersfield and nearby Central Valley cities, built with React, TypeScript, and Vite. Implements the interface and local behavior in [issue #2](https://github.com/GaelCT/LaunchScout/issues/2) and the resume-to-Markdown foundation for [issue #3](https://github.com/GaelCT/LaunchScout/issues/3).

**Demo status:** All 20 companies, descriptions, statistics, and opportunities are fictional. There are no verified listings, live job openings, real contacts, or source links in this dataset. Using fake data is intentional for this development phase; the real-data acceptance criteria in issues #1 and #2 remain outstanding.

## Run locally

Requires Node.js 22.13 or newer.

```sh
npm ci
npm run dev
```

Open the localhost URL printed by Vite. On Windows PowerShell, use `npm.cmd` if execution policy blocks `npm.ps1`.

```sh
npm run build       # Type-check and create dist/
npm run preview     # Serve the production build
npx playwright install chromium
npm test            # Desktop and mobile Chromium browser tests
npm run format:check
```

## Prototype behavior

- Discover one company at a time. Open its card for details, sample stats, verification status, and an editable outreach template.
- Save a company to a persistent Saved collection, or pass to exclude it from Discover. Both states survive reloads. Saved companies also leave the deck.
- Swipe right to save or left to pass. Buttons provide the same actions; left/right arrow keys work while the card has focus. Undo reverses the most recent decision in the current session.
- Filter Discover by city, industry, and sample opportunity type. Filters intersect; passed companies remain excluded. Saved and Passed collections show all their companies regardless of discovery filters.
- Remove a saved company or restore a passed company to return it to Discover, subject to current filters.
- Open **Privacy & your data** in the sidebar, or the shield button on mobile, to clear each category or all local data.
- Edit draft subject and body, then explicitly copy them. The demo never sends emails or supplies a recipient.
- Use the moon/sun toggle to switch between light and dark themes. The choice survives reloads and can be reset in Privacy controls.
- Cards tilt with a horizontal drag and fly right when saved or left when passed. Decisions are stored immediately; the animation is only visual. Reduced-motion preferences skip the flight and drag rotation.
- **My resume** opens an opt-in workspace to import a resume, edit Markdown, preview it, review it, and download `resume.md`. Optional AI cleanup is available only when the local server is configured.

## Resume workspace

1. Open **My resume** (or **Resume** in mobile navigation) and enable the workspace for this session.
2. Choose or drop a PDF, DOCX, TXT, or Markdown file, or paste text and select **Create Markdown**. A clearly labeled fictional example is available for trying the interface.
3. Correct extracted text if necessary. **Rebuild Markdown** explicitly replaces the editable version using that source. The read-only original extraction remains unchanged.
4. Edit Markdown or switch to the reading preview. Preview rendering disables HTML, images, and clickable document links, avoiding remote content requests from imported files.
5. Review the facts and check the approval box to enable **Download Markdown**. Every content change or successful AI cleanup clears that approval.

Imports are parsed locally with PDF.js and Mammoth. Files are limited to 5 MB, PDFs to 15 pages, and extracted text to 30,000 characters. Scanned PDFs require OCR outside this prototype; password-protected or unreadable documents can be replaced with pasted text. Older `.doc` files are unsupported. Extraction order and formatting can be imperfect, especially for multiple columns; review the result.

Resume text and the original extraction exist only in React session memory. Navigating between app views preserves them; reloading or closing the tab discards them. **Delete resume**, disabling the workspace, and Privacy controls remove the content and consent. The original file on the user's device is never modified. Downloads and clipboard contents must be removed on the device separately.

### Local Python parser (no API key)

The browser workflow already parses files locally without a key. A standalone Python 3.10+ alternative is also included at `public/tools/parse_resume.py`, downloadable from **My resume → Prefer a local Python script?**. Download the PDF dependency list to the same folder if using that link.

From this repository:

```sh
python -m pip install -r public/tools/requirements.txt
python public/tools/parse_resume.py path/to/resume.pdf -o resume.md
```

For the fictional test resume in this workspace:

```sh
python public/tools/parse_resume.py output/pdf/fictional-test-resume.pdf -o fictional-resume.md
```

PDF extraction uses `pypdf`; TXT, Markdown, and DOCX use Python's standard library and need no dependency installation. Installing `pypdf` requires package access once; parsing itself makes no network requests, uses no LLM, and does not require Node, a running server, an account, or an API key. Keep a local copy of Python and the dependency to work offline afterward.

The script recognizes common section headings and normalizes bullets without rewriting facts. Existing Markdown is preserved apart from outer whitespace, BOM, and line-ending normalization. It does not perform AI polishing or OCR. Review extraction order, especially for multi-column PDFs. Encrypted PDFs, old `.doc` files, and scanned PDFs without text need conversion first.

Output defaults to `INPUT.parsed.md`. Use `-o` for a specific `.md` path. Existing outputs require `--force`; the original input cannot be overwritten even with that flag. The limits match browser imports: 5 MB input, 15 PDF pages, and 30,000 extracted characters. DOCX parsing reads the document body (including tables) and does not extract headers, footers, comments, images, or text embedded inside images. It never rewrites, deletes, or uploads the original. Generated Markdown stays on disk until the user deletes it and can be imported back into the browser workspace.

```sh
python -m unittest discover -s tests/python -v
```

### Optional AI cleanup setup

Manual editing and downloads need no API key. To enable cleanup locally, copy `.env.example` to `.env.local` and set:

```dotenv
OPENAI_API_KEY=your_api_key
OPENAI_MODEL=your_selected_model
```

Choose a model supporting the Responses API and Structured Outputs. Restart `npm run dev` after changing configuration. Keep credentials server-side; do not use a `VITE_` prefix. `.env.local` and other real environment files are ignored by Git.

The server reports availability without sending resume content. An AI request requires both the disclosure checkbox and the explicit **Clean up with AI** action. It sends only the editable extracted text through the local server to OpenAI, including any contact information left in that text. The original file, browser preferences, and company data are not sent. Remove personal details in the source editor first if desired.

The request asks for faithful Markdown organization without embellishment, job tailoring, inferred qualifications, or omitted factual content. The API returns schema-constrained Markdown and review warnings; schema validation does not guarantee factual accuracy. AI output is labeled and always requires human review. Failed/canceled requests leave current content unchanged. Deleting or leaving the workspace aborts an in-flight cleanup and ignores late results, but cannot recall a request already received by the provider.

`server/resumeApi.ts` uses the official OpenAI SDK with `store: false`, no automatic retries, a timeout, request-size limits, and one in-flight cleanup per local instance. Application code does not log request content or write resume data to disk. Provider retention rules still apply; see [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data).

The API is local prototype middleware available in `npm run dev` and `npm run preview`. It rejects non-local hosts and cross-origin submissions. A plain static deployment of `dist/` supports manual import/edit/download but has no AI endpoint. Public deployment requires an authenticated backend with deployment-specific abuse controls; the local middleware is not a public AI service.

This is the first implementation slice of #3. Company-specific AI email generation, outreach goal selection, and tailored resume variants remain follow-up work. The existing non-AI outreach editor stays available. The issue remains open, including its reviewed-company-data dependency.

The demo covers Bakersfield, Delano, Wasco, Tulare, and Visalia as an illustrative discovery area. This does not establish a geographic policy for the future researched dataset.

## Privacy and storage

One origin-scoped browser `localStorage` key, `launchscout.preferences.v1`, contains:

```json
{
  "saved": ["company-id"],
  "rejected": ["other-company-id"],
  "filters": { "city": "", "industry": "", "opportunity": "" },
  "theme": "dark"
}
```

No names, email addresses, resumes, user accounts, or draft content are stored in localStorage. Resume content is held in session memory as described above. Outreach text stays in memory while its dialog is open, including when switching between its tabs. Closing the dialog or reloading discards it. Copying explicitly places draft text on the operating system clipboard; LaunchScout does not clear that clipboard.

Privacy controls clear saved IDs, passed IDs, filters, the appearance preference, and session resume content independently. Clearing everything removes the key, restores the light theme, clears the undo action, and removes session resume content and consent. Clearing browser site data also removes saved preferences. Preferences do not sync between devices or origins. If storage is blocked, the interface stays usable in memory and displays a persistence warning when a write fails. Malformed stored JSON is discarded; unknown IDs, unsupported filters, and invalid themes are sanitized.

There is no telemetry, analytics, external font request, or automatic email sending. The optional resume cleanup endpoint is the only AI integration. The app fetches its own static assets; GitHub, provider-policy links, and future public source links visit third-party sites only when opened. A future hosting provider may maintain its own request logs.

## Replacing the demo data

The typed fixture data is in `src/data.ts`; browser preference validation is in `src/storage.ts`. Preserve stable company IDs to preserve existing saved selections.

Before enabling a real-data mode:

1. Import the reviewed spreadsheet from issue #1, including public source URLs and actual check dates.
2. Make unavailable stats optional and omit unknown openings. Never infer contacts, opportunities, or statistics.
3. Replace the demo disclosures, hardcoded sample labels, and fictional draft disclaimer with accurate verification and source-based wording. The current UI deliberately always identifies its fixtures as fictional.
4. Confirm the listing reviewer, review cadence, stale threshold, and removal process under the separate maintenance workstream.

The issue must remain open until its real-data requirements are satisfied. This prototype does not implement research, ongoing listing maintenance, California-wide expansion, tailored resume variants, or AI outreach.

## Verification

Playwright runs the same user flows on desktop and an emulated iPhone viewport using Chromium: persistence and privacy resets, filters and rejection exclusion, edited draft copying and disposal, missing-source disclosures, undo and restoration, an exhausted deck, malformed/blocked storage, swipe and keyboard actions, theme persistence, viewport overflow, and dialog focus restoration. Resume tests cover actual PDF/DOCX extraction using fictional fixtures, editing, preview safety, reviewed downloads, consent, deletion during a pending AI request, and server rejection of unconsented/cross-origin submissions. AI success/error responses are mocked; no live provider request or factual-output quality evaluation is performed by the tests. This is mobile layout testing, not a Safari/WebKit compatibility claim.

The standalone parser has Python unit tests covering PDF/DOCX/TXT/Markdown extraction, formatting, invalid inputs, limits, output protection, and the CLI. They run with socket creation disabled to catch accidental network use. Run them after installing the optional PDF dependency with `python -m unittest discover -s tests/python -v`.

GitHub Actions runs formatting checks, the production build, the Python parser tests, and the browser tests on pushes and pull requests.
