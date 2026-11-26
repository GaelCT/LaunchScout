import type { AppConfig } from './config';
import { transaction } from './db';
import type { Database } from './db';
import { HttpError } from './security';
import type { Identity } from './security';
import { instructions, outputSchema } from './provider';
import type { ProviderResult } from './provider';

export interface Policy {
  enabled: boolean;
  model: string;
  input_microusd_per_million: string;
  output_microusd_per_million: string;
  daily_budget_microusd: string;
  monthly_budget_microusd: string;
  user_daily_requests: number;
  user_daily_tokens: number;
  max_concurrency: number;
  max_output_tokens: number;
}
export const cost = (input: number, output: number, inputRate: string, outputRate: string) =>
  (BigInt(input) * BigInt(inputRate) + BigInt(output) * BigInt(outputRate) + 999999n) / 1000000n;
export class AiLedger {
  private db: Database;
  private config: AppConfig;
  constructor(db: Database, config: AppConfig) {
    this.db = db;
    this.config = config;
  }
  async policy() {
    return (await this.db.query<Policy>('SELECT * FROM ai_policy WHERE singleton=true')).rows[0];
  }
  async reserve(user: Identity, key: string, text: string, task: 'cleanup' | 'guard' = 'cleanup') {
    return transaction(this.db, async (client) => {
      const policy = (
        await client.query<Policy>('SELECT * FROM ai_policy WHERE singleton=true FOR UPDATE')
      ).rows[0];
      if (
        !policy?.enabled ||
        !policy.model ||
        BigInt(policy.input_microusd_per_million) <= 0n ||
        BigInt(policy.output_microusd_per_million) <= 0n
      )
        throw new HttpError(503, 'AI cleanup is paused or not configured.');
      // Recheck access inside admission, including concurrent logout, deletion, or entitlement changes.
      const allowed = await client.query(
        `SELECT 1 FROM users u JOIN auth_sessions s ON s.user_id=u.id
        WHERE u.id=$1 AND s.id=$2 AND u.ai_enabled AND u.email_verified_at IS NOT NULL
        AND s.revoked_at IS NULL AND s.expires_at>now() AND u.auth_version=s.auth_version`,
        [user.id, user.sid],
      );
      if (!allowed.rowCount)
        throw new HttpError(403, 'A verified account with AI access is required.');
      const duplicate = await client.query(
        'SELECT 1 FROM ai_requests WHERE user_id=$1 AND idempotency_key=$2',
        [user.id, key],
      );
      if (duplicate.rowCount)
        throw new HttpError(
          409,
          'This cleanup request was already submitted. Review its result before starting another.',
        );
      // A stale/crashed call keeps its full reservation. Only the local concurrency slot expires.
      await client.query(
        "UPDATE ai_requests SET state='unknown',finished_at=now() WHERE state='running' AND lease_until<now()",
      );
      const stats = (
        await client.query(
          `SELECT
        count(*) FILTER (WHERE state='running') AS active,
        coalesce(sum(charged_microusd) FILTER (WHERE created_at>=date_trunc('day',now())),0) AS day_cost,
        coalesce(sum(charged_microusd),0) AS month_cost,
        count(*) FILTER (WHERE user_id=$1 AND created_at>=date_trunc('day',now())) AS user_requests,
        coalesce(sum(charged_tokens) FILTER (WHERE user_id=$1 AND created_at>=date_trunc('day',now())),0) AS user_tokens
        FROM ai_requests WHERE created_at>=date_trunc('month',now()) OR state='running'`,
          [user.id],
        )
      ).rows[0];
      const inputTokens =
        Buffer.byteLength(
          JSON.stringify({ resume_text: text }) + instructions + JSON.stringify(outputSchema),
          'utf8',
        ) + 4096;
      const outputTokens = policy.max_output_tokens;
      const reservation = cost(
        inputTokens,
        outputTokens,
        policy.input_microusd_per_million,
        policy.output_microusd_per_million,
      );
      if (Number(stats.active) >= policy.max_concurrency)
        throw new HttpError(429, 'AI cleanup is busy. Try again shortly.', 2);
      if (
        Number(stats.user_requests) >= policy.user_daily_requests ||
        Number(stats.user_tokens) + inputTokens + outputTokens > policy.user_daily_tokens
      )
        throw new HttpError(429, 'Your daily AI usage limit was reached.', 3600);
      if (
        BigInt(stats.day_cost) + reservation > BigInt(policy.daily_budget_microusd) ||
        BigInt(stats.month_cost) + reservation > BigInt(policy.monthly_budget_microusd)
      )
        throw new HttpError(
          503,
          'AI usage budget is exhausted. Local editing remains available.',
          3600,
          'ai_budget_exhausted',
        );
      const result = await client.query(
        `INSERT INTO ai_requests(user_id,session_id,idempotency_key,model,state,
        reserved_input_tokens,reserved_output_tokens,charged_tokens,input_rate,output_rate,reserved_microusd,charged_microusd,lease_until)
        VALUES ($1,$2,$3,$4,'running',$5,$6,$7,$8,$9,$10,$10,now()+$11*interval '1 millisecond') RETURNING id`,
        [
          user.id,
          user.sid,
          key,
          policy.model,
          inputTokens,
          outputTokens,
          inputTokens + outputTokens,
          policy.input_microusd_per_million,
          policy.output_microusd_per_million,
          reservation.toString(),
          this.config.providerTimeoutMs + 30000,
        ],
      );
      await client.query('UPDATE ai_requests SET task=$2 WHERE id=$1', [result.rows[0].id, task]);
      return {
        id: result.rows[0].id as string,
        model: policy.model,
        maxOutputTokens: outputTokens,
      };
    });
  }
  async settle(
    id: string,
    state: 'succeeded' | 'failed' | 'unknown' | 'cancelled',
    usage?: ProviderResult['usage'],
  ) {
    await transaction(this.db, async (client) => {
      await client.query('SELECT singleton FROM ai_policy WHERE singleton=true FOR UPDATE');
      const job = (await client.query('SELECT * FROM ai_requests WHERE id=$1 FOR UPDATE', [id]))
        .rows[0];
      if (!job || job.state !== 'running') return;
      let charged = BigInt(job.reserved_microusd);
      let tokens = job.charged_tokens as number;
      if (state === 'cancelled') {
        charged = 0n;
        tokens = 0;
      } else if (usage) {
        charged = cost(usage.inputTokens, usage.outputTokens, job.input_rate, job.output_rate);
        tokens = usage.inputTokens + usage.outputTokens;
        if (
          charged > BigInt(job.reserved_microusd) ||
          usage.inputTokens > job.reserved_input_tokens ||
          usage.outputTokens > job.reserved_output_tokens
        )
          await client.query('UPDATE ai_policy SET enabled=false WHERE singleton=true');
      }
      await client.query(
        'UPDATE ai_requests SET state=$2,charged_microusd=$3,charged_tokens=$4,finished_at=now() WHERE id=$1',
        [id, state, charged.toString(), tokens],
      );
    });
  }
}
