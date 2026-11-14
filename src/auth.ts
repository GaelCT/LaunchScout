/** Frontend boundary for replacing the local preview with issue #8's real auth service. */
export interface LoginCredentials {
  email: string;
  password: string;
}

export interface LoginResult {
  kind: 'preview';
}

export interface AuthAdapter {
  signIn(credentials: LoginCredentials, options: { signal: AbortSignal }): Promise<LoginResult>;
}

// Deliberately ignores credentials. No request, token, storage, or user session is created.
export const mockAuthAdapter: AuthAdapter = {
  signIn(_credentials, { signal }) {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(new DOMException('Canceled', 'AbortError'));
        return;
      }
      const onAbort = () => {
        window.clearTimeout(timer);
        reject(new DOMException('Canceled', 'AbortError'));
      };
      const timer = window.setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        resolve({ kind: 'preview' });
      }, 650);
      signal.addEventListener('abort', onAbort, { once: true });
    });
  },
};
