import { useEffect, useLayoutEffect, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  Check,
  CheckCheck,
  ChevronDown,
  Compass,
  Copy,
  ExternalLink,
  Leaf,
  MapPin,
  Moon,
  RotateCcw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sprout,
  Sun,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cities, companies, industries, opportunityTypes } from './data';
import type { Company } from './data';
import { emptyFilters, emptyPreferences, loadPreferences, STORAGE_KEY } from './storage';
import type { Filters, Preferences } from './storage';
import { Modal } from './Modal';
import { useCardMotion } from './useCardMotion';
type View = 'discover' | 'saved' | 'passed';
type Decision = {
  id: string;
  wasSaved: boolean;
  wasRejected: boolean;
};
function Brand({ small = false }: { small?: boolean }) {
  return (
    <span className={`brand ${small ? 'brand-small' : ''}`}>
      <span className="brand-mark">
        <Compass size={25} strokeWidth={1.6} />
      </span>
      LaunchScout<span className="brand-dot">.</span>
    </span>
  );
}
function CompanyArt({ company, compact = false }: { company: Company; compact?: boolean }) {
  const ArtIcon =
    company.industry === 'AgTech'
      ? Sprout
      : company.industry === 'Clean energy'
        ? Sparkles
        : company.industry === 'HealthTech'
          ? Users
          : company.industry === 'Climate tech'
            ? Leaf
            : Compass;
  return (
    <div
      className={`company-art ${company.color} ${compact ? 'compact-art' : ''}`}
      aria-hidden="true"
    >
      <span className="art-grid" />
      <span className="art-orbit orbit-one" />
      <span className="art-orbit orbit-two" />
      <span className="art-caption">GROW SOMETHING GOOD</span>
      <span className="art-center">
        <ArtIcon size={76} strokeWidth={1.1} />
      </span>
      <span className="art-spark spark-one">✳</span>
      <span className="art-spark spark-two">+</span>
      <span className="art-bottom">Rooted here. Reaching further.</span>
      <span className="art-coordinate">35° N · 119° W</span>
    </div>
  );
}
export default function App() {
  const [initial] = useState(loadPreferences);
  const [preferences, setPreferences] = useState<Preferences>(initial.preferences);
  const [storageError, setStorageError] = useState(initial.error);
  const [view, setView] = useState<View>('discover');
  const [detail, setDetail] = useState<Company | null>(null);
  const [privacy, setPrivacy] = useState(false);
  const [about, setAbout] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [notice, setNotice] = useState('');
  const [undo, setUndo] = useState<Decision | null>(null);
  const motion = useCardMotion();
  const { suppressClick } = motion;
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = preferences.theme;
  }, [preferences.theme]);
  useEffect(() => {
    try {
      if (
        !preferences.saved.length &&
        !preferences.rejected.length &&
        preferences.theme === 'light' &&
        !Object.values(preferences.filters).some(Boolean)
      )
        localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [preferences]);
  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(''), 6000);
    return () => window.clearTimeout(timeout);
  }, [notice]);
  const filters = preferences.filters;
  const activeFilters = Object.values(filters).filter(Boolean).length;
  const filtered = companies.filter(
    (company) =>
      !preferences.saved.includes(company.id) &&
      !preferences.rejected.includes(company.id) &&
      (!filters.city || company.city === filters.city) &&
      (!filters.industry || company.industry === filters.industry) &&
      (!filters.opportunity || company.opportunities.some((type) => type === filters.opportunity)),
  );
  const current = filtered[0];
  const saved = companies.filter((company) => preferences.saved.includes(company.id));
  const passed = companies.filter((company) => preferences.rejected.includes(company.id));
  function setFilter(key: keyof Filters, value: string) {
    setPreferences((previous) => ({ ...previous, filters: { ...previous.filters, [key]: value } }));
  }
  function decide(company: Company, action: 'save' | 'reject') {
    if (view === 'discover' && current?.id === company.id && !detail) motion.depart(action);
    setUndo({
      id: company.id,
      wasSaved: preferences.saved.includes(company.id),
      wasRejected: preferences.rejected.includes(company.id),
    });
    setPreferences((previous) => ({
      ...previous,
      saved: [
        ...previous.saved.filter((id) => id !== company.id),
        ...(action === 'save' ? [company.id] : []),
      ],
      rejected: [
        ...previous.rejected.filter((id) => id !== company.id),
        ...(action === 'reject' ? [company.id] : []),
      ],
    }));
    setNotice(
      action === 'save'
        ? `${company.name} added to Saved.`
        : `${company.name} passed. It won’t reappear in Discover.`,
    );
  }
  function undoDecision() {
    if (!undo) return;
    setPreferences((previous) => ({
      ...previous,
      saved: [
        ...previous.saved.filter((id) => id !== undo.id),
        ...(undo.wasSaved ? [undo.id] : []),
      ],
      rejected: [
        ...previous.rejected.filter((id) => id !== undo.id),
        ...(undo.wasRejected ? [undo.id] : []),
      ],
    }));
    setUndo(null);
    setNotice('Last action undone.');
  }
  function restore(company: Company) {
    setPreferences((previous) => ({
      ...previous,
      saved: previous.saved.filter((id) => id !== company.id),
      rejected: previous.rejected.filter((id) => id !== company.id),
    }));
    setUndo(null);
    setNotice(`${company.name} returned to Discover.`);
  }
  function clearData(type: 'saved' | 'rejected' | 'filters' | 'theme' | 'all') {
    setPreferences((previous) =>
      type === 'all'
        ? { ...emptyPreferences, filters: { ...emptyFilters } }
        : {
            ...previous,
            [type]: type === 'filters' ? { ...emptyFilters } : type === 'theme' ? 'light' : [],
          },
    );
    setUndo(null);
    setNotice(
      type === 'all'
        ? 'All LaunchScout data cleared from this browser.'
        : `${type === 'rejected' ? 'Passed companies' : type === 'filters' ? 'Filter preferences' : type === 'theme' ? 'Appearance preference' : 'Saved companies'} cleared.`,
    );
  }
  function navItem(key: View, label: string, Icon: LucideIcon, count?: number) {
    return (
      <button
        className={`nav-item ${view === key ? 'active' : ''}`}
        aria-current={view === key ? 'page' : undefined}
        onClick={() => setView(key)}
      >
        <Icon size={20} />
        <span>{label}</span>
        {count !== undefined && <span className="nav-count">{count}</span>}
      </button>
    );
  }
  const filterControls = (
    <>
      <FilterSelect
        label="City"
        value={filters.city}
        options={cities}
        allLabel="All nearby cities"
        onChange={(value) => setFilter('city', value)}
      />
      <FilterSelect
        label="Industry"
        value={filters.industry}
        options={industries}
        allLabel="All industries"
        onChange={(value) => setFilter('industry', value)}
      />
      <FilterSelect
        label="Opportunity"
        value={filters.opportunity}
        options={opportunityTypes}
        allLabel="All opportunities"
        onChange={(value) => setFilter('opportunity', value)}
      />
      <p className="filter-note">Opportunity types are examples in this demo, not live openings.</p>
    </>
  );
  const themeToggle = (
    <button
      className="theme-toggle"
      aria-label={`Switch to ${preferences.theme === 'dark' ? 'light' : 'dark'} theme`}
      title={`Switch to ${preferences.theme === 'dark' ? 'light' : 'dark'} theme`}
      onClick={() =>
        setPreferences((previous) => ({
          ...previous,
          theme: previous.theme === 'dark' ? 'light' : 'dark',
        }))
      }
    >
      {preferences.theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand-link"
          href="#discover"
          aria-label="LaunchScout home"
          onClick={() => setView('discover')}
        >
          <Brand />
        </a>
        <div className="workspace-label">YOUR NEXT CHAPTER</div>
        <nav aria-label="Main navigation">
          {navItem('discover', 'Discover', Compass)}
          {navItem('saved', 'Saved companies', Bookmark, saved.length)}
          {navItem('passed', 'Passed companies', X, passed.length)}
        </nav>
        <div className="sidebar-filters">
          <div className="section-label">
            <span>MAKE IT YOURS</span>
            <SlidersHorizontal size={15} />
          </div>
          {filterControls}
        </div>
        <div className="sidebar-bottom">
          <div className="local-note">
            <span className="local-dot" />A local kind of opportunity.
          </div>
          <button className="privacy-link" onClick={() => setPrivacy(true)}>
            <ShieldCheck size={18} />
            Privacy & your data
            <ArrowUpRight size={14} />
          </button>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Your neighborhood. <span>Your next big thing.</span>
          </div>
          <div className="topbar-right">
            {themeToggle}
            <span className="demo-badge">
              <span />
              DEMO MODE
            </span>
            <button className="about-button" onClick={() => setAbout(true)}>
              About LaunchScout
              <ArrowUpRight size={15} />
            </button>
          </div>
        </header>
        <main id="main-content">
          <div className="mobile-brand">
            <Brand small />
            {themeToggle}
            <button
              className="icon-button"
              aria-label="Privacy and your data"
              onClick={() => setPrivacy(true)}
            >
              <ShieldCheck size={22} />
            </button>
          </div>
          <div className="demo-notice">
            <Sparkles size={16} />
            <span>
              A little preview of what’s possible.{' '}
              <strong>All companies, stats, and opportunities here are fictional.</strong>
            </span>
            <button onClick={() => setAbout(true)} aria-label="Learn about demo data">
              <ArrowUpRight size={17} />
            </button>
          </div>
          {storageError && (
            <div className="storage-warning" role="alert">
              Browser storage is unavailable or could not be read. Your changes may only last for
              this session. Enable site storage to keep your selections.
            </div>
          )}

          <section className="page-intro">
            <div>
              <div className="eyebrow">
                <span />
                {'BAKERSFIELD & BEYOND'}
              </div>
              <h1>
                {view === 'discover' ? (
                  <>
                    Big ideas.
                    <br className="mobile-break" /> Close to home<span>.</span>
                  </>
                ) : view === 'saved' ? (
                  <>
                    Good things, <em>kept close.</em>
                  </>
                ) : (
                  <>
                    Room for <em>something else.</em>
                  </>
                )}
              </h1>
              <p>
                {view === 'discover'
                  ? 'Meet the local companies building something worth being part of.'
                  : view === 'saved'
                    ? 'Your collection of possibilities. Come back when the time feels right.'
                    : 'These companies stay out of Discover until you bring them back.'}
              </p>
            </div>
            <div className="intro-stamp" aria-hidden="true">
              <Sprout size={24} strokeWidth={1.4} />
              <span>
                GROW
                <br />
                FROM HERE
              </span>
            </div>
          </section>

          {
            <div className="content-heading">
              <div className="view-label">
                <span className="live-dot" />
                {view === 'discover'
                  ? 'Your discovery deck'
                  : view === 'saved'
                    ? 'Your saved collection'
                    : 'Your passed companies'}
                <span className="count-pill">
                  {view === 'discover'
                    ? filtered.length
                    : view === 'saved'
                      ? saved.length
                      : passed.length}
                </span>
              </div>
              {view === 'discover' && (
                <button
                  className="filter-toggle"
                  aria-expanded={showFilters}
                  onClick={() => setShowFilters(!showFilters)}
                >
                  <SlidersHorizontal size={15} />
                  Filters{activeFilters > 0 && ` (${activeFilters})`}
                </button>
              )}
              <span className="heading-note">A fresh perspective starts here.</span>
            </div>
          }
          {showFilters && view === 'discover' && (
            <div className="mobile-filters">{filterControls}</div>
          )}
          {view === 'discover' && activeFilters > 0 && (
            <div className="filter-chips">
              {Object.entries(filters)
                .filter(([, value]) => value)
                .map(([key, value]) => (
                  <button key={key} onClick={() => setFilter(key as keyof Filters, '')}>
                    {value}
                    <X size={13} />
                    <span className="sr-only">Remove {key} filter</span>
                  </button>
                ))}
              <button className="clear-filters" onClick={() => clearData('filters')}>
                Reset filters
              </button>
            </div>
          )}

          {view === 'discover' ? (
            <div className="discovery-layout">
              <section className="deck" aria-label="Company discovery deck">
                {current ? (
                  <>
                    <article
                      className={`company-card ${motion.dragX ? 'is-dragging' : ''}`}
                      key={current.id}
                      ref={motion.cardRef}
                      style={
                        motion.dragX
                          ? {
                              transform: `translateX(${motion.dragX}px) rotate(${motion.dragX / 18}deg)`,
                            }
                          : undefined
                      }
                    >
                      {Math.abs(motion.dragX) > 25 && (
                        <span
                          className={`swipe-feedback ${motion.dragX > 0 ? 'save' : 'reject'}`}
                          aria-hidden="true"
                        >
                          {motion.dragX > 0 ? 'KEEP' : 'PASS'}
                        </span>
                      )}
                      <button
                        className="card-open"
                        aria-label={`View ${current.name} details`}
                        onClick={() => {
                          if (!suppressClick.current) setDetail(current);
                          suppressClick.current = false;
                        }}
                        onPointerDown={motion.onPointerDown}
                        onPointerMove={motion.onPointerMove}
                        onPointerCancel={motion.reset}
                        onPointerUp={(event) => {
                          const action = motion.finish(event);
                          if (action) {
                            suppressClick.current = true;
                            decide(current, action);
                          }
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                            event.preventDefault();
                            decide(current, event.key === 'ArrowRight' ? 'save' : 'reject');
                            requestAnimationFrame(() =>
                              document
                                .querySelector<HTMLButtonElement>(
                                  '.card-open, .empty-state .primary-button',
                                )
                                ?.focus(),
                            );
                          }
                        }}
                      >
                        <CompanyArt company={current} />
                        <span className="card-art-badge">
                          <MapPin size={13} />
                          {current.city}, CA
                        </span>
                        <span className="sample-tag">FICTIONAL COMPANY</span>
                        <div className="card-content">
                          <div className="company-title-row">
                            <span className={`company-logo ${current.color}`}>
                              {current.initials}
                              <span>↗</span>
                            </span>
                            <span className="industry-tag">{current.industry}</span>
                            <ArrowUpRight className="details-arrow" size={22} />
                          </div>
                          <h2>{current.name}</h2>
                          <p className="company-tagline">{current.tagline}</p>
                          <p className="company-description">{current.description}</p>
                          <div className="opportunity-tags">
                            {current.opportunities.length ? (
                              current.opportunities.map((type) => (
                                <span key={type}>
                                  <span />
                                  {type} <small>· sample</small>
                                </span>
                              ))
                            ) : (
                              <span>Opportunities unknown</span>
                            )}
                          </div>
                          <div className="card-meta">
                            <span>
                              <ShieldCheck size={14} />
                              Demo listing · Not verified
                            </span>
                            <span>
                              Explore company
                              <ArrowRight size={14} />
                            </span>
                          </div>
                        </div>
                      </button>
                    </article>
                    <div className="deck-actions">
                      <button
                        className="action-circle undo-action"
                        disabled={!undo}
                        onClick={undoDecision}
                        aria-label="Undo last action"
                      >
                        <RotateCcw size={20} />
                      </button>
                      <button className="pass-button" onClick={() => decide(current, 'reject')}>
                        <X size={23} />
                        <span>Pass for now</span>
                      </button>
                      <button className="save-button" onClick={() => decide(current, 'save')}>
                        <Bookmark size={20} />
                        <span>Save company</span>
                      </button>
                    </div>
                    <p className="swipe-hint">
                      Swipe left to pass, right to save. Or use the buttons above.
                    </p>
                    <p className="keyboard-hint">
                      Focused on a card? Use <kbd>←</kbd> <kbd>→</kbd>
                    </p>
                  </>
                ) : (
                  <div className="empty-state">
                    <span className="empty-icon">
                      <CheckCheck size={34} />
                    </span>
                    <h2>
                      {activeFilters
                        ? 'No companies match just yet.'
                        : 'You’ve explored the whole neighborhood.'}
                    </h2>
                    <p>
                      {activeFilters
                        ? 'Try a different city, industry, or opportunity. Passed companies stay hidden.'
                        : 'Your saved companies are waiting for you. You can also bring passed companies back to your deck.'}
                    </p>
                    <button
                      className="primary-button"
                      onClick={() => (activeFilters ? clearData('filters') : setView('saved'))}
                    >
                      {activeFilters ? 'Reset filters' : 'Open saved companies'}
                      <ArrowRight size={16} />
                    </button>
                    {undo && (
                      <button className="text-button" onClick={undoDecision}>
                        Undo last action
                      </button>
                    )}
                  </div>
                )}
              </section>
              <aside className="discovery-aside">
                <div className="how-it-works">
                  <span className="mini-eyebrow">SMALL STEPS, BIG POSSIBILITIES</span>
                  <h2>
                    Your next chapter
                    <br />
                    could be <em>right here.</em>
                  </h2>
                  <p>You don’t have to look far to find people working on something meaningful.</p>
                  <div className="guide-step">
                    <span>01</span>
                    <div>
                      <h3>Follow your curiosity</h3>
                      <p>Open a card. Get to know the company behind the idea.</p>
                    </div>
                  </div>
                  <div className="guide-step">
                    <span>02</span>
                    <div>
                      <h3>Keep what clicks</h3>
                      <p>Save the ones you like. Pass on the ones you don’t.</p>
                    </div>
                  </div>
                  <div className="guide-step">
                    <span>03</span>
                    <div>
                      <h3>Start a conversation</h3>
                      <p>Make an outreach draft your own, then take it from there.</p>
                    </div>
                  </div>
                  <div className="little-doodle" aria-hidden="true">
                    <span />
                    <Sprout size={63} strokeWidth={1} />
                    <span />
                  </div>
                </div>
                <div className="privacy-card">
                  <ShieldCheck size={23} strokeWidth={1.5} />
                  <div>
                    <h3>Your search. Your space.</h3>
                    <p>Saved companies and preferences stay in this browser. No account needed.</p>
                    <button onClick={() => setPrivacy(true)}>
                      You’re in control
                      <ArrowUpRight size={13} />
                    </button>
                  </div>
                </div>
                {saved.length > 0 && (
                  <button className="saved-teaser" onClick={() => setView('saved')}>
                    <span className="saved-avatars">
                      {saved.slice(0, 3).map((c) => (
                        <span className={c.color} key={c.id}>
                          {c.initials}
                        </span>
                      ))}
                    </span>
                    <span>
                      {saved.length} {saved.length === 1 ? 'possibility' : 'possibilities'} saved
                      <ArrowRight size={15} />
                    </span>
                  </button>
                )}
              </aside>
            </div>
          ) : (
            <section
              className="collection-grid"
              aria-label={view === 'saved' ? 'Saved companies' : 'Passed companies'}
            >
              {(view === 'saved' ? saved : passed).map((company) => (
                <article className="collection-card" key={company.id}>
                  <button
                    className="collection-open"
                    onClick={() => setDetail(company)}
                    aria-label={`View ${company.name} details`}
                  >
                    <CompanyArt company={company} compact />
                    <div className="collection-content">
                      <span className="mini-eyebrow">FICTIONAL · {company.city.toUpperCase()}</span>
                      <h2>
                        {company.name}
                        <ArrowUpRight size={20} />
                      </h2>
                      <span className="industry-tag">{company.industry}</span>
                      <p>{company.description}</p>
                    </div>
                  </button>
                  <button className="collection-restore" onClick={() => restore(company)}>
                    <RotateCcw size={15} />
                    {view === 'saved' ? 'Remove from Saved' : 'Return to Discover'}
                  </button>
                </article>
              ))}
              {!(view === 'saved' ? saved : passed).length && (
                <div className="empty-state">
                  <span className="empty-icon">
                    {view === 'saved' ? <Bookmark size={32} /> : <Compass size={32} />}
                  </span>
                  <h2>
                    {view === 'saved' ? 'Your next possibility is out there.' : 'A clean slate.'}
                  </h2>
                  <p>
                    {view === 'saved'
                      ? 'Save a company from Discover and it’ll be waiting here.'
                      : 'Companies you pass on will appear here. You can restore them anytime.'}
                  </p>
                  <button className="primary-button" onClick={() => setView('discover')}>
                    Explore companies
                    <ArrowRight size={16} />
                  </button>
                </div>
              )}
            </section>
          )}
          <footer className="page-footer">
            <span>Made for the possibility next door.</span>
            <span>
              <MapPin size={12} />
              Central Valley, California
            </span>
          </footer>
        </main>
        <nav className="mobile-nav" aria-label="Mobile navigation">
          {navItem('discover', 'Discover', Compass)}
          {navItem('saved', 'Saved', Bookmark, saved.length)}
          {navItem('passed', 'Passed', X, passed.length)}
        </nav>
      </div>
      <div className="toast-region" aria-live="polite" aria-atomic="true">
        {notice && (
          <div className="toast">
            <Check size={17} />
            <span>{notice}</span>
            {undo && <button onClick={undoDecision}>Undo</button>}
            <button onClick={() => setNotice('')} aria-label="Dismiss notification">
              <X size={16} />
            </button>
          </div>
        )}
      </div>
      {detail && (
        <CompanyDetails
          company={detail}
          onClose={() => setDetail(null)}
          isSaved={preferences.saved.includes(detail.id)}
          onSave={() => decide(detail, 'save')}
        />
      )}
      {privacy && (
        <Modal title="Your data belongs to you." onClose={() => setPrivacy(false)}>
          <div className="privacy-intro">
            <ShieldCheck size={30} />
            <p>
              No account. No tracking. Your saved companies, passed company IDs, and city, industry,
              and opportunity filters, plus your theme choice, are stored only in this browser’s
              local storage.
            </p>
          </div>
          <p className="modal-copy">
            Company preferences stay local. Outreach drafts exist only while their company dialog is
            open and are discarded when it closes. Copying a draft puts it on your device’s
            clipboard. Clearing browser data also clears your preferences. They do not sync between
            devices.
          </p>
          <div className="privacy-controls">
            <PrivacyRow
              title="Saved companies"
              description={`${saved.length} ${saved.length === 1 ? 'company' : 'companies'} in your collection`}
              onClear={() => clearData('saved')}
              disabled={!saved.length}
            />
            <PrivacyRow
              title="Passed companies"
              description={`${passed.length} hidden from your discovery deck`}
              onClear={() => clearData('rejected')}
              disabled={!passed.length}
            />
            <PrivacyRow
              title="Filter preferences"
              description={`${activeFilters} active ${activeFilters === 1 ? 'filter' : 'filters'}`}
              onClear={() => clearData('filters')}
              disabled={!activeFilters}
            />
            <PrivacyRow
              title="Appearance preference"
              description={`${preferences.theme === 'dark' ? 'Dark' : 'Light'} theme`}
              onClear={() => clearData('theme')}
              disabled={preferences.theme === 'light'}
            />
          </div>
          <button
            className="danger-button"
            disabled={
              !saved.length && !passed.length && !activeFilters && preferences.theme === 'light'
            }
            onClick={() => clearData('all')}
          >
            <Trash2 size={16} />
            Clear all local data
          </button>
          <p className="fine-print">
            This prototype has no resume uploads, AI services, analytics, or automatic email
            sending. Opening an external source link will visit that website.
          </p>
        </Modal>
      )}
      {about && (
        <Modal title="Opportunity, a little closer." onClose={() => setAbout(false)}>
          <div className="about-art">
            <Sprout size={55} strokeWidth={1.2} />
          </div>
          <p className="modal-copy">
            LaunchScout helps you discover companies in Bakersfield and nearby Central Valley
            cities, save the ones that spark your curiosity, and start thoughtful conversations.
          </p>
          <div className="sample-callout">
            <strong>You’re exploring a fictional demo.</strong>
            <p>
              All 20 company names, descriptions, statistics, and opportunities are made-up
              fixtures. No listings have been verified, and there are no real source or contact
              links yet.
            </p>
          </div>
          <p className="modal-copy">
            Reviewed public company information from research issue #1 will replace these examples
            before the real-data MVP is complete.
          </p>
          <a
            className="external-link"
            href="https://github.com/GaelCT/LaunchScout/issues/2"
            target="_blank"
            rel="noreferrer"
          >
            View the project on GitHub
            <ExternalLink size={15} />
          </a>
        </Modal>
      )}
    </div>
  );
}
function FilterSelect({
  label,
  value,
  options,
  allLabel,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  allLabel: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="filter-field">
      <span>{label}</span>
      <span className="select-wrap">
        <select
          aria-label={`Filter by ${label.toLowerCase()}`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">{allLabel}</option>
          {options.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
        <ChevronDown size={14} />
      </span>
    </label>
  );
}
function PrivacyRow({
  title,
  description,
  onClear,
  disabled,
}: {
  title: string;
  description: string;
  onClear: () => void;
  disabled: boolean;
}) {
  return (
    <div className="privacy-row">
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      <button disabled={disabled} onClick={onClear} aria-label={`Clear ${title.toLowerCase()}`}>
        Clear
        <Trash2 size={14} />
      </button>
    </div>
  );
}
function CompanyDetails({
  company,
  onClose,
  isSaved,
  onSave,
}: {
  company: Company;
  onClose: () => void;
  isSaved: boolean;
  onSave: () => void;
}) {
  const [tab, setTab] = useState<'overview' | 'outreach'>('overview');
  const [subject, setSubject] = useState(`Demo inquiry — learning more about ${company.name}`);
  const [body, setBody] = useState(
    `[DEMO — ${company.name} is fictional. Replace this draft with reviewed company information before using it.]\n\nHello ${company.name} team,\n\nI came across your work in ${company.industry.toLowerCase()} in ${company.city} and would love to learn more about your team.\n\n[Add a sentence about yourself and what interests you about the company.]\n\nWould someone on your team be open to a short introductory conversation?\n\nThank you for your time,\n[Your name]`,
  );
  const [copyStatus, setCopyStatus] = useState('');
  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
      setCopyStatus('Draft copied. Review it before using.');
    } catch {
      setCopyStatus('Clipboard unavailable. Select and copy the text manually.');
    }
  }
  return (
    <Modal title={company.name} onClose={onClose} wide>
      <div className="detail-subtitle">
        <MapPin size={15} />
        {company.city}, CA<span>·</span>
        {company.industry}
        <span className="sample-tag-inline">Fictional demo</span>
      </div>
      <div
        className="detail-tabs"
        role="tablist"
        aria-label="Company information"
        onKeyDown={(event) => {
          if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
            event.preventDefault();
            const next =
              event.key === 'Home'
                ? 'overview'
                : event.key === 'End'
                  ? 'outreach'
                  : tab === 'overview'
                    ? 'outreach'
                    : 'overview';
            setTab(next);
            document.getElementById(`${next}-tab`)?.focus();
          }
        }}
      >
        <button
          id="overview-tab"
          role="tab"
          tabIndex={tab === 'overview' ? 0 : -1}
          aria-selected={tab === 'overview'}
          aria-controls="overview-panel"
          onClick={() => setTab('overview')}
        >
          Company overview
        </button>
        <button
          id="outreach-tab"
          role="tab"
          tabIndex={tab === 'outreach' ? 0 : -1}
          aria-selected={tab === 'outreach'}
          aria-controls="outreach-panel"
          onClick={() => setTab('outreach')}
        >
          Outreach draft
          <ArrowUpRight size={14} />
        </button>
      </div>
      {tab === 'overview' ? (
        <div id="overview-panel" role="tabpanel" aria-labelledby="overview-tab">
          <CompanyArt company={company} compact />
          <h3 className="detail-tagline">{company.tagline}</h3>
          <p className="modal-copy">{company.description}</p>
          <div className="stats-grid">
            <div>
              <span>Founded · sample</span>
              <strong>{company.founded}</strong>
            </div>
            <div>
              <span>Team size · sample</span>
              <strong>{company.team}</strong>
            </div>
            <div>
              <span>Verification date</span>
              <strong className="stat-text">Not verified</strong>
            </div>
          </div>
          <h3 className="detail-section-title">Example opportunities</h3>
          <div className="opportunity-tags">
            {company.opportunities.length ? (
              company.opportunities.map((type) => (
                <span key={type}>
                  {type} <small>· fictional</small>
                </span>
              ))
            ) : (
              <p>No opportunity information available.</p>
            )}
          </div>
          <h3 className="detail-section-title">Sources & verification</h3>
          {company.sources.length ? (
            company.sources.map((source) => (
              <a
                key={source.url}
                className="external-link"
                href={source.url}
                target="_blank"
                rel="noreferrer"
              >
                {source.label}
                <ExternalLink size={14} />
              </a>
            ))
          ) : (
            <div className="sample-callout">
              <Search size={19} />
              <p>
                No public sources are attached to this fictional listing. Statistics and
                opportunities above are sample data, not verified facts or active openings.
              </p>
            </div>
          )}
          <div className="modal-actions">
            <button className="secondary-button" disabled={isSaved} onClick={onSave}>
              {isSaved ? <Check size={17} /> : <Bookmark size={17} />}
              {isSaved ? 'Saved to your collection' : 'Save company'}
            </button>
            <button className="primary-button" onClick={() => setTab('outreach')}>
              Make an outreach draft
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      ) : (
        <div id="outreach-panel" role="tabpanel" aria-labelledby="outreach-tab">
          <div className="draft-note">
            <ShieldCheck size={19} />
            <p>
              A starting point, in your own words. This template uses fictional demo information. No
              recipient is supplied and nothing will be sent.
            </p>
          </div>
          <label className="draft-label">
            Subject
            <input
              value={subject}
              onChange={(event) => {
                setSubject(event.target.value);
                setCopyStatus('');
              }}
            />
          </label>
          <label className="draft-label">
            Your message
            <textarea
              rows={13}
              value={body}
              onChange={(event) => {
                setBody(event.target.value);
                setCopyStatus('');
              }}
            />
          </label>
          <div className="draft-footer">
            <span>
              <ShieldCheck size={14} />
              Draft stays here until you close this dialog.
            </span>
            <button className="primary-button" onClick={copyDraft}>
              <Copy size={16} />
              Copy draft
            </button>
          </div>
          <p className="copy-status" role="status">
            {copyStatus}
          </p>
        </div>
      )}
    </Modal>
  );
}
