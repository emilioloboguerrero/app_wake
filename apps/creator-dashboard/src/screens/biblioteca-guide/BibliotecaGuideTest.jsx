import { useState } from 'react';
import { BookOpen, LayoutDashboard, Users, Dumbbell, CalendarCheck } from 'lucide-react';
import BibliotecaGuide from './BibliotecaGuide';
import './BibliotecaGuideTest.css';

const NAV_ITEMS = [
  { key: 'inicio', label: 'Inicio', icon: LayoutDashboard },
  { key: 'clientes', label: 'Asesorias', icon: Users },
  { key: 'programas', label: 'Generales', icon: Dumbbell },
  { key: 'biblioteca', label: 'Biblioteca', icon: BookOpen, active: true },
  { key: 'eventos', label: 'Eventos', icon: CalendarCheck },
];

export default function BibliotecaGuideTest() {
  const [guideComplete, setGuideComplete] = useState(false);

  return (
    <div className="bgt-layout">
      {/* ── Mock sidebar (dimmed, non-interactive) ──────────── */}
      <aside className="bgt-sidebar">
        <div className="bgt-sidebar-logo">
          <span className="bgt-logo-text">Wake</span>
          <span className="bgt-logo-sub">Creadores</span>
        </div>
        <nav className="bgt-sidebar-nav">
          {NAV_ITEMS.map(item => {
            const Icon = item.icon;
            return (
              <div
                key={item.key}
                className={`bgt-nav-item ${item.active ? 'bgt-nav-item--active' : ''}`}
              >
                <Icon size={14} />
                <span>{item.label}</span>
              </div>
            );
          })}
        </nav>
        <div className="bgt-sidebar-footer">
          <div className="bgt-user">
            <div className="bgt-user-avatar">C</div>
            <div className="bgt-user-info">
              <span className="bgt-user-name">Coach Demo</span>
              <span className="bgt-user-sub">Perfil</span>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main content area ──────────────────────────────── */}
      <main className="bgt-main">
        {/* Mock sticky header */}
        <div className="bgt-header">
          <span className="bgt-header-title">Biblioteca</span>
        </div>

        {/* Guide content area */}
        <div className="bgt-content">
          {!guideComplete ? (
            <BibliotecaGuide onComplete={() => setGuideComplete(true)} />
          ) : (
            <div className="bgt-done">
              <p className="bgt-done-text">Guia completada. Aqui iria el contenido de la biblioteca.</p>
              <button
                className="bgt-done-replay"
                onClick={() => setGuideComplete(false)}
              >
                Repetir guia
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
