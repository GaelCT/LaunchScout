import { useEffect, useId, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import Markdown from 'react-markdown';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Download,
  FileText,
  LoaderCircle,
  RotateCcw,
  Sparkles,
  Trash2,
  Upload,
  WandSparkles,
} from 'lucide-react';
import { extractResumeText, ResumeImportError } from './resume/extract';
import { hasRenderableResume, normalizeResume } from './resume/normalize';
import { EXAMPLE_RESUME } from './resume/example';
import { downloadTextFile } from './resume/download';
import { clearSession, loadSession, saveSession } from './resume/session';
import type { ResumeSession } from './resume/types';

type WorkspaceStatus = 'idle' | 'parsing' | 'editing' | 'cleaning' | 'error';
type EditorTab = 'edit' | 'original' | 'preview';

function blankSession(): ResumeSession {
  return {
    original: '',
    markdown: '',
    fileName: '',
    fileType: '',
    warnings: [],
    aiUsed: false,
    reviewed: false,
    consent: false,
  };
}

export function ResumeWorkspace({ resetSignal = 0 }: { resetSignal?: number }) {
  const inputId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const [enabled, setEnabled] = useState(() => !!loadSession());
  const [session, setSession] = useState<ResumeSession>(() => loadSession() ?? blankSession());
  const [status, setStatus] = useState<WorkspaceStatus>(() => loadSession() ? 'editing' : 'idle');
  const [error, setError] = useState('');
  const [tab, setTab] = useState<EditorTab>('edit');
  const [dragging, setDragging] = useState(false);
  const [providerAvailable, setProviderAvailable] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    fetch('/api/resume/status', { signal: controller.signal })
      .then((response) => response.ok ? response.json() : { available: false })
      .then((data: { available?: boolean }) => { if (mounted.current) setProviderAvailable(!!data.available); })
      .catch(() => { if (mounted.current) setProviderAvailable(false); });
    return () => {
      mounted.current = false;
      controller.abort();
      requestRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (resetSignal > 0) resetWorkspace();
  }, [resetSignal]);

  function resetWorkspace() {
    requestRef.current?.abort();
    requestRef.current = null;
    clearSession();
    setSession(blankSession());
    setEnabled(false);
    setStatus('idle');
    setError('');
    setTab('edit');
    setDownloaded(false);
    if (fileInput.current) fileInput.current.value = '';
  }

  function startWorkspace() {
    setEnabled(true);
    setSession((current) => ({ ...current }));
  }

  function update(patch: Partial<ResumeSession>) {
    const next = { ...session, ...patch };
    setSession(next);
    saveSession(next);
  }

  function editMarkdown(value: string) {
    update({ markdown: value, reviewed: false });
    setDownloaded(false);
  }

  function loadExtracted(original: string, fileName: string, fileType: string) {
    const normalized = normalizeResume(original);
    update({
      original,
      markdown: normalized.markdown,
      fileName,
      fileType,
      warnings: normalized.warnings,
      aiUsed: false,
      reviewed: false,
      consent: false,
    });
    setStatus('editing');
    setTab('edit');
    setError('');
    setDownloaded(false);
    if (fileInput.current) fileInput.current.value = '';
  }

  async function importFile(file?: File) {
    if (!file) return;
    setStatus('parsing');
    setError('');
    setDragging(false);
    try {
      const extracted = await extractResumeText(file);
      if (mounted.current) loadExtracted(extracted.text, file.name, extracted.type);
    } catch (caught) {
      if (!mounted.current) return;
      setStatus(session.original ? 'editing' : 'error');
      setError(caught instanceof ResumeImportError ? caught.message : 'This file could not be read. Try another file or paste the text.');
    }
  }

  function fileChanged(event: ChangeEvent<HTMLInputElement>) {
    void importFile(event.target.files?.[0]);
  }

  function dropped(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (!enabled) setEnabled(true);
    void importFile(event.dataTransfer.files?.[0]);
  }

  function useExample() {
    setEnabled(true);
    loadExtracted(EXAMPLE_RESUME, 'Fictional example — not a real person', 'txt');
  }

  function createFromText() {
    if (session.original.length > 30000) {
      setError('Text is limited to 30,000 characters. Shorten it before rebuilding.');
      return;
    }
    if (!session.original.trim()) {
      setError('Paste your resume text first, or choose a file to import.');
      return;
    }
    const normalized = normalizeResume(session.original);
    update({
      markdown: normalized.markdown,
      warnings: normalized.warnings,
      aiUsed: false,
      reviewed: false,
      fileName: session.fileName || 'Pasted resume',
      fileType: session.fileType || 'txt',
    });
    setStatus('editing');
    setTab('edit');
    setError('');
    setDownloaded(false);
  }

  async function cleanup() {
    if (!session.consent || !hasRenderableResume(session.markdown)) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setStatus('cleaning');
    setError('');
    try {
      const response = await fetch('/api/resume/normalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: session.markdown, consent: true }),
        signal: controller.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Cleanup could not be completed. Your editable Markdown is unchanged.');
      if (!mounted.current || requestRef.current !== controller) return;
      if (typeof data.markdown !== 'string' || !data.markdown.trim()) throw new Error('The provider returned no usable Markdown. Your editable version is unchanged.');
      update({ markdown: data.markdown, warnings: Array.isArray(data.warnings) ? data.warnings : [], aiUsed: true, reviewed: false });
      setStatus('editing');
      setDownloaded(false);
      setTab('edit');
    } catch (caught) {
      if (!mounted.current || controller.signal.aborted) return;
      setStatus('editing');
      setError(caught instanceof Error ? caught.message : 'Cleanup could not be completed. Your editable Markdown is unchanged.');
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
    }
  }

  function download() {
    if (!session.reviewed || !hasRenderableResume(session.markdown)) return;
    downloadTextFile('resume.md', session.markdown);
    setDownloaded(true);
  }

  function deleteResume() {
    if (session.original || session.markdown) {
      if (!window.confirm('Delete the imported original, edits, preview, and AI consent from this browser session?')) return;
    }
    resetWorkspace();
  }

  const busy = status === 'parsing' || status === 'cleaning';
  const hasContent = !!(session.original || session.markdown);
  const characterCount = session.markdown.length;
  const downloadDisabled = !session.reviewed || !hasRenderableResume(session.markdown) || busy;

  return (
    <section className="resume-workspace" aria-labelledby="resume-title">
      <div className="resume-hero">
        <div><span className="eyebrow">A reusable starting point</span><h1 id="resume-title">Your experience.<br /><em>Clearly organized.</em></h1><p>Turn a resume into Markdown you can edit, review, and keep. AI formatting is optional — your document works without it.</p></div>
        <div className="resume-local-badge"><CheckCircle2 size={19} /><div><strong>Private by default</strong><span>Local parsing · no account · session only</span></div></div>
      </div>

      {!enabled ? (
        <div className="resume-onboarding">
          <div className="onboarding-number">01</div>
          <h2>Bring in your current resume</h2>
          <p>Upload a PDF, DOCX, TXT, or Markdown file. PDF and DOCX text is extracted in this browser. You can also paste text instead.</p>
          <div className="onboarding-facts"><span><Check size={16} /> Up to 5 MB</span><span><Check size={16} /> Up to 15 PDF pages</span><span><Check size={16} /> Nothing sent automatically</span></div>
          <div className="onboarding-actions"><button className="button primary" onClick={startWorkspace}><Upload size={18} /> Choose or paste a resume</button><button className="button" onClick={useExample}><FileText size={17} /> Try a fictional example</button></div>
          <p className="resume-fine-print">Use the example to explore without uploading personal information. Enabling the workspace does not upload a file or contact a provider.</p>
          <div className="local-script-callout"><FileText size={21} /><div><h3>Prefer a local Python script?</h3><p>Download an offline parser with the same file limits. PDF support needs <code>pypdf</code>; DOCX, TXT, and Markdown need only Python’s standard library. No Node, account, LLM, or API key.</p><div className="local-script-links"><a href="/tools/parse_resume.py" download="parse_resume.py"><Download size={14} /> Download Python parser</a><a href="/tools/requirements.txt" download="requirements.txt"><Download size={14} /> PDF dependency list</a></div></div></div>
        </div>
      ) : (
        <>
          <div className="resume-toolbar">
            <div className="session-chip"><span className="session-dot" /> Session-only workspace <span>· cleared on reload</span></div>
            <div><button className="text-button" onClick={() => { setSession(blankSession()); clearSession(); setStatus('idle'); setEnabled(false); setError(''); setTab('edit'); requestRef.current?.abort(); }} disabled={busy}><ArrowLeft size={15} /> Start over</button><button className="text-button danger-text" onClick={deleteResume} disabled={busy}><Trash2 size={15} /> Delete resume</button></div>
          </div>

          {!hasContent && (
            <div className="resume-import-grid">
              <div className={`drop-zone ${dragging ? 'dragging' : ''}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={dropped}>
                <input ref={fileInput} id={inputId} type="file" accept=".pdf,.docx,.txt,.md,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={fileChanged} />
                <label htmlFor={inputId}><span className="upload-icon">{status === 'parsing' ? <LoaderCircle className="spin" size={27} /> : <Upload size={27} />}</span><strong>{status === 'parsing' ? 'Reading your document…' : 'Drop your resume here'}</strong><span>or choose a file from your device</span><small>PDF · DOCX · TXT · MD — maximum 5 MB</small></label>
              </div>
              <div className="paste-panel"><div><h2>Paste text instead</h2><p>Useful for scanned PDFs, unsupported documents, or a quick cleanup.</p></div><textarea aria-label="Paste resume text" value={session.original} onChange={(event) => update({ original: event.target.value, fileName: 'Pasted resume', fileType: 'txt' })} placeholder="Paste your name, contact details, experience, education, and skills…" maxLength={30001} /><div className="paste-actions"><span>{session.original.length.toLocaleString()} / 30,000</span><button className="button primary" onClick={createFromText} disabled={!session.original.trim()}>Create Markdown</button></div></div>
            </div>
          )}

          {hasContent && (
            <div className="resume-workbench">
              <div className="workbench-heading"><div><span className="eyebrow">{session.aiUsed ? 'AI-assisted formatting · review required' : 'Editable Markdown'}</span><h2>{session.fileName || 'Pasted resume'}</h2></div><span className="character-count">{characterCount.toLocaleString()} characters</span></div>
              <div className="workspace-tabs" role="tablist" aria-label="Resume views"><button role="tab" aria-selected={tab === 'edit'} onClick={() => setTab('edit')}><FileText size={15} /> Edit Markdown</button><button role="tab" aria-selected={tab === 'preview'} onClick={() => setTab('preview')}><CheckCircle2 size={15} /> Reading preview</button><button role="tab" aria-selected={tab === 'original'} onClick={() => setTab('original')}>Original extraction</button></div>
              <div className="editor-panel">
                {tab === 'edit' ? <textarea ref={editorRef} className="markdown-editor" aria-label="Resume Markdown" value={session.markdown} onChange={(event) => editMarkdown(event.target.value)} spellCheck={false} /> : tab === 'original' ? <pre className="original-extraction">{session.original}</pre> : <article className="markdown-preview"><Markdown skipHtml urlTransform={() => ''} components={{ img: () => null, a: ({ children }) => <span>{children}</span> }}>{session.markdown}</Markdown></article>}
              </div>
              <div className="workbench-actions"><span><Check size={14} /> Manual edits stay in this session until you reload or delete them.</span><div><label className="replace-file-button"><RotateCcw size={15} /> Replace file<input type="file" accept=".pdf,.docx,.txt,.md,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={fileChanged} disabled={busy} /></label><button className="button small-button" onClick={() => setTab('preview')}>Preview</button></div></div>
            </div>
          )}

          {hasContent && (
            <details className="source-corrections"><summary>Correct extracted text or rebuild from pasted text</summary><p>Rebuilding replaces the editable Markdown with a fresh basic conversion. It does not change the original extraction shown above.</p><textarea aria-label="Or paste / correct the extracted text" value={session.original} onChange={(event) => update({ original: event.target.value })} maxLength={30001} rows={8} /><div className="paste-actions"><span>{session.original.length.toLocaleString()} / 30,000</span><button className="button" onClick={createFromText} disabled={!session.original.trim() || busy}>Rebuild Markdown</button></div></details>
          )}

          {error && <div className="resume-message error-message" role="alert"><AlertCircle size={19} /><div><strong>{status === 'parsing' ? 'Reading the file' : 'Action needed'}</strong><p>{error}</p></div><button className="icon-button" onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}
          {session.warnings.length > 0 && <div className="resume-message warning-message"><AlertCircle size={19} /><div><strong>Review these details</strong><ul className="resume-warnings">{session.warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}</ul></div></div>}

          {hasContent && (
            <div className="ai-cleanup-panel">
              <div className="ai-panel-heading"><span className="ai-icon"><WandSparkles size={21} /></span><div><span className="eyebrow">Optional</span><h2>Clean up formatting with AI</h2></div><span className={`provider-status ${providerAvailable ? 'available' : ''}`}><i />{providerAvailable ? 'Local server configured' : 'Not configured'}</span></div>
              <p>Ask for faithful section and bullet cleanup without adding qualifications, removing factual content, or tailoring to a job. The result still needs your review.</p>
              <div className="provider-disclosure"><Sparkles size={17} /><p>When configured, clicking <strong>Clean up with AI</strong> sends only the editable extracted text to the locally configured OpenAI model. The original file, company data, and browser preferences are not sent. Provider retention terms apply.</p></div>
              {!providerAvailable && <p className="provider-help">Manual editing and download work now. To enable this optional action, a local operator must add server-side <code>OPENAI_API_KEY</code> and <code>OPENAI_MODEL</code> settings. Never place a private key in browser code.</p>}
              <label className="consent-check"><input type="checkbox" checked={session.consent} onChange={(event) => update({ consent: event.target.checked })} disabled={!providerAvailable || busy} /><span>I agree to send the extracted text shown in the editor for this one cleanup request.</span></label>
              <div className="ai-actions"><button className="button" onClick={cleanup} disabled={!providerAvailable || !session.consent || busy || !hasRenderableResume(session.markdown)}>{status === 'cleaning' ? <LoaderCircle className="spin" size={17} /> : <WandSparkles size={17} />}{status === 'cleaning' ? 'Cleaning up…' : 'Clean up with AI'}</button>{status === 'cleaning' && <button className="text-button" onClick={() => { requestRef.current?.abort(); setStatus('editing'); setError('Cleanup canceled. Your editable Markdown is unchanged.'); }}>Cancel request</button>}<a href="https://openai.com/policies/row-privacy-policy/" target="_blank" rel="noopener noreferrer">Provider privacy policy</a></div>
            </div>
          )}

          {hasContent && (
            <div className="resume-export-panel">
              <div><span className="eyebrow">Keep your work</span><h2>Review, then download</h2><p>Check names, dates, contact details, experience, and every AI-formatted section. Downloading creates a plain-text <code>resume.md</code> file on your device.</p></div>
              <div className="review-controls"><label className="consent-check"><input type="checkbox" checked={session.reviewed} onChange={(event) => { update({ reviewed: event.target.checked }); setDownloaded(false); }} disabled={!hasRenderableResume(session.markdown) || busy} /><span>I reviewed this Markdown and approve this version for download.</span></label><button className="button primary" onClick={download} disabled={downloadDisabled}><Download size={18} /> Download Markdown</button>{downloaded && <span className="download-success" role="status"><CheckCircle2 size={15} /> Download created. Keep or delete the file on your device as needed.</span>}</div>
            </div>
          )}

          {!hasContent && <div className="resume-bottom-note"><FileText size={17} /><p><strong>Scanned or protected document?</strong> This prototype does not perform OCR or bypass passwords. Paste the text instead. Multi-column extraction may need manual correction.</p></div>}
        </>
      )}
    </section>
  );
}
