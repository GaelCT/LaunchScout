import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppConfig } from './config';
import type { Database } from './db';
import { AuthService, smtpMailer } from './authService';
import type { Audit, Mailer } from './authService';
import { AiLedger } from './aiLedger';
import {
  authenticate,
  csrf,
  digest,
  emailAddress,
  HttpError,
  limit,
  objectBody,
  requireCsrf,
  uuid,
  validPassword,
} from './security';
import type { Identity } from './security';
import { openAIProvider, validResult } from './provider';
import type { Provider } from './provider';

export interface AppDependencies {
  db?: Database;
  mailer?: Mailer;
  provider?: Provider;
  audit?: Audit;
}
export async function createApp(config: AppConfig, dependencies: AppDependencies = {}) {
  const db = dependencies.db;
  const audit: Audit =
    dependencies.audit ??
    ((event, requestId) => process.stdout.write(JSON.stringify({ event, requestId }) + '\n'));
  const app = Fastify({
    logger: false,
    bodyLimit: 128000,
    requestTimeout: 15000,
    connectionTimeout: config.providerTimeoutMs + 15000,
    maxRequestsPerSocket: 100,
    trustProxy: config.trustedProxies.length ? config.trustedProxies : false,
    http: { headersTimeout: 5000, connectionsCheckingInterval: 1000, maxHeaderSize: 16384 },
    ajv: { customOptions: { removeAdditional: false } },
  });
  await app.register(cookie);
  const auth = db
    ? new AuthService(db, config, dependencies.mailer ?? smtpMailer(config), audit)
    : null;
  const ledger = db ? new AiLedger(db, config) : null;
  const provider = dependencies.provider ?? (config.apiKey ? openAIProvider(config.apiKey) : null);
  const accessName = config.production ? '__Host-ls_access' : 'ls_access';
  const refreshName = config.production ? '__Host-ls_refresh' : 'ls_refresh';
  const identities = new WeakMap<FastifyRequest, Identity>();
  const bodyTimers = new WeakMap<FastifyRequest, ReturnType<typeof setTimeout>>();
  const clearBodyTimer = (request: FastifyRequest) => {
    clearTimeout(bodyTimers.get(request));
    bodyTimers.delete(request);
  };
  const cookieOptions = {
    path: '/',
    httpOnly: true,
    secure: config.production,
    sameSite: 'strict' as const,
  };
  const clearCookies = (reply: FastifyReply) =>
    reply.clearCookie(accessName, cookieOptions).clearCookie(refreshName, cookieOptions);
  const requireDatabase = () => {
    if (!db || !auth)
      throw new HttpError(503, 'Accounts are not configured. Guest tools remain available.');
    return { db, auth };
  };
  async function identify(request: FastifyRequest) {
    const { db } = requireDatabase();
    const user = await authenticate(db, config, request.cookies[accessName]);
    identities.set(request, user);
    return user;
  }
  async function signedIn(request: FastifyRequest) {
    await identify(request);
  }
  async function protectedMutation(request: FastifyRequest) {
    const user = await identify(request);
    requireCsrf(config, user.sid, request.headers['x-csrf-token']);
  }
  async function credentialLimits(request: FastifyRequest) {
    const { db } = requireDatabase();
    await limit(db, config, 'auth-global', 'all', 120, 60);
    await limit(db, config, 'auth-network', request.ip, 30, 300);
  }
  async function emailLimit(email: string) {
    const { db } = requireDatabase();
    await limit(db, config, 'auth-email', email, 12, 300);
  }
  async function issueCookies(reply: FastifyReply, result: { user: Identity; refresh: string }) {
    const { auth } = requireDatabase();
    reply.setCookie(accessName, await auth.tokens(result.user), {
      ...cookieOptions,
      maxAge: config.accessSeconds,
    });
    reply.setCookie(refreshName, result.refresh, {
      ...cookieOptions,
      expires: result.user.expires_at,
    });
    return auth.view(result.user);
  }
  app.addHook('onRequest', async (request, reply) => {
    reply
      .header('Cache-Control', 'no-store')
      .header('X-Content-Type-Options', 'nosniff')
      .header('Referrer-Policy', 'no-referrer');
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      if (request.headers.origin !== config.origin)
        throw new HttpError(403, 'Use the configured LaunchScout site.');
      if (request.headers['content-type']?.split(';')[0].trim() !== 'application/json')
        throw new HttpError(415, 'Send a JSON request.');
      if (request.headers['content-encoding'] && request.headers['content-encoding'] !== 'identity')
        throw new HttpError(415, 'Compressed requests are unsupported.');
    }
    if (db) {
      await limit(db, config, 'network-global', 'all', 1000, 60);
      await limit(db, config, 'network', request.ip, 300, 60);
    }
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
      const timer = setTimeout(() => {
        if (!reply.sent) {
          reply.raw.once('finish', () => request.raw.destroy());
          void reply.code(408).send({ error: 'Request body timed out.' });
        }
      }, config.bodyTimeoutMs);
      timer.unref();
      bodyTimers.set(request, timer);
    }
  });
  app.addHook('preValidation', async (request) => {
    clearBodyTimer(request);
  });
  app.addHook('onResponse', async (request) => {
    clearBodyTimer(request);
  });
  app.addHook('onError', async (request) => {
    clearBodyTimer(request);
  });
  app.setErrorHandler((error, request, reply) => {
    clearBodyTimer(request);
    const code =
      error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : null;
    const status =
      error instanceof HttpError
        ? error.status
        : typeof code === 'number' && code >= 400 && code < 500
          ? code
          : 503;
    if (error instanceof HttpError && error.retryAfter)
      reply.header('Retry-After', String(error.retryAfter));
    if (status === 401 && request.routeOptions.url === '/api/auth/refresh') clearCookies(reply);
    audit(
      error instanceof HttpError && error.event
        ? error.event
        : status === 429
          ? 'rate_limited'
          : status === 503
            ? 'service_unavailable'
            : 'request_rejected',
      request.id,
    );
    void reply.code(status).send({
      error:
        error instanceof HttpError
          ? error.message
          : status === 413
            ? 'The request is too large.'
            : status < 500
              ? 'Invalid request.'
              : 'Service is unavailable. Try again later.',
    });
  });
  app.setNotFoundHandler((_request, reply) =>
    reply.code(404).send({ error: 'Unknown API route.' }),
  );
  app.get('/api/health', async () => ({ ok: true }));
  app.get('/api/auth/config', async () => ({
    configured: Boolean(db),
    emailEnabled: Boolean(config.smtpUrl || dependencies.mailer),
  }));
  app.get('/api/auth/session', { onRequest: signedIn }, async (request) =>
    requireDatabase().auth.view(identities.get(request)!),
  );
  app.get('/api/auth/csrf', async (request) => {
    const { auth } = requireDatabase();
    const user = await auth.refreshIdentity(request.cookies[refreshName]);
    return { csrfToken: csrf(config, user.sid) };
  });
  app.post(
    '/api/auth/register',
    { onRequest: credentialLimits, bodyLimit: 4096 },
    async (request, reply) => {
      const { auth } = requireDatabase();
      const body = objectBody(request.body, ['email', 'password']);
      const email = emailAddress(body.email);
      await emailLimit(email);
      if (!validPassword(body.password))
        throw new HttpError(400, 'Use a password of 15–128 characters (up to 512 UTF-8 bytes).');
      if (!config.smtpUrl && !dependencies.mailer)
        throw new HttpError(503, 'Account email delivery is not configured.');
      await auth.register(email, body.password);
      return reply.code(202).send({
        message:
          'If registration is available for this address, a verification email will arrive shortly.',
      });
    },
  );
  app.post(
    '/api/auth/login',
    { onRequest: credentialLimits, bodyLimit: 4096 },
    async (request, reply) => {
      const body = objectBody(request.body, ['email', 'password']);
      const email = emailAddress(body.email);
      await emailLimit(email);
      if (
        typeof body.password !== 'string' ||
        body.password.length > 128 ||
        Buffer.byteLength(body.password) > 512
      )
        throw new HttpError(400, 'Invalid credentials.');
      return issueCookies(reply, await requireDatabase().auth.login(email, body.password));
    },
  );
  app.post(
    '/api/auth/refresh',
    { onRequest: credentialLimits, bodyLimit: 128 },
    async (request, reply) => {
      objectBody(request.body, []);
      const token = request.cookies[refreshName];
      if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token))
        throw new HttpError(401, 'Sign in to continue.');
      // Derive the family from the hash even for consumed tokens so a replay can revoke it.
      const row = await requireDatabase().db.query(
        'SELECT session_id FROM refresh_tokens WHERE token_hash=$1',
        [digest(token)],
      );
      if (!row.rows[0]) throw new HttpError(401, 'Sign in to continue.');
      requireCsrf(config, row.rows[0].session_id, request.headers['x-csrf-token']);
      return issueCookies(reply, await requireDatabase().auth.refresh(token));
    },
  );
  app.post(
    '/api/auth/logout',
    { onRequest: protectedMutation, bodyLimit: 128 },
    async (request, reply) => {
      objectBody(request.body, []);
      await requireDatabase().auth.logout(identities.get(request)!);
      clearCookies(reply);
      return reply.code(204).send();
    },
  );
  for (const purpose of ['verify', 'reset'] as const) {
    app.post(
      `/api/auth/${purpose}/request`,
      { onRequest: credentialLimits, bodyLimit: 1024 },
      async (request, reply) => {
        const body = objectBody(request.body, ['email']);
        const email = emailAddress(body.email);
        await emailLimit(email);
        if (!config.smtpUrl && !dependencies.mailer)
          throw new HttpError(503, 'Account email delivery is not configured.');
        await requireDatabase().auth.actionEmail(email, purpose);
        return reply
          .code(202)
          .send({ message: 'If this address is eligible, an email will arrive shortly.' });
      },
    );
    app.post(
      `/api/auth/${purpose}/confirm`,
      { onRequest: credentialLimits, bodyLimit: 4096 },
      async (request, reply) => {
        const body = objectBody(
          request.body,
          purpose === 'reset' ? ['token', 'password'] : ['token'],
        );
        if (typeof body.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(body.token))
          throw new HttpError(400, 'This link is invalid or expired.');
        if (purpose === 'reset' && !validPassword(body.password))
          throw new HttpError(400, 'Use a password of 15–128 characters.');
        await requireDatabase().auth.consumeAction(
          body.token,
          purpose,
          purpose === 'reset' ? (body.password as string) : undefined,
        );
        if (purpose === 'reset') clearCookies(reply);
        return {
          message:
            purpose === 'verify'
              ? 'Email verified. You can sign in.'
              : 'Password reset. Sign in with your new password.',
        };
      },
    );
  }
  app.post(
    '/api/auth/password',
    { onRequest: protectedMutation, bodyLimit: 4096 },
    async (request, reply) => {
      const user = identities.get(request)!;
      await limit(requireDatabase().db, config, 'sensitive', user.id, 5, 300);
      const body = objectBody(request.body, ['password', 'newPassword']);
      if (
        typeof body.password !== 'string' ||
        body.password.length > 128 ||
        !validPassword(body.newPassword)
      )
        throw new HttpError(400, 'Use valid current and new passwords.');
      await requireDatabase().auth.sensitive(user, body.password, body.newPassword);
      clearCookies(reply);
      return reply.code(204).send();
    },
  );
  app.delete(
    '/api/auth/account',
    { onRequest: protectedMutation, bodyLimit: 2048 },
    async (request, reply) => {
      const user = identities.get(request)!;
      await limit(requireDatabase().db, config, 'sensitive', user.id, 5, 300);
      const body = objectBody(request.body, ['password']);
      if (typeof body.password !== 'string' || body.password.length > 128)
        throw new HttpError(400, 'Confirm your current password.');
      await requireDatabase().auth.sensitive(user, body.password);
      clearCookies(reply);
      return reply.code(204).send();
    },
  );
  app.get('/api/resume/status', async (request) => {
    if (!db || !ledger || !provider) return { available: false, reason: 'not_configured' };
    let user: Identity;
    try {
      user = await authenticate(db, config, request.cookies[accessName]);
    } catch {
      return { available: false, reason: 'sign_in' };
    }
    if (!user.email_verified_at) return { available: false, reason: 'verify_email' };
    if (!user.ai_enabled) return { available: false, reason: 'not_enabled' };
    const policy = await ledger.policy();
    return {
      available: Boolean(policy?.enabled && policy.model),
      reason: policy?.enabled ? null : 'paused',
    };
  });
  app.post('/api/resume/normalize', { onRequest: protectedMutation }, async (request, reply) => {
    const user = identities.get(request)!;
    if (!user.email_verified_at || !user.ai_enabled)
      throw new HttpError(403, 'A verified account with AI access is required.');
    const body = objectBody(request.body, ['text', 'consent']);
    if (body.consent !== true) throw new HttpError(400, 'Explicit consent is required.');
    if (typeof body.text !== 'string' || body.text.trim().length < 20 || body.text.length > 30000)
      throw new HttpError(400, 'Use between 20 and 30,000 characters of resume text.');
    const key = request.headers['idempotency-key'];
    if (!uuid(key)) throw new HttpError(400, 'A unique cleanup request ID is required.');
    if (!provider || !ledger) throw new HttpError(503, 'AI cleanup is not configured.');
    await limit(db!, config, 'ai-network', request.ip, 30, 60);
    await limit(db!, config, 'ai-user', user.id, 10, 60);
    const reservation = await ledger.reserve(user, key, body.text);
    const abort = new AbortController();
    const onClose = () => {
      if (!reply.raw.writableEnded) abort.abort();
    };
    reply.raw.on('close', onClose);
    const timeout = setTimeout(() => abort.abort(), config.providerTimeoutMs);
    timeout.unref();
    try {
      if (reply.raw.destroyed) {
        await ledger.settle(reservation.id, 'cancelled');
        return;
      }
      // Promise.race also bounds adapters that fail to honor AbortSignal. Never retry a paid call.
      const result = await Promise.race([
        provider({
          text: body.text,
          model: reservation.model,
          maxOutputTokens: reservation.maxOutputTokens,
          signal: abort.signal,
          requestId: reservation.id,
        }),
        new Promise<never>((_resolve, reject) => {
          abort.signal.addEventListener('abort', () => reject(new Error('Canceled')), {
            once: true,
          });
        }),
      ]);
      if (!validResult(result)) throw new Error('Invalid provider output.');
      await ledger.settle(reservation.id, 'succeeded', result.usage);
      return { markdown: result.markdown, warnings: result.warnings };
    } catch {
      await ledger
        .settle(reservation.id, 'unknown')
        .catch(() => audit('ai_settlement_failed', request.id));
      audit(abort.signal.aborted ? 'ai_canceled_or_timed_out' : 'ai_provider_failed', request.id);
      throw new HttpError(503, 'AI cleanup is unavailable. Your original text is unchanged.');
    } finally {
      clearTimeout(timeout);
      reply.raw.off('close', onClose);
    }
  });
  return app;
}
