import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const navItems = [
  { to: '/developers', label: 'Inicio', end: true },
  { to: '/developers/api-reference', label: 'Referencia API' },
  { to: '/developers/api-keys', label: 'Claves API' },
  { to: '/developers/changelog', label: 'Changelog' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/developers');
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div style={styles.brand}>
            <span style={styles.logo}>W</span>
            <span style={styles.brandName}>Wake API</span>
          </div>
          <nav style={styles.nav}>
            {navItems.map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                style={({ isActive }) => ({
                  ...styles.navLink,
                  color: isActive ? '#fff' : 'rgba(255,255,255,0.5)',
                })}
              >
                {label}
              </NavLink>
            ))}
          </nav>
          {user && (
            <div style={styles.userArea}>
              <span style={styles.email}>{user.email}</span>
              <button onClick={handleLogout} style={styles.logoutBtn}>Salir</button>
            </div>
          )}
        </div>
      </header>
      <main style={styles.main}>
        <Outlet />
      </main>
      <footer style={styles.footer}>
        <span>Wake API v1 — Documentación para desarrolladores</span>
      </footer>
    </div>
  );
}

const styles = {
  header: {
    background: '#111',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    position: 'sticky',
    top: 0,
    zIndex: 100,
  },
  headerInner: {
    maxWidth: 1200,
    margin: '0 auto',
    padding: '0 24px',
    height: 56,
    display: 'flex',
    alignItems: 'center',
    gap: 32,
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flexShrink: 0,
  },
  logo: {
    width: 28,
    height: 28,
    borderRadius: 6,
    background: '#fff',
    color: '#111',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: 16,
  },
  brandName: {
    color: '#fff',
    fontWeight: 600,
    fontSize: 15,
    letterSpacing: '-0.02em',
  },
  nav: {
    display: 'flex',
    gap: 4,
    flex: 1,
  },
  navLink: {
    textDecoration: 'none',
    fontSize: 13,
    fontWeight: 500,
    padding: '6px 12px',
    borderRadius: 6,
    transition: 'color 0.15s',
  },
  userArea: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexShrink: 0,
  },
  email: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
  },
  logoutBtn: {
    background: 'none',
    border: '1px solid rgba(255,255,255,0.15)',
    color: 'rgba(255,255,255,0.6)',
    padding: '4px 12px',
    borderRadius: 6,
    fontSize: 12,
    cursor: 'pointer',
  },
  main: {
    flex: 1,
    maxWidth: 1200,
    margin: '0 auto',
    padding: '40px 24px',
    width: '100%',
    boxSizing: 'border-box',
  },
  footer: {
    borderTop: '1px solid rgba(255,255,255,0.06)',
    padding: '20px 24px',
    textAlign: 'center',
    fontSize: 12,
    color: 'rgba(255,255,255,0.25)',
  },
};
