import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { chromium } from '@playwright/test';
import { SignJWT } from 'jose';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../server/app';
import { newSecret, readConfig } from '../server/config';
import type { AppConfig } from '../server/config';
import {
  authenticate,
  csrf,
  digest,
  hashPassword,
  HttpError,
  limit,
  opaque,
} from '../server/security';
import { AiLedger } from '../server/aiLedger';
import type { Mail } from '../server/authService';
import type { Provider } from '../server/provider';
import { testDatabase } from './database';

let database: Awaited<ReturnType<typeof testDatabase>>;
let app: FastifyInstance;
let config: AppConfig;
let mail: Mail[];
let calls: number;
let events: string[];
let provider: Provider;
const password = 'fictional-test-password-123';
const sample = 'Taylor Demo\nExample University 2027\nSkills: TypeScript, React and SQL.';
const headers = { origin: 'http://127.0.0.1:5173', 'content-type': 'application/json' };
const send = (
  url: string,
  payload: object,
  extra: Record<string, string> = {},
  method: 'POST' | 'DELETE' = 'POST',
) => app.inject({ method, url, headers: { ...headers, ...extra }, payload });
const cookies = (response: { headers: Record<string, unknown> }) =>
  (response.headers['set-cookie'] as string[]).map((s) => s.split(';')[0]).join('; ');
const cookieValue = (cookie: string, name: string) =>
  cookie
    .split('; ')
    .find((s) => s.startsWith(name + '='))!
    .slice(name.length + 1);
async function login(email = 'alex@example.com', verified = true, enabled = true) {
  const id = randomUUID();
  await database.db.query(
    'INSERT INTO users(id,email,email_verified_at,ai_enabled) VALUES ($1,$2,$3,$4)',
    [id, email, verified ? new Date() : null, enabled],
  );
  await database.db.query(
    'INSERT INTO password_credentials(user_id,password_hash) VALUES ($1,$2)',
    [id, await hashPassword(password)],
  );
  const response = await send('/api/auth/login', { email, password });
  assert.equal(response.statusCode, 200, response.body);
  return { id, cookie: cookies(response), csrf: response.json().csrfToken as string, response };
}
const paid = (user: { cookie: string; csrf: string }, key = randomUUID(), text = sample) =>
  send(
    '/api/resume/normalize',
    { text, consent: true },
    { cookie: user.cookie, 'x-csrf-token': user.csrf, 'idempotency-key': key },
  );

before(async () => {
  database = await testDatabase();
});
after(async () => {
  await app?.close();
  await database?.stop();
});
beforeEach(async () => {
  await app?.close();
  await database.db.query('TRUNCATE users,rate_limits,ai_requests CASCADE');
  await database.db.query(
    "UPDATE ai_policy SET enabled=true,model='test-model',input_microusd_per_million=1000000,output_microusd_per_million=2000000,daily_budget_microusd=1000000,monthly_budget_microusd=10000000,user_daily_requests=10,user_daily_tokens=500000,max_concurrency=2,max_output_tokens=12000",
  );
  config = readConfig({
    APP_ORIGIN: headers.origin,
    DATABASE_URL: 'postgresql://unused',
    JWT_KEYS: JSON.stringify({ v1: newSecret() }),
    JWT_ACTIVE_KID: 'v1',
    CSRF_SECRET: newSecret(),
    ABUSE_HASH_KEY: newSecret(),
  });
  mail = [];
  events = [];
  calls = 0;
  provider = async () => {
    calls++;
    return {
      markdown: '# Taylor Demo\n\n## Skills\nTypeScript, React, SQL',
      warnings: [],
      usage: { inputTokens: 200, outputTokens: 100 },
    };
  };
  app = await createApp(config, {
    db: database.db,
    mailer: async (m) => {
      mail.push(m);
    },
    provider: (r) => provider(r),
    audit: (event) => {
      events.push(event);
    },
  });
});

