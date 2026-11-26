# LaunchScout project status

Updated November 26, 2026. This report describes the implementation in this branch; an open pull request does not mean the changes have been merged into `main`.

## Current state

LaunchScout has a responsive JSON-backed company discovery interface, session-only resume tools, and a PostgreSQL-backed account API when configured. The research snapshot is dated November 13, 2026 and contains 28 companies, 2 programs, 2 ecosystem resources and 2 unverified leads. This branch implements #8 authentication and #12 paid-AI controls for review; it does not enable cloud resume storage or complete #6 collection syncing. Mistral and Jev remain planned.

## Issue status and ownership

| Issue                                                                         | Assigned to | Implemented here                                                                                                                                                                                                                                                                                 | Still required to close                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#1: Research local startups](https://github.com/GaelCT/LaunchScout/issues/1) | JCVB51      | Integrated a source-linked Kern County snapshot with 28 company records, 2 student programs, 2 ecosystem resources, and 2 verification leads.                                                                                                                                                    | Review the integrated records and source links against the research brief, agree on the issue’s final fields/geographic scope, and use the supplied JSON dataset as the research handoff. Define listing ownership and ongoing maintenance before treating the directory as current.                                            |
| [#2: Swipe-card MVP](https://github.com/GaelCT/LaunchScout/issues/2)          | GaelCT      | Discovery cards, source-linked company details, snapshot role information, editable outreach drafts, copy fallback, city/company-type/industry/role filters, persistent Saved/Passed collections, undo/restore, privacy resets, dark theme, directional card motion, and reduced-motion support. | Review data quality, verify source links, check current role statuses, and validate the complete data-driven workflow. Listings remain a dated snapshot rather than live openings.                                                                                                                                              |
| [#3: Opt-in LLM outreach](https://github.com/GaelCT/LaunchScout/issues/3)     | GaelCT      | Opt-in PDF/DOCX/TXT/MD import; local extraction; original-text view; editable Markdown and safe preview; review before download; session deletion; optional server-side OpenAI cleanup; cancellation/error recovery; downloadable offline Python parser; synthetic test resume.                  | Connect approved resume content and reviewed company data to editable AI **email** generation; add internship, coffee-chat, desired-role, target-contact, and company-needs options; support regeneration; label and validate generated outreach. Configure and evaluate a real provider/model before claiming live AI quality. |
| [#4: Email-client handoff](https://github.com/GaelCT/LaunchScout/issues/4)    | JCVB51      | Goal-based editable outreach drafts, percent-encoded `mailto:` handoff, prefilled recipient only from a public `mailto:` contact route, and copy fallback. No inbox OAuth or automatic sending.                                                                                                  | Confirm default-client behavior on target browsers; review remains open until the handoff is manually checked.                                                                                                                                                                                                                  |

Issues #2 and #3 remain open because their full acceptance criteria have not been met. Completed implementation slices are committed by issue, without automatic issue-closing keywords.

## Account work breakdown

| Issue                                                                           | Owner  | Status in this branch                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#6: PostgreSQL accounts](https://github.com/GaelCT/LaunchScout/issues/6)       | GaelCT | Proposed schema in docs/database-schema.md and issue #6. Required auth/usage tables, migrations and local PostgreSQL setup are implemented for #8/#12. Collection tables, sync APIs, cross-device preferences and explicit guest import remain #6 work.                                                         |
| [#7: Login-page prototype](https://github.com/GaelCT/LaunchScout/issues/7)      | GaelCT | Completed and merged. The real account forms now extend the established UI under #8.                                                                                                                                                                                                                            |
| [#8: Password hashing and JWTs](https://github.com/GaelCT/LaunchScout/issues/8) | GaelCT | Implemented for review: Argon2id, live JWT/session checks, rotating refresh tokens/replay revocation, registration, email verification/reset, password change, logout/deletion, CSRF, abuse limits, account-state cleanup and browser integration. Requires configured PostgreSQL, secrets and SMTP to operate. |
| [#12: AI API protection](https://github.com/GaelCT/LaunchScout/issues/12)       | GaelCT | Implemented for review: verified/entitled account access, shared rate/token/request/budget/concurrency limits, atomic conservative reservations and settlement, idempotency, deadlines/cancellation, trusted-proxy policy, kill switch, metadata events and operator commands. AI defaults off.                 |

Google/GitHub and possible passkey/email-link sign-in remain placeholders. Account authentication uses the real API; the browser receives only HTTP-only cookies and an in-memory account/CSRF view. The guest workflow stays available without account configuration.

## Planned Mistral integration

[#10: Privacy-focused Mistral integration](https://github.com/GaelCT/LaunchScout/issues/10) is assigned to GaelCT. It tracks the planned provider integration, local/self-hosted versus hosted inference decision, verified retention/training settings, accurate consent and privacy copy, and no silent fallback to another provider. Mistral is not connected yet; the existing optional cleanup endpoint still uses OpenAI when configured, and the no-key local parsers remain available.

## What users can do now

- Explore source-linked Kern County company records, save or pass, restore selections, filter the discovery deck, and retain preferences after reloading.
- Open company details, choose an internship, coffee-chat, or desired-role template, edit it, then open a prefilled `mailto:` draft or copy the content. Only a listed public email is prefilled; no message is automatically sent.
- Use the light/dark theme toggle and swipe, button, or keyboard card actions.
- Register, verify an email, sign in/out, restore sessions, recover/change a password and delete an account when the backend is configured. Private session state clears on account changes.
- Import a resume locally, correct extracted text, edit/preview Markdown, approve it, and download a reusable copy without any API key.
- Download and run `public/tools/parse_resume.py` without an LLM. PDF support needs `pypdf`; DOCX/TXT/Markdown use Python's standard library.
- Request consented AI cleanup only with a verified, operator-enabled account and configured provider/model/prices/budget. The feature remains formatting cleanup; company-specific AI outreach is not implemented.

## Privacy and deployment boundaries

- Guest localStorage contains only saved/passed IDs, filters and theme. Signed-in choices stay in memory until #6 syncing; credentials, tokens and resume text never enter browser storage. PostgreSQL holds account, hashed credential/token, session and content-free accounting data.
- Resume text lives in browser session memory. Delete, disable, reload, or close the tab to discard it. Python outputs and downloaded files remain on the user's device until deleted there.
- Only an explicit consented cleanup sends extracted resume text to OpenAI through the local API. The original file is not uploaded to the provider. No live provider call has been used for validation of this branch.
- A standalone API now enforces #8/#12 controls; Vite only proxies API requests locally. Production needs the reviewed same-origin HTTPS deployment under #15. Setup, retention, key rotation, rate/budget defaults and operator responsibilities are documented in docs/security.md.
- A provider key is not bundled, exposed to the browser, or required for the manual workflow. Model access and API usage must be configured by the operator.

## Validation

- Production TypeScript/Vite build and Prettier formatting checks.
- 88 desktop/mobile Chromium checks passed locally on the combined authentication, mailto, and rendering-security implementation. Coverage includes renewing expired access before checking AI availability and keeping long untrusted company text within the mobile viewport and dialog.
- A separate production-preview run exercises 8 applicable rendering-security checks on desktop and mobile. The synthetic company data-module fixture runs against the development server and is skipped in that production run; pure URL-policy checks still run in both.
- 23 backend security integration tests use real PostgreSQL, including two independent Node processes sharing admission limits and a real browser registration/verification/login/cleanup/logout flow. Provider/mail adapters are synthetic; no paid call or outside email is sent.
- 17 Python parser tests run in CI with socket creation disabled.
- AI browser responses are mocked; no live LLM factual-quality, cost, latency, or refusal evaluation has been performed.
- Phone viewport checks are not a Safari/WebKit compatibility claim. GitHub Actions results must be checked after the branch is pushed.

## Next priorities

1. Review the integrated Kern County JSON records against their linked sources and record corrections under issue #2. The research handoff in #1 is already complete.
2. Confirm role statuses, record any corrections, and define a reviewer, cadence, stale threshold, and removal workflow.
3. Complete #3's outreach generation and goal controls using approved resume text and reviewed company facts.
4. Manually confirm #4 with a configured default email client; the app does not automatically send messages.

California-wide expansion, OCR, tailored resume variants, inbox integrations and automatic outreach delivery remain unimplemented. Account verification/recovery emails are distinct from outreach.
