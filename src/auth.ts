export interface Session {
  user: { id: string; email: string; emailVerified: boolean; aiEnabled: boolean };
  csrfToken: string;
  expiresAt: string;
}
type Action = { purpose: 'verify' | 'reset'; token: string };
let action: Action | null = null;
const actionListeners = new Set<() => void>();
function captureAction() {
  const match = /^#(verify|reset)=([A-Za-z0-9_-]{43})$/.exec(location.hash);
  if (!match) return;
  action = { purpose: match[1] as Action['purpose'], token: match[2] };
  history.replaceState(null, '', location.pathname + location.search);
  actionListeners.forEach((listener) => listener());
}
captureAction();
window.addEventListener('hashchange', captureAction);
let session: Session | null = null;
let revision = 0;
let refreshTask: Promise<Session | null> | null = null;
const listeners = new Set<(value: Session | null) => void>();
const channel =
  typeof BroadcastChannel === 'function' ? new BroadcastChannel('launchscout-auth') : null;
function publish(value: Session | null, announce = false) {
  session = value;
  listeners.forEach((listener) => listener(value));
  if (announce) channel?.postMessage('changed');
}
async function json(response: Response) {
  const value = response.status === 204 ? null : await response.json();
  if (!response.ok)
    throw new Error(
      typeof value?.error === 'string' ? value.error : 'The request could not finish. Try again.',
    );
  return value;
}
function checkedSession(value: unknown): Session {
  const candidate = value as Session;
  if (
    !candidate?.user ||
    typeof candidate.user.id !== 'string' ||
    typeof candidate.user.email !== 'string' ||
    typeof candidate.user.emailVerified !== 'boolean' ||
    typeof candidate.user.aiEnabled !== 'boolean' ||
    typeof candidate.csrfToken !== 'string' ||
    !/^[A-Za-z0-9_-]{43}$/.test(candidate.csrfToken) ||
    typeof candidate.expiresAt !== 'string'
  )
    throw new Error('The sign-in service returned an invalid session.');
  return candidate;
}
async function refresh(): Promise<Session | null> {
  if (refreshTask) return refreshTask;
  const perform = async () => {
    const start = revision;
    const token = await fetch('/api/auth/csrf', { credentials: 'same-origin', cache: 'no-store' });
    if (start !== revision) return session;
    if (token.status === 401) {
      publish(null);
      return null;
    }
    const csrf = await json(token);
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf.csrfToken },
      body: '{}',
    });
    if (start !== revision) return session;
    if (response.status === 401) {
      publish(null);
      return null;
    }
    const value = checkedSession(await json(response));
    if (start !== revision) return session;
    publish(value);
    return value;
  };
  refreshTask = (async () =>
    navigator.locks
      ? await navigator.locks.request('launchscout-refresh', perform)
      : await perform())().finally(() => {
    refreshTask = null;
  });
  return refreshTask;
}
export async function authenticatedFetch(path: string, options: RequestInit = {}) {
  const owner = session?.user.id;
  const execute = () =>
    fetch(path, {
      ...options,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        ...Object.fromEntries(new Headers(options.headers)),
        ...(session ? { 'X-CSRF-Token': session.csrfToken } : {}),
      },
    });
  const response = await execute();
  if (response.status !== 401 || options.signal?.aborted || !owner) return response;
  const renewed = await refresh();
  if (!renewed || renewed.user.id !== owner || options.signal?.aborted) return response;
  return execute();
}
async function post(
  path: string,
  body: object,
  authenticated = false,
  signal?: AbortSignal,
  method = 'POST',
) {
  const options = {
    method,
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
  return json(
    await (authenticated
      ? authenticatedFetch(path, options)
      : fetch(path, { ...options, credentials: 'same-origin', cache: 'no-store' })),
  );
}
export const authClient = {
  subscribeAction(listener: () => void) {
    actionListeners.add(listener);
    return () => {
      actionListeners.delete(listener);
    };
  },
  pendingAction: () => action,
  clearAction: () => {
    action = null;
  },
  subscribe(listener: (value: Session | null) => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  async restore() {
    const start = revision;
    const response = await fetch('/api/auth/session', {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    if (start !== revision) return session;
    if (response.status === 401) return refresh();
    const value = checkedSession(await json(response));
    if (start !== revision) return session;
    publish(value);
    return value;
  },
  async signIn(email: string, password: string, signal: AbortSignal) {
    const start = ++revision;
    const value = checkedSession(await post('/api/auth/login', { email, password }, false, signal));
    if (!signal.aborted && start === revision) publish(value, true);
  },
  register: (email: string, password: string, signal: AbortSignal) =>
    post('/api/auth/register', { email, password }, false, signal),
  requestLink: (purpose: 'verify' | 'reset', email: string, signal: AbortSignal) =>
    post(`/api/auth/${purpose}/request`, { email }, false, signal),
  async confirm(purpose: 'verify' | 'reset', token: string, password: string, signal: AbortSignal) {
    const start = purpose === 'reset' ? ++revision : revision;
    const result = await post(
      `/api/auth/${purpose}/confirm`,
      { token, ...(purpose === 'reset' ? { password } : {}) },
      false,
      signal,
    );
    action = null;
    if (purpose === 'reset' && start === revision) publish(null, true);
    else if (session) await authClient.restore();
    return result;
  },
  async signOut() {
    const start = ++revision;
    await post('/api/auth/logout', {}, true);
    if (start === revision) publish(null, true);
  },
  async changePassword(password: string, newPassword: string, signal: AbortSignal) {
    const start = ++revision;
    await post('/api/auth/password', { password, newPassword }, true, signal);
    if (start === revision) publish(null, true);
  },
  async deleteAccount(password: string, signal: AbortSignal) {
    const start = ++revision;
    await post('/api/auth/account', { password }, true, signal, 'DELETE');
    if (start === revision) publish(null, true);
  },
};
channel?.addEventListener('message', () => {
  revision++;
  void authClient.restore().catch(() => {});
});