test('registration stores salted Argon2id hashes and only a hashed, expiring verification token', async () => {
  const first = await send('/api/auth/register', { email: 'Alice@example.com', password });
  const second = await send('/api/auth/register', { email: 'bob@example.com', password });
  assert.equal(first.statusCode, 202);
  assert.equal(second.statusCode, 202);
  const hashes = (
    await database.db.query('SELECT password_hash FROM password_credentials')
  ).rows.map((r) => r.password_hash);
  assert.equal(hashes.length, 2);
  assert.notEqual(hashes[0], hashes[1]);
  assert.ok(
    hashes.every(
      (s: string) => s.startsWith('$argon2id$v=19$m=19456,t=2,p=1$') && !s.includes(password),
    ),
  );
  const token = new URL(mail[0].url).hash.slice('#verify='.length);
  const row = (
    await database.db.query('SELECT * FROM action_tokens WHERE token_hash=$1', [digest(token)])
  ).rows[0];
  assert.equal(row.purpose, 'verify');
  assert.equal(row.token_hash.includes(token), false);
  const repeated = await send('/api/auth/register', { email: 'alice@example.com', password });
  assert.equal(repeated.statusCode, 202);
  assert.equal(repeated.body, first.body);
  assert.equal(
    (await send('/api/auth/register', { email: 'other@example.com', password: 'short' }))
      .statusCode,
    400,
  );
});

test('slow email delivery does not reveal eligibility latency or occupy password slots', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const slow = await createApp(config, {
    db: database.db,
    mailer: async () => gate,
    audit: () => {},
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const response = await Promise.race([
      slow.inject({
        method: 'POST',
        url: '/api/auth/register',
        headers,
        payload: { email: 'slow@example.com', password },
      }),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Account response waited for SMTP')), 3000);
      }),
    ]);
    assert.equal(response.statusCode, 202);
    const login = await slow.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers,
      payload: { email: 'slow@example.com', password },
    });
    assert.equal(login.statusCode, 200);
  } finally {
    clearTimeout(timer);
    release();
    await slow.close();
  }
});

test('verification and reset links are purpose-bound, expiring and single-use', async () => {
  await send('/api/auth/register', { email: 'alice@example.com', password });
  const token = new URL(mail[0].url).hash.slice('#verify='.length);
  assert.equal((await send('/api/auth/reset/confirm', { token, password })).statusCode, 400);
  assert.equal((await send('/api/auth/verify/confirm', { token })).statusCode, 200);
  assert.equal((await send('/api/auth/verify/confirm', { token })).statusCode, 400);
  await send('/api/auth/reset/request', { email: 'alice@example.com' });
  const reset = new URL(mail.at(-1)!.url).hash.slice('#reset='.length);
  await database.db.query(
    "UPDATE action_tokens SET expires_at=now()-interval '1 second' WHERE token_hash=$1",
    [digest(reset)],
  );
  assert.equal((await send('/api/auth/reset/confirm', { token: reset, password })).statusCode, 400);
});

test('login sets HTTP-only cookies and no token or hash is in the JSON view', async () => {
  const user = await login();
  assert.ok(
    (user.response.headers['set-cookie'] as string[]).every(
      (s) => s.includes('HttpOnly') && s.includes('SameSite=Strict'),
    ),
  );
  assert.deepEqual(user.response.json().user, {
    id: user.id,
    email: 'alex@example.com',
    emailVerified: true,
    aiEnabled: true,
  });
  assert.doesNotMatch(user.response.body, /password_hash|ls_access|ls_refresh|eyJ/);
  assert.equal(
    (await app.inject({ url: '/api/auth/session', headers: { cookie: user.cookie } })).json().user
      .id,
    user.id,
  );
  const wrong = await send('/api/auth/login', { email: 'alex@example.com', password: 'incorrect' });
  const unknown = await send('/api/auth/login', {
    email: 'unknown@example.com',
    password: 'incorrect',
  });
  assert.equal(wrong.statusCode, 401);
  assert.equal(wrong.body, unknown.body);
});

