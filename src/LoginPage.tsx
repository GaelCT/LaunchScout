import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Check,
  Compass,
  Eye,
  EyeOff,
  Fingerprint,
  Github,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Sparkles,
  Sprout,
} from 'lucide-react';
import { mockAuthAdapter } from './auth';
import type { AuthAdapter } from './auth';
import './login.css';

interface LoginPageProps {
  brand: ReactNode;
  themeToggle: ReactNode;
  onBack: () => void;
  adapter?: AuthAdapter;
}
type Phase = 'idle' | 'loading' | 'preview' | 'error';

export function LoginPage({
  brand,
  themeToggle,
  onBack,
  adapter = mockAuthAdapter,
}: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [phase, setPhase] = useState<Phase>('idle');
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    headingRef.current?.focus();
    return () => requestRef.current?.abort();
  }, []);
  useEffect(() => {
    if (phase === 'preview' || phase === 'error') statusRef.current?.focus();
  }, [phase]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (requestRef.current) return;
    const next: typeof errors = {};
    if (!email.trim()) next.email = 'Enter a fictional email address to try the preview.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      next.email = 'Use an email format like you@example.com.';
    if (!password) next.password = 'Enter a made-up password for this preview.';
    setErrors(next);
    setPhase('idle');
    if (next.email || next.password) {
      if (next.email) emailRef.current?.focus();
      else passwordRef.current?.focus();
      return;
    }
    const controller = new AbortController();
    requestRef.current = controller;
    setPhase('loading');
    setVisible(false);
    try {
      await adapter.signIn({ email: email.trim(), password }, { signal: controller.signal });
      if (!controller.signal.aborted) setPhase('preview');
    } catch {
      if (!controller.signal.aborted) setPhase('error');
    } finally {
      requestRef.current = null;
      if (!controller.signal.aborted) {
        setEmail('');
        setPassword('');
        setVisible(false);
      }
    }
  }
  function sampleDetails() {
    setEmail('alex@example.com');
    setPassword('demo-only-password');
    setErrors({});
    setPhase('idle');
    setVisible(false);
    emailRef.current?.focus();
  }
  const loading = phase === 'loading';

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
            <p>
              Big ideas have local roots. Find the companies, people, and possibilities worth
              getting to know.
            </p>
          </div>
          <div className="login-illustration" aria-hidden="true">
            <span className="login-art-ring ring-a" />
            <span className="login-art-ring ring-b" />
            <span className="login-art-dot dot-a" />
            <span className="login-art-dot dot-b" />
            <span className="login-compass">
              <Compass size={83} strokeWidth={1} />
            </span>
            <span className="login-art-spark">✳</span>
            <div className="login-floating-card idea-card">
              <span>
                <Sprout size={21} strokeWidth={1.3} />
              </span>
              <div>
                <b>Something good is growing.</b>
                <small>Your neighborhood has possibilities.</small>
              </div>
            </div>
            <div className="login-floating-card bookmark-card">
              <Bookmark size={18} />
              <span>A little curiosity goes a long way.</span>
              <Check size={13} />
            </div>
          </div>
          <div className="login-story-bottom">
            <span className="login-local-stamp">
              <Sprout size={20} />
              <span>
                GROW
                <br />
                FROM HERE
              </span>
            </span>
            <p>
              Discover something meaningful.
              <br />
              <em>One local connection at a time.</em>
            </p>
          </div>
        </section>
        <section className="login-form-section" aria-labelledby="login-title">
          <div className="login-form-content">
            <span className="login-preview-pill">
              <Sparkles size={12} />
              SIGN-IN PREVIEW
            </span>
            <h1 id="login-title" ref={headingRef} tabIndex={-1}>
              A good place
              <br />
              to come back to<span>.</span>
            </h1>
            <p className="login-subtitle">
              A familiar face. A fresh possibility.
              <br />
              Your LaunchScout account will start here.
            </p>
            <div className="login-preview-notice">
              <ShieldCheck size={19} />
              <p>
                <strong>Try the page with fictional details.</strong> This preview doesn’t create an
                account or sign you in. Your inputs aren’t sent or saved.
              </p>
            </div>
            <form
              className="login-form"
              onSubmit={(event) => void submit(event)}
              noValidate
              autoComplete="off"
              aria-label="Sign-in preview"
            >
              <label htmlFor="login-email">Email address</label>
              <div className={`login-input-wrap ${errors.email ? 'invalid' : ''}`}>
                <Mail size={17} />
                <input
                  ref={emailRef}
                  id="login-email"
                  name="preview-email"
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  placeholder="you@example.com"
                  maxLength={254}
                  disabled={loading}
                  value={email}
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={errors.email ? 'login-email-error' : undefined}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setErrors((previous) => ({ ...previous, email: undefined }));
                    setPhase('idle');
                  }}
                />
              </div>
              {errors.email && (
                <p id="login-email-error" className="login-field-error">
                  {errors.email}
                </p>
              )}
              <div className="login-password-label">
                <label htmlFor="login-password">Password</label>
                <button type="button" className="login-soon-link" disabled>
                  Forgot password? <span>Later</span>
                </button>
              </div>
              <div className={`login-input-wrap ${errors.password ? 'invalid' : ''}`}>
                <LockKeyhole size={17} />
                <input
                  ref={passwordRef}
                  id="login-password"
                  name="preview-password"
                  type={visible ? 'text' : 'password'}
                  autoComplete="off"
                  placeholder="Use a made-up password"
                  maxLength={256}
                  disabled={loading}
                  value={password}
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={
                    errors.password ? 'login-password-error' : 'login-password-hint'
                  }
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setErrors((previous) => ({ ...previous, password: undefined }));
                    setPhase('idle');
                  }}
                />
                <button
                  type="button"
                  className="login-reveal"
                  disabled={loading}
                  aria-label={visible ? 'Hide password' : 'Show password'}
                  aria-pressed={visible}
                  onClick={() => setVisible(!visible)}
                >
                  {visible ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
              {errors.password ? (
                <p id="login-password-error" className="login-field-error">
                  {errors.password}
                </p>
              ) : (
                <p id="login-password-hint" className="login-input-hint">
                  This is a demo. Please don’t use a real password.
                </p>
              )}
              <button className="login-submit" type="submit" disabled={loading}>
                {loading ? (
                  <>
                    <LoaderCircle className="spin" size={17} />
                    Trying the preview…
                  </>
                ) : (
                  <>
                    Preview sign in
                    <ArrowRight size={17} />
                  </>
                )}
              </button>
              <button
                type="button"
                className="login-sample"
                disabled={loading}
                onClick={sampleDetails}
              >
                Use example details
              </button>
            </form>
            {(phase === 'preview' || phase === 'error') && (
              <div
                className={`login-result ${phase}`}
                ref={statusRef}
                tabIndex={-1}
                role={phase === 'error' ? 'alert' : 'status'}
              >
                {phase === 'preview' ? (
                  <>
                    <Check size={18} />
                    <p>
                      <strong>Preview complete. You’re still browsing as a guest.</strong> Real
                      sign-in isn’t connected yet. The email and password fields have been cleared.
                    </p>
                  </>
                ) : (
                  <>
                    <ShieldCheck size={18} />
                    <p>
                      <strong>The preview couldn’t finish.</strong> Your fields have been cleared.
                      You can try again or continue as a guest.
                    </p>
                  </>
                )}
              </div>
            )}
            <div className="login-divider">
              <span />
              Other ways to sign in
              <span />
            </div>
            <div className="login-provider-options" aria-label="Future OAuth providers">
              <button disabled type="button">
                <span className="provider-google" aria-hidden="true">
                  G
                </span>
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
              <span>
                <Fingerprint size={14} />
                Passkeys
              </span>
              <span>
                <KeyRound size={14} />
                Email link
              </span>
              <small>Possible future options</small>
            </div>
            <p className="login-provider-note">
              Provider options are placeholders. No provider is connected.
            </p>
            <div className="login-create-account">
              <span>New around here?</span>
              <button disabled>
                Create an account <small>Coming later</small>
              </button>
            </div>
            <button className="login-guest" onClick={onBack}>
              Keep exploring as a guest
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
          <LockKeyhole size={11} />A local preview. No credentials stored.
        </span>
      </footer>
    </div>
  );
}
