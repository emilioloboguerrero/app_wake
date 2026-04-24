import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import videoExchangeService from '../../services/videoExchangeService';
import { queryKeys, cacheConfig } from '../../config/queryClient';
import VideoExchangeThreadView from './VideoExchangeThreadView.web';

const RETENTION_DAYS = 30;

/**
 * Rolling window of the client's recent video threads, framed around
 * the coach's replies (which is what users actually care about seeing here).
 * Server deletes threads with lastMessageAt older than RETENTION_DAYS,
 * so this view inherits that window by construction.
 */
export default function VideoHistoryView({ userId, onClose }) {
  const [selectedId, setSelectedId] = useState(null);

  const { data: submissions = [], isLoading } = useQuery({
    queryKey: queryKeys.videoExchanges.byClient(userId),
    queryFn: () => videoExchangeService.getThreads({}),
    enabled: !!userId,
    ...cacheConfig.videoExchanges,
  });

  const { newReplies, replied, awaiting } = useMemo(
    () => groupSubmissions(submissions),
    [submissions]
  );

  if (selectedId) {
    return (
      <VideoExchangeThreadView
        exchangeId={selectedId}
        userId={userId}
        onBack={() => setSelectedId(null)}
      />
    );
  }

  const hasAny = submissions.length > 0;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={onClose} aria-label="Cerrar">←</button>
        <div style={styles.headerText}>
          <span style={styles.headerTitle}>Respuestas del coach</span>
          <span style={styles.headerSubtitle}>Últimos {RETENTION_DAYS} días</span>
        </div>
      </div>

      <div style={styles.body}>
        {isLoading ? (
          <div style={styles.placeholder}>Cargando…</div>
        ) : !hasAny ? (
          <div style={styles.empty}>
            <div style={styles.emptyIcon} aria-hidden>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path d="M4 6.5L4 15.5C4 17.1569 5.34315 18.5 7 18.5L15 18.5C16.6569 18.5 18 17.1569 18 15.5L18 6.5C18 4.84315 16.6569 3.5 15 3.5L7 3.5C5.34315 3.5 4 4.84315 4 6.5Z" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5"/>
                <path d="M20 9L20 14" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <p style={styles.emptyTitle}>Aún no hay respuestas</p>
            <p style={styles.emptyDesc}>Cuando tu coach revise tus videos, aparecerán acá.</p>
          </div>
        ) : (
          <>
            <Section title="Nuevas respuestas" items={newReplies} onSelect={setSelectedId} emphasis />
            <Section title="Respondidas" items={replied} onSelect={setSelectedId} />
            <Section title="En espera" items={awaiting} onSelect={setSelectedId} muted />
          </>
        )}

        {hasAny && (
          <p style={styles.retentionNote}>
            Los videos se guardan por {RETENTION_DAYS} días.
          </p>
        )}
      </div>
    </div>
  );
}

function Section({ title, items, onSelect, emphasis, muted }) {
  if (!items || items.length === 0) return null;
  return (
    <div style={styles.section}>
      <div style={styles.sectionHeader}>
        <span style={styles.sectionLabel}>{title}</span>
        <span style={styles.sectionCount}>{items.length}</span>
      </div>
      <div style={styles.list}>
        {items.map((item) => (
          <ThreadRow
            key={item.id}
            item={item}
            onClick={() => onSelect(item.id)}
            emphasis={emphasis}
            muted={muted}
          />
        ))}
      </div>
    </div>
  );
}

function ThreadRow({ item, onClick, emphasis, muted }) {
  const hasUnread = (item.unreadByClient || 0) > 0;
  return (
    <button
      style={{
        ...styles.row,
        ...(emphasis ? styles.rowEmphasis : null),
        ...(muted ? styles.rowMuted : null),
      }}
      onClick={onClick}
    >
      <div style={styles.rowMain}>
        <span style={styles.rowName}>{item.exerciseName || 'Video'}</span>
        <span style={styles.rowMeta}>{formatShortTime(item.lastMessageAt)}</span>
      </div>
      {hasUnread && <span style={styles.unreadDot} aria-label="No leído" />}
      <span style={styles.rowChev} aria-hidden>›</span>
    </button>
  );
}

