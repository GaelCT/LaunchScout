import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, PointerEvent, ReactNode } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileText,
  Inbox,
  LockKeyhole,
  Mail,
  Moon,
  RotateCcw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  X,
} from 'lucide-react';
import type { Company, Filters, Theme } from './types';
import { COMPANIES, ECOSYSTEM_RESOURCES, filterOptions, STUDENT_PROGRAMS } from './data';
import { loadPreferences, savePreferences } from './storage';
import { getVerifiedPublicEmail, safeExternalUrl, safePublicContactUrl } from './urls';
import { ResumeWorkspace } from './ResumeWorkspace';
import { LoginPage } from './LoginPage';

const DEFAULT_FILTERS: Filters = { city: '', companyType: '', industry: '', opportunity: '' };
const RESEARCH_DATE = 'November 13, 2026';

type View = 'discover' | 'saved' | 'passed' | 'resume' | 'login';
type DetailTab = 'details' | 'outreach';
type OutreachGoal = 'internship' | 'coffee' | 'role';

interface Props {
  children: ReactNode;
  className?: string;
}

function Button({ children, className = '', ...props }: Props & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`button ${className}`} {...props}>{children}</button>;
}

function CompanyDetails({ company, onClose }: { company: Company; onClose: () => void }) {
  const [tab, setTab] = useState<DetailTab>('details');
  const [goal, setGoal] = useState<OutreachGoal>('internship');
  const [role, setRole] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [copied, setCopied] = useState(false);
  const publicContact = safePublicContactUrl(company.publicLinks.contact);
  const publicEmail = getVerifiedPublicEmail(publicContact);

  useEffect(() => {
    setRole(company.openings.find((opening) => opening.status !== 'closed')?.title ?? company.openings[0]?.title ?? '');
  }, [company]);

  useEffect(() => {
    const templates = {
      internship: {
        subject: `Internship question for ${company.name}`,
        body: `Hello ${company.name} team,\n\nI am a local student interested in learning about internship opportunities. I would appreciate any guidance on upcoming roles or the best way to apply.\n\nThank you for your time.`,
      },
      coffee: {
        subject: `Coffee chat request — ${company.name}`,
        body: `Hello ${company.name} team,\n\nI am a local student exploring career paths and would be grateful for a brief conversation about your work and experience. Please let me know if you would be open to a short coffee chat.\n\nThank you.`,
      },
      role: {
        subject: `Question about ${role || 'an open role'} at ${company.name}`,
        body: `Hello ${company.name} team,\n\nI am interested in ${role || 'an open role'} and would like to learn more about the position and application process. I would appreciate any information you can share.\n\nThank you.`,
      },
    };
    setSubject(templates[goal].subject);
    setBody(templates[goal].body);
    setCopied(false);
  }, [company, goal, role]);

  const mailtoHref = createMailtoHref(publicEmail, subject, body);
  const draftText = `To: ${publicEmail ?? 'Choose the appropriate public recipient'}\nSubject: ${subject}\n\n${body}`;

  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(draftText);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="company-dialog" role="dialog" aria-modal="true" aria-labelledby="company-dialog-title">
        <div className="dialog-topline">
          <span className="eyebrow">{company.city} · {company.companyType}</span>
          <button className="icon-button" onClick={onClose} aria-label="Close company details"><X size={20} /></button>
        </div>
        <h2 id="company-dialog-title">{company.name}</h2>
        <div className="dialog-tabs" role="tablist" aria-label="Company information">
          <button role="tab" aria-selected={tab === 'details'} onClick={() => setTab('details')}>Company details</button>
          <button role="tab" aria-selected={tab === 'outreach'} onClick={() => setTab('outreach')}>Outreach draft</button>
        </div>
        {tab === 'details' ? (
          <div className="dialog-scroll">
            <p className="dialog-description">{company.description}</p>
            <div className="detail-facts">
              <div><span>Local connection</span><strong>{company.localConnection}</strong></div>
              <div><span>Industries</span><strong>{company.industries.join(' · ')}</strong></div>
              {company.teamSize && <div><span>Reported team size</span><strong>{company.teamSize}</strong></div>}
              {company.yearFounded && <div><span>Founded</span><strong>{company.yearFounded}</strong></div>}
            </div>
            <div className="research-note"><ShieldCheck size={17} /><p>Research snapshot from {RESEARCH_DATE}. Role details and status are not live; confirm them on the employer’s current page.</p></div>
            <section className="detail-section">
              <h3>Reported opportunities</h3>
              {company.openings.length ? company.openings.map((opening) => {
                const applicationUrl = safeExternalUrl(opening.applicationUrl);
                return (
                  <article className="opening" key={opening.id}>
                    <div className="opening-heading"><div><span className={`status status-${opening.status}`}>{opening.status === 'open-snapshot' ? 'Open in snapshot' : opening.status}</span><h4>{opening.title}</h4></div>{applicationUrl ? <a href={applicationUrl} target="_blank" rel="noopener noreferrer" aria-label={`View role or application for ${opening.title}`}>View role / application <ArrowUpRight size={15} /></a> : <span className="muted">Application link unavailable because the recorded URL is not valid HTTPS.</span>}</div>
                    <dl className="opening-facts">
                      <div><dt>Type</dt><dd>{opening.type}</dd></div>
                      <div><dt>Location</dt><dd>{opening.location}</dd></div>
                      <div><dt>Compensation</dt><dd>{opening.pay}</dd></div>
                      <div><dt>Education</dt><dd>{opening.education}</dd></div>
                      <div><dt>Experience</dt><dd>{opening.experience}</dd></div>
                      <div><dt>Timing</dt><dd>{opening.schedule}</dd></div>
                      <div><dt>Apply by</dt><dd>{opening.applyBy ?? 'Not listed'}</dd></div>
                      <div><dt>Source checked</dt><dd>{opening.checkedOn}</dd></div>
                    </dl>
                    <div className="requirements"><div><h5>Requirements</h5><ul>{opening.requirements.map((item) => <li key={item}>{item}</li>)}</ul></div><div><h5>Preferred</h5><ul>{opening.preferred.length ? opening.preferred.map((item) => <li key={item}>{item}</li>) : <li>Not listed</li>}</ul></div></div>
                    <p className="opening-notes">{opening.notes}</p>
                  </article>
                );
              }) : <p className="muted">No relevant public student or entry-level opening was found in this snapshot. This does not mean the company has no opportunities.</p>}
            </section>
            <section className="detail-section">
              <h3>Potential student skill fit</h3>
              <p className="muted">Editorial guidance based on the work described in the sources — not an employer requirement or hiring claim.</p>
              <div className="skill-list">{company.studentSkillFit.map((skill) => <span key={skill}>{skill}</span>)}</div>
            </section>
            {company.notes && <section className="detail-section"><h3>Research notes</h3><p>{company.notes}</p></section>}
            <section className="detail-section sources">
              <h3>Sources</h3>
              {company.sources.map((source) => {
                const sourceUrl = safeExternalUrl(source.url);
                return <div className="source-row" key={`${source.label}-${source.url}`}><div>{sourceUrl ? <a href={sourceUrl} target="_blank" rel="noopener noreferrer">{source.label} <ExternalLink size={13} /></a> : <span>{source.label}</span>}<span>Checked {source.checkedOn}</span></div><p>{source.supports}</p>{!sourceUrl && <p className="source-unavailable">Source link unavailable because the recorded URL is not valid HTTPS.</p>}</div>;
              })}
            </section>
            <section className="detail-section">
              <h3>Public contact</h3>
              {publicContact ? <a className="contact-link" href={publicContact} target={publicContact.startsWith('https:') ? '_blank' : undefined} rel={publicContact.startsWith('https:') ? 'noopener noreferrer' : undefined}>Public contact route <ArrowUpRight size={15} /></a> : <p className="muted">No public contact route listed. Do not assume or invent a recipient.</p>}
            </section>
          </div>
        ) : (
          <div className="outreach-panel">
            <div className="outreach-intro"><Mail size={20} /><div><h3>Start with an editable draft</h3><p>Uses only this company’s public research record. LaunchScout does not send emails or access your inbox.</p></div></div>
            <fieldset className="goal-picker"><legend>What is your goal?</legend>{([['internship', 'Ask about internships'], ['coffee', 'Request a coffee chat'], ['role', 'Ask about a desired role']] as const).map(([value, label]) => <label key={value} className={goal === value ? 'selected' : ''}><input type="radio" name="goal" value={value} checked={goal === value} onChange={() => setGoal(value)} />{label}</label>)}</fieldset>
            {goal === 'role' && <label className="field"><span>Desired role</span><input value={role} onChange={(event) => setRole(event.target.value)} placeholder="Role you want to ask about" list="company-roles" /><datalist id="company-roles">{company.openings.map((opening) => <option key={opening.id} value={opening.title} />)}</datalist></label>}
            <div className="recipient-note"><span>Recipient</span><strong>{publicEmail ?? 'No public email prefilled'}</strong><p>{publicEmail ? 'This is the public contact listed in the research record.' : 'Add the appropriate public recipient in your email app, or use the company’s public contact route.'}</p></div>
            <label className="field"><span>Subject</span><input value={subject} onChange={(event) => { setSubject(event.target.value); setCopied(false); }} /></label>
            <label className="field"><span>Your message</span><textarea value={body} onChange={(event) => { setBody(event.target.value); setCopied(false); }} rows={9} /></label>
            <p className="draft-disclosure">Review and personalize this template before sending. No qualifications, role availability, or company interest is inferred.</p>
            <div className="outreach-actions"><a className={`button primary ${!mailtoHref ? 'disabled-link' : ''}`} href={mailtoHref ?? undefined} aria-disabled={!mailtoHref} onClick={(event) => { if (!mailtoHref) event.preventDefault(); }}><Mail size={17} />Open email draft</a><Button onClick={copyDraft}>{copied ? <Check size={17} /> : <FileText size={17} />}{copied ? 'Copied' : 'Copy draft'}</Button></div>
            {!publicEmail && <p className="muted small">Open email draft is unavailable without a listed public email. You can still copy the message.</p>}
          </div>
        )}
        {tab === 'details' && <div className="dialog-footer"><Button className="primary" onClick={() => setTab('outreach')}>Make an outreach draft <ArrowRight size={17} /></Button></div>}
      </section>
    </div>
  );
}

