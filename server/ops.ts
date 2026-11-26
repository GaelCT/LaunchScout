import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { readConfig, newSecret } from './config';
import { connectDatabase, migrate } from './db';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    email: { type: 'string' },
    model: { type: 'string' },
    input: { type: 'string' },
    output: { type: 'string' },
    daily: { type: 'string' },
    monthly: { type: 'string' },
  },
});
const command = positionals[0];
if (command === 'secrets') {
  process.stdout.write(
    `JWT_KEYS=${JSON.stringify({ v1: newSecret() })}\nJWT_ACTIVE_KID=v1\nCSRF_SECRET=${newSecret()}\nABUSE_HASH_KEY=${newSecret()}\n`,
  );
} else {
  const config = readConfig();
  if (!config.databaseUrl) throw new Error('Set DATABASE_URL for operator commands.');
  const db = connectDatabase(config.databaseUrl);
  try {
    if (command === 'migrate') await migrate(db);
    else if (command === 'ai-disable')
      await db.query('UPDATE ai_policy SET enabled=false WHERE singleton=true');
    else if (command === 'ai-enable') {
      const numbers = [
        values.input,
        values.output,
        values.daily ?? '1000000',
        values.monthly ?? '10000000',
      ];
      if (
        !values.model ||
        values.model.length > 128 ||
        !numbers.every((s) => s && /^[1-9][0-9]{0,14}$/.test(s))
      )
        throw new Error(
          'Supply --model, --input and --output prices (microUSD per million tokens); optional --daily/--monthly budgets (microUSD).',
        );
      await db.query(
        'UPDATE ai_policy SET enabled=true,model=$1,input_microusd_per_million=$2,output_microusd_per_million=$3,daily_budget_microusd=$4,monthly_budget_microusd=$5 WHERE singleton=true',
        [values.model, ...numbers],
      );
    } else if (command === 'ai-grant' || command === 'ai-revoke') {
      if (!values.email) throw new Error('Supply --email.');
      await db.query('UPDATE users SET ai_enabled=$1 WHERE email=$2', [
        command === 'ai-grant',
        values.email.toLowerCase(),
      ]);
    } else if (command === 'stats') {
      const rows = await db.query(
        "SELECT state,count(*)::int AS requests,sum(charged_microusd)::text AS charged_microusd FROM ai_requests WHERE created_at>now()-interval '1 day' GROUP BY state",
      );
      process.stdout.write(JSON.stringify(rows.rows) + '\n');
    } else if (command === 'prune') {
      await db.query(
        "DELETE FROM rate_limits WHERE expires_at<now(); DELETE FROM action_tokens WHERE expires_at<now()-interval '1 day'; DELETE FROM auth_sessions WHERE expires_at<now()-interval '1 day'; DELETE FROM ai_requests WHERE state<>'running' AND created_at<now()-interval '35 days'",
      );
    } else throw new Error('Unknown operator command.');
    process.stdout.write('Operator command completed.\n');
  } finally {
    await db.end();
  }
}
