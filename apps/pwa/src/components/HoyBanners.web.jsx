// Banners shown above the Hoy carousel:
//   - Session recovery (in-progress workout) — primary CTA, highest priority
//   - Pending one-on-one invites (accept / decline)
//   - Upcoming calls today/tomorrow
//   - Library transition notice (one-time, after first program acquisition)
//
// All banners are dark-glass cards consistent with STANDARDS.md.
import React from 'react';

const styles = {
  wrap: {
    padding: '12px 16px 0',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  banner: {
    padding: '12px 14px',
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13,
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  bannerStrong: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    border: '1px solid rgba(255,255,255,0.22)',
  },
  textCol: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 0,
  },
  title: {
    fontSize: 13,
    fontWeight: 600,
    color: '#fff',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  subtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.55)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  primaryBtn: {
    height: 36,
    paddingLeft: 14,
    paddingRight: 14,
    borderRadius: 999,
    backgroundColor: '#fff',
    color: '#1a1a1a',
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0.4,
    border: 'none',
    cursor: 'pointer',
    flexShrink: 0,
  },
  ghostBtn: {
    height: 36,
    paddingLeft: 12,
    paddingRight: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontWeight: 600,
    border: '1px solid rgba(255,255,255,0.12)',
    cursor: 'pointer',
    flexShrink: 0,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    border: 'none',
    cursor: 'pointer',
    flexShrink: 0,
  },
};

const formatCallTime = (iso) => {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
    const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
    const isTomorrow = d.getFullYear() === tomorrow.getFullYear() && d.getMonth() === tomorrow.getMonth() && d.getDate() === tomorrow.getDate();
    const time = d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    if (sameDay) return `Hoy a las ${time}`;
    if (isTomorrow) return `Mañana a las ${time}`;
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }) + ` · ${time}`;
  } catch {
    return '';
  }
};

const PreviewBanners = ({
  recoveryCheckpoint,
  onResumeRecovery,
  onDiscardRecovery,
  pendingInvites = [],
  onAcceptInvite,
  onDeclineInvite,
  inviteActionId,
  upcomingCalls = [],
  onOpenCall,
  showLibraryMoved,
  onDismissLibraryMoved,
  onOpenLibrary,
  showProgramUpdate,
  onApplyProgramUpdate,
}) => {
  const hasAnything =
    !!recoveryCheckpoint ||
    pendingInvites.length > 0 ||
    upcomingCalls.length > 0 ||
    showLibraryMoved ||
    showProgramUpdate;
  if (!hasAnything) return null;

  return (
    <div style={styles.wrap}>
      {showProgramUpdate ? (
        <div style={styles.banner}>
          <div style={styles.textCol}>
            <span style={styles.title}>Tu programa se actualizó</span>
            <span style={styles.subtitle}>Toca para cargar la última versión</span>
          </div>
          <button style={styles.primaryBtn} onClick={onApplyProgramUpdate}>Actualizar</button>
        </div>
      ) : null}

      {recoveryCheckpoint ? (
        <div style={{ ...styles.banner, ...styles.bannerStrong }}>
          <div style={styles.textCol}>
            <span style={styles.title}>Tienes una sesión en curso</span>
            <span style={styles.subtitle}>{recoveryCheckpoint.sessionName || 'Continúa donde la dejaste'}</span>
          </div>
          <button style={styles.primaryBtn} onClick={onResumeRecovery}>Continuar</button>
          <button style={styles.closeBtn} onClick={onDiscardRecovery} aria-label="Descartar">×</button>
        </div>
      ) : null}

      {pendingInvites.map((inv) => {
        const programTitle = inv?.pendingProgramAssignment?.title || inv?.programTitle || inv?.creatorName || 'Tu coach';
        const creatorName = inv?.creatorName || inv?.coachName || 'Coach';
        const isActing = inviteActionId === inv.id;
        return (
          <div key={inv.id} style={styles.banner}>
            <div style={styles.textCol}>
              <span style={styles.title}>Invitacion de {creatorName}</span>
              <span style={styles.subtitle}>{programTitle}</span>
            </div>
            <button style={styles.primaryBtn} disabled={isActing} onClick={() => onAcceptInvite?.(inv.id)}>
              Aceptar
            </button>
            <button style={styles.ghostBtn} disabled={isActing} onClick={() => onDeclineInvite?.(inv.id)}>
              Rechazar
            </button>
          </div>
        );
      })}

      {upcomingCalls.map((call) => {
        const creatorName = call?.creatorName || 'Tu coach';
        const startsAt = call?.booking?.startTime || call?.booking?.scheduledFor || call?.booking?.start_time;
        return (
          <div key={call?.booking?.id} style={styles.banner}>
            <div style={styles.textCol}>
              <span style={styles.title}>Llamada con {creatorName}</span>
              <span style={styles.subtitle}>{formatCallTime(startsAt)}</span>
            </div>
            <button style={styles.ghostBtn} onClick={() => onOpenCall?.(call)}>Detalles</button>
          </div>
        );
      })}

      {showLibraryMoved ? (
        <div style={styles.banner}>
          <div style={styles.textCol}>
            <span style={styles.title}>La biblioteca se movió</span>
            <span style={styles.subtitle}>Ahora vive en tu perfil</span>
          </div>
          <button style={styles.ghostBtn} onClick={onOpenLibrary}>Ir</button>
          <button style={styles.closeBtn} onClick={onDismissLibraryMoved} aria-label="Entendido">×</button>
        </div>
      ) : null}
    </div>
  );
};

export default PreviewBanners;