function createMailtoHref(email: string | null, subject: string, body: string) {
  if (!email) return null;
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function CompanyCard({ company, saved, onSave, onPass, onOpen, motion, onMotionEnd }: { company: Company; saved: boolean; onSave: () => void; onPass: () => void; onOpen: () => void; motion: 'left' | 'right' | null; onMotionEnd: () => void }) {
  const [dragX, setDragX] = useState(0);
  const startX = useRef<number | null>(null);
  const moved = useRef(false);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function pointerDown(event: PointerEvent<HTMLElement>) {
    if ((event.target as HTMLElement).closest('button, a')) return;
    startX.current = event.clientX;
    moved.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function pointerMove(event: PointerEvent<HTMLElement>) {
    if (startX.current === null || reducedMotion) return;
    const delta = event.clientX - startX.current;
    if (Math.abs(delta) > 6) moved.current = true;
    setDragX(delta);
  }

  function pointerUp(event: PointerEvent<HTMLElement>) {
    if (startX.current === null) return;
    const delta = event.clientX - startX.current;
    startX.current = null;
    setDragX(0);
    if (Math.abs(delta) > 90) delta > 0 ? onSave() : onPass();
    else if (!moved.current && !(event.target as HTMLElement).closest('button, a')) onOpen();
  }

  function keyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'ArrowRight') { event.preventDefault(); onSave(); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); onPass(); }
    if (event.key === 'Enter') { event.preventDefault(); onOpen(); }
  }

  const style = {
    '--drag-x': `${dragX}px`,
    '--drag-rotate': `${reducedMotion ? 0 : dragX / 24}deg`,
  } as CSSProperties;

  return (
    <article className={`company-card ${motion ? `fly-${motion}` : ''}`} style={style} tabIndex={0} onKeyDown={keyDown} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={() => { startX.current = null; setDragX(0); }} onAnimationEnd={motion ? onMotionEnd : undefined} aria-label={`${company.name} company card. Press Enter for details, right arrow to save, left arrow to pass.`}>
      <div className="card-accent" />
      <div className="card-content">
        <div className="card-top"><span className="company-type">{company.companyType}</span><span className="card-location">{company.city}</span></div>
        <div className="company-mark" aria-hidden="true">{company.name.split(/\s+/).slice(0, 2).map((word) => word[0]).join('')}</div>
        <h2>{company.name}</h2>
        <p className="card-description">{company.description}</p>
        <div className="industry-list">{company.industries.slice(0, 3).map((industry) => <span key={industry}>{industry}</span>)}</div>
        <div className="card-role">
          <span className="eyebrow">{company.openings.length ? 'Latest role snapshot' : 'Research snapshot'}</span>
          {company.openings.length ? <><strong>{company.openings[0].title}</strong><span>{company.openings[0].type} · {company.openings[0].location}</span></> : <strong>No public student role found in this snapshot</strong>}
        </div>
        <div className="card-bottom"><span><ShieldCheck size={15} /> Researched {RESEARCH_DATE}</span><button className="text-button" onClick={onOpen}>View {company.name} details & sources <ArrowUpRight size={16} /></button></div>
      </div>
      <div className="swipe-hint pass-hint">PASS</div><div className="swipe-hint save-hint">SAVE</div>
      {saved && <div className="saved-indicator"><Bookmark size={15} fill="currentColor" /> Saved</div>}
    </article>
  );
}

