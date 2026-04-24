import React from 'react';

/**
 * Exercise picker shown before the submit screen when the user opens the
 * video-exchange flow without a pre-selected exercise (e.g. from the
 * notes/videos bottom sheet).
 */
export default function ChooseExerciseScreen({ exercises, onPick, onCancel }) {
  const list = Array.isArray(exercises) ? exercises : [];

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={onCancel} aria-label="Cerrar">←</button>
        <span style={styles.headerTitle}>Elige un ejercicio</span>
      </div>

      <div style={styles.body}>
        {list.length === 0 ? (
          <p style={styles.empty}>No hay ejercicios en esta sesión.</p>
        ) : (
          <ul style={styles.list}>
            {list.map((ex, idx) => {
              const exerciseKey = ex?.id || ex?.exerciseId || ex?.name || `ex-${idx}`;
              const exerciseName = ex?.name || ex?.exerciseName || 'Ejercicio';
              return (
                <li key={`${exerciseKey}-${idx}`} style={styles.listItem}>
                  <button
                    type="button"
                    style={styles.row}
                    onClick={() => onPick({ exerciseKey, exerciseName })}
                  >
                    <span style={styles.rowName}>{exerciseName}</span>
                    <span style={styles.rowChev} aria-hidden>›</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: { display: 'flex', flexDirection: 'column', minHeight: 400 },
  header: {
    display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  backBtn: {
    width: 28, height: 28, borderRadius: 8, border: 'none',
    background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.8)',
    cursor: 'pointer', fontSize: 16, display: 'flex',
    alignItems: 'center', justifyContent: 'center', padding: 0,
  },
  headerTitle: { fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.92)' },
  body: { padding: 8 },
  list: { listStyle: 'none', margin: 0, padding: 0 },
  listItem: { margin: 0, padding: 0 },
  row: {
    width: '100%', display: 'flex', alignItems: 'center',
    justifyContent: 'space-between', gap: 12,
    padding: '14px 12px', borderRadius: 10, border: 'none',
    background: 'transparent', color: 'rgba(255,255,255,0.92)',
    cursor: 'pointer', textAlign: 'left',
  },
  rowName: {
    fontSize: 15, fontWeight: 600,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  rowChev: {
    fontSize: 20, color: 'rgba(255,255,255,0.35)', lineHeight: 1,
  },
  empty: {
    padding: '40px 16px', textAlign: 'center',
    color: 'rgba(255,255,255,0.4)', fontSize: 13,
  },
};