function groupSubmissions(list) {
  const newReplies = [];
  const replied = [];
  const awaiting = [];

  const sorted = [...list].sort((a, b) => msOf(b.lastMessageAt) - msOf(a.lastMessageAt));

  for (const s of sorted) {
    if ((s.unreadByClient || 0) > 0 || s.lastMessageBy === 'creator') {
      if ((s.unreadByClient || 0) > 0) newReplies.push(s);
      else replied.push(s);
    } else if (s.status === 'closed') {
      replied.push(s);
    } else {
      awaiting.push(s);
    }
  }

  return { newReplies, replied, awaiting };
}

function msOf(timestamp) {
  if (!timestamp) return 0;
  if (typeof timestamp === 'number') return timestamp;
  if (typeof timestamp === 'string') {
    const n = new Date(timestamp).getTime();
    return Number.isFinite(n) ? n : 0;
  }
  const secs = timestamp.seconds ?? timestamp._seconds;
  if (typeof secs === 'number') return secs * 1000;
  return 0;
}

function formatShortTime(timestamp) {
  const ms = msOf(timestamp);
  if (!ms) return '';
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
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
  headerText: { display: 'flex', flexDirection: 'column', gap: 2 },
  headerTitle: { fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,0.95)' },
  headerSubtitle: {
    fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.4)',
    textTransform: 'uppercase', letterSpacing: '0.08em',
  },
  body: { padding: 12, display: 'flex', flexDirection: 'column', gap: 18 },
  placeholder: {
    padding: '48px 16px', textAlign: 'center',
    color: 'rgba(255,255,255,0.3)', fontSize: 13,
  },
  empty: {
    padding: '56px 24px', textAlign: 'center',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
  },
  emptyIcon: {
    width: 56, height: 56, borderRadius: 14,
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.06)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.7)', margin: 0 },
  emptyDesc: {
    fontSize: 12, color: 'rgba(255,255,255,0.35)',
    margin: 0, maxWidth: 260, lineHeight: 1.5,
  },
  section: { display: 'flex', flexDirection: 'column', gap: 6 },
  sectionHeader: {
    display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
    padding: '0 4px 4px',
  },
  sectionLabel: {
    fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.45)',
    textTransform: 'uppercase', letterSpacing: '0.1em',
  },
  sectionCount: {
    fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.3)',
  },
  list: { display: 'flex', flexDirection: 'column', gap: 6 },
  row: {
    display: 'flex', alignItems: 'center', gap: 10,
    width: '100%', padding: '14px 14px',
    borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)',
    background: 'rgba(255,255,255,0.03)',
    color: 'rgba(255,255,255,0.92)',
    cursor: 'pointer', textAlign: 'left',
    transition: 'background 0.15s ease, border-color 0.15s ease',
  },
  rowEmphasis: {
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.16)',
  },
  rowMuted: {
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.05)',
    opacity: 0.85,
  },
  rowMain: {
    flex: 1, display: 'flex', flexDirection: 'column', gap: 2,
    minWidth: 0,
  },
  rowName: {
    fontSize: 14, fontWeight: 600,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    color: 'rgba(255,255,255,0.95)',
  },
  rowMeta: {
    fontSize: 11, color: 'rgba(255,255,255,0.4)',
  },
  unreadDot: {
    width: 8, height: 8, borderRadius: 999,
    background: 'rgba(255,255,255,0.95)',
    flexShrink: 0,
  },
  rowChev: {
    fontSize: 20, color: 'rgba(255,255,255,0.3)', lineHeight: 1,
    flexShrink: 0,
  },
  retentionNote: {
    fontSize: 11, color: 'rgba(255,255,255,0.3)',
    textAlign: 'center', margin: '8px 0 4px',
  },
};
