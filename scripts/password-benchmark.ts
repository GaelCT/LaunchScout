import { performance } from 'node:perf_hooks';
import { cpus } from 'node:os';
import { randomBytes } from 'node:crypto';
import { hashPassword, verifyPassword, passwordOptions } from '../server/security';

const password = randomBytes(32).toString('base64url');
for (let index = 0; index < 3; index++) {
  const encoded = await hashPassword(password);
  if (!(await verifyPassword(encoded, password))) throw new Error('Benchmark verification failed.');
}
const hashTimes: number[] = [];
const verifyTimes: number[] = [];
for (let index = 0; index < 20; index++) {
  let started = performance.now();
  const encoded = await hashPassword(password);
  hashTimes.push(performance.now() - started);
  started = performance.now();
  if (!(await verifyPassword(encoded, password))) throw new Error('Benchmark verification failed.');
  verifyTimes.push(performance.now() - started);
}
const started = performance.now();
await Promise.all([hashPassword(password), hashPassword(password)]);
const summarize = (times: number[]) => {
  times.sort((left, right) => left - right);
  return { medianMs: Math.round((times[9] + times[10]) / 2), p95Ms: Math.round(times[18]) };
};
process.stdout.write(
  JSON.stringify({
    node: process.version,
    platform: process.platform,
    cpu: cpus()[0].model,
    parameters: passwordOptions,
    warmups: 3,
    samples: 20,
    hash: summarize(hashTimes),
    verify: summarize(verifyTimes),
    twoConcurrentHashesMs: Math.round(performance.now() - started),
  }) + '\n',
);
