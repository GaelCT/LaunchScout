# LaunchScout project status

Updated November 15, 2026. This report describes the implementation in this branch; an open pull request does not mean the changes have been merged into `main`.

## Current state

LaunchScout is a working local prototype with a responsive swipe-card interface, a Kern County research snapshot, and an optional resume workspace. The research snapshot is dated November 13, 2026 and contains 28 companies, 2 student programs, 2 ecosystem resources, and 2 leads awaiting verification. It is not a live feed, and public role information must be rechecked before users apply. No API credentials or private resumes are included.

## Issue status and ownership

| Issue                                                                         | Assigned to | Implemented here                                                                                                                                                                                                                                                                                 | Still required to close                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#1: Research local startups](https://github.com/GaelCT/LaunchScout/issues/1) | JCVB51      | Integrated a source-linked Kern County snapshot with 28 company records, 2 student programs, 2 ecosystem resources, and 2 verification leads.                                                                                                                                                    | Review the integrated records and source links against the research brief, agree on the issue’s final fields/geographic scope, and link the reviewed source spreadsheet or dataset in the issue. Define listing ownership and ongoing maintenance before treating the directory as current.                                     |
| [#2: Swipe-card MVP](https://github.com/GaelCT/LaunchScout/issues/2)          | GaelCT      | Discovery cards, source-linked company details, snapshot role information, editable outreach drafts, copy fallback, city/company-type/industry/role filters, persistent Saved/Passed collections, undo/restore, privacy resets, dark theme, directional card motion, and reduced-motion support. | Review data quality, verify source links, check current role statuses, and validate the complete data-driven workflow. Listings remain a dated snapshot rather than live openings.                                                                                                                                              |
| [#3: Opt-in LLM outreach](https://github.com/GaelCT/LaunchScout/issues/3)     | GaelCT      | Opt-in PDF/DOCX/TXT/MD import; local extraction; original-text view; editable Markdown and safe preview; review before download; session deletion; optional server-side OpenAI cleanup; cancellation/error recovery; downloadable offline Python parser; synthetic test resume.                  | Connect approved resume content and reviewed company data to editable AI **email** generation; add internship, coffee-chat, desired-role, target-contact, and company-needs options; support regeneration; label and validate generated outreach. Configure and evaluate a real provider/model before claiming live AI quality. |
| [#4: Email-client handoff](https://github.com/GaelCT/LaunchScout/issues/4)    | JCVB51      | Copying editable outreach text already works in #2.                                                                                                                                                                                                                                              | Add a properly encoded `mailto:` action with verified public recipients when available, outreach-goal templates, manual-client review, and copy fallback. No inbox OAuth or automatic sending.                                                                                                                                  |

Issues #2 and #3 remain open because their full acceptance criteria have not been met. Completed implementation slices are committed by issue, without automatic issue-closing keywords.

## What users can do now

- Explore source-linked Kern County company records, save or pass, restore selections, filter the discovery deck, and retain preferences after reloading.
- Open company details and edit/copy a non-AI outreach template. No email is automatically sent.
- Use the light/dark theme toggle and swipe, button, or keyboard card actions.
- Import a resume locally, correct extracted text, edit/preview Markdown, approve it, and download a reusable copy without any API key.
- Download and run `public/tools/parse_resume.py` without an LLM. PDF support needs `pypdf`; DOCX/TXT/Markdown use Python's standard library.
- Optionally request AI resume-format cleanup after explicit consent, if the local server is configured with `OPENAI_API_KEY` and `OPENAI_MODEL`. This is resume cleanup, not company-specific email generation or job-specific resume tailoring.

## Privacy and deployment boundaries

- Browser localStorage contains only saved/passed company IDs, filters, and the theme.
- Resume text lives in browser session memory. Delete, disable, reload, or close the tab to discard it. Python outputs and downloaded files remain on the user's device until deleted there.
- Only an explicit consented cleanup sends extracted resume text to OpenAI through the local API. The original file is not uploaded to the provider. No live provider call has been used for validation of this branch.
- The cleanup API is local Vite development/preview middleware. A static deployment supports the manual resume workflow but needs a separately deployed backend for AI. Public AI deployment still needs authentication, deployment-specific rate/abuse controls, and reviewed privacy/retention disclosures.
- A provider key is not bundled, exposed to the browser, or required for the manual workflow. Model access and API usage must be configured by the operator.

## Validation

- Production TypeScript/Vite build and Prettier formatting checks.
- 42 Playwright checks across desktop and an emulated phone viewport in Chromium: 22 discovery/theme/privacy checks and 20 resume checks, including no-key downloads, actual PDF/DOCX extraction, safe Markdown preview, consent, error recovery, and deletion during in-flight cleanup.
- 17 Python parser unit tests with socket creation disabled, plus a command-line conversion of the fictional PDF.
- AI browser responses are mocked; no live LLM factual-quality, cost, latency, or refusal evaluation has been performed.
- Phone viewport checks are not a Safari/WebKit compatibility claim. GitHub Actions results must be checked after the branch is pushed.

## Next priorities

1. Review the integrated Kern County records against their linked sources and attach the approved dataset/spreadsheet to issue #1.
2. Confirm role statuses, record any corrections, and define a reviewer, cadence, stale threshold, and removal workflow.
3. Complete #3's outreach generation and goal controls using approved resume text and reviewed company facts.
4. Coordinate #4's email-client handoff with JCVB51.

California-wide expansion, OCR, tailored resume variants, inbox integrations, and automatic email delivery are not implemented. Automatic delivery remains outside the current MVP scope.
