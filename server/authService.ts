import { parseOptions } from '@node-rs/argon2';
import nodemailer from 'nodemailer';
import type { PoolClient } from 'pg';
import type { AppConfig } from './config';
import { transaction } from './db';
import type { Database } from './db';
import {
  accessToken,
  csrf,
  digest,
  hashPassword,
  HttpError,
  opaque,
  passwordOptions,
  userView,
  verifyPassword,
} from './security';
import type { Identity } from './security';

export interface Mail {
  to: string;
  purpose: 'verify' | 'reset';
  url: string;
}
export type Mailer = (mail: Mail) => Promise<void>;
export type Audit = (event: string, requestId?: string) => void;
export function smtpMailer(config: AppConfig): Mailer {
  const smtp = config.smtpUrl ? new URL(config.smtpUrl) : null;
  const transport = smtp
    ? nodemailer.createTransport({
        host: smtp.hostname,
        port: Number(smtp.port || (smtp.protocol === 'smtps:' ? 465 : 587)),
        secure: smtp.protocol === 'smtps:',
        requireTLS: config.production,
        auth: smtp.username
          ? { user: decodeURIComponent(smtp.username), pass: decodeURIComponent(smtp.password) }
          : undefined,
        logger: false,
        debug: false,
        connectionTimeout: 5000,
        greetingTimeout: 5000,
        socketTimeout: 10000,
        tls: { rejectUnauthorized: true },
      })
    : null;
  return async (mail) => {
    if (!transport) throw new Error('Mail delivery is not configured.');
    await transport.sendMail({
      from: config.mailFrom,
      to: mail.to,
      subject:
        mail.purpose === 'verify'
          ? 'Verify your LaunchScout email'
          : 'Reset your LaunchScout password',
      text: `You requested a LaunchScout ${mail.purpose === 'verify' ? 'verification' : 'password reset'} link.\n\n${mail.url}\n\nIf you did not request this, ignore this message.`,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
  };
}

export class AuthService {
  private db: Database;
  private config: AppConfig;
  private mailer: Mailer;
  private audit: Audit;
  private passwordJobs = 0;
  private mailJobs = 0;
  private dummyHash: Promise<string>;
  constructor(db: Database, config: AppConfig, mailer: Mailer, audit: Audit) {
    this.db = db;
    this.config = config;
    this.mailer = mailer;
    this.audit = audit;
    this.dummyHash = hashPassword(opaque());
  }
  private async work<T>(action: () => Promise<T>): Promise<T> {
    if (this.passwordJobs >= 2)
      throw new HttpError(429, 'Sign-in service is busy. Try again shortly.', 2);
    this.passwordJobs++;
    try {
      return await action();
    } finally {
      this.passwordJobs--;
    }
  }
  private async issueAction(
    client: PoolClient,
    userId: string,
    email: string,
    purpose: Mail['purpose'],
  ) {
    const token = opaque();
    await client.query(
      'UPDATE action_tokens SET consumed_at=now() WHERE user_id=$1 AND purpose=$2 AND consumed_at IS NULL',
      [userId, purpose],
    );
    await client.query(
      `INSERT INTO action_tokens(token_hash,user_id,purpose,expires_at) VALUES ($1,$2,$3,now()+$4*interval '1 second')`,
      [digest(token), userId, purpose, purpose === 'verify' ? 86400 : 900],
    );
    return { to: email, purpose, url: `${this.config.origin}/#${purpose}=${token}` };
  }
  private deliver(mail: Mail | null) {
    if (!mail) return;
    if (this.mailJobs >= 10) {
      this.audit('mail_delivery_failed');
      return;
    }
    this.mailJobs++;
    // Do not disclose eligible addresses through SMTP latency or hold password slots during delivery.
    void Promise.resolve()
      .then(() => this.mailer(mail))
      .catch(() => this.audit('mail_delivery_failed'))
      .finally(() => {
        this.mailJobs--;
      });
  }
  async register(email: string, password: string) {
    await this.work(async () => {
      const encoded = await hashPassword(password);
      const mail = await transaction(this.db, async (client) => {
        const inserted = await client.query(
          'INSERT INTO users(email) VALUES ($1) ON CONFLICT(email) DO NOTHING RETURNING id',
          [email],
        );
        if (!inserted.rowCount) return null;
        const id = inserted.rows[0].id as string;
        await client.query(
          'INSERT INTO password_credentials(user_id,password_hash) VALUES ($1,$2)',
          [id, encoded],
        );
        return this.issueAction(client, id, email, 'verify');
      });
      this.deliver(mail);
    });
  }
  private async createSession(
    client: PoolClient,
    user: Identity,
  ): Promise<{ user: Identity; refresh: string }> {
    const session = await client.query(
      `INSERT INTO auth_sessions(user_id,auth_version,expires_at)
      VALUES ($1,$2,now()+$3*interval '1 second') RETURNING id,expires_at`,
      [user.id, user.auth_version, this.config.sessionSeconds],
    );
    const refresh = opaque();
    await client.query(
      'INSERT INTO refresh_tokens(token_hash,session_id,expires_at) VALUES ($1,$2,$3)',
      [digest(refresh), session.rows[0].id, session.rows[0].expires_at],
    );
    return {
      user: { ...user, sid: session.rows[0].id, expires_at: session.rows[0].expires_at },
      refresh,
    };
  }
  async login(email: string, password: string) {
    return this.work(async () => {
      const found = await this.db.query<Identity & { password_hash: string }>(
        `SELECT u.*,p.password_hash FROM users u JOIN password_credentials p ON p.user_id=u.id WHERE u.email=$1`,
        [email],
      );
      const row = found.rows[0];
      const encoded = row?.password_hash ?? (await this.dummyHash);
      if (!(await verifyPassword(encoded, password)) || !row)
        throw new HttpError(401, 'Email or password is incorrect.');
      const parameters = parseOptions(encoded);
      const replacement =
        parameters.algorithm !== 2 ||
        parameters.version !== 1 ||
        parameters.outputLen < 32 ||
        parameters.memoryCost < passwordOptions.memoryCost ||
        parameters.timeCost < passwordOptions.timeCost ||
        parameters.saltLen < 16
          ? await hashPassword(password)
          : null;
      return transaction(this.db, async (client) => {
        const current = await client.query<Identity & { password_hash: string }>(
          `SELECT u.*,p.password_hash FROM users u JOIN password_credentials p ON p.user_id=u.id WHERE u.id=$1 FOR UPDATE OF u`,
          [row.id],
        );
        if (!current.rows[0] || current.rows[0].password_hash !== encoded)
          throw new HttpError(401, 'Email or password is incorrect.');
        if (replacement)
          await client.query(
            'UPDATE password_credentials SET password_hash=$1,updated_at=now() WHERE user_id=$2',
            [replacement, row.id],
          );
        return this.createSession(client, current.rows[0]);
      });
    });
  }
  async refreshIdentity(token?: string): Promise<Identity> {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token))
      throw new HttpError(401, 'Sign in to continue.');
    const found = await this.db.query<Identity>(
      `SELECT u.*,s.id AS sid,s.expires_at FROM refresh_tokens t
      JOIN auth_sessions s ON s.id=t.session_id JOIN users u ON u.id=s.user_id
      WHERE t.token_hash=$1 AND t.used_at IS NULL AND t.expires_at>now() AND s.expires_at>now()
      AND s.revoked_at IS NULL AND s.auth_version=u.auth_version`,
      [digest(token)],
    );
    if (!found.rows[0]) throw new HttpError(401, 'Sign in to continue.');
    return found.rows[0];
  }
  async refresh(token: string) {
    const result = await transaction(this.db, async (client) => {
      const found = await client.query<Identity & { used_at: Date | null }>(
        `SELECT u.*,s.id AS sid,s.expires_at,t.used_at FROM refresh_tokens t
        JOIN auth_sessions s ON s.id=t.session_id JOIN users u ON u.id=s.user_id
        WHERE t.token_hash=$1 AND t.expires_at>now() AND s.expires_at>now()
        AND s.revoked_at IS NULL AND s.auth_version=u.auth_version FOR UPDATE OF s,u,t`,
        [digest(token)],
      );
      const user = found.rows[0];
      if (!user) return null;
      if (user.used_at) {
        await client.query('UPDATE auth_sessions SET revoked_at=now() WHERE id=$1', [user.sid]);
        return null; // Commit revocation before reporting replay failure.
      }
      const refresh = opaque();
      await client.query('UPDATE refresh_tokens SET used_at=now() WHERE token_hash=$1', [
        digest(token),
      ]);
      await client.query(
        'INSERT INTO refresh_tokens(token_hash,session_id,expires_at) VALUES ($1,$2,$3)',
        [digest(refresh), user.sid, user.expires_at],
      );
      return { user, refresh };
    });
    if (!result) throw new HttpError(401, 'Session ended. Sign in again.');
    return result;
  }
  async actionEmail(email: string, purpose: Mail['purpose']) {
    const mail = await transaction(this.db, async (client) => {
      const found = await client.query<Identity>('SELECT * FROM users WHERE email=$1 FOR UPDATE', [
        email,
      ]);
      const user = found.rows[0];
      if (!user || (purpose === 'verify' && user.email_verified_at)) return null;
      return this.issueAction(client, user.id, user.email, purpose);
    });
    this.deliver(mail);
  }
  async consumeAction(token: string, purpose: Mail['purpose'], password?: string) {
    const perform = async () => {
      const encoded = password ? await hashPassword(password) : null;
      await transaction(this.db, async (client) => {
        const found = await client.query(
          `SELECT t.user_id FROM action_tokens t JOIN users u ON u.id=t.user_id
          WHERE token_hash=$1 AND purpose=$2 AND consumed_at IS NULL AND expires_at>now() FOR UPDATE OF t,u`,
          [digest(token), purpose],
        );
        if (!found.rowCount)
          throw new HttpError(400, 'This link is invalid or expired. Request a new one.');
        const id = found.rows[0].user_id;
        await client.query(
          'UPDATE action_tokens SET consumed_at=now() WHERE user_id=$1 AND purpose=$2',
          [id, purpose],
        );
        if (purpose === 'verify')
          await client.query(
            'UPDATE users SET email_verified_at=now(),updated_at=now() WHERE id=$1',
            [id],
          );
        else {
          await client.query(
            'UPDATE password_credentials SET password_hash=$1,updated_at=now() WHERE user_id=$2',
            [encoded, id],
          );
          await client.query(
            'UPDATE users SET auth_version=auth_version+1,updated_at=now() WHERE id=$1',
            [id],
          );
          await client.query('UPDATE auth_sessions SET revoked_at=now() WHERE user_id=$1', [id]);
        }
      });
    };
    if (purpose === 'reset') await this.work(perform);
    else await perform();
  }
  async logout(user: Identity) {
    await this.db.query('UPDATE auth_sessions SET revoked_at=now() WHERE id=$1 AND user_id=$2', [
      user.sid,
      user.id,
    ]);
  }
  async sensitive(user: Identity, password: string, nextPassword?: string) {
    await this.work(async () => {
      const found = await this.db.query(
        'SELECT password_hash FROM password_credentials WHERE user_id=$1',
        [user.id],
      );
      const oldHash = found.rows[0]?.password_hash as string | undefined;
      if (!oldHash || !(await verifyPassword(oldHash, password)))
        throw new HttpError(403, 'Password is incorrect.');
      const encoded = nextPassword ? await hashPassword(nextPassword) : null;
      await transaction(this.db, async (client) => {
        const current = await client.query(
          `SELECT p.password_hash FROM users u JOIN password_credentials p ON p.user_id=u.id
          JOIN auth_sessions s ON s.user_id=u.id WHERE u.id=$1 AND s.id=$2 AND s.revoked_at IS NULL AND s.expires_at>now() FOR UPDATE OF u`,
          [user.id, user.sid],
        );
        if (current.rows[0]?.password_hash !== oldHash)
          throw new HttpError(401, 'Sign in again to continue.');
        if (!encoded) await client.query('DELETE FROM users WHERE id=$1', [user.id]);
        else {
          await client.query(
            'UPDATE password_credentials SET password_hash=$1,updated_at=now() WHERE user_id=$2',
            [encoded, user.id],
          );
          await client.query(
            'UPDATE users SET auth_version=auth_version+1,updated_at=now() WHERE id=$1',
            [user.id],
          );
          await client.query('UPDATE auth_sessions SET revoked_at=now() WHERE user_id=$1', [
            user.id,
          ]);
          await client.query(
            "UPDATE action_tokens SET consumed_at=now() WHERE user_id=$1 AND purpose='reset'",
            [user.id],
          );
        }
      });
    });
  }
  async view(user: Identity) {
    return {
      user: userView(user),
      csrfToken: csrf(this.config, user.sid),
      expiresAt: user.expires_at.toISOString(),
    };
  }
  async tokens(user: Identity) {
    return accessToken(this.config, user);
  }
}
