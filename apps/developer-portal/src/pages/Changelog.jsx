export default function Changelog() {
  return (
    <div>
      <h1 style={styles.title}>Changelog</h1>
      <p style={styles.subtitle}>Historial de cambios y versiones de la API de Wake</p>

      <div style={styles.timeline}>
        <ChangelogEntry
          version="v1.0.0"
          date="Marzo 2026"
          tag="Lanzamiento inicial"
          changes={[
            'API REST v1 con autenticación por Firebase ID token y claves API',
            'Endpoints de perfil, clientes, programas, entrenamientos, nutrición y progreso',
            'Claves API con alcances read y write',
            'Límites de tasa: 1,000 req/día, 60 req/min por clave',
            'Portal de desarrolladores con gestión de claves',
          ]}
        />
      </div>

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Política de versionamiento</h2>
        <p style={styles.text}>
          La API usa versionamiento por URL (<code style={styles.code}>/api/v1/</code>).
          Los cambios no disruptivos (nuevos campos, nuevos endpoints) se agregan a la versión actual.
        </p>
        <p style={styles.text}>
          <strong style={{ color: '#fff' }}>Cambios disruptivos</strong> (requieren nueva versión):
        </p>
        <ul style={styles.list}>
          <li>Eliminar un campo de una respuesta</li>
          <li>Cambiar el nombre o tipo de un campo</li>
          <li>Eliminar un endpoint</li>
          <li>Cambiar requisitos de autenticación</li>
        </ul>
        <p style={styles.text}>
          Antes de deprecar una versión se dará un aviso mínimo de 90 días a todos los desarrolladores
          con claves activas.
        </p>
      </section>
    </div>
  );
}

function ChangelogEntry({ version, date, tag, changes }) {
  return (
    <div style={entryStyles.entry}>
      <div style={entryStyles.header}>
        <span style={entryStyles.version}>{version}</span>
        <span style={entryStyles.tag}>{tag}</span>
        <span style={entryStyles.date}>{date}</span>
      </div>
      <ul style={entryStyles.list}>
        {changes.map((change, i) => (
          <li key={i} style={entryStyles.item}>{change}</li>
        ))}
      </ul>
    </div>
  );
}

const entryStyles = {
  entry: {
    borderLeft: '2px solid rgba(255,255,255,0.1)',
    paddingLeft: 20,
    marginLeft: 8,
    paddingBottom: 32,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  version: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 700,
    fontFamily: "'JetBrains Mono', monospace",
  },
  tag: {
    background: 'rgba(76,175,80,0.12)',
    color: '#4caf50',
    fontSize: 10,
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: 4,
    textTransform: 'uppercase',
  },
  date: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 12,
  },
  list: {
    margin: 0,
    paddingLeft: 18,
  },
  item: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    lineHeight: 1.8,
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
    fontSize: 14,
    marginTop: 8,
  },
  timeline: {
    marginTop: 36,
  },
  section: {
    marginTop: 48,
    paddingTop: 32,
    borderTop: '1px solid rgba(255,255,255,0.06)',
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 600,
    margin: '0 0 12px',
  },
  text: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    lineHeight: 1.6,
    margin: '0 0 10px',
  },
  code: {
    background: 'rgba(255,255,255,0.08)',
    padding: '2px 6px',
    borderRadius: 4,
    fontSize: 12,
    fontFamily: "'JetBrains Mono', monospace",
  },
  list: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    lineHeight: 1.8,
    paddingLeft: 18,
    margin: '0 0 12px',
  },
};
