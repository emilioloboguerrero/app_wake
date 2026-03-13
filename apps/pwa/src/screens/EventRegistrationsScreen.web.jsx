import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  doc, getDoc, collection, getDocs, query, orderBy,
  updateDoc, deleteDoc, serverTimestamp,
} from 'firebase/firestore';
import { firestore, auth } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { FixedWakeHeader, WakeHeaderSpacer } from '../components/WakeHeader';
import WakeLoader from '../components/WakeLoader';

// ── helpers ──────────────────────────────────────────────────────────

function buildColumns(event) {
  if (event?.fields?.length > 0) {
    return event.fields.map(f => ({ id: f.id, label: f.label }));
  }
  return [
    { id: 'nombre',   label: 'Nombre' },
    { id: 'email',    label: 'Email' },
    { id: 'telefono', label: 'Teléfono' },
    { id: 'edad',     label: 'Edad' },
    { id: 'genero',   label: 'Género' },
  ];
}

function getCellValue(reg, colId) {
  if (reg.responses) {
    const val = reg.responses[colId];
    if (Array.isArray(val)) return val.join(', ');
    return val ?? null;
  }
  return reg[colId] ?? null;
}

function getDisplayName(reg, columns) {
  if (reg.nombre) return reg.nombre;
  if (reg.responses) {
    const nameCol = columns.find(c =>
      c.label.toLowerCase().includes('nombre') || c.label.toLowerCase().includes('name')
    );
    if (nameCol) return reg.responses[nameCol.id] || 'Registrado';
    return Object.values(reg.responses).find(v => typeof v === 'string' && v.trim().includes(' ')) || 'Registrado';
  }
  return 'Registrado';
}

function getDisplaySub(reg, columns) {
  const emailCol = columns.find(c => c.label.toLowerCase().includes('email') || c.id === 'email');
  const phoneCol = columns.find(c => c.label.toLowerCase().includes('tel') || c.id === 'telefono');
  const email = emailCol ? getCellValue(reg, emailCol.id) : (reg.email ?? null);
  const phone = phoneCol ? getCellValue(reg, phoneCol.id) : (reg.telefono ?? null);
  return email || phone || null;
}

