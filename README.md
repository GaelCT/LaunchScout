# LaunchScout

A privacy-first company discovery prototype for Kern County, built with React, TypeScript, and Vite. It implements the swipe-card experience in [issue #2](https://github.com/GaelCT/LaunchScout/issues/2), the resume-to-Markdown foundation for [issue #3](https://github.com/GaelCT/LaunchScout/issues/3), and a source-linked local research snapshot.

**Research data:** `src/research-data/kern-county.json` contains 28 company records, 2 student-program records, 2 ecosystem resources, and 2 verification-queue leads from the Kern County research brief. The snapshot date is November 13, 2026. It is a dated research dataset, not a live feed: users should open linked sources and confirm role status, requirements, pay, and contact routes before acting. Unknown information remains blank, and potential student skill fit is editorial guidance rather than an employer claim. The California-wide expansion and ongoing listing-maintenance process are not implemented.

See [current project status](STATUS.md) for completed work, issue ownership, validation, and the remaining requirements for issues #1–#4.

## Run locally

Requires Node.js 22.13 or newer.

```sh
npm ci
npm run dev
```

The command starts both the loopback API and Vite. Open the localhost URL printed by Vite. Accounts and AI are unavailable until their server configuration is supplied; guest tools still work. On Windows PowerShell, use `npm.cmd` if execution policy blocks `npm.ps1`.

```sh
npm run build       # Type-check and create dist/
npm run preview     # Serve the production build
npx playwright install chromium
npm test            # Desktop and mobile Chromium browser tests
npm run format:check
```

## Prototype behavior

- Discover one company at a time. Open its card for source-linked company details, reported statistics when available, role status, and an editable outreach draft.
- Save a company to a persistent Saved collection, or pass to exclude it from Discover. Both states survive reloads. Saved companies also leave the deck.
- Swipe right to save or left to pass. Buttons provide the same actions; left/right arrow keys work while the card has focus. Undo reverses the most recent decision in the current session.
- Filter Discover by city, company type, industry, and role type listed in the research snapshot. Filters intersect; passed companies remain excluded. Saved and Passed collections show all their companies regardless of discovery filters.
- Remove a saved company or restore a passed company to return it to Discover, subject to current filters.
- Open **Privacy & your data** in the sidebar, or the shield button on mobile, to clear each category or all local data.
- Edit the outreach subject and body, then explicitly copy them. LaunchScout does not send emails or supply unverified recipients.
- Use the moon/sun toggle to switch between light and dark themes. The choice survives reloads and can be reset in Privacy controls.
- Cards tilt with a horizontal drag and fly right when saved or left when passed. Decisions are stored immediately; the animation is only visual. Reduced-motion preferences skip the flight and drag rotation.
- **My resume** opens an opt-in workspace to import a resume, edit Markdown, preview it, review it, and download `resume.md`. Optional AI cleanup is available only when the local server is configured.
- **Sign in** connects to the real account API when configured. Guest discovery and local resume editing do not require an account.

## Accounts and authentication

Sign-in now uses a standalone PostgreSQL-backed API: registration, email verification, password recovery/change, HTTP-only JWT/refresh cookies, logout, and account deletion. Google/GitHub remain disabled placeholders. Without account configuration, guest discovery and local resume tools remain usable.

See [setup, session/security policy, and operator commands](docs/security.md) and the [proposed PostgreSQL schema for issue #6](docs/database-schema.md). Only the tables needed for authentication and AI controls are implemented; cross-device collection syncing and reviewed guest import remain #6 work. Signed-in choices stay in memory and do not overwrite guest preferences.

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

### Protected AI cleanup

Manual parsing, editing and downloads need no API key or account. Paid cleanup requires a signed-in, verified account with operator-granted AI access, explicit disclosure/consent, and a configured server-side provider/model/budget. The current provider is still OpenAI; Mistral and Jev remain planned integrations.

The standalone API enforces live session/CSRF checks, input limits, per-account/network limits, shared PostgreSQL spending reservations, concurrency limits, idempotency and a kill switch. No request waits in an unbounded queue. Failures/cancellation preserve original text and conservatively retain any uncertain provider charge. No provider key is bundled or exposed to the browser.

See [security setup](docs/security.md) for exact limits, model/pricing configuration, retention, key rotation, cancellation/accounting semantics and operator commands. AI stays off until configured; no live paid request is used by tests. A static deployment supports the local resume workflow, while accounts and paid AI require the separately deployed API under the same HTTPS origin.

The current research snapshot covers Kern County communities. Company listings, student programs, ecosystem resources, and leads awaiting verification are stored as separate data types.

## Privacy and storage

For guests, one origin-scoped browser `localStorage` key, `launchscout.preferences.v1`, contains:

```json
{
  "saved": ["company-id"],
  "rejected": ["other-company-id"],
  "filters": { "city": "", "companyType": "", "industry": "", "opportunity": "" },
  "theme": "dark"
}
```

No names, email addresses, resumes, user accounts, or draft content are stored in localStorage. Resume content is held in session memory as described above. Outreach text stays in memory while its dialog is open, including when switching between its tabs. Closing the dialog or reloading discards it. Copying explicitly places draft text on the operating system clipboard; LaunchScout does not clear that clipboard.

Privacy controls clear saved IDs, passed IDs, filters, the appearance preference, and session resume content independently. Clearing everything removes the key, restores the light theme, clears the undo action, and removes session resume content and consent. Clearing browser site data also removes saved preferences. Preferences do not sync between devices or origins. If storage is blocked, the interface stays usable in memory and displays a persistence warning when a write fails. Malformed stored JSON is discarded; unknown IDs, unsupported filters, and invalid themes are sanitized.

There is no analytics, external font request, or automatic outreach sending. Account registration/recovery sends only explicitly requested account emails. The backend records content-free security events. The optional resume cleanup endpoint is the only AI integration. The app fetches its own static assets; GitHub, provider-policy links, and future public source links visit third-party sites only when opened. A future hosting provider may maintain its own request logs.

## Research data and maintenance

The reviewed snapshot is stored in `src/research-data/kern-county.json`; `src/data.ts` maps company records into the card interface, and `src/storage.ts` validates saved company IDs and filters against the dataset. Stable company IDs preserve saved and passed selections when records are updated.

The app presents company types, local connection, industries, source links and check dates, reported role details, student programs, and potential skill-fit notes. No relevant public role found in the research is different from a claim that a company has no opportunities. Openings are historical snapshot records and must be confirmed on the linked employer page. Unknown team size, contact details, and other fields remain unknown. Do not scrape private contact details or invent contacts, openings, statistics, or hiring plans.

Before treating the directory as current, assign a listing reviewer, establish a review cadence and stale threshold, and define a flag, recheck, and removal process. The dataset includes recommended company and role recheck intervals, but the app does not yet perform scheduled updates or flag stale listings automatically. California-wide expansion, LLM-generated outreach, tailored resume variants, and inbox integrations are not implemented.

## Verification

Playwright runs the same user flows on desktop and an emulated iPhone viewport using Chromium: persistence and privacy resets, filters and rejection exclusion, edited draft copying and disposal, missing-source disclosures, undo and restoration, an exhausted deck, malformed/blocked storage, swipe and keyboard actions, theme persistence, viewport overflow, and dialog focus restoration. Resume tests cover actual PDF/DOCX extraction using fictional fixtures, editing, preview safety, reviewed downloads, consent, deletion during a pending AI request, and server rejection of unconsented/cross-origin submissions. Login tests cover validation, keyboard/focus behavior, password visibility and cleanup, loading/cancellation, no auth requests or persisted credentials, inactive providers, themes, and guest workflow continuity. AI success/error responses are mocked; no live provider request or factual-output quality evaluation is performed by the tests. This is mobile layout testing, not a Safari/WebKit compatibility claim.

The standalone parser has Python unit tests covering PDF/DOCX/TXT/Markdown extraction, formatting, invalid inputs, limits, output protection, and the CLI. They run with socket creation disabled to catch accidental network use. Run them after installing the optional PDF dependency with `python -m unittest discover -s tests/python -v`.

GitHub Actions runs formatting checks, the production build, the Python parser tests, and the browser tests on pushes and pull requests.

Backend security tests: `npm run test:server`. They use TEST_DATABASE_URL when explicitly supplied or start an isolated real PostgreSQL instance otherwise. They include two-process quota enforcement and a real browser/account/database flow. See [security verification](docs/security.md#verification).
