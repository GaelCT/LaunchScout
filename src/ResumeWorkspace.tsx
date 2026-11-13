import { useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import {
  ArrowRight,
  Check,
  CheckCheck,
  Download,
  FileText,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { extractResume, initialMarkdown, MAX_RESUME_CHARS } from './resume';
import type { ResumeDocument } from './resume';
import './resume.css';

const example =
  '# Alex Morgan\n\n## Education\nB.S. Computer Science — Example University, 2026\n\n## Projects\n### Community Garden Planner\n- Built a React application to coordinate volunteer garden shifts.\n- Used TypeScript and SQLite to manage schedules.\n\n## Skills\nTypeScript, React, Python, SQL\n';

export function ResumeWorkspace({
  document: resume,
  enabled,
  onChange,
  onEnabledChange,
}: {
  document: ResumeDocument | null;
  enabled: boolean;
  onChange: (document: ResumeDocument | null) => void;
  onEnabledChange: (value: boolean) => void;
}) {
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');
  const [pasted, setPasted] = useState('');
  const [busy, setBusy] = useState<'import' | 'ai' | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [consent, setConsent] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const sequence = useRef(0);
  const request = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const source = resume?.sourceText ?? pasted;

  useEffect(() => {
    if (!enabled) {
      sequence.current++;
      request.current?.abort();
      setPasted('');
      setConsent(false);
      setBusy(null);
      setError('');
      setMessage('');
      return;
    }
    const abort = new AbortController();
    void fetch('/api/resume/status', { signal: abort.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((value) => setAvailable(value?.available === true))
      .catch(() => {
        if (!abort.signal.aborted) setAvailable(false);
      });
    return () => abort.abort();
  }, [enabled]);
  useEffect(
    () => () => {
      sequence.current++;
      request.current?.abort();
    },
    [],
  );

  function clear() {
    sequence.current++;
    request.current?.abort();
    onChange(null);
    onEnabledChange(false);
    setPasted('');
    setBusy(null);
    setConsent(false);
    setError('');
    setMessage('Resume content removed from this session.');
    if (fileInput.current) fileInput.current.value = '';
  }
  async function importFile(file: File) {
    if (!enabled || busy) return;
    const id = ++sequence.current;
    setBusy('import');
    setError('');
    setMessage('');
    try {
      const result = await extractResume(file);
      if (id !== sequence.current) return;
      onChange(result);
      setTab('edit');
      setConsent(false);
      setMessage(
        'Resume imported locally. Check the extracted text and Markdown before approving.',
      );
    } catch (error) {
      if (id === sequence.current)
        setError(error instanceof Error ? error.message : 'This file could not be imported.');
    } finally {
      if (id === sequence.current) setBusy(null);
    }
  }
  function useSource() {
    if (!source.trim()) return;
    onChange({
      fileName: resume?.fileName ?? 'pasted-resume.txt',
      originalText: resume?.originalText ?? source,
      sourceText: source,
      markdown: initialMarkdown(source),
      reviewed: false,
      aiGenerated: false,
      warnings: [],
    });
    setTab('edit');
    setError('');
    setMessage('Markdown created locally. No AI request was made.');
  }
  async function cleanWithAi() {
    if (!enabled || !consent || !available || busy || !resume || source.trim().length < 20) return;
    const id = ++sequence.current;
    const controller = new AbortController();
    request.current = controller;
    setBusy('ai');
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/resume/normalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ text: source, consent: true }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          typeof result.error === 'string'
            ? result.error
            : 'AI cleanup failed. Your content is unchanged.',
        );
      if (
        typeof result.markdown !== 'string' ||
        !result.markdown.trim() ||
        result.markdown.length > 60_000 ||
        !Array.isArray(result.warnings) ||
        !result.warnings.every((warning: unknown) => typeof warning === 'string')
      )
        throw new Error('AI returned an invalid result. Your content is unchanged.');
      if (id !== sequence.current) return;
      onChange({
        ...resume,
        markdown: result.markdown,
        reviewed: false,
        aiGenerated: true,
        warnings: result.warnings,
      });
      setTab('edit');
      setMessage('AI cleanup ready. Compare it with your original and review every detail.');
    } catch (error) {
      if (id === sequence.current && !controller.signal.aborted)
        setError(
          error instanceof Error ? error.message : 'AI cleanup failed. Your content is unchanged.',
        );
    } finally {
      if (id === sequence.current) setBusy(null);
    }
  }
  function cancel() {
    sequence.current++;
    request.current?.abort();
    setBusy(null);
    setMessage('Canceled. Your content is unchanged.');
  }
  function download() {
    if (!resume?.reviewed || !resume.markdown.trim()) return;
    const url = URL.createObjectURL(
      new Blob([resume.markdown], { type: 'text/markdown;charset=utf-8' }),
    );
    const link = window.document.createElement('a');
    link.href = url;
    link.download = 'resume.md';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage('Markdown downloaded. This copy stays on your device.');
  }

  return (
    <section className="resume-workspace" aria-label="Resume workspace">
      <div className="resume-steps" aria-label="Resume workflow">
        <span className={enabled ? 'complete' : ''}>
          <b>01</b>Bring your story
        </span>
        <ArrowRight size={14} />
        <span className={resume ? 'complete' : ''}>
          <b>02</b>Make it clear
        </span>
        <ArrowRight size={14} />
        <span className={resume?.reviewed ? 'complete' : ''}>
          <b>03</b>Keep it yours
        </span>
        <span className="session-badge">
          <LockKeyhole size={12} />
          SESSION ONLY
        </span>
      </div>
      <div className="resume-consent-card">
        <span className="resume-lock-icon">
          <ShieldCheck size={23} />
        </span>
        <div>
          <h2>Your experience. On your terms.</h2>
          <p>
            Import and edit in this browser. Your original file stays untouched. Resume content
            disappears when you reload or delete it.
          </p>
        </div>
        <label className="workspace-switch">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => (event.target.checked ? onEnabledChange(true) : clear())}
          />
          <span>Enable resume workspace</span>
        </label>
      </div>
      <div className="resume-columns">
        <div className="resume-source-column">
          <section className="resume-panel import-panel">
            <div className="resume-panel-heading">
              <span className="panel-number">01</span>
              <h2>Start with your resume</h2>
            </div>
            <div
              className={`resume-dropzone ${!enabled ? 'disabled' : ''}`}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const file = event.dataTransfer.files[0];
                if (file) void importFile(file);
              }}
            >
              <span className="upload-orbit">
                <Upload size={26} strokeWidth={1.5} />
              </span>
              <h3>
                {busy === 'import'
                  ? 'Reading your resume…'
                  : resume
                    ? 'A fresh version? Drop it here.'
                    : 'A good place to begin.'}
              </h3>
              <p>Drop your resume here or choose a file.</p>
              <button
                className="secondary-button"
                disabled={!enabled || Boolean(busy)}
                onClick={() => fileInput.current?.click()}
              >
                <Upload size={14} />
                Choose a file
              </button>
              <input
                className="sr-only"
                ref={fileInput}
                type="file"
                aria-label="Import resume file"
                accept=".pdf,.docx,.txt,.md"
                disabled={!enabled || Boolean(busy)}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void importFile(file);
                  event.target.value = '';
                }}
              />
              <span className="upload-formats">PDF, DOCX, TXT, MD · up to 5 MB</span>
              <span className="local-parser-note">
                <ShieldCheck size={12} />
                Local parsing. No API key needed.
              </span>
            </div>
            <div className="source-heading">
              <label htmlFor="resume-source">Or paste / correct the extracted text</label>
              <span>{source.length.toLocaleString()} / 30,000</span>
            </div>
            <textarea
              id="resume-source"
              className="source-editor"
              disabled={!enabled || Boolean(busy)}
              maxLength={MAX_RESUME_CHARS}
              value={source}
              placeholder="Your name, experience, education, skills…"
              onChange={(event) => {
                if (resume)
                  onChange({ ...resume, sourceText: event.target.value, reviewed: false });
                else setPasted(event.target.value);
                setMessage('');
              }}
            />
            <div className="source-actions">
              <button
                className="text-button"
                disabled={!enabled || Boolean(busy)}
                onClick={() => {
                  onChange({
                    fileName: 'fictional-example.md',
                    originalText: example,
                    sourceText: example,
                    markdown: example,
                    reviewed: false,
                    aiGenerated: false,
                    warnings: [],
                  });
                  setMessage(
                    'Fictional example loaded. Replace it with your own experience before use.',
                  );
                }}
              >
                Try a fictional example
              </button>
              <button
                className="secondary-button"
                disabled={!enabled || Boolean(busy) || !source.trim()}
                onClick={useSource}
              >
                {resume ? 'Rebuild Markdown' : 'Create Markdown'}
                <ArrowRight size={13} />
              </button>
            </div>
            {resume && (
              <details className="original-text">
                <summary>View original extracted text (unchanged)</summary>
                <pre>{resume.originalText}</pre>
              </details>
            )}
            <details className="offline-parser-tools">
              <summary>Prefer a local Python script?</summary>
              <p>
                Convert on your own computer, then import the resulting Markdown here. No API key,
                account, or running app is needed for the script.
              </p>
              <div className="parser-downloads">
                <a href="/tools/parse_resume.py" download="parse_resume.py">
                  <Download size={13} />
                  Python parser
                </a>
                <a href="/tools/requirements.txt" download="requirements.txt">
                  PDF dependency list
                </a>
              </div>
              <pre>
                <code>
                  {
                    'python -m pip install -r requirements.txt\npython parse_resume.py resume.pdf -o resume.md'
                  }
                </code>
              </pre>
              <p>
                Python 3.10+. Install the dependency once for PDFs. DOCX, TXT, and Markdown need
                only Python. Parsing itself runs offline; review extraction and formatting before
                use.
              </p>
            </details>
          </section>
          <section className="resume-panel ai-panel">
            <div className="resume-panel-heading">
              <span className="ai-icon">
                <Sparkles size={18} />
              </span>
              <h2>A little help, if you want it.</h2>
              <span className="optional-label">OPTIONAL</span>
            </div>
            <p>
              Ask AI to organize headings, spacing, and bullets. Your facts should stay the
              same—always review the result.
            </p>
            {enabled && available === false && (
              <div className="ai-unavailable">
                AI cleanup isn’t enabled here. Local parsing, editing, previews, and Markdown
                downloads need no API key.
              </div>
            )}
            <label className="ai-consent">
              <input
                type="checkbox"
                checked={consent}
                disabled={!enabled || Boolean(busy)}
                onChange={(event) => setConsent(event.target.checked)}
              />
              <span>
                I agree to send the extracted text above to OpenAI for this cleanup. Contact details
                in that text will be included.
              </span>
            </label>
            <details className="provider-details">
              <summary>What leaves my browser?</summary>
              <p>
                Only the extracted text above is sent through LaunchScout’s local server to OpenAI
                when you click the button. You can remove personal details first. We don’t save it
                on the server. Provider retention may still apply; deleting here cannot recall an
                already submitted request.
              </p>
              <a
                href="https://developers.openai.com/api/docs/guides/your-data"
                target="_blank"
                rel="noreferrer"
              >
                OpenAI data controls ↗
              </a>
            </details>
            <button
              className="ai-cleanup-button"
              disabled={
                !enabled ||
                !resume ||
                !consent ||
                !available ||
                Boolean(busy) ||
                source.trim().length < 20
              }
              onClick={() => void cleanWithAi()}
            >
              {busy === 'ai' ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}
              {busy === 'ai' ? 'Organizing your resume…' : 'Clean up with AI'}
            </button>
            {busy === 'ai' && (
              <button className="text-button" onClick={cancel}>
                Cancel cleanup
              </button>
            )}
          </section>
        </div>
        <section className="resume-panel resume-workbench">
          <div className="workbench-heading">
            <span className="document-icon">
              <FileText size={20} />
            </span>
            <div>
              <h2>
                resume<span>.md</span>
              </h2>
              <p>{resume ? resume.fileName : 'A clearer version of your story'}</p>
            </div>
            <span className={`review-state ${resume?.reviewed ? 'reviewed' : ''}`}>
              {resume?.reviewed ? <CheckCheck size={13} /> : <span className="review-dot" />}
              {resume?.reviewed ? 'Reviewed' : 'Needs review'}
            </span>
          </div>
          <div
            className="workbench-tabs"
            role="tablist"
            aria-label="Resume document view"
            onKeyDown={(event) => {
              if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
                event.preventDefault();
                const next =
                  event.key === 'Home'
                    ? 'edit'
                    : event.key === 'End'
                      ? 'preview'
                      : tab === 'edit'
                        ? 'preview'
                        : 'edit';
                setTab(next);
                window.document.getElementById(`resume-${next}-tab`)?.focus();
              }
            }}
          >
            <button
              id="resume-edit-tab"
              role="tab"
              aria-selected={tab === 'edit'}
              aria-controls="resume-document-panel"
              tabIndex={tab === 'edit' ? 0 : -1}
              onClick={() => setTab('edit')}
            >
              Markdown editor
            </button>
            <button
              id="resume-preview-tab"
              role="tab"
              aria-selected={tab === 'preview'}
              aria-controls="resume-document-panel"
              tabIndex={tab === 'preview' ? 0 : -1}
              onClick={() => setTab('preview')}
            >
              Reading preview
            </button>
            <span>
              <LockKeyhole size={11} />
              Private to this session
            </span>
          </div>
          <div
            id="resume-document-panel"
            className="document-panel"
            role="tabpanel"
            aria-labelledby={`resume-${tab}-tab`}
          >
            {tab === 'edit' ? (
              <textarea
                className="markdown-editor"
                aria-label="Resume Markdown"
                spellCheck={false}
                disabled={!enabled || Boolean(busy)}
                maxLength={60_000}
                value={resume?.markdown ?? ''}
                placeholder={
                  '# Your name\n\n## Experience\nYour story belongs here.\n\n## Education\n\n## Projects\n\n## Skills'
                }
                onChange={(event) => {
                  const value = event.target.value;
                  onChange(
                    resume
                      ? { ...resume, markdown: value, reviewed: false }
                      : {
                          fileName: 'resume.md',
                          originalText: '',
                          sourceText: value.slice(0, MAX_RESUME_CHARS),
                          markdown: value,
                          reviewed: false,
                          aiGenerated: false,
                          warnings: [],
                        },
                  );
                  setMessage('');
                }}
              />
            ) : (
              <div className="markdown-preview">
                {resume?.markdown.trim() ? (
                  <Markdown
                    skipHtml
                    components={{ img: () => null, a: ({ children }) => <span>{children}</span> }}
                  >
                    {resume.markdown}
                  </Markdown>
                ) : (
                  <div className="preview-empty">
                    <FileText size={34} strokeWidth={1} />
                    <h3>A fresh page, just for you.</h3>
                    <p>
                      Import a resume or start writing in the editor. Your reading preview will
                      appear here.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
          {resume?.aiGenerated && (
            <div className="ai-generated-label">
              <Sparkles size={13} />
              AI-assisted formatting · Compare with the original before approval.
            </div>
          )}
          {Boolean(resume?.warnings.length) && (
            <div className="resume-warnings">
              <strong>A few details to check</strong>
              <ul>
                {resume!.warnings.map((warning, index) => (
                  <li key={index}>{warning}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="review-check">
            <label>
              <input
                type="checkbox"
                checked={resume?.reviewed ?? false}
                disabled={!resume?.markdown.trim() || Boolean(busy)}
                onChange={(event) =>
                  resume && onChange({ ...resume, reviewed: event.target.checked })
                }
              />
              <span>I’ve checked the details. This accurately represents my experience.</span>
            </label>
            <p>AI can make mistakes. Check names, dates, qualifications, and every achievement.</p>
          </div>
          <div className="workbench-footer">
            <button className="delete-resume" disabled={!enabled && !resume} onClick={clear}>
              <Trash2 size={15} />
              Delete resume
            </button>
            <button
              className="primary-button"
              disabled={!resume?.reviewed || !resume.markdown.trim() || Boolean(busy)}
              onClick={download}
            >
              <Download size={15} />
              Download Markdown
            </button>
          </div>
        </section>
      </div>
      {error && (
        <div className="resume-error" role="alert">
          <X size={17} />
          {error}
        </div>
      )}
      <div className="resume-status" role="status">
        {message && (
          <>
            <Check size={15} />
            {message}
          </>
        )}
      </div>
      <div className="resume-bottom-note">
        <ShieldCheck size={14} />
        <p>
          Your original file stays yours. This workspace prepares a reusable resume;
          company-specific outreach is the next step. Download anything you want to keep before
          leaving or reloading.
        </p>
      </div>
    </section>
  );
}