function formatDate(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTime(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

function matchesSearch(reg, q) {
  if (!q) return true;
  const lower = q.toLowerCase();
  if (reg.responses) {
    return Object.values(reg.responses).some(v =>
      typeof v === 'string' && v.toLowerCase().includes(lower)
    );
  }
  return ['nombre', 'email', 'telefono'].some(k =>
    String(reg[k] || '').toLowerCase().includes(lower)
  );
}

// ── Row detail modal ─────────────────────────────────────────────────

function RowModal({ reg, columns, onClose, onCheckIn, onDelete }) {
  const [actionLoading, setActionLoading] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const name = getDisplayName(reg, columns);

  async function handleCheckIn() {
    setActionLoading('checkin');
    await onCheckIn();
    setActionLoading(null);
  }

  async function handleDelete() {
    setActionLoading('delete');
    await onDelete();
    setActionLoading(null);
  }

  return (
    <div style={m.backdrop} onClick={onClose}>
      <div style={m.sheet} onClick={e => e.stopPropagation()}>
        <button style={m.closeBtn} onClick={onClose} aria-label="Cerrar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div style={m.header}>
          <div style={m.avatar}>{name.charAt(0).toUpperCase()}</div>
          <div>
            <p style={m.name}>{name}</p>
            <span style={reg.checked_in ? m.badgeYes : m.badgeNo}>
              {reg.checked_in ? 'Check-in ✓' : 'Sin check-in'}
            </span>
          </div>
        </div>

        <div style={m.fields}>
          {columns.map(col => {
            const val = getCellValue(reg, col.id);
            if (!val) return null;
            return (
              <div key={col.id} style={m.fieldRow}>
                <span style={m.fieldLabel}>{col.label}</span>
                <span style={m.fieldValue}>{String(val)}</span>
              </div>
            );
          })}
          <div style={m.fieldRow}>
            <span style={m.fieldLabel}>Fecha de registro</span>
            <span style={m.fieldValue}>{formatDate(reg.created_at)}</span>
          </div>
          {reg.checked_in && reg.checked_in_at && (
            <div style={m.fieldRow}>
              <span style={m.fieldLabel}>Hora de check-in</span>
              <span style={m.fieldValue}>{formatTime(reg.checked_in_at)}</span>
            </div>
          )}
        </div>

        {!reg.checked_in && (
          <button
            style={m.checkinBtn}
            onClick={handleCheckIn}
            disabled={actionLoading !== null}
          >
            {actionLoading === 'checkin' ? 'Registrando…' : 'Marcar check-in manual'}
          </button>
        )}

        {confirmDelete ? (
          <div style={m.confirmRow}>
            <span style={m.confirmText}>¿Eliminar este registro?</span>
            <button
              style={m.confirmYes}
              onClick={handleDelete}
              disabled={actionLoading !== null}
            >
              {actionLoading === 'delete' ? 'Eliminando…' : 'Eliminar'}
            </button>
            <button style={m.confirmNo} onClick={() => setConfirmDelete(false)}>
              Cancelar
            </button>
          </div>
        ) : (
          <button style={m.deleteBtn} onClick={() => setConfirmDelete(true)}>
            Eliminar registro
          </button>
        )}
      </div>
    </div>
  );
}

const m = {
  backdrop: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    zIndex: 2000,
  },
  sheet: {
    background: '#2a2a2a',
    borderRadius: '20px 20px 0 0',
    padding: '24px 20px 40px',
    width: '100%',
    maxWidth: 480,
    maxHeight: '85vh',
    overflowY: 'auto',
    position: 'relative',
  },
  closeBtn: {
    position: 'absolute', top: 16, right: 16,
    background: 'none', border: 'none',
    color: 'rgba(255,255,255,0.5)', cursor: 'pointer',
    display: 'flex', padding: 4,
  },
  header: {
    display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20,
  },
  avatar: {
    width: 48, height: 48, borderRadius: 24,
    background: 'rgba(255,255,255,0.1)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#ffffff', fontSize: 20, fontWeight: 700, flexShrink: 0,
  },
  name: {
    color: '#ffffff', fontSize: 17, fontWeight: 700, margin: '0 0 6px',
  },
  badgeYes: {
    display: 'inline-block',
    background: 'rgba(74,222,128,0.12)',
    border: '1px solid rgba(74,222,128,0.3)',
    color: '#4ade80',
    borderRadius: 6, padding: '3px 10px',
    fontSize: 12, fontWeight: 600,
  },
  badgeNo: {
    display: 'inline-block',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
    color: 'rgba(255,255,255,0.4)',
    borderRadius: 6, padding: '3px 10px',
    fontSize: 12, fontWeight: 600,
  },
  fields: {
    display: 'flex', flexDirection: 'column', gap: 12,
    borderTop: '1px solid rgba(255,255,255,0.08)',
    paddingTop: 16, marginBottom: 20,
  },
  fieldRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12,
  },
  fieldLabel: {
    color: 'rgba(255,255,255,0.4)', fontSize: 13, flexShrink: 0,
  },
  fieldValue: {
    color: '#ffffff', fontSize: 13, textAlign: 'right', wordBreak: 'break-word',
  },
  checkinBtn: {
    width: '100%', padding: '13px 0',
    marginBottom: 8,
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: 12, color: '#ffffff',
    fontSize: 15, fontWeight: 600, cursor: 'pointer',
    fontFamily: 'inherit',
  },
  deleteBtn: {
    width: '100%', padding: '13px 0',
    background: 'rgba(239,68,68,0.08)',
    border: '1px solid rgba(239,68,68,0.2)',
    borderRadius: 12, color: 'rgba(239,68,68,0.85)',
    fontSize: 15, fontWeight: 600, cursor: 'pointer',
    fontFamily: 'inherit',
  },
  confirmRow: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '10px 14px',
    background: 'rgba(239,68,68,0.08)',
    border: '1px solid rgba(239,68,68,0.2)',
    borderRadius: 12,
  },
  confirmText: {
    flex: 1, color: 'rgba(255,255,255,0.7)', fontSize: 13,
  },
  confirmYes: {
    padding: '6px 14px',
    background: 'rgba(239,68,68,0.7)',
    border: 'none', borderRadius: 8,
    color: '#fff', fontSize: 13, fontWeight: 700,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  confirmNo: {
    padding: '6px 14px',
    background: 'rgba(255,255,255,0.08)',
    border: 'none', borderRadius: 8,
    color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit',
  },
};

// ── Main screen ──────────────────────────────────────────────────────

