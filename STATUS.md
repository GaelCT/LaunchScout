# LaunchScout project status

Updated November 17, 2026. This report describes the implementation in this branch; an open pull request does not mean the changes have been merged into `main`.

## Current state

LaunchScout is a working local prototype with a responsive swipe-card interface, a Kern County research snapshot, an optional resume workspace, and a frontend-only login preview. The JSON snapshot is dated November 13, 2026 and contains 28 companies, 2 student programs, 2 ecosystem resources, and 2 leads awaiting verification. It is not a live feed, and public role information must be rechecked before users apply. The login preview does not authenticate or create accounts. No API credentials or private resumes are included.

## Issue status and ownership

| Issue                                                                         | Assigned to | Implemented here                                                                                                                                                                                                                                                                                 | Still required to close                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#1: Research local startups](https://github.com/GaelCT/LaunchScout/issues/1) | JCVB51      | Integrated a source-linked Kern County snapshot with 28 company records, 2 student programs, 2 ecosystem resources, and 2 verification leads.                                                                                                                                                    | Review the integrated records and source links against the research brief, agree on the issue’s final fields/geographic scope, and use the supplied JSON dataset as the research handoff. Define listing ownership and ongoing maintenance before treating the directory as current.                                            |
| [#2: Swipe-card MVP](https://github.com/GaelCT/LaunchScout/issues/2)          | GaelCT      | Discovery cards, source-linked company details, snapshot role information, editable outreach drafts, copy fallback, city/company-type/industry/role filters, persistent Saved/Passed collections, undo/restore, privacy resets, dark theme, directional card motion, and reduced-motion support. | Review data quality, verify source links, check current role statuses, and validate the complete data-driven workflow. Listings remain a dated snapshot rather than live openings.                                                                                                                                              |
| [#3: Opt-in LLM outreach](https://github.com/GaelCT/LaunchScout/issues/3)     | GaelCT      | Opt-in PDF/DOCX/TXT/MD import; local extraction; original-text view; editable Markdown and safe preview; review before download; session deletion; optional server-side OpenAI cleanup; cancellation/error recovery; downloadable offline Python parser; synthetic test resume.                  | Connect approved resume content and reviewed company data to editable AI **email** generation; add internship, coffee-chat, desired-role, target-contact, and company-needs options; support regeneration; label and validate generated outreach. Configure and evaluate a real provider/model before claiming live AI quality. |
| [#4: Email-client handoff](https://github.com/GaelCT/LaunchScout/issues/4)    | JCVB51      | Goal-based editable outreach drafts, percent-encoded `mailto:` handoff, prefilled recipient only from a public `mailto:` contact route, and copy fallback. No inbox OAuth or automatic sending.                                                                                                  | Confirm default-client behavior on target browsers; review remains open until the handoff is manually checked.                                                                                                                                                                                                                  |

Issues #2 and #3 remain open because their full acceptance criteria have not been met. Completed implementation slices are committed by issue, without automatic issue-closing keywords.

## Account work breakdown

| Issue                                                                           | Owner  | Status in this branch                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#6: PostgreSQL accounts](https://github.com/GaelCT/LaunchScout/issues/6)       | GaelCT | Not implemented: PostgreSQL schema, migrations, persistent users, and account data APIs.                                                                                                                                                                                              |
| [#7: Login-page prototype](https://github.com/GaelCT/LaunchScout/issues/7)      | GaelCT | Frontend merged in PR #9; issue #7 is closed: responsive light/dark page, local validation, show/hide password, cancelable mock submission, credential cleanup, clear guest/preview feedback, disabled recovery/registration controls, and inactive OAuth/future-method placeholders. |
| [#8: Password hashing and JWTs](https://github.com/GaelCT/LaunchScout/issues/8) | GaelCT | Not implemented: real credential verification, hashing, token/session issuance and validation, recovery, logout/revocation, and backend authorization.                                                                                                                                |

Google, GitHub, passkeys, and email links are placeholders only. No OAuth or other external sign-in provider is connected. The `AuthAdapter` boundary is ready for a future real service; the current mock creates no tokens or persisted login state.

## Planned Mistral integration

[#10: Privacy-focused Mistral integration](https://github.com/GaelCT/LaunchScout/issues/10) is assigned to GaelCT. It tracks the planned provider integration, local/self-hosted versus hosted inference decision, verified retention/training settings, accurate consent and privacy copy, and no silent fallback to another provider. Mistral is not connected yet; the existing optional cleanup endpoint still uses OpenAI when configured, and the no-key local parsers remain available.

## What users can do now

- Explore source-linked Kern County company records, save or pass, restore selections, filter the discovery deck, and retain preferences after reloading.
- Open company details, choose an internship, coffee-chat, or desired-role template, edit it, then open a prefilled `mailto:` draft or copy the content. Only a listed public email is prefilled; no message is automatically sent.
- Use the light/dark theme toggle and swipe, button, or keyboard card actions.
- Open **Sign in** to preview the login interface with fictional inputs, then return to the guest app. Fields clear after mock submission or leaving the login page.
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
- 64 Playwright checks across desktop and an emulated phone viewport in Chromium: 22 discovery/theme/privacy checks, 8 JSON research checks, 20 resume checks, and 14 login-preview checks. Coverage includes the dated JSON snapshot, source links, role requirements and closed status, combined filters, legacy preference cleanup, guest continuity, local resume extraction, consent, cancellation/deletion, and safe preview rendering.
- 17 Python parser unit tests with socket creation disabled, plus a command-line conversion of the fictional PDF.
- AI browser responses are mocked; no live LLM factual-quality, cost, latency, or refusal evaluation has been performed.
- Phone viewport checks are not a Safari/WebKit compatibility claim. GitHub Actions results must be checked after the branch is pushed.

## Next priorities

1. Review the integrated Kern County JSON records against their linked sources and record corrections under issue #2. The research handoff in #1 is already complete.
2. Confirm role statuses, record any corrections, and define a reviewer, cadence, stale threshold, and removal workflow.
3. Complete #3's outreach generation and goal controls using approved resume text and reviewed company facts.
4. Manually confirm #4 with a configured default email client; the app does not automatically send messages.

California-wide expansion, OCR, tailored resume variants, inbox integrations, and automatic email delivery are not implemented. Automatic delivery remains outside the current MVP scope.
