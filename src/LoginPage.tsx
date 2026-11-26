import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  Github,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
  Sprout,
} from 'lucide-react';
import { authClient } from './auth';
import type { Session } from './auth';
import './login.css';

type Mode =
  'login' | 'register' | 'recover' | 'verify' | 'reset' | 'account' | 'password' | 'delete';
export function LoginPage({
  brand,
  themeToggle,
  onBack,
  session,
}: {
  brand: ReactNode;
  themeToggle: ReactNode;
  onBack: () => void;
  session: Session | null;
}) {
  const pending = authClient.pendingAction();
  const [mode, setMode] = useState<Mode>(pending?.purpose ?? (session ? 'account' : 'login'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const request = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const result = useRef<HTMLDivElement>(null);
  useEffect(() => {
    heading.current?.focus();
    const abort = new AbortController();
    void fetch('/api/auth/config', { signal: abort.signal })
      .then((r) => r.json())
      .then((value) => {
        if (!abort.signal.aborted) {
          setConfigured(value.configured === true);
          setEmailEnabled(value.emailEnabled === true);
        }
      })
      .catch(() => {
        if (!abort.signal.aborted) setConfigured(false);
      });
    return () => {
      abort.abort();
      request.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (message || error) result.current?.focus();
  }, [message, error]);
  function switchMode(next: Mode) {
    request.current?.abort();
    request.current = null;
    setMode(next);
    setPassword('');
    setNextPassword('');
    setVisible(false);
    setError('');
    setMessage('');
    setBusy(false);
    if (next !== 'verify' && next !== 'reset') authClient.clearAction();
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (request.current || !configured) return;
    setError('');
    setMessage('');
    if (
      ['login', 'register', 'recover'].includes(mode) &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ) {
      setError('Enter a valid email address.');
      return;
    }
    if (['login', 'register', 'password', 'delete', 'reset'].includes(mode) && !password) {
      setError('Enter your password.');
      return;
    }
    const newValue = mode === 'password' ? nextPassword : password;
    if (
      ['register', 'reset', 'password'].includes(mode) &&
      (newValue.length < 15 || newValue.length > 128)
    ) {
      setError('Use a password of 15–128 characters.');
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setVisible(false);
    try {
      if (mode === 'login') await authClient.signIn(email.trim(), password, controller.signal);
      else if (mode === 'register') {
        const reply = await authClient.register(email.trim(), password, controller.signal);
        setMessage(reply.message);
      } else if (mode === 'recover') {
        const reply = await authClient.requestLink('reset', email.trim(), controller.signal);
        setMessage(reply.message);
      } else if (mode === 'verify' || mode === 'reset') {
        if (!pending) throw new Error('Open a fresh email link to continue.');
        const reply = await authClient.confirm(mode, pending.token, password, controller.signal);
        setMessage(reply.message);
      } else if (mode === 'password') {
        await authClient.changePassword(password, nextPassword, controller.signal);
        setMessage('Password changed. Sign in again.');
        setMode('login');
      } else if (mode === 'delete') await authClient.deleteAccount(password, controller.signal);
    } catch (failure) {
      if (!controller.signal.aborted)
        setError(failure instanceof Error ? failure.message : 'The request could not finish.');
    } finally {
      if (!controller.signal.aborted) {
        setPassword('');
        setNextPassword('');
        setEmail('');
        setBusy(false);
        request.current = null;
      }
    }
  }
  async function accountAction(kind: 'logout' | 'verify') {
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError('');
    try {
      if (kind === 'logout') await authClient.signOut();
      else {
        const reply = await authClient.requestLink(
          'verify',
          session!.user.email,
          controller.signal,
        );
        setMessage(reply.message);
      }
    } catch (failure) {
      if (!controller.signal.aborted)
        setError(failure instanceof Error ? failure.message : 'Try again later.');
    } finally {
      if (!controller.signal.aborted) {
        setBusy(false);
        request.current = null;
      }
    }
  }
  const titles: Record<Mode, string> = {
    login: 'Welcome back.',
    register: 'Make yourself at home.',
    recover: 'Find your way back.',
    verify: 'Verify your email.',
    reset: 'Choose a new password.',
    account: 'Your LaunchScout account.',
    password: 'Change your password.',
    delete: 'Delete your account.',
  };
  const passwordField = ['login', 'register', 'reset', 'password', 'delete'].includes(mode);
  return (
    <div className="login-page">
      <header className="login-header">
        <button className="login-brand" aria-label="LaunchScout home" onClick={onBack}>
          {brand}
        </button>
        <div className="login-header-actions">
          <button className="login-back" aria-label="Back to exploring" onClick={onBack}>
            <ArrowLeft size={15} />
            <span>Back to exploring</span>
          </button>
          {themeToggle}
        </div>
      </header>
      <main className="login-layout" id="main-content">
        <section className="login-story" aria-label="Welcome to LaunchScout">
          <div className="login-story-top">
            <span className="login-eyebrow">
              <span />
              ROOTED HERE. READY FOR WHAT’S NEXT.
            </span>
            <h2>
              Your next chapter
              <br />
              starts <em>close to home.</em>
            </h2>
            <p>Find the companies, people, and possibilities worth getting to know.</p>
          </div>
          <div className="login-illustration" aria-hidden="true">
            <span className="login-compass">
              <Sprout size={85} strokeWidth={1} />
            </span>
          </div>
          <div className="login-story-bottom">
            <ShieldCheck size={24} />
            <p>
              Guest discovery and local resume editing
              <br />
              <em>are always available.</em>
            </p>
          </div>
        </section>
        <section className="login-form-section" aria-labelledby="login-title">
          <div className="login-form-content">
            <h1 id="login-title" ref={heading} tabIndex={-1}>
              {titles[mode]}
            </h1>
            <p className="login-input-hint">
              Account changes clear private session content. Download any resume edits you want to
              keep first.
            </p>
            {configured === false && (
              <div className="login-preview-notice" role="status">
                <ShieldCheck size={19} />
                <p>
                  Account service is unavailable. You can keep exploring and edit your resume
                  locally.
                </p>
              </div>
            )}
            {mode === 'account' && session ? (
              <div className="account-details">
                <p>
                  <strong>{session.user.email}</strong>
                </p>
                <p>
                  {session.user.emailVerified ? 'Email verified' : 'Email verification required'}
                </p>
                <p>
                  {session.user.aiEnabled
                    ? 'AI access enabled'
                    : 'AI access requires operator approval'}
                </p>
                {!session.user.emailVerified && (
                  <button
                    className="login-submit"
                    disabled={busy || !emailEnabled}
                    onClick={() => void accountAction('verify')}
                  >
                    Send verification email
                  </button>
                )}
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => switchMode('password')}
                >
                  Change password
                </button>
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => void accountAction('logout')}
                >
                  Sign out
                </button>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => switchMode('delete')}
                >
                  Delete account
                </button>
              </div>
            ) : (
              <form
                className="login-form"
                onSubmit={(event) => void submit(event)}
                noValidate
                aria-label={titles[mode]}
              >
                {['login', 'register', 'recover'].includes(mode) && (
                  <>
                    <label htmlFor="login-email">Email address</label>
                    <div className="login-input-wrap">
                      <input
                        id="login-email"
                        type="email"
                        autoComplete="email"
                        maxLength={254}
                        disabled={busy || !configured}
                        value={email}
                        aria-invalid={Boolean(error)}
                        aria-describedby={error ? 'auth-result' : undefined}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          setError('');
                        }}
                      />
                    </div>
                  </>
                )}
                {passwordField && (
                  <>
                    <label htmlFor="login-password">
                      {mode === 'password' || mode === 'delete'
                        ? 'Current password'
                        : mode === 'reset'
                          ? 'New password'
                          : 'Password'}
                    </label>
                    <div className="login-input-wrap">
                      <input
                        id="login-password"
                        type={visible ? 'text' : 'password'}
                        autoComplete={
                          ['register', 'reset'].includes(mode) ? 'new-password' : 'current-password'
                        }
                        maxLength={128}
                        disabled={busy || !configured}
                        value={password}
                        aria-invalid={Boolean(error)}
                        aria-describedby={error ? 'auth-result' : undefined}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          setError('');
                        }}
                      />
                      <button
                        type="button"
                        className="login-reveal"
                        disabled={busy}
                        aria-label={visible ? 'Hide password' : 'Show password'}
                        aria-pressed={visible}
                        onClick={() => setVisible(!visible)}
                      >
                        {visible ? <EyeOff size={17} /> : <Eye size={17} />}
                      </button>
                    </div>
                  </>
                )}
                {mode === 'password' && (
                  <>
                    <label htmlFor="new-password">New password</label>
                    <div className="login-input-wrap">
                      <input
                        id="new-password"
                        type="password"
                        autoComplete="new-password"
                        maxLength={128}
                        disabled={busy}
                        value={nextPassword}
                        aria-invalid={Boolean(error)}
                        aria-describedby={error ? 'auth-result' : undefined}
                        onChange={(e) => {
                          setNextPassword(e.target.value);
                          setError('');
                        }}
                      />
                    </div>
                  </>
                )}
                {['register', 'reset', 'password'].includes(mode) && (
                  <p className="login-input-hint">
                    Use 15–128 characters. A long, unique passphrase works well.
                  </p>
                )}
                {mode === 'verify' && <p>Confirm this email address to finish verification.</p>}
                {mode === 'delete' && (
                  <p>
                    Your account and active sessions will be removed. Download any session resume
                    you want to keep first. Provider or backup retention may still apply.
                  </p>
                )}
                <button
                  className="login-submit"
                  type="submit"
                  disabled={
                    busy || !configured || (['register', 'recover'].includes(mode) && !emailEnabled)
                  }
                >
                  {busy ? (
                    <>
                      <LoaderCircle className="spin" size={17} />
                      Working…
                    </>
                  ) : mode === 'login' ? (
                    'Sign in'
                  ) : mode === 'register' ? (
                    'Create account'
                  ) : mode === 'recover' ? (
                    'Send reset link'
                  ) : mode === 'verify' ? (
                    'Verify email'
                  ) : mode === 'reset' ? (
                    'Reset password'
                  ) : mode === 'delete' ? (
                    'Confirm account deletion'
                  ) : (
                    'Update password'
                  )}
                </button>
              </form>
            )}
            {(message || error) && (
              <div
                ref={result}
                id="auth-result"
                tabIndex={-1}
                className={`login-result ${error ? 'error' : 'preview'}`}
                role={error ? 'alert' : 'status'}
              >
                {error || message}
              </div>
            )}
            {mode === 'login' && (
              <div className="account-links">
                <button
                  className="text-button"
                  disabled={busy || !emailEnabled}
                  onClick={() => switchMode('register')}
                >
                  Create an account
                </button>
                <button
                  className="text-button"
                  disabled={busy || !emailEnabled}
                  onClick={() => switchMode('recover')}
                >
                  Forgot password?
                </button>
              </div>
            )}
            {mode !== 'login' && mode !== 'account' && (
              <button
                className="text-button"
                onClick={() => switchMode(session ? 'account' : 'login')}
              >
                Back to {session ? 'account' : 'sign in'}
              </button>
            )}
            <div className="login-divider">
              <span />
              Other ways to sign in
              <span />
            </div>
            <div className="login-provider-options" aria-label="Future OAuth providers">
              <button disabled type="button">
                <span className="provider-google">G</span>
                <span>Google</span>
                <small>Planned</small>
              </button>
              <button disabled type="button">
                <Github size={18} />
                <span>GitHub</span>
                <small>Planned</small>
              </button>
            </div>
            <div className="login-other-methods">
              <span>Passkeys</span>
              <span>Email links</span>
              <small>Possible future options</small>
            </div>
            <p className="login-provider-note">
              Provider options are placeholders. No provider is connected.
            </p>
            <button className="login-guest" onClick={onBack}>
              Keep exploring{session ? '' : ' as a guest'}
              <ArrowRight size={15} />
            </button>
            <p className="login-guest-note">
              No account needed to discover companies or edit your resume.
            </p>
          </div>
        </section>
      </main>
      <footer className="login-footer">
        <span>Made for the possibility next door.</span>
        <span>
          <LockKeyhole size={11} />
          Passwords and private keys never enter browser storage.
        </span>
      </footer>
    </div>
  );
}
