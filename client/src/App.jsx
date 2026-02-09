import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Home from './Home';
import TextEditor from './TextEditor';

function App() {
  const location = useLocation();

  const isActive = (path) => (location.pathname === path ? 'active' : '');

  return (
    <div className="app-frame">
      <header className="app-nav">
        <div className="app-brand">
          <span className="app-logo">G</span>
          <span>Docs Clone</span>
        </div>
        <nav className="app-nav-links">
          <Link className={`app-link ${isActive('/')}`} to="/">Home</Link>
          <Link className={`app-link ${isActive('/editor')}`} to="/editor">Editor</Link>
        </nav>
      </header>

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/editor" element={<TextEditor />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

export default App;