test('JWTs reject wrong signature, issuer, audience, algorithm, claims and arbitrary key references', async () => {
  const user = await login();
  const session = (
    await database.db.query('SELECT id FROM auth_sessions WHERE user_id=$1', [user.id])
  ).rows[0].id;
  const make = (
    options: {
      key?: Uint8Array;
      issuer?: string;
      audience?: string;
      expiration?: string;
      nbf?: string;
      sid?: string;
      sub?: string;
      header?: object;
    } = {},
  ) =>
    new SignJWT({ sid: options.sid ?? session, ver: 0 })
      .setProtectedHeader({ alg: 'HS256', typ: 'at+jwt', kid: 'v1', ...options.header })
      .setSubject(options.sub ?? user.id)
      .setIssuer(options.issuer ?? config.origin)
      .setAudience(options.audience ?? 'launchscout-api')
      .setIssuedAt()
      .setNotBefore(options.nbf ?? '0s')
      .setExpirationTime(options.expiration ?? '10m')
      .setJti(randomUUID())
      .sign(options.key ?? config.keys.v1);
  for (const token of [
    await make({ key: Buffer.alloc(32, 3) }),
    await make({ issuer: 'https://foreign.example' }),
    await make({ audience: 'another-api' }),
    await make({ expiration: '-1m' }),
    await make({ nbf: '1h' }),
    await make({ sub: randomUUID() }),
    await make({ sid: randomUUID() }),
    await make({ header: { jku: 'https://attacker.example/keys' } }),
    'eyJhbGciOiJub25lIn0.e30.',
    'x'.repeat(3000),
  ]) {
    const response = await app.inject({
      url: '/api/auth/session',
      headers: { cookie: `ls_access=${token}` },
    });
    assert.equal(response.statusCode, 401, response.body);
  }
  const rotated = { ...config, keys: { v2: Buffer.alloc(32, 4), ...config.keys }, activeKid: 'v2' };
  assert.equal(
    (await authenticate(database.db, rotated, cookieValue(user.cookie, 'ls_access'))).id,
    user.id,
  );
  await assert.rejects(
    authenticate(
      database.db,
      { ...rotated, keys: { v2: rotated.keys.v2 } },
      cookieValue(user.cookie, 'ls_access'),
    ),
    HttpError,
  );
});

test('CSRF and origin are required; ownership and client-supplied IDs never authorize', async () => {
  const a = await login();
  const b = await login('other@example.com');
  assert.equal((await send('/api/auth/logout', {}, { cookie: a.cookie })).statusCode, 403);
  assert.equal(
    (await send('/api/auth/logout', {}, { cookie: a.cookie, 'x-csrf-token': b.csrf })).statusCode,
    403,
  );
  assert.equal(
    (await send('/api/auth/logout', {}, { cookie: a.cookie, 'x-csrf-token': '!'.repeat(43) }))
      .statusCode,
    403,
  );
  assert.equal(
    (
      await send(
        '/api/auth/logout',
        {},
        { origin: 'https://attacker.example', cookie: a.cookie, 'x-csrf-token': a.csrf },
      )
    ).statusCode,
    403,
  );
  assert.equal(
    (await send('/api/auth/login', { email: 'alex@example.com', password, userId: b.id }))
      .statusCode,
    400,
  );
  assert.equal(
    (await app.inject({ url: `/api/users/${b.id}`, headers: { cookie: a.cookie } })).statusCode,
    404,
  );
  assert.equal(
    (
      await app.inject({ url: `/api/auth/session?userId=${b.id}`, headers: { cookie: a.cookie } })
    ).json().user.id,
    a.id,
  );
  assert.equal(
    (await send('/api/auth/login', { email: "'/**/OR/**/1=1--@example.com", password })).statusCode,
    401,
  );
});

test('refresh rotates once, replay revokes the family, and concurrent refresh has one winner', async () => {
  const user = await login();
  const first = await send(
    '/api/auth/refresh',
    {},
    { cookie: user.cookie, 'x-csrf-token': user.csrf },
  );
  assert.equal(first.statusCode, 200);
  assert.notEqual(cookies(first), user.cookie);
  assert.equal(
    (await send('/api/auth/refresh', {}, { cookie: user.cookie, 'x-csrf-token': user.csrf }))
      .statusCode,
    401,
  );
  assert.equal(
    (await app.inject({ url: '/api/auth/session', headers: { cookie: cookies(first) } }))
      .statusCode,
    401,
  );
  const next = await send('/api/auth/login', { email: 'alex@example.com', password });
  const both = await Promise.all(
    [1, 2].map(() =>
      send(
        '/api/auth/refresh',
        {},
        { cookie: cookies(next), 'x-csrf-token': next.json().csrfToken },
      ),
    ),
  );
  assert.deepEqual(both.map((r) => r.statusCode).sort(), [200, 401]);
});