function FilterPanel({ filters, onChange, onClose, mobile = false }: { filters: Filters; onChange: (filters: Filters) => void; onClose?: () => void; mobile?: boolean }) {
  const fields: Array<{ key: keyof Filters; label: string; values: string[] }> = [
    { key: 'city', label: 'Community', values: filterOptions.cities },
    { key: 'companyType', label: 'Organization', values: filterOptions.companyTypes },
    { key: 'industry', label: 'Industry', values: filterOptions.industries },
    { key: 'opportunity', label: 'Role type', values: filterOptions.opportunities },
  ];
  const active = Object.values(filters).filter(Boolean).length;
  return (
    <div className={`filter-panel ${mobile ? 'mobile-filter-panel' : ''}`}>
      <div className="filter-title"><div><SlidersHorizontal size={18} /><h2>Refine discover</h2></div>{mobile && <button className="icon-button" onClick={onClose} aria-label="Close filters"><X size={20} /></button>}</div>
      <p>Match the dated research snapshot to what you want to explore.</p>
      {fields.map((field) => <label className="filter-field" key={field.key}><span>{field.label}</span><div className="select-wrap"><select value={filters[field.key]} onChange={(event) => onChange({ ...filters, [field.key]: event.target.value })}><option value="">All {field.label.toLowerCase()}s</option>{field.values.map((value) => <option key={value} value={value}>{value}</option>)}</select><ChevronDown size={16} /></div></label>)}
      {active > 0 && <button className="clear-filters" onClick={() => onChange(DEFAULT_FILTERS)}><RotateCcw size={14} /> Clear {active} filter{active === 1 ? '' : 's'}</button>}
      {mobile && <Button className="primary apply-filters" onClick={onClose}>Show matching companies</Button>}
    </div>
  );
}

