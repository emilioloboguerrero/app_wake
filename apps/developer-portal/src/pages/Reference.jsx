export default function Reference() {
  return (
    <div>
      <h1 style={styles.title}>Referencia API</h1>
      <p style={styles.subtitle}>
        Todos los endpoints disponibles en la API Wake v1. Los endpoints marcados con
        <code style={styles.code}>write</code> requieren una clave con alcance write.
      </p>

      <EndpointGroup title="Perfil">
        <Endpoint method="GET" path="/users/me" scope="read" description="Obtener perfil del creador autenticado" />
        <Endpoint method="PATCH" path="/users/me" scope="write" description="Actualizar perfil del creador" />
        <Endpoint method="POST" path="/users/me/profile-picture/upload-url" scope="write" description="Obtener URL firmada para subir foto de perfil" />
        <Endpoint method="POST" path="/users/me/profile-picture/upload-url/confirm" scope="write" description="Confirmar subida de foto de perfil" />
      </EndpointGroup>

      <EndpointGroup title="Clientes">
        <Endpoint method="GET" path="/creator/clients" scope="read" description="Listar clientes del creador" />
        <Endpoint method="POST" path="/creator/clients/invite" scope="write" description="Invitar un cliente por email" />
      </EndpointGroup>

      <EndpointGroup title="Programas">
        <Endpoint method="GET" path="/creator/programs" scope="read" description="Listar programas del creador" />
        <Endpoint method="POST" path="/creator/programs" scope="write" description="Crear nuevo programa" />
        <Endpoint method="GET" path="/creator/programs/:id" scope="read" description="Obtener detalle de un programa" />
        <Endpoint method="PATCH" path="/creator/programs/:id" scope="write" description="Actualizar un programa" />
        <Endpoint method="DELETE" path="/creator/programs/:id" scope="write" description="Eliminar un programa" />
      </EndpointGroup>

      <EndpointGroup title="Entrenamientos">
        <Endpoint method="GET" path="/workout/daily" scope="read" description="Obtener entrenamiento del día para un usuario" />
        <Endpoint method="POST" path="/workout/complete" scope="write" description="Marcar sesión como completada" />
      </EndpointGroup>

      <EndpointGroup title="Nutrición">
        <Endpoint method="GET" path="/nutrition/diary" scope="read" description="Obtener diario de nutrición" />
        <Endpoint method="POST" path="/nutrition/diary" scope="write" description="Agregar entrada al diario" />
        <Endpoint method="GET" path="/nutrition/foods/search" scope="read" description="Buscar alimentos" />
        <Endpoint method="GET" path="/nutrition/foods/:id" scope="read" description="Obtener detalle de un alimento" />
      </EndpointGroup>

      <EndpointGroup title="Progreso">
        <Endpoint method="GET" path="/progress/body-log" scope="read" description="Obtener registros corporales" />
        <Endpoint method="POST" path="/progress/body-log" scope="write" description="Agregar registro corporal" />
        <Endpoint method="GET" path="/progress/readiness" scope="read" description="Obtener registro de bienestar" />
      </EndpointGroup>

      <EndpointGroup title="Analíticas">
        <Endpoint method="GET" path="/analytics/weekly-volume" scope="read" description="Volumen semanal de entrenamiento" />
      </EndpointGroup>

      <EndpointGroup title="Eventos">
        <Endpoint method="GET" path="/events" scope="read" description="Listar eventos públicos" />
      </EndpointGroup>

      <EndpointGroup title="Claves API">
        <Endpoint method="GET" path="/api-keys" scope="read" description="Listar claves API del creador" />
        <Endpoint method="POST" path="/api-keys" scope="write" description="Crear nueva clave API" />
        <Endpoint method="DELETE" path="/api-keys/:id" scope="write" description="Revocar una clave API" />
      </EndpointGroup>

      <section style={{ marginTop: 48 }}>
        <h2 style={styles.sectionTitle}>Paginación</h2>
        <p style={styles.text}>
          Los endpoints que devuelven listas usan paginación basada en cursor.
          La respuesta incluye un campo <code style={styles.code}>nextPageToken</code> que debes
          pasar como parámetro en la siguiente petición.
        </p>
        <pre style={styles.pre}>{`GET /api/v1/creator/clients?pageSize=50&pageToken=abc123`}</pre>
      </section>

      <section style={{ marginTop: 32 }}>
        <h2 style={styles.sectionTitle}>Formato de errores</h2>
        <pre style={styles.pre}>{`{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "El campo 'name' es requerido",
    "field": "name"
  }
}`}</pre>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Status</th>
              <th style={styles.th}>Código</th>
              <th style={styles.th}>Reintentar</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['400', 'VALIDATION_ERROR', 'No'],
              ['401', 'UNAUTHENTICATED', 'No'],
              ['403', 'FORBIDDEN', 'No'],
              ['404', 'NOT_FOUND', 'No'],
              ['409', 'CONFLICT', 'Sí (backoff)'],
              ['429', 'RATE_LIMITED', 'Sí (Retry-After)'],
              ['500', 'INTERNAL_ERROR', 'Sí'],
              ['503', 'SERVICE_UNAVAILABLE', 'Sí'],
            ].map(([status, code, retry]) => (
              <tr key={code}>
                <td style={styles.td}>{status}</td>
                <td style={styles.td}><code style={styles.code}>{code}</code></td>
                <td style={styles.td}>{retry}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function EndpointGroup({ title, children }) {
  return (
    <section style={{ marginTop: 36 }}>
      <h2 style={styles.sectionTitle}>{title}</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {children}
      </div>
    </section>
  );
}

function Endpoint({ method, path, scope, description }) {
  const methodColors = {
    GET: '#4caf50',
    POST: '#2196f3',
    PATCH: '#ff9800',
    PUT: '#ff9800',
    DELETE: '#e53935',
  };

  return (
    <div style={endpointStyles.row}>
      <span style={{ ...endpointStyles.method, color: methodColors[method] || '#fff' }}>
        {method}
      </span>
      <code style={endpointStyles.path}>{path}</code>
      <span style={{
        ...endpointStyles.scope,
        background: scope === 'write' ? 'rgba(255,152,0,0.12)' : 'rgba(76,175,80,0.12)',
        color: scope === 'write' ? '#ff9800' : '#4caf50',
      }}>
        {scope}
      </span>
      <span style={endpointStyles.desc}>{description}</span>
    </div>
  );
}

const endpointStyles = {
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 12px',
    borderRadius: 6,
    background: 'rgba(255,255,255,0.02)',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
  },
  method: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    fontWeight: 700,
    width: 52,
    flexShrink: 0,
  },
  path: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    minWidth: 280,
    flexShrink: 0,
  },
  scope: {
    fontSize: 10,
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: 4,
    textTransform: 'uppercase',
    flexShrink: 0,
  },
  desc: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
    flex: 1,
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
    lineHeight: 1.6,
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
    margin: '0 0 12px',
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
    marginTop: 16,
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
    padding: '8px 12px',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
  },
};
