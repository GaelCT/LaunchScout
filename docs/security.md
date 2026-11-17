# Authentication and AI access controls

Implemented for issues #8 and #12. The [schema proposal for #6](database-schema.md) separates implemented prerequisites from future preference/company-state syncing. Mistral (#10), Jev (#17), full production hosting hardening (#15), and cloud collection persistence (#6) remain separate work.

## Local setup

Node 22.13+ is required (CI uses Node 24). Without account configuration, `npm run dev` still starts the API and frontend and preserves guest discovery and local resume editing/downloads; sign-in is honestly unavailable.

1. Run `npm ci` and copy `.env.example` to `.env.local`.
2. Choose a local `POSTGRES_PASSWORD`; run `docker compose --env-file .env.local up -d`. PostgreSQL and Mailpit bind only to loopback. Existing PostgreSQL installations may be used instead.
3. Set `DATABASE_URL=postgresql://launchscout_owner:YOUR_URL_ENCODED_LOCAL_PASSWORD@127.0.0.1:5432/launchscout` and `SMTP_URL=smtp://127.0.0.1:1025`.
4. Run `npm run ops -- secrets` and place its newly generated authentication settings in `.env.local`. Do not commit or share them. Keys are base64url, with at least 32 random bytes.
5. Run `npm run db:migrate`, then `npm run dev`. The frontend is on `http://127.0.0.1:5173`; its `/api` proxy targets the separate loopback API on port 3001.
6. Register using a fictional address. Open local Mailpit at `http://127.0.0.1:8025`, follow the verification link, and explicitly confirm it. Local Mailpit captures account emails; it does not deliver them to outside recipients.

Use the documented owner connection only for local development/migrations. Before deployment, use a separate migration identity and a restricted application role; `server/grants.sql` is a reviewed starting point, not an automatic role/password installer. Production rejects missing database/mail/secrets, insecure app origins, wildcard proxy trust, and nonlocal database URLs without `sslmode=verify-full`.

`npm start` starts the standalone API, not Vite. Serve frontend build assets and `/api` behind the same HTTPS origin with a reverse proxy. Configure `APP_ORIGIN` exactly (no path/trailing slash), and `TRUSTED_PROXY_CIDRS` only for actual proxy addresses/subnets. Forwarded addresses are ignored by default. Do not publish Vite dev/preview or expose PostgreSQL/Mailpit publicly. Configure production SMTP with a valid sender and verified TLS; delivery errors log only a coarse event, never recipients or link contents.

## Passwords and sessions

- Passwords are 15–128 characters with a 512-byte UTF-8 ceiling. The maintained Argon2 library generates a separate 16-byte salt and hashes using Argon2id with 19 MiB, two iterations and one lane. Benchmark on deployment hardware; weaker stored parameters are upgraded at sign-in.
- Password hashing has a two-job per-process admission cap without an unbounded queue. Shared global, network and normalized-address rate limits also apply. There is no permanent account lockout an attacker can trigger.
- Access JWTs last ten minutes and contain only account/session identifiers and validation claims. HS256 and `at+jwt` are fixed; named signing keys are selected only from server configuration. Validate signature, issuer, audience, required claims, time bounds and the live PostgreSQL session/user version. Token-provided URLs, keys or filesystem paths are never followed.
- Production cookies use `__Host-` names, Secure, HttpOnly, SameSite=Strict, Path=/ and no Domain. Local HTTP uses separate development names. Neither JWT nor refresh token enters localStorage/sessionStorage, URLs, React state or JSON responses. CSRF tokens and a minimal account view remain in memory.
- Session lifetime is seven days absolute. Each refresh replaces a high-entropy opaque token; only its SHA-256 hash is stored. Replay of a consumed token revokes that login family. Concurrent refreshes have one winner and the loser revokes the family: there is no replay grace window. The browser serializes normal refreshes, including between supported tabs with Web Locks.
- Every authenticated request checks revocation/version in PostgreSQL. Logout revokes its session immediately; password change/reset and deletion invalidate all relevant sessions immediately. A request already admitted or sent to a provider cannot be recalled by revocation.
- Authenticated mutations require an exact allowed Origin and a session-bound, server-derived CSRF header. Login/registration/recovery also require the exact Origin and JSON. CORS is not treated as authentication.
- Sign-out and account changes clear private session state and cancel/ignore old resume work. Browser retries after renewal are bound to the original account; they cannot send an old user's action under a new user's session. Signed-in company choices remain in memory pending #6; guest preferences are not silently uploaded or overwritten by account choices.

## Recovery and verification

Registration and link-request messages are generic for known/unknown addresses. Verification links expire after 24 hours; reset links after 15 minutes. They are purpose-bound, stored hashed, consumed once, and replaced on a new request. Reset changes the hash and revokes sessions atomically.

Email is dispatched asynchronously with at most ten in-memory deliveries per process. SMTP latency does not hold password-hashing slots or delay the eligibility response. Failure, saturation or process shutdown can lose a delivery; the user can request a new link. Monitor `mail_delivery_failed`. No plaintext token outbox is persisted.

Email links carry tokens in a URL fragment rather than a server query/path. The browser removes the fragment from history and keeps the token in memory, including when a link opens in an existing tab. Verification/reset require an explicit POST; following a GET does not consume a link. Private payloads, cookies, credentials and tokens are never application-logged. Users can change passwords and delete accounts after confirming their current password. Account deletion cannot remove a provider's already-received request or backups outside this application; operators must document those retention limits.