test('logout, reset, password change, and deletion invalidate relevant sessions', async () => {
  const user = await login();
  assert.equal(
    (
      await send(
        '/api/auth/password',
        { password: 'incorrect', newPassword: password },
        { cookie: user.cookie, 'x-csrf-token': user.csrf },
      )
    ).statusCode,
    403,
  );
  assert.equal(
    (await app.inject({ url: '/api/auth/session', headers: { cookie: user.cookie } })).statusCode,
    200,
  );
  assert.equal(
    (await send('/api/auth/logout', {}, { cookie: user.cookie, 'x-csrf-token': user.csrf }))
      .statusCode,
    204,
  );
  assert.equal(
    (await app.inject({ url: '/api/auth/session', headers: { cookie: user.cookie } })).statusCode,
    401,
  );
  const signed = await send('/api/auth/login', { email: 'alex@example.com', password });
  await send('/api/auth/reset/request', { email: 'alex@example.com' });
  const token = new URL(mail.at(-1)!.url).hash.slice('#reset='.length);
  assert.equal(
    (await send('/api/auth/reset/confirm', { token, password: 'new-fictional-password-123' }))
      .statusCode,
    200,
  );
  assert.equal(
    (await app.inject({ url: '/api/auth/session', headers: { cookie: cookies(signed) } }))
      .statusCode,
    401,
  );
  const newer = await send('/api/auth/login', {
    email: 'alex@example.com',
    password: 'new-fictional-password-123',
  });
  assert.equal(
    (
      await send(
        '/api/auth/password',
        { password: 'new-fictional-password-123', newPassword: password },
        { cookie: cookies(newer), 'x-csrf-token': newer.json().csrfToken },
      )
    ).statusCode,
    204,
  );
  assert.equal(
    (await app.inject({ url: '/api/auth/session', headers: { cookie: cookies(newer) } }))
      .statusCode,
    401,
  );
  const final = await send('/api/auth/login', { email: 'alex@example.com', password });
  assert.equal(
    (
      await send(
        '/api/auth/account',
        { password },
        { cookie: cookies(final), 'x-csrf-token': final.json().csrfToken },
        'DELETE',
      )
    ).statusCode,
    204,
  );
  assert.equal((await database.db.query('SELECT count(*) FROM users')).rows[0].count, '0');
  assert.equal((await database.db.query('SELECT count(*) FROM auth_sessions')).rows[0].count, '0');
});

test('abuse limits are shared, hashed, and cannot be bypassed with forwarding headers', async () => {
  for (let i = 0; i < 12; i++)
    await send('/api/auth/reset/request', { email: 'not-registered@example.com' });
  const blocked = await send(
    '/api/auth/reset/request',
    { email: 'not-registered@example.com' },
    { 'x-forwarded-for': '198.51.100.8' },
  );
  assert.equal(blocked.statusCode, 429);
  assert.ok(blocked.headers['retry-after']);
  await limit(database.db, config, 'fixture', 'address', 1, 60);
  await assert.rejects(limit(database.db, config, 'fixture', 'address', 1, 60), HttpError);
  const limits = await database.db.query('SELECT bucket FROM rate_limits');
  assert.ok(limits.rows.every((r) => !r.bucket.includes('@') && !r.bucket.includes('127.0.0.1')));
  await database.db.query('DELETE FROM rate_limits');
  for (let i = 0; i < 30; i++)
    assert.equal(
      (
        await send(
          '/api/auth/reset/request',
          { email: `synthetic-${i}@example.com` },
          { 'x-forwarded-for': `198.51.100.${i + 1}` },
        )
      ).statusCode,
      202,
    );
  assert.equal(
    (
      await send(
        '/api/auth/reset/request',
        { email: 'another@example.com' },
        { 'x-forwarded-for': '203.0.113.9' },
      )
    ).statusCode,
    429,
  );
});

test('anonymous, invalid, unverified, or non-entitled AI requests make no provider calls', async () => {
  assert.equal(
    (await send('/api/resume/normalize', { text: sample, consent: true })).statusCode,
    401,
  );
  const unverified = await login('unverified@example.com', false);
  assert.equal((await paid(unverified)).statusCode, 403);
  const denied = await login('denied@example.com', true, false);
  assert.equal((await paid(denied)).statusCode, 403);
  const user = await login();
  assert.equal(
    (
      await send(
        '/api/resume/normalize',
        { text: sample, consent: false },
        { cookie: user.cookie, 'x-csrf-token': user.csrf },
      )
    ).statusCode,
    400,
  );
  assert.equal(calls, 0);
});