function Collection({ title, companies, emptyTitle, emptyText, actionLabel, onAction, onOpen }: { title: string; companies: Company[]; emptyTitle: string; emptyText: string; actionLabel: string; onAction: (company: Company) => void; onOpen: (company: Company) => void }) {
  return (
    <section className="collection-view">
      <div className="view-heading"><span className="eyebrow">Your collection</span><h1>{title}</h1><p>{companies.length} {companies.length === 1 ? 'company' : 'companies'} · Stored only in this browser</p></div>
      {companies.length ? <div className="collection-grid">{companies.map((company) => <article className="collection-card" key={company.id}><div className="card-top"><span className="company-type">{company.companyType}</span><span className="card-location">{company.city}</span></div><h2>{company.name}</h2><p>{company.description}</p><div className="industry-list">{company.industries.slice(0, 2).map((industry) => <span key={industry}>{industry}</span>)}</div><div className="collection-actions"><Button onClick={() => onOpen(company)}>Details & sources</Button><button className="text-button" onClick={() => onAction(company)}>{actionLabel} <ArrowRight size={15} /></button></div></article>)}</div> : <div className="empty-state"><Inbox size={38} /><h2>{emptyTitle}</h2><p>{emptyText}</p></div>}
    </section>
  );
}

function ResearchPanel({ onClose }: { onClose?: () => void }) {
  return (
    <div className="research-panel">
      <div className="filter-title"><div><FileText size={18} /><h2>Research notes</h2></div>{onClose && <button className="icon-button" onClick={onClose} aria-label="Close research notes"><X size={20} /></button>}</div>
      <p>A dated snapshot, not a live job feed. Check the linked source before applying.</p>
      <section><h3>Student programs</h3>{STUDENT_PROGRAMS.map((program) => <article className="mini-research-card" key={program.id}><div><h4>{program.name}</h4><span>{program.organization} · {program.city}</span></div><p>{program.description}</p><p className="mini-meta">{program.timing}<br />{program.eligibility}</p><a href={program.url} target="_blank" rel="noopener noreferrer">Program source <ArrowUpRight size={13} /></a><small>Checked {program.checkedOn}</small></article>)}</section>
      <section><h3>Local ecosystem</h3>{ECOSYSTEM_RESOURCES.map((resource) => <article className="mini-research-card" key={resource.id}><div><h4>{resource.name}</h4><span>{resource.city}</span></div><p>{resource.description}</p><a href={resource.url} target="_blank" rel="noopener noreferrer">Resource source <ArrowUpRight size={13} /></a><small>Checked {resource.checkedOn}</small></article>)}</section>
      <a className="repository-link" href="https://github.com/GaelCT/LaunchScout/issues/1" target="_blank" rel="noopener noreferrer">View the research handoff <ExternalLink size={14} /></a>
    </div>
  );
}