## Paid AI admission

No anonymous paid AI is supported. A request needs a live session, verified email, explicit operator AI entitlement, current consent, valid text, a CSRF header and an idempotency UUID. AI defaults disabled and pricing defaults unconfigured. No key or quota is needed for local parsing/editing/downloads.

The PostgreSQL policy row serializes admission and settlement across processes. It enforces:

- Ten requests and 500,000 reserved/charged tokens per user per UTC day by default, plus network and per-minute account limits.
- Two active request leases globally, with **zero waiting queue**. Saturation returns 429 with Retry-After instead of accumulating work.
- Default application budgets of 1,000,000 microUSD per day ($1) and 10,000,000 microUSD per month ($10), effective only after the operator enables a configured model and prices.
- Output capped at 12,000 tokens; input limited to 128 KB JSON/30,000 characters. Admission conservatively reserves UTF-8 input/instruction/schema bytes plus 4,096 wrapper tokens and the entire output allowance.
- An account-scoped idempotency key produces only one admitted request, including concurrent retries. Completed duplicates return 409 instead of persisting private output for replay. Idempotency metadata is retained for 35 days.

Prices are integer **microUSD per million tokens**; budgets are integer microUSD. One dollar is 1,000,000 microUSD. Verify current rates for the selected model and include any applicable provider costs in conservative configured ceilings. These are application accounting limits, not a guarantee about a provider's invoice, hidden fees, currency conversion or changed pricing. Configure provider-side billing caps where available.

Successful responses settle to validated actual usage. Provider failures, timeouts, disconnects and ambiguous billing keep the full reservation; a client abort does not establish that a provider did not bill. A call canceled before dispatch costs zero. Over-reservation usage disables further AI until an operator investigates. A crashed call's local concurrency lease expires after the provider timeout plus 30 seconds, keeping its full charge; this bounds local admission, not the lifetime of remote computation after a disconnect. The ledger supports the same admission for future `guard` tasks; Jev is not called or enabled by this work.

There are no automatic provider retries or silent provider fallbacks. Timeouts, invalid output or cancellation preserve original resume data. The current provider remains the existing server-side OpenAI integration with `store: false`; the user's provider retention terms still apply. Mistral and any separate guard provider need their own reviewed configuration/privacy decisions.

## Operator commands and alerts

Run these only from a trusted operator environment with server-side database access; there are no public admin routes:

```sh
npm run ops -- ai-enable --model MODEL --input VERIFIED_INPUT_RATE --output VERIFIED_OUTPUT_RATE
npm run ops -- ai-grant --email fictional-test@example.com
npm run ops -- ai-revoke --email fictional-test@example.com
npm run ops -- ai-disable
npm run ops -- stats
npm run ops -- prune
```

Replace placeholders with verified integer rates. `ai-enable` also accepts `--daily` and `--monthly` microUSD budgets. The kill switch is database-backed and takes effect on new admissions across instances. Disabling does not recall a request already dispatched. Set output/user/concurrency limits through the operator-owned policy row, respecting its constraints.

Connect hosting log alerts to content-free events: `ai_budget_exhausted`, `rate_limited`, `service_unavailable`, `ai_provider_failed`, `ai_canceled_or_timed_out`, `ai_settlement_failed` and `mail_delivery_failed`. Alert on spikes or repeated rejections. The stats command returns only aggregate states/counts/charges. Monitor database health and provider billing independently. Configure the monitor destination in deployment; this implementation does not send unsolicited notifications.

Schedule `prune` regularly (for example hourly). It removes expired rate buckets/tokens/sessions and finished accounting records older than 35 days. It never refunds unknown usage or deletes active requests. Back up the accounting database; restoring old accounting data or manually deleting ledger rows can reset protections. Keep all instances on one authoritative PostgreSQL database/policy and compatible migrations.

For signing-key rotation, add a new random key under a new `kid`, retain the old key temporarily, switch `JWT_ACTIVE_KID` on all instances, and retain CSRF/abuse secrets across restarts. Remove retired signing keys after access-token expiry. For suspected compromise, remove the key and revoke sessions/increment affected users' `auth_version`; do not rely on ordinary expiry alone. Rotate database/provider/SMTP credentials through their operators and audit access without copying secrets into tickets.

## Verification

```sh
npx playwright install chromium
npm run test:server
npm test
npm run build
npm run format:check
```

Backend tests use `TEST_DATABASE_URL` only when explicitly supplied; otherwise a real embedded PostgreSQL instance starts on loopback in an ignored temporary directory and stops after the suite. They never connect using the application's DATABASE_URL. They cover real hashes/JWTs, replay, revocation, ownership, recovery, malformed/slow bodies, actual cancellation, budget/token/request boundaries, operator pause, idempotency, two independent Node API processes sharing limits, and a real browser registration/verification/login/cleanup/logout flow. Models and mail delivery use synthetic adapters: no paid model call or outside email is used.

CI uses PostgreSQL 17 and runs server/browser/Python tests. Local embedded PostgreSQL may be a newer supported major, providing additional compatibility coverage. Scans and tests are evidence, not a completed penetration test or production hosting certification.

References: [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), [REST security](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html), [jose](https://github.com/panva/jose), [node-postgres transactions](https://node-postgres.com/features/transactions).