test('paid requests validate output, settle actual usage, and do not store private text', async () => {
  const user = await login();
  const response = await paid(user);
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(calls, 1);
  const job = (await database.db.query('SELECT * FROM ai_requests')).rows[0];
  assert.equal(job.state, 'succeeded');
  assert.equal(job.charged_microusd, '400');
  assert.equal(job.charged_tokens, 300);
  assert.doesNotMatch(JSON.stringify(job), /Taylor Demo|TypeScript|Example University/);
  assert.doesNotMatch(JSON.stringify(events), /Taylor Demo|password|@example/);
});

test('idempotency rejects duplicate pending/completed submissions without a second charge', async () => {
  const user = await login();
  const key = randomUUID();
  const results = await Promise.all([paid(user, key), paid(user, key)]);
  assert.deepEqual(results.map((r) => r.statusCode).sort(), [200, 409]);
  assert.equal((await paid(user, key)).statusCode, 409);
  assert.equal(calls, 1);
  assert.equal((await database.db.query('SELECT count(*) FROM ai_requests')).rows[0].count, '1');
});

test('parallel API instances share the global concurrency cap with no waiting queue', async () => {
  const user = await login();
  await database.db.query('UPDATE ai_policy SET max_concurrency=1');
  let finish!: () => void;
  let started!: () => void;
  const gate = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  provider = async () => {
    calls++;
    started();
    await gate;
    return { markdown: '# Safe', warnings: [], usage: { inputTokens: 10, outputTokens: 10 } };
  };
  const first = paid(user);
  await entered;
  const second = await createApp(config, { db: database.db, provider, audit: () => {} });
  try {
    const response = await second.inject({
      method: 'POST',
      url: '/api/resume/normalize',
      headers: {
        ...headers,
        cookie: user.cookie,
        'x-csrf-token': user.csrf,
        'idempotency-key': randomUUID(),
      },
      payload: { text: sample, consent: true },
    });
    assert.equal(response.statusCode, 429);
    assert.equal(calls, 1);
  } finally {
    finish();
    await first;
    await second.close();
  }
});

test('daily/monthly budgets and user quotas reserve atomically across instances', async () => {
  const user = await login();
  await database.db.query('UPDATE ai_policy SET daily_budget_microusd=1');
  assert.equal((await paid(user)).statusCode, 503);
  assert.equal(calls, 0);
  const identity = await authenticate(database.db, config, cookieValue(user.cookie, 'ls_access'));
  await assert.rejects(
    new AiLedger(database.db, config).reserve(identity, randomUUID(), sample, 'guard'),
    (error: unknown) => error instanceof HttpError && error.status === 503,
  );
  await database.db.query(
    'UPDATE ai_policy SET daily_budget_microusd=1000000,monthly_budget_microusd=1',
  );
  assert.equal((await paid(user)).statusCode, 503);
  assert.equal(calls, 0);
  await database.db.query(
    'UPDATE ai_policy SET monthly_budget_microusd=10000000,user_daily_requests=1',
  );
  const results = await Promise.all([paid(user), paid(user)]);
  assert.deepEqual(results.map((r) => r.statusCode).sort(), [200, 429]);
  assert.equal(calls, 1);
  await database.db.query('UPDATE ai_policy SET user_daily_requests=10,user_daily_tokens=1');
  assert.equal((await paid(user)).statusCode, 429);
});

