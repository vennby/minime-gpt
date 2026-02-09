import './styles.css';

const templates = [
  { title: 'Blank', accent: '#1a73e8', type: 'blank' },
  { title: 'Report', accent: '#ea4335' },
  { title: 'Project proposal', accent: '#34a853' },
  { title: 'Meeting notes', accent: '#fbbc04' },
  { title: 'Brochure', accent: '#a142f4' },
];

const recents = [
  { title: 'Methods draft', subtitle: 'Last opened 2 days ago', color: '#1a73e8' },
  { title: 'Data analysis notes', subtitle: 'Last opened 5 days ago', color: '#34a853' },
  { title: 'Thesis outline', subtitle: 'Last opened 1 week ago', color: '#a142f4' },
  { title: 'Seminar summary', subtitle: 'Last opened 2 weeks ago', color: '#fbbc04' },
  { title: 'Reading list', subtitle: 'Last opened 3 weeks ago', color: '#ea4335' },
  { title: 'Draft questionnaire', subtitle: 'Last opened 1 month ago', color: '#0f9d58' },
];

function TemplateCard({ title, accent, type }) {
  return (
    <div className={`template-card ${type === 'blank' ? 'is-blank' : ''}`}>
      <div className="template-thumb" style={{ borderColor: accent }}>
        {type === 'blank' ? <div className="template-plus">+</div> : <div className="template-band" style={{ background: accent }}></div>}
      </div>
      <div className="template-title">{title}</div>
    </div>
  );
}

function DocCard({ title, subtitle, color }) {
  return (
    <div className="doc-card">
      <div className="doc-card__meta">
        <div className="doc-card__icon" style={{ background: color }} />
        <div>
          <div className="doc-card__title">{title}</div>
          <div className="doc-card__subtitle">{subtitle}</div>
        </div>
      </div>
      <div className="doc-card__actions">⋮</div>
    </div>
  );
}

export default function Home() {
  return (
    <div className="home-shell">
      <header className="home-topbar">
        <div className="home-logo">
          <div className="logo-mark">G</div>
          <span className="logo-text">Docs</span>
        </div>
        <div className="home-search">
          <span className="search-icon">🔍</span>
          <input placeholder="Search" />
        </div>
        <div className="home-actions">
          <button className="icon-btn" aria-label="Grid">☷</button>
          <button className="icon-btn" aria-label="Help">?</button>
          <div className="avatar">A</div>
        </div>
      </header>

      <main className="home-main">
        <section className="home-section">
          <div className="section-head">
            <h2>Start a new document</h2>
            <button className="text-link">Template gallery ▸</button>
          </div>
          <div className="template-grid">
            {templates.map((tpl) => (
              <TemplateCard key={tpl.title} {...tpl} />
            ))}
          </div>
        </section>

        <section className="home-section">
          <div className="section-head">
            <h2>Recent documents</h2>
            <div className="filters">
              <button className="chip ghost">Owned by anyone</button>
              <button className="chip ghost">AZ ▾</button>
              <button className="chip ghost">Last opened ▾</button>
            </div>
          </div>
          <div className="doc-grid">
            {recents.map((doc) => (
              <DocCard key={doc.title} {...doc} />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
