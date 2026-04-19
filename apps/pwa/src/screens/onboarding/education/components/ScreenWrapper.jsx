export default function ScreenWrapper({ children }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
      height: '100%',
      gap: 40,
      position: 'relative',
      zIndex: 1,
    }}>
      {children}
    </div>
  );
}

export function Title({ children }) {
  return (
    <h1 style={{
      color: 'rgba(255,255,255,0.9)',
      fontSize: 'clamp(20px, 5.5vw, 28px)',
      fontWeight: 300,
      fontFamily: "'Inter', sans-serif",
      textAlign: 'center',
      letterSpacing: '-0.01em',
      margin: 0,
      lineHeight: 1.4,
      padding: '0 8px',
      flexShrink: 0,
    }}>
      {children}
    </h1>
  );
}

export function Bold({ children }) {
  return <span style={{ fontWeight: 700 }}>{children}</span>;
}

export function Visual({ children }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
      flexShrink: 0,
    }}>
      {children}
    </div>
  );
}