function PrivacyDialog({ onClose, onClear }: { onClose: () => void; onClear: (scope: 'decisions' | 'filters' | 'theme' | 'resume' | 'all') => void }) {
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="privacy-dialog" role="dialog" aria-modal="true" aria-labelledby="privacy-title">
        <div className="dialog-topline"><span className="eyebrow">Local by design</span><button className="icon-button" onClick={onClose} aria-label="Close privacy controls"><X size={20} /></button></div>
        <div className="privacy-icon"><LockKeyhole size={25} /></div><h2 id="privacy-title">Privacy & your data</h2>
        <p>Saved and passed company IDs, filters, and theme are stored in this browser’s localStorage. They do not sync across devices or browsers.</p>
        <div className="privacy-fact"><ShieldCheck size={18} /><span>No account, analytics, or server database is used for discovery preferences.</span></div>
        <p>Resume imports stay in session memory only. Outreach drafts stay in the open dialog. A mailto draft or clipboard copy is handled by your device. Deleting data here does not delete downloaded files or your email app’s drafts.</p>
        <div className="privacy-actions"><Button onClick={() => onClear('decisions')}>Clear saved & passed</Button><Button onClick={() => onClear('filters')}>Reset filters</Button><Button onClick={() => onClear('theme')}>Reset appearance</Button><Button onClick={() => onClear('resume')}>Delete session resume</Button><Button className="danger-button" onClick={() => onClear('all')}>Clear all local data</Button></div>
      </section>
    </div>
  );
}

