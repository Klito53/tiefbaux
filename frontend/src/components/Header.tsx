export function Header() {
  return (
    <header className="app-header">
      <div className="header-content">
        <div className="logo-group">
          <div className="logo-icon">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="8" fill="#146c60" />
              <path d="M8 12h16M8 16h12M8 20h14M16 8v4" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <h1>TiefbauX</h1>
            <p className="subtitle">Leistungsverzeichnis-Analyse & Angebotsassistent</p>
          </div>
        </div>
      </div>
    </header>
  )
}