export default function EventRegistrationsScreen() {
  const { eventId } = useParams();
  const { user: contextUser } = useAuth();
  const user = contextUser || auth.currentUser;
  const navigate = useNavigate();

  const [status, setStatus] = useState('loading');
  const [event, setEvent] = useState(null);
  const [registrations, setRegistrations] = useState([]);
  const [waitlist, setWaitlist] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedReg, setSelectedReg] = useState(null);

  useEffect(() => {
    if (!user) return;
    getDoc(doc(firestore, 'events', eventId)).then(async snap => {
      if (!snap.exists() || snap.data().creator_id !== user.uid) {
        navigate('/creator/events', { replace: true });
        return;
      }
      setEvent({ id: snap.id, ...snap.data() });

      const [regSnap, waitSnap] = await Promise.all([
        getDocs(query(collection(firestore, 'event_signups', eventId, 'registrations'), orderBy('created_at', 'desc'))),
        getDocs(query(collection(firestore, 'event_signups', eventId, 'waitlist'), orderBy('created_at', 'desc'))),
      ]);
      setRegistrations(regSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setWaitlist(waitSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setStatus('ready');
    }).catch(() => navigate('/creator/events', { replace: true }));
  }, [eventId, user, navigate]);

  async function handleManualCheckIn(regId) {
    await updateDoc(doc(firestore, 'event_signups', eventId, 'registrations', regId), {
      checked_in: true,
      checked_in_at: serverTimestamp(),
    });
    setRegistrations(prev => prev.map(r =>
      r.id === regId ? { ...r, checked_in: true, checked_in_at: new Date() } : r
    ));
    setSelectedReg(prev => prev?.id === regId ? { ...prev, checked_in: true, checked_in_at: new Date() } : prev);
  }

  async function handleDeleteRegistration(regId) {
    await deleteDoc(doc(firestore, 'event_signups', eventId, 'registrations', regId));
    setRegistrations(prev => prev.filter(r => r.id !== regId));
    setSelectedReg(null);
  }

  const columns = event ? buildColumns(event) : [];
  const total = registrations.length;
  const checkedIn = registrations.filter(r => r.checked_in).length;
  const capacity = event?.max_registrations ?? null;
  const capacityPct = capacity ? Math.min(Math.round(total / capacity * 100), 100) : null;
  const filtered = registrations.filter(r => matchesSearch(r, search));

  return (
    <div style={s.screen}>
      <FixedWakeHeader showBackButton onBackPress={() => navigate('/creator/events')} />

      <div style={s.content}>
        <WakeHeaderSpacer />

        {status === 'loading' ? (
          <div style={s.loaderWrap}>
            <WakeLoader />
          </div>
        ) : (
          <>
            {/* Page header */}
            <div style={s.pageHeader}>
              <h1 style={s.title}>{event?.title}</h1>
              <p style={s.subtitle}>
                {total} registro{total !== 1 ? 's' : ''}
                {capacity != null && ` · ${capacity} cupos`}
                {waitlist.length > 0 && ` · ${waitlist.length} en espera`}
              </p>
            </div>

            {/* Stats row */}
            {total > 0 && (
              <div style={s.statsRow}>
                <div style={s.statCard}>
                  <span style={s.statValue}>{total}</span>
                  <span style={s.statLabel}>Total</span>
                </div>
                <div style={s.statCard}>
                  <span style={s.statValue}>{checkedIn}</span>
                  <span style={s.statLabel}>Check-in</span>
                </div>
                <div style={s.statCard}>
                  <span style={s.statValue}>
                    {total > 0 ? `${Math.round(checkedIn / total * 100)}%` : '—'}
                  </span>
                  <span style={s.statLabel}>Tasa</span>
                </div>
                {capacity != null && (
                  <div style={s.statCard}>
                    <span style={s.statValue}>{capacityPct}%</span>
                    <span style={s.statLabel}>Capacidad</span>
                  </div>
                )}
              </div>
            )}

            {/* Check-in button */}
            <button
              style={s.checkinCta}
              onClick={() => navigate(`/creator/events/${eventId}/checkin`)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="3" height="3" rx="0.5" />
                <rect x="18" y="14" width="3" height="3" rx="0.5" />
                <rect x="14" y="18" width="3" height="3" rx="0.5" />
                <rect x="18" y="18" width="3" height="3" rx="0.5" />
              </svg>
              Escanear QR
            </button>

            {/* Search */}
            {total > 0 && (
              <div style={s.searchWrap}>
                <svg style={s.searchIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                </svg>
                <input
                  style={s.searchInput}
                  placeholder="Buscar registros…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
                {search && (
                  <button style={s.searchClear} onClick={() => setSearch('')}>×</button>
                )}
              </div>
            )}

            {/* Registrations list */}
            {filtered.length === 0 ? (
              <div style={s.emptyState}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.2">
                  <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
                </svg>
                <p style={s.emptyText}>
                  {search ? 'Sin resultados.' : 'Aún no hay registros.'}
                </p>
              </div>
            ) : (
              <div style={s.listContainer}>
                {filtered.map((reg, idx) => {
                  const name = getDisplayName(reg, columns);
                  const sub = getDisplaySub(reg, columns);
                  const isLast = idx === filtered.length - 1;
                  return (
                    <button
                      key={reg.id}
                      style={{ ...s.regRow, borderBottom: isLast ? 'none' : '1px solid rgba(255,255,255,0.07)' }}
                      onClick={() => setSelectedReg(reg)}
                    >
                      <div style={s.regAvatar}>{name.charAt(0).toUpperCase()}</div>
                      <div style={s.regInfo}>
                        <span style={s.regName}>{name}</span>
                        {sub && <span style={s.regSub}>{sub}</span>}
                      </div>
                      <div style={s.regRight}>
                        {reg.checked_in ? (
                          <span style={s.checkBadgeYes}>✓</span>
                        ) : (
                          <span style={s.checkBadgeNo}>—</span>
                        )}
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2">
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Waitlist */}
            {waitlist.length > 0 && (
              <div style={s.waitlistSection}>
                <p style={s.waitlistTitle}>
                  Lista de espera
                  <span style={s.waitlistCount}>{waitlist.length}</span>
                </p>
                <div style={s.listContainer}>
                  {waitlist.map((w, idx) => (
                    <div
                      key={w.id}
                      style={{
                        ...s.regRow,
                        cursor: 'default',
                        borderBottom: idx === waitlist.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.07)',
                      }}
                    >
                      <div style={s.regAvatar}>{(w.contact || '?').charAt(0).toUpperCase()}</div>
                      <span style={{ ...s.regName, flex: 1 }}>{w.contact}</span>
                      <span style={s.regSub}>{formatDate(w.created_at)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {selectedReg && (
        <RowModal
          reg={selectedReg}
          columns={columns}
          onClose={() => setSelectedReg(null)}
          onCheckIn={() => handleManualCheckIn(selectedReg.id)}
          onDelete={() => handleDeleteRegistration(selectedReg.id)}
        />
      )}
    </div>
  );
}

const s = {
  screen: {
    position: 'fixed',
    inset: 0,
    backgroundColor: '#1a1a1a',
    overflowY: 'auto',
    WebkitOverflowScrolling: 'touch',
  },
  content: {
    padding: '0 16px 96px',
  },
  loaderWrap: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageHeader: {
    paddingTop: 'max(16px, 2vh)',
    paddingLeft: 20,
    marginBottom: 20,
  },
  title: {
    color: '#ffffff',
    fontSize: 'clamp(26px, 8vw, 32px)',
    fontWeight: '600',
    margin: '0 0 4px',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 13,
    margin: 0,
  },
  statsRow: {
    display: 'flex',
    gap: 10,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.08)',
    padding: '12px 8px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 700,
  },
  statLabel: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 11,
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  checkinCta: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    padding: '13px 0',
    marginBottom: 16,
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.14)',
    borderRadius: 12,
    color: '#ffffff',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  searchWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 10,
    padding: '10px 12px',
    marginBottom: 14,
  },
  searchIcon: {
    color: 'rgba(255,255,255,0.3)',
    flexShrink: 0,
  },
  searchInput: {
    flex: 1,
    background: 'none',
    border: 'none',
    outline: 'none',
    color: '#ffffff',
    fontSize: 14,
    fontFamily: 'inherit',
  },
  searchClear: {
    background: 'none',
    border: 'none',
    color: 'rgba(255,255,255,0.4)',
    cursor: 'pointer',
    fontSize: 18,
    padding: '0 2px',
    lineHeight: 1,
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
    padding: '48px 24px',
    textAlign: 'center',
  },
  emptyText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 14,
    margin: 0,
  },
  listContainer: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.1)',
    overflow: 'hidden',
    marginBottom: 8,
  },
  regRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '12px 14px',
    background: 'none',
    border: 'none',
    borderRadius: 0,
    cursor: 'pointer',
    width: '100%',
    textAlign: 'left',
    fontFamily: 'inherit',
  },
  regAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    background: 'rgba(255,255,255,0.08)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#ffffff',
    fontSize: 15,
    fontWeight: 700,
    flexShrink: 0,
  },
  regInfo: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 0,
  },
  regName: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 600,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  regSub: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 12,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  regRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  checkBadgeYes: {
    color: '#4ade80',
    fontSize: 14,
    fontWeight: 700,
  },
  checkBadgeNo: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 14,
  },
  waitlistSection: {
    marginTop: 28,
  },
  waitlistTitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    margin: '0 0 10px',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  waitlistCount: {
    background: 'rgba(255,255,255,0.1)',
    borderRadius: 10,
    padding: '1px 7px',
    fontSize: 11,
    fontWeight: 700,
    color: 'rgba(255,255,255,0.6)',
  },
};
