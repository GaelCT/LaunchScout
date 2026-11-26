import { randomBytes } from 'node:crypto';

export interface AppConfig {
  origin: string;
  production: boolean;
  databaseUrl?: string;
  keys: Record<string, Uint8Array>;
  activeKid: string;
  csrfSecret: string;
  abuseSecret: string;
  trustedProxies: string[];
  apiKey?: string;
  smtpUrl?: string;
  mailFrom: string;
  bodyTimeoutMs: number;
  accessSeconds: number;
  sessionSeconds: number;
  providerTimeoutMs: number;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const production = env.NODE_ENV === 'production';
  const origin = new URL(env.APP_ORIGIN ?? 'http://127.0.0.1:5173');
  if (origin.origin !== (env.APP_ORIGIN ?? origin.origin) || origin.username || origin.password)
    throw new Error('APP_ORIGIN must be an exact origin without a path or credentials.');
  if (
    origin.protocol !== 'https:' &&
    (production || !['127.0.0.1', 'localhost'].includes(origin.hostname))
  )
    throw new Error('HTTPS is required outside local development.');
  const databaseUrl = env.DATABASE_URL;
  let raw: unknown = {};
  try {
    raw = env.JWT_KEYS ? JSON.parse(env.JWT_KEYS) : {};
  } catch {
    throw new Error('JWT_KEYS must be a JSON key map.');
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid JWT_KEYS.');
  const keys: Record<string, Uint8Array> = Object.create(null);
  for (const [kid, value] of Object.entries(raw)) {
    if (
      !/^[A-Za-z0-9_-]{1,32}$/.test(kid) ||
      typeof value !== 'string' ||
      !/^[A-Za-z0-9_-]{43,}$/.test(value)
    )
      throw new Error('JWT_KEYS requires named base64url keys of at least 32 random bytes.');
    const decoded = Buffer.from(value, 'base64url');
    if (decoded.length < 32) throw new Error('JWT key is too short.');
    keys[kid] = decoded;
  }
  const activeKid = env.JWT_ACTIVE_KID ?? 'local';
  const csrfSecret = env.CSRF_SECRET ?? '';
  const abuseSecret = env.ABUSE_HASH_KEY ?? '';
  if (databaseUrl && (!keys[activeKid] || csrfSecret.length < 43 || abuseSecret.length < 43))
    throw new Error(
      'Configured authentication requires JWT_KEYS, JWT_ACTIVE_KID, CSRF_SECRET and ABUSE_HASH_KEY.',
    );
  if (production && (!databaseUrl || !env.SMTP_URL))
    throw new Error('Production requires PostgreSQL and SMTP.');
  if (databaseUrl) {
    let url: URL;
    try {
      url = new URL(databaseUrl);
    } catch {
      throw new Error('DATABASE_URL must be a PostgreSQL URL.');
    }
    if (!['postgres:', 'postgresql:'].includes(url.protocol))
      throw new Error('DATABASE_URL must use PostgreSQL.');
    if (
      production &&
      !['127.0.0.1', 'localhost'].includes(url.hostname) &&
      url.searchParams.get('sslmode') !== 'verify-full'
    )
      throw new Error('Nonlocal production PostgreSQL requires sslmode=verify-full.');
  }
  if (env.SMTP_URL) {
    let smtp: URL;
    try {
      smtp = new URL(env.SMTP_URL);
    } catch {
      throw new Error('Invalid SMTP_URL.');
    }
    if (!['smtp:', 'smtps:'].includes(smtp.protocol))
      throw new Error('SMTP_URL must use SMTP or SMTPS.');
  }
  const trustedProxies = (env.TRUSTED_PROXY_CIDRS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (trustedProxies.some((s) => ['true', '*', '0.0.0.0/0', '::/0'].includes(s)))
    throw new Error('Trust only explicit proxy addresses/subnets.');
  return {
    origin: origin.origin,
    production,
    databaseUrl,
    keys,
    activeKid,
    csrfSecret,
    abuseSecret,
    trustedProxies,
    apiKey: env.OPENAI_API_KEY,
    smtpUrl: env.SMTP_URL,
    mailFrom: env.MAIL_FROM ?? 'LaunchScout <noreply@localhost>',
    bodyTimeoutMs: 10_000,
    accessSeconds: 600,
    sessionSeconds: 7 * 24 * 3600,
    providerTimeoutMs: 60_000,
  };
}

// Operator helper: generated secrets are for environment configuration, never checked in.
export const newSecret = () => randomBytes(32).toString('base64url');