export default function App() {
  const [initial] = useState(loadPreferences);
  const [view, setView] = useState<View>('discover');
  const [saved, setSaved] = useState<string[]>(initial.saved);
  const [rejected, setRejected] = useState<string[]>(initial.rejected);
  const [filters, setFilters] = useState<Filters>(initial.filters);
  const [theme, setTheme] = useState<Theme>(initial.theme);
  const [selected, setSelected] = useState<Company | null>(null);
  const [undo, setUndo] = useState<{ company: Company; action: 'saved' | 'rejected' } | null>(null);
  const [motion, setMotion] = useState<'left' | 'right' | null>(null);
  const [pendingDecision, setPendingDecision] = useState<{ company: Company; action: 'saved' | 'rejected' } | null>(null);
  const [storageWarning, setStorageWarning] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [researchOpen, setResearchOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [resumeReset, setResumeReset] = useState(0);
  const [loginReturnView, setLoginReturnView] = useState<Exclude<View, 'login'>>('discover');
  const modalRef = useRef<'company' | 'filters' | 'research' | 'privacy' | null>(null);
  const modalTriggerRef = useRef<HTMLElement | null>(null);

  const matching = COMPANIES.filter((company) => (!filters.city || company.city === filters.city) && (!filters.companyType || company.companyType === filters.companyType) && (!filters.industry || company.industries.includes(filters.industry)) && (!filters.opportunity || company.openings.some((opening) => opening.type === filters.opportunity)));
  const discover = matching.filter((company) => !saved.includes(company.id) && !rejected.includes(company.id));
  const savedCompanies = COMPANIES.filter((company) => saved.includes(company.id));
  const passedCompanies = COMPANIES.filter((company) => rejected.includes(company.id));
  const current = discover[0];
  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  useEffect(() => {
    if (!savePreferences({ saved, rejected, filters, theme })) setStorageWarning(true);
  }, [saved, rejected, filters, theme]);

  useEffect(() => {
    const activeModal = selected ? 'company' : filtersOpen ? 'filters' : researchOpen ? 'research' : privacyOpen ? 'privacy' : null;
    if (activeModal && !modalRef.current) modalTriggerRef.current = document.activeElement as HTMLElement;
    if (!activeModal && modalRef.current) {
      const trigger = modalTriggerRef.current;
      requestAnimationFrame(() => {
        if (trigger?.isConnected) trigger?.focus();
        else document.querySelector<HTMLElement>('.main-content h1, .main-content button')?.focus();
      });
    }
    modalRef.current = activeModal;
    if (!activeModal) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const frame = requestAnimationFrame(() => {
      const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
      const target = dialog?.querySelector<HTMLElement>('[autofocus], input:not([disabled]), button:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]');
      (target ?? dialog)?.focus();
    });
    function handleKey(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') { setSelected(null); setFiltersOpen(false); setResearchOpen(false); setPrivacyOpen(false); return; }
      if (event.key !== 'Tab') return;
      const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
      const focusable = dialog?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]');
      if (!focusable?.length) { event.preventDefault(); dialog?.focus(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!dialog?.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', handleKey);
    return () => { cancelAnimationFrame(frame); document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', handleKey); };
  }, [selected, filtersOpen, researchOpen, privacyOpen]);

  function changeView(next: View) {
    setSelected(null);
    setFiltersOpen(false);
    setResearchOpen(false);
    if (next !== 'discover') setUndo(null);
    if (next === 'login') {
      if (view !== 'login') setLoginReturnView(view === 'resume' ? 'resume' : view === 'saved' ? 'saved' : view === 'passed' ? 'passed' : 'discover');
      setView('login');
      window.scrollTo({ top: 0 });
      return;
    }
    if (view === 'login') {
      setView(next);
      requestAnimationFrame(() => document.getElementById('main-content')?.focus());
      return;
    }
    setView(next);
    document.getElementById('main-content')?.focus();
  }

  function decide(company: Company, action: 'saved' | 'rejected') {
    if (pendingDecision || selected || filtersOpen || researchOpen || privacyOpen || view !== 'discover' || current?.id !== company.id) return;
    setUndo({ company, action });
    setPendingDecision({ company, action });
    setMotion(action === 'saved' ? 'right' : 'left');
    const persist = () => {
      if (action === 'saved') { setSaved((items) => [...items, company.id]); setRejected((items) => items.filter((id) => id !== company.id)); }
      else { setRejected((items) => [...items, company.id]); setSaved((items) => items.filter((id) => id !== company.id)); }
    };
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      persist();
      setMotion(null);
      setPendingDecision(null);
    } else {
      (decide as typeof decide & { persist?: () => void }).persist = persist;
    }
  }

  function finishMotion() {
    if (pendingDecision) {
      const { company, action } = pendingDecision;
      if (action === 'saved') { setSaved((items) => [...items, company.id]); setRejected((items) => items.filter((id) => id !== company.id)); }
      else { setRejected((items) => [...items, company.id]); setSaved((items) => items.filter((id) => id !== company.id)); }
    }
    setMotion(null);
    setPendingDecision(null);
  }

  function restore(company: Company) {
    setRejected((items) => items.filter((id) => id !== company.id));
    setSaved((items) => items.filter((id) => id !== company.id));
    setUndo(null);
  }

  function removeSaved(company: Company) {
    setSaved((items) => items.filter((id) => id !== company.id));
    setRejected((items) => items.includes(company.id) ? items : [...items, company.id]);
    setUndo(null);
  }

  function clearData(scope: 'decisions' | 'filters' | 'theme' | 'resume' | 'all') {
    if (scope === 'decisions' || scope === 'all') { setSaved([]); setRejected([]); setUndo(null); }
    if (scope === 'filters' || scope === 'all') setFilters(DEFAULT_FILTERS);
    if (scope === 'theme' || scope === 'all') setTheme('light');
    if (scope === 'resume' || scope === 'all') setResumeReset((value) => value + 1);
    if (scope === 'all') setView('discover');
  }

  const navItems: Array<{ id: View; label: string; icon: typeof Search; count?: number }> = [
    { id: 'discover', label: 'Discover', icon: Search },
    { id: 'saved', label: 'Saved', icon: Bookmark, count: saved.length },
    { id: 'passed', label: 'Passed', icon: ArrowLeft, count: rejected.length },
    { id: 'resume', label: 'My resume', icon: FileText },
  ];

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">Skip to content</a>
      <aside className="sidebar">
        <button className="brand" onClick={() => changeView('discover')} aria-label="LaunchScout home"><span className="brand-mark"><ArrowUpRight size={23} /></span><span>Launch<span>Scout</span></span></button>
        <div className="sidebar-label">Find your next step</div>
        <nav aria-label="Main navigation">{navItems.map((item) => <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => changeView(item.id)} aria-current={view === item.id ? 'page' : undefined}><item.icon size={19} /><span>{item.label}</span>{item.count !== undefined && <span className="nav-count">{item.count}</span>}</button>)}</nav>
        <div className="sidebar-spacer" />
        <button className="sidebar-research" onClick={() => setResearchOpen(true)}><FileText size={17} /><span>Research notes</span><ChevronRight size={15} /></button>
        <div className="sidebar-bottom"><div className="local-badge"><ShieldCheck size={16} /><div><strong>Local-first prototype</strong><span>No account needed</span></div></div><button className="sidebar-privacy" onClick={() => setPrivacyOpen(true)}><LockKeyhole size={15} /> Privacy & your data</button></div>
      </aside>

      <header className="mobile-header"><button className="brand" onClick={() => changeView('discover')}><span className="brand-mark"><ArrowUpRight size={20} /></span><span>Launch<span>Scout</span></span></button><div><button className="icon-button" onClick={() => changeView('login')} aria-label="Sign in"><LockKeyhole size={18} /></button><button className="icon-button" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}>{theme === 'light' ? <Moon size={19} /> : <Sun size={19} />}</button><button className="icon-button" onClick={() => setPrivacyOpen(true)} aria-label="Privacy and your data"><ShieldCheck size={19} /></button></div></header>

      <main className="main-content" id="main-content" tabIndex={-1}>
        <div className="desktop-topbar"><div><span className="topbar-dot" /> Kern County research snapshot</div><div className="topbar-actions"><span>{RESEARCH_DATE}</span><button className="sign-in-button" onClick={() => changeView('login')}><LockKeyhole size={15} /> Sign in</button><button className="icon-button" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}>{theme === 'light' ? <Moon size={19} /> : <Sun size={19} />}</button></div></div>
        {view === 'login' ? <LoginPage onBack={() => changeView(loginReturnView)} /> : view === 'resume' ? <ResumeWorkspace resetSignal={resumeReset} /> : view === 'discover' ? (
          <div className="discover-layout">
            <div className="discover-main">
              <div className="discover-heading"><div><span className="eyebrow">Explore closer to home</span><h1>Find work worth<br /><em>showing up for.</em></h1><p>Discover local companies, understand the role, and make your first move.</p></div><button className="mobile-filter-button" onClick={() => setFiltersOpen(true)}><SlidersHorizontal size={17} /> Filters{activeFilterCount > 0 && <span>{activeFilterCount}</span>}</button></div>
              {storageWarning && <div className="storage-warning" role="status">Browser storage is unavailable. Changes will last only for this session.</div>}
              {undo && !pendingDecision && <div className="undo-bar" role="status"><span><Check size={16} /> {undo.company.name} {undo.action === 'saved' ? 'saved' : 'passed'}</span><button onClick={() => restore(undo.company)}><RotateCcw size={15} /> Undo</button><button className="icon-button" onClick={() => setUndo(null)} aria-label="Dismiss undo"><X size={16} /></button></div>}
              <div className="deck-area" aria-live="polite">
                {discover.length > 1 && <div className="deck-card deck-card-back" aria-hidden="true" />}
                {current ? <CompanyCard key={current.id} company={current} saved={saved.includes(current.id)} onSave={() => decide(current, 'saved')} onPass={() => decide(current, 'rejected')} onOpen={() => setSelected(current)} motion={motion} onMotionEnd={finishMotion} /> : <div className="empty-state deck-empty"><Search size={38} /><h2>No companies in this view</h2><p>{matching.length ? 'You have reviewed every matching company. Undo a decision, restore a passed company, or reset your filters.' : 'No researched companies match all these filters. Try widening your search.'}</p>{activeFilterCount > 0 && <Button onClick={() => setFilters(DEFAULT_FILTERS)}>Clear filters</Button>}</div>}
              </div>
              {current && <div className="swipe-controls"><button className="swipe-button pass-button" onClick={() => decide(current, 'rejected')} disabled={!!pendingDecision} aria-label={`Pass on ${current.name}`}><X size={25} /><span>Pass</span></button><div className="deck-progress"><strong>{Math.min(COMPANIES.length - discover.length + 1, COMPANIES.length)} <span>/ {COMPANIES.length}</span></strong><span>{discover.length} remaining{activeFilterCount ? ' in filter' : ''}</span></div><button className="swipe-button save-button" onClick={() => decide(current, 'saved')} disabled={!!pendingDecision} aria-label={`Save ${current.name}`}><Bookmark size={23} /><span>Save</span></button></div>}
              {current && <p className="keyboard-hint"><ArrowLeft size={13} /> Swipe or use arrow keys <ArrowRight size={13} /></p>}
            </div>
            <aside className="desktop-filters"><FilterPanel filters={filters} onChange={setFilters} /><div className="research-teaser"><FileText size={18} /><div><strong>Beyond the job boards</strong><p>Student programs and local founder resources are included too.</p><button onClick={() => setResearchOpen(true)}>Explore research notes <ArrowRight size={14} /></button></div></div></aside>
          </div>
        ) : view === 'saved' ? <Collection title="Saved for later" companies={savedCompanies} emptyTitle="Your shortlist starts here" emptyText="Save a company from Discover to keep its details, role snapshot, and outreach tools close." actionLabel="Remove from saved" onAction={removeSaved} onOpen={setSelected} /> : <Collection title="Passed companies" companies={passedCompanies} emptyTitle="Nothing passed yet" emptyText="Companies you pass will appear here so you can revisit or restore them." actionLabel="Restore to discover" onAction={restore} onOpen={setSelected} />}
        <footer className="app-footer"><span>LaunchScout · Student opportunity discovery</span><span>Research data is a snapshot, not a guarantee of availability.</span></footer>
      </main>

      <nav className="mobile-nav" aria-label="Mobile navigation">{navItems.map((item) => <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => changeView(item.id)} aria-current={view === item.id ? 'page' : undefined} aria-label={item.id === 'resume' ? 'Resume' : item.label}><item.icon size={20} /><span>{item.id === 'resume' ? 'Resume' : item.label}</span>{item.count !== undefined && item.count > 0 && <i>{item.count}</i>}</button>)}</nav>

      {selected && <CompanyDetails company={selected} onClose={() => setSelected(null)} />}
      {filtersOpen && <div className="dialog-backdrop mobile-sheet-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setFiltersOpen(false)}><section className="mobile-sheet" role="dialog" aria-modal="true" aria-label="Discovery filters"><FilterPanel filters={filters} onChange={setFilters} onClose={() => setFiltersOpen(false)} mobile /></section></div>}
      {researchOpen && <div className="dialog-backdrop mobile-sheet-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setResearchOpen(false)}><section className="research-drawer" role="dialog" aria-modal="true" aria-label="Research notes"><ResearchPanel onClose={() => setResearchOpen(false)} /></section></div>}
      {privacyOpen && <PrivacyDialog onClose={() => setPrivacyOpen(false)} onClear={clearData} />}
    </div>
  );
}
