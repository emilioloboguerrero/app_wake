export default function ScreenWrapper({ children, fullWidth = false }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      width: fullWidth ? '100%' : '60%',
      height: '100%',
      paddingLeft: 60,
      paddingRight: 40,
      gap: 48,
      position: 'relative',
      zIndex: 1,
      alignSelf: 'flex-start',
    }}>
      {children}
    </div>
  );
}

export function Title({ children }) {
  return (
    <h1 style={{
      color: 'rgba(255,255,255,0.9)',
      fontSize: 'clamp(32px, 3.5vw, 52px)',
      fontWeight: 300,
      fontFamily: "'Inter', sans-serif",
      textAlign: 'center',
      letterSpacing: '-0.02em',
      margin: 0,
      lineHeight: 1.3,
      flexShrink: 0,
    }}>
      {children}
    </h1>
  );
}

export function Subtitle({ children }) {
  return (
    <p style={{
      color: 'rgba(255,255,255,0.3)',
      fontSize: 15,
      fontFamily: "'Inter', sans-serif",
      fontWeight: 400,
      margin: '-32px 0 0 0',
      textAlign: 'center',
      flexShrink: 0,
    }}>
      {children}
    </p>
  );
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

export function Bold({ children }) {
  return <span style={{ fontWeight: 700 }}>{children}</span>;
}
