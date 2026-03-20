export default function Home() {
  return (
    <div>
      <h1 style={styles.title}>Wake API</h1>
      <p style={styles.subtitle}>
        API REST para integrar datos de fitness y nutrición de Wake en tus aplicaciones.
      </p>

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Primeros pasos</h2>
        <div style={styles.steps}>
          <Step number="1" title="Obtén tu clave API">
            Ve a <a href="/developers/keys" style={styles.link}>Claves API</a> y crea una nueva clave
            con alcance <code style={styles.code}>read</code>. Se activa inmediatamente.
          </Step>
          <Step number="2" title="Autentícate">
            Incluye tu clave en el header <code style={styles.code}>Authorization</code>:
            <pre style={styles.pre}>Authorization: Bearer wk_live_&lt;tu_clave&gt;</pre>
          </Step>
          <Step number="3" title="Haz tu primera llamada">
            <pre style={styles.pre}>{`curl -H "Authorization: Bearer wk_live_..." \\
  https://wolf-20b8b.web.app/api/v1/users/me`}</pre>
          </Step>
        </div>
      </section>

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>URL base</h2>
        <pre style={styles.pre}>https://wolf-20b8b.web.app/api/v1</pre>
      </section>

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Autenticación</h2>
        <p style={styles.text}>
          Todas las llamadas requieren una clave API válida. Las claves usan el formato{' '}
          <code style={styles.code}>wk_live_</code> seguido de 64 caracteres hexadecimales.
        </p>
        <p style={styles.text}>
          Las claves con alcance <code style={styles.code}>read</code> permiten solo peticiones GET.
          Para operaciones de escritura necesitas alcance <code style={styles.code}>write</code>,
          que requiere aprobación manual.
        </p>
      </section>

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Alcances</h2>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Alcance</th>
              <th style={styles.th}>Permisos</th>
              <th style={styles.th}>Aprobación</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={styles.td}><code style={styles.code}>read</code></td>
              <td style={styles.td}>Solo GET — perfil, clientes, programas, historial</td>
              <td style={styles.td}>Autoservicio</td>
            </tr>
            <tr>
              <td style={styles.td}><code style={styles.code}>write</code></td>
              <td style={styles.td}>Todos los métodos HTTP (GET, POST, PATCH, DELETE)</td>
              <td style={styles.td}>Aprobación manual (48h)</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Límites de tasa</h2>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Límite</th>
              <th style={styles.th}>Valor</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={styles.td}>Peticiones por día</td>
              <td style={styles.td}>1,000 por clave</td>
            </tr>
            <tr>
              <td style={styles.td}>Peticiones por minuto</td>
              <td style={styles.td}>60 (ráfaga)</td>
            </tr>
          </tbody>
        </table>
        <p style={styles.textSmall}>
          Cuando se excede el límite recibirás HTTP 429 con un header <code style={styles.code}>Retry-After</code>.
        </p>
      </section>

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Errores</h2>
        <p style={styles.text}>Todas las respuestas de error siguen este formato:</p>
        <pre style={styles.pre}>{`{
  "error": {
    "code": "ERROR_CODE",
    "message": "Descripción del error",
    "field": "campo_afectado"
  }
}`}</pre>
        <p style={styles.textSmall}>
          Reintenta en errores 5xx y 429. Nunca reintentar en 4xx (excepto 429).
        </p>
      </section>
    </div>
  );
}

function Step({ number, title, children }) {
  return (
    <div style={stepStyles.step}>
      <div style={stepStyles.number}>{number}</div>
      <div>
        <h3 style={stepStyles.title}>{title}</h3>
        <div style={stepStyles.content}>{children}</div>
      </div>
    </div>
  );
}

const stepStyles = {
  step: {
    display: 'flex',
    gap: 16,
    padding: '16px 0',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  number: {
    width: 28,
    height: 28,
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.08)',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 13,
    fontWeight: 600,
    flexShrink: 0,
  },
  title: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 600,
    margin: 0,
  },
  content: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    marginTop: 6,
    lineHeight: 1.6,
  },
};

const styles = {
  title: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 700,
    margin: 0,
    letterSpacing: '-0.03em',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 15,
    marginTop: 8,
    lineHeight: 1.5,
  },
  section: {
    marginTop: 40,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 600,
    margin: '0 0 16px',
    letterSpacing: '-0.02em',
  },
  steps: {},
  text: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    lineHeight: 1.6,
    margin: '0 0 12px',
  },
  textSmall: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    marginTop: 8,
  },
  link: {
    color: '#fff',
    textDecoration: 'underline',
    textUnderlineOffset: 2,
  },
  code: {
    background: 'rgba(255,255,255,0.08)',
    padding: '2px 6px',
    borderRadius: 4,
    fontSize: 12,
    fontFamily: "'JetBrains Mono', monospace",
  },
  pre: {
    background: '#111',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 8,
    padding: '12px 16px',
    fontSize: 12,
    fontFamily: "'JetBrains Mono', monospace",
    color: 'rgba(255,255,255,0.8)',
    overflowX: 'auto',
    marginTop: 8,
    lineHeight: 1.6,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  th: {
    textAlign: 'left',
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    padding: '8px 12px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
  },
  td: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    padding: '10px 12px',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
  },
};
