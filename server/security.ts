import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { decodeProtectedHeader, jwtVerify, SignJWT } from 'jose';
import type { AppConfig } from './config';
import type { Database } from './db';

export class HttpError extends Error {
  status: number;
  retryAfter?: number;
  event?: string;
  constructor(status: number, message: string, retryAfter?: number, event?: string) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
    this.event = event;
  }
}
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const opaque = () => randomBytes(32).toString('base64url');
export const uuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export const passwordOptions = {
  algorithm: 2 as const,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
};
export const hashPassword = (password: string) => hash(password, passwordOptions);
export const verifyPassword = (encoded: string, password: string) =>
  verify(encoded, password).catch(() => false);
export function validPassword(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 15 &&
    value.length <= 128 &&
    Buffer.byteLength(value) <= 512
  );
}
export function emailAddress(value: unknown): string {
  if (typeof value !== 'string' || value.length > 512)
    throw new HttpError(400, 'Enter a valid email address.');
  const normalized = value.trim().toLowerCase();
  const [local, domain, extra] = normalized.split('@');
  if (
    extra !== undefined ||
    normalized.length > 254 ||
    !local ||
    local.length > 64 ||
    !domain ||
    !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local) ||
    local.startsWith('.') ||
    local.endsWith('.') ||
    local.includes('..') ||
    !domain.includes('.') ||
    domain.split('.').some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
  )
    throw new HttpError(400, 'Enter a valid email address.');
  return normalized;
}
export function objectBody(body: unknown, allowed: string[]): Record<string, unknown> {
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => !allowed.includes(key))
  )
    throw new HttpError(400, 'Invalid request fields.');
  return body as Record<string, unknown>;
}
export interface Identity {
  id: string;
  email: string;
  email_verified_at: Date | null;
  ai_enabled: boolean;
  auth_version: number;
  sid: string;
  expires_at: Date;
}
export function userView(user: Identity) {
  return {
    id: user.id,
    email: user.email,
    emailVerified: Boolean(user.email_verified_at),
    aiEnabled: user.ai_enabled,
  };
}
export function csrf(config: AppConfig, sid: string) {
  return createHmac('sha256', config.csrfSecret)
    .update('csrf:' + sid)
    .digest('base64url');
}
export function requireCsrf(config: AppConfig, sid: string, supplied: unknown) {
  const expected = csrf(config, sid);
  if (
    typeof supplied !== 'string' ||
    !/^[A-Za-z0-9_-]{43}$/.test(supplied) ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))
  )
    throw new HttpError(403, 'Refresh the page and try again.');
}
export async function accessToken(config: AppConfig, user: Identity) {
  return new SignJWT({ sid: user.sid, ver: user.auth_version })
    .setProtectedHeader({ alg: 'HS256', typ: 'at+jwt', kid: config.activeKid })
    .setSubject(user.id)
    .setIssuer(config.origin)
    .setAudience('launchscout-api')
    .setIssuedAt()
    .setNotBefore('0s')
    .setExpirationTime(`${config.accessSeconds}s`)
    .setJti(crypto.randomUUID())
    .sign(config.keys[config.activeKid]);
}
export async function authenticate(
  db: Database,
  config: AppConfig,
  token?: string,
): Promise<Identity> {
  let subject = '';
  let sessionId = '';
  let version = 0;
  try {
    if (!token || token.length > 2048) throw new Error();
    const header = decodeProtectedHeader(token);
    if (
      header.alg !== 'HS256' ||
      header.typ !== 'at+jwt' ||
      typeof header.kid !== 'string' ||
      !Object.hasOwn(config.keys, header.kid) ||
      Object.keys(header).some((key) => !['alg', 'typ', 'kid'].includes(key))
    )
      throw new Error();
    const { payload } = await jwtVerify(token, config.keys[header.kid], {
      algorithms: ['HS256'],
      issuer: config.origin,
      audience: 'launchscout-api',
      typ: 'at+jwt',
      requiredClaims: ['sub', 'sid', 'ver', 'iat', 'nbf', 'exp', 'jti'],
      maxTokenAge: `${config.accessSeconds}s`,
      clockTolerance: 5,
    });
    if (!uuid(payload.sub) || !uuid(payload.sid) || !Number.isSafeInteger(payload.ver))
      throw new Error();
    subject = payload.sub;
    sessionId = payload.sid;
    version = payload.ver as number;
  } catch {
    throw new HttpError(401, 'Sign in to continue.');
  }
  const result = await db.query<Identity>(
    `SELECT u.*, s.id AS sid, s.expires_at FROM auth_sessions s JOIN users u ON u.id=s.user_id
    WHERE s.id=$1 AND u.id=$2 AND s.auth_version=$3 AND u.auth_version=$3 AND s.revoked_at IS NULL AND s.expires_at>now()`,
    [sessionId, subject, version],
  );
  if (!result.rows[0]) throw new HttpError(401, 'Sign in to continue.');
  return result.rows[0];
}
export async function limit(
  db: Database,
  config: AppConfig,
  kind: string,
  identifier: string,
  maximum: number,
  seconds: number,
) {
  const key = createHmac('sha256', config.abuseSecret)
    .update(kind + ':' + identifier)
    .digest('hex');
  const result = await db.query(
    `INSERT INTO rate_limits(bucket,attempts,expires_at)
    VALUES ($1 || ':' || floor(extract(epoch from clock_timestamp())/$3)::text,1,clock_timestamp()+($3*2)*interval '1 second')
    ON CONFLICT(bucket) DO UPDATE SET attempts=rate_limits.attempts+1 WHERE rate_limits.attempts<$2 RETURNING attempts`,
    [key, maximum, seconds],
  );
  if (!result.rowCount) throw new HttpError(429, 'Too many requests. Try again later.', seconds);
}