test('browser registration, email verification, real cookies, paid cleanup, and sign-out work end to end', async () => {
  const { createServer } = await import('vite');
  const { default: react } = await import('@vitejs/plugin-react');
  const apiAddress = await app.listen({ host: '127.0.0.1', port: 0 });
  const frontend = await createServer({
    configFile: false,
    plugins: [react()],
    server: { host: '127.0.0.1', port: 0, proxy: { '/api': apiAddress } },
    logLevel: 'silent',
  });
  await frontend.listen();
  const address = frontend.httpServer!.address();
  if (!address || typeof address === 'string') throw new Error('No browser test address.');
  config.origin = `http://127.0.0.1:${address.port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(config.origin);
    await page
      .getByRole('button', { name: 'Sign in', exact: true })
      .filter({ visible: true })
      .click();
    await page.getByRole('button', { name: 'Create an account', exact: true }).click();
    await page.getByLabel('Email address', { exact: true }).fill('browser@example.com');
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'verification email' }).waitFor();
    assert.equal(mail.length, 1);
    await page.goto(mail[0].url);
    await page.getByRole('button', { name: 'Verify email', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Email verified' }).waitFor();
    await page.getByRole('button', { name: 'Back to sign in', exact: true }).click();
    await page.getByLabel('Email address', { exact: true }).fill('browser@example.com');
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page
      .getByRole('button', { name: 'Account', exact: true })
      .filter({ visible: true })
      .waitFor();
    const jar = await page.context().cookies();
    assert.equal(jar.length, 2);
    assert.ok(jar.every((c) => c.httpOnly));
    assert.equal(await page.evaluate(() => document.cookie), '');
    await database.db.query("UPDATE users SET ai_enabled=true WHERE email='browser@example.com'");
    await page
      .getByRole('navigation')
      .filter({ visible: true })
      .getByRole('button', { name: /resume/i })
      .click();
    await page.getByRole('checkbox', { name: 'Enable resume workspace' }).check();
    await page.getByRole('button', { name: 'Try a fictional example' }).click();
    await page.getByRole('checkbox', { name: /I agree to send the extracted text/ }).check();
    await page.getByRole('button', { name: 'Clean up with AI' }).click();
    await page.getByText(/AI-assisted formatting/).waitFor();
    assert.equal(calls, 1);
    await page
      .getByRole('button', { name: 'Account', exact: true })
      .filter({ visible: true })
      .click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page
      .getByRole('button', { name: 'Sign in', exact: true })
      .filter({ visible: true })
      .waitFor();
    await page
      .getByRole('navigation')
      .filter({ visible: true })
      .getByRole('button', { name: /resume/i })
      .click();
    assert.equal(await page.getByRole('textbox', { name: 'Resume Markdown' }).inputValue(), '');
    assert.equal((await page.context().cookies()).length, 0);
  } finally {
    await browser.close();
    await frontend.close();
  }
});

test('provider errors and malformed output conservatively retain reservations and stale slots recover', async () => {
  const user = await login();
  provider = async () => {
    throw new Error('private-provider-error ' + sample);
  };
  assert.equal((await paid(user)).statusCode, 503);
  let row = (await database.db.query('SELECT * FROM ai_requests')).rows[0];
  assert.equal(row.state, 'unknown');
  assert.equal(row.charged_microusd, row.reserved_microusd);
  provider = async () => ({
    markdown: '',
    warnings: [],
    usage: { inputTokens: 1, outputTokens: 1 },
  });
  assert.equal((await paid(user)).statusCode, 503);
  assert.equal(JSON.stringify(events).includes('private-provider-error'), false);
  await database.db.query(
    "UPDATE ai_requests SET state='running',lease_until=now()-interval '1 second' WHERE id=$1",
    [row.id],
  );
  const identity = await authenticate(database.db, config, cookieValue(user.cookie, 'ls_access'));
  const ledger = new AiLedger(database.db, config);
  await ledger.reserve(identity, randomUUID(), sample);
  row = (await database.db.query('SELECT * FROM ai_requests WHERE id=$1', [row.id])).rows[0];
  assert.equal(row.state, 'unknown');
  assert.equal(row.charged_microusd, row.reserved_microusd);
});

test('real timeout and disconnected-client cancellation abort the provider without refunding unknown costs', async () => {
  const user = await login();
  let aborted = 0;
  const hanging: Provider = async ({ signal }) =>
    new Promise((_resolve, reject) => {
      signal.addEventListener(
        'abort',
        () => {
          aborted++;
          reject(new Error('aborted'));
        },
        { once: true },
      );
    });
  const timed = await createApp(
    { ...config, providerTimeoutMs: 40 },
    { db: database.db, provider: hanging, audit: () => {} },
  );
  try {
    const response = await timed.inject({
      method: 'POST',
      url: '/api/resume/normalize',
      headers: {
        ...headers,
        cookie: user.cookie,
        'x-csrf-token': user.csrf,
        'idempotency-key': randomUUID(),
      },
      payload: { text: sample, consent: true },
    });
    assert.equal(response.statusCode, 503);
    assert.equal(aborted, 1);
  } finally {
    await timed.close();
  }
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const canceled = await createApp(config, {
    db: database.db,
    audit: () => {},
    provider: async (r) => {
      entered();
      return hanging(r);
    },
  });
  const address = await canceled.listen({ host: '127.0.0.1', port: 0 });
  try {
    const abort = new AbortController();
    const response = fetch(address + '/api/resume/normalize', {
      method: 'POST',
      signal: abort.signal,
      headers: {
        ...headers,
        cookie: user.cookie,
        'x-csrf-token': user.csrf,
        'idempotency-key': randomUUID(),
      },
      body: JSON.stringify({ text: sample, consent: true }),
    }).catch(() => null);
    await started;
    abort.abort();
    await response;
    for (let i = 0; i < 40 && aborted < 2; i++) await new Promise((r) => setTimeout(r, 10));
    assert.equal(aborted, 2);
    for (let i = 0; i < 40; i++) {
      if (
        (await database.db.query("SELECT count(*) FROM ai_requests WHERE state='running'")).rows[0]
          .count === '0'
      )
        break;
      await new Promise((r) => setTimeout(r, 10));
    }
    const rows = (await database.db.query('SELECT * FROM ai_requests')).rows;
    assert.equal(rows.length, 2);
    assert.ok(
      rows.every((r) => r.state === 'unknown' && r.charged_microusd === r.reserved_microusd),
    );
  } finally {
    await canceled.close();
  }
});

test('two independent Node processes enforce one shared concurrency slot and one shared budget', async () => {
  const user = await login();
  const workers: Array<{ address: string; stop: () => Promise<void> }> = [];
  try {
    for (let i = 0; i < 2; i++) {
      const child = spawn(process.execPath, ['--import', 'tsx', 'server-tests/worker.ts'], {
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        windowsHide: true,
        env: {
          ...process.env,
          NODE_ENV: 'test',
          DATABASE_URL: database.url,
          APP_ORIGIN: config.origin,
          JWT_KEYS: JSON.stringify({ v1: Buffer.from(config.keys.v1).toString('base64url') }),
          JWT_ACTIVE_KID: 'v1',
          CSRF_SECRET: config.csrfSecret,
          ABUSE_HASH_KEY: config.abuseSecret,
        },
      });
      const address = await new Promise<string>((resolve, reject) => {
        let buffer = '';
        const timer = setTimeout(() => reject(new Error('Worker startup timed out')), 15000);
        child.once('error', reject);
        child.once('exit', (code) => {
          if (code) reject(new Error('Worker startup failed'));
        });
        child.stdout!.on('data', (chunk) => {
          buffer += String(chunk);
          for (const line of buffer.split('\n')) {
            if (line.startsWith('{"address"')) {
              clearTimeout(timer);
              resolve(JSON.parse(line).address);
            }
          }
        });
      });
      workers.push({
        address,
        stop: async () => {
          const exited = once(child, 'exit');
          child.send('stop');
          await exited;
        },
      });
    }
    const remote = (worker: number) =>
      fetch(workers[worker].address + '/api/resume/normalize', {
        method: 'POST',
        headers: {
          ...headers,
          cookie: user.cookie,
          'x-csrf-token': user.csrf,
          'idempotency-key': randomUUID(),
        },
        body: JSON.stringify({ text: sample, consent: true }),
      });
    await database.db.query('UPDATE ai_policy SET max_concurrency=1');
    const first = await Promise.all([remote(0), remote(1)]);
    assert.deepEqual(first.map((r) => r.status).sort(), [200, 429]);
    await database.db.query('DELETE FROM ai_requests');
    await database.db.query('UPDATE ai_policy SET max_concurrency=2,daily_budget_microusd=40000');
    const second = await Promise.all([remote(0), remote(1)]);
    assert.deepEqual(second.map((r) => r.status).sort(), [200, 503]);
    assert.equal((await database.db.query('SELECT count(*) FROM ai_requests')).rows[0].count, '1');
  } finally {
    await Promise.all(workers.map((w) => w.stop()));
  }
});

test('production cookies are host-only, secure, HTTP-only and exact-origin protected', async () => {
  await login();
  const secure = await createApp(
    { ...config, production: true, origin: 'https://launch.example' },
    { db: database.db, provider, audit: () => {} },
  );
  try {
    const response = await secure.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { ...headers, origin: 'https://launch.example' },
      payload: { email: 'alex@example.com', password },
    });
    assert.equal(response.statusCode, 200, response.body);
    const set = response.headers['set-cookie'] as string[];
    assert.ok(
      set.every(
        (s) =>
          s.startsWith('__Host-ls_') &&
          s.includes('Secure') &&
          s.includes('HttpOnly') &&
          s.includes('Path=/') &&
          !s.includes('Domain='),
      ),
    );
  } finally {
    await secure.close();
  }
});

test('kill switch, accounting overrun, request limits, and local no-key status fail closed', async () => {
  const user = await login();
  await database.db.query('UPDATE ai_policy SET enabled=false');
  assert.equal((await paid(user)).statusCode, 503);
  assert.equal(calls, 0);
  await database.db.query('UPDATE ai_policy SET enabled=true');
  assert.equal((await paid(user, randomUUID(), 'a'.repeat(30001))).statusCode, 400);
  const oversized = await app.inject({
    method: 'POST',
    url: '/api/resume/normalize',
    headers: { ...headers, cookie: user.cookie, 'x-csrf-token': user.csrf },
    payload: JSON.stringify({ text: 'x'.repeat(129000), consent: true }),
  });
  assert.equal(oversized.statusCode, 413);
  provider = async () => ({
    markdown: '# Safe',
    warnings: [],
    usage: { inputTokens: 200000, outputTokens: 100 },
  });
  assert.equal((await paid(user)).statusCode, 200);
  assert.equal((await database.db.query('SELECT enabled FROM ai_policy')).rows[0].enabled, false);
  assert.equal((await paid(user)).statusCode, 503);
  const local = await createApp(readConfig({ APP_ORIGIN: headers.origin }));
  assert.deepEqual((await local.inject('/api/resume/status')).json(), {
    available: false,
    reason: 'not_configured',
  });
  await local.close();
});

test('AI availability returns an authentication challenge when access needs renewal', async () => {
  const user = await login();
  const refreshCookie = user.cookie
    .split('; ')
    .filter((cookie) => cookie.startsWith('ls_refresh='))
    .join('; ');
  assert.ok(refreshCookie);
  const expired = await app.inject({
    url: '/api/resume/status',
    headers: { cookie: refreshCookie },
  });
  assert.equal(expired.statusCode, 401);
  const renewed = await send(
    '/api/auth/refresh',
    {},
    {
      cookie: refreshCookie,
      'x-csrf-token': user.csrf,
    },
  );
  assert.equal(renewed.statusCode, 200);
  const status = await app.inject({
    url: '/api/resume/status',
    headers: { cookie: cookies(renewed) },
  });
  assert.equal(status.statusCode, 200);
  assert.equal(status.json().available, true);
  assert.equal(calls, 0);
});

test('slow bodies are terminated before a provider call', async () => {
  const short = await createApp(
    { ...config, bodyTimeoutMs: 80 },
    { db: database.db, provider, audit: () => {} },
  );
  const address = await short.listen({ host: '127.0.0.1', port: 0 });
  try {
    const status = await new Promise<number>((resolve, reject) => {
      const request = httpRequest(
        address + '/api/auth/login',
        { method: 'POST', headers: { ...headers, 'content-length': '100' } },
        (response) => {
          response.resume();
          resolve(response.statusCode!);
        },
      );
      request.on('error', reject);
      request.write('{"email":');
    });
    assert.equal(status, 408);
    assert.equal(calls, 0);
  } finally {
    await short.close();
  }
});

test('production config requires HTTPS, secrets, mail and explicit proxy trust', async () => {
  assert.throws(() => readConfig({ NODE_ENV: 'production', APP_ORIGIN: 'http://example.com' }));
  assert.throws(() =>
    readConfig({ APP_ORIGIN: headers.origin, DATABASE_URL: 'postgresql://unused' }),
  );
  assert.throws(() => readConfig({ APP_ORIGIN: headers.origin, TRUSTED_PROXY_CIDRS: '0.0.0.0/0' }));
  assert.equal(csrf(config, randomUUID()).length, 43);
  assert.equal(opaque().length, 43);
});
