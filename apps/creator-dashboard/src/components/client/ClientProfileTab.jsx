import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../../utils/apiClient';
import { queryKeys } from '../../config/queryClient';
import { ShimmerSkeleton, GlowingEffect } from '../ui';
import {
  MapPin, Mail, User, Dumbbell,
  Plus, Trash2, Calendar, ShieldCheck, Info, X,
  Send,
} from 'lucide-react';
import './ClientProfileTab.css';

export default function ClientProfileTab({ clientId, clientUserId, clientName, creatorId, clientDetail }) {
  const queryClient = useQueryClient();
  const [newNote, setNewNote] = useState('');
  const [accessModal, setAccessModal] = useState(null);

  const profile = clientDetail;

  const addNote = useMutation({
    mutationKey: ['clients', 'add-note'],
    mutationFn: (text) => apiClient.post(`/creator/clients/${clientId}/notes`, { text }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.detail(clientId) });
      setNewNote('');
    },
  });

  const deleteNote = useMutation({
    mutationKey: ['clients', 'delete-note'],
    mutationFn: (noteId) => apiClient.delete(`/creator/clients/${clientId}/notes/${noteId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.clients.detail(clientId) }),
  });

  const updateAccess = useMutation({
    mutationKey: ['clients', 'update-access'],
    mutationFn: ({ programId, expiresAt }) =>
      apiClient.patch(`/creator/clients/${clientUserId}/programs/${programId}`, { expiresAt }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.detail(clientId) });
      setAccessModal(null);
    },
  });

  const handleSubmitNote = useCallback((e) => {
    e.preventDefault();
    if (!newNote.trim()) return;
    addNote.mutate(newNote.trim());
  }, [newNote, addNote]);

  if (!profile) return <ProfileSkeleton />;

  const avatar = profile?.profilePictureUrl || profile?.avatarUrl;
  const email = profile?.email || profile?.clientEmail;
  const country = profile?.country;
  const city = profile?.city;
  const gender = profile?.gender;
  const enrolledPrograms = profile?.enrolledPrograms || [];
  const notes = profile?.notes || [];

  return (
    <div className="cprt-root">
      {/* ── Hero: avatar + identity ───────────────────────────── */}
      <div className="cprt-hero" style={{ animationDelay: '0ms' }}>
        <GlowingEffect spread={50} proximity={140} borderWidth={1} />
        <div className="cprt-hero-inner">
          <div className="cprt-hero-avatar-wrap">
            {avatar ? (
              <img src={avatar} alt={clientName} className="cprt-hero-avatar" />
            ) : (
              <div className="cprt-hero-avatar-fallback">
                {clientName?.charAt(0)?.toUpperCase() || 'C'}
              </div>
            )}
          </div>
          <div className="cprt-hero-info">
            <h2 className="cprt-hero-name">{clientName}</h2>
            <div className="cprt-hero-meta">
              {email && <span className="cprt-hero-chip"><Mail size={11} /> {email}</span>}
              {(country || city) && <span className="cprt-hero-chip"><MapPin size={11} /> {[city, country].filter(Boolean).join(', ')}</span>}
              {gender && <span className="cprt-hero-chip"><User size={11} /> {gender}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* ── Two-column layout ─────────────────────────────────── */}
      <div className="cprt-columns">

        {/* ── Left column ───────────────────────────────────── */}
        <div className="cprt-col-left">

          {/* Programs */}
          {enrolledPrograms.length > 0 && (
            <div className="cprt-panel cprt-panel--stagger-2">
              <GlowingEffect spread={40} proximity={120} borderWidth={1} />
              <div className="cprt-panel-inner">
                <h3 className="cprt-panel-title">Programa</h3>
                <div className="cprt-programs">
                  {enrolledPrograms.map((prog) => (
                    <div key={prog.courseId} className="cprt-prog">
                      {prog.image_url ? (
                        <img src={prog.image_url} alt={prog.title} className="cprt-prog-img" />
                      ) : (
                        <div className="cprt-prog-img-fallback"><Dumbbell size={20} /></div>
                      )}
                      <div className="cprt-prog-body">
                        <span className="cprt-prog-name">{prog.title || 'Programa'}</span>
                        <div className="cprt-prog-row">
                          <span className={`cprt-prog-badge cprt-prog-badge--${prog.status || 'active'}`}>
                            {prog.status === 'active' ? 'Activo' : prog.status}
                          </span>
                          <span className="cprt-prog-expiry">
                            {prog.expires_at ? `Hasta ${prog.expires_at}` : 'Sin limite'}
                          </span>
                        </div>
                      </div>
                      <button className="cprt-prog-access" onClick={() => setAccessModal({ courseId: prog.courseId, title: prog.title, currentExpiry: prog.expires_at || '' })}>
                        <ShieldCheck size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Right column: notes ────────────────────────────── */}
        <div className="cprt-col-right">
          <div className="cprt-panel cprt-panel--stagger-3 cprt-panel--notes">
            <GlowingEffect spread={40} proximity={120} borderWidth={1} />
            <div className="cprt-panel-inner">
              <h3 className="cprt-panel-title">Notas del entrenador</h3>

              <form className="cprt-nf" onSubmit={handleSubmitNote}>
                <textarea
                  className="cprt-nf-input"
                  placeholder="Escribe una nota..."
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  rows={3}
                />
                <button type="submit" className="cprt-nf-send" disabled={!newNote.trim() || addNote.isPending} aria-label="Enviar nota">
                  <Send size={14} />
                </button>
              </form>

              <div className="cprt-notes-timeline">
                {notes.length > 0 ? notes.map((note) => (
                  <div key={note.id} className="cprt-nt-item">
                    <div className="cprt-nt-dot" />
                    <div className="cprt-nt-content">
                      <p className="cprt-nt-text">{note.text}</p>
                      <span className="cprt-nt-date">
                        {note.createdAt ? new Date(note.createdAt).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                      </span>
                    </div>
                    <button className="cprt-nt-del" onClick={() => deleteNote.mutate(note.id)} disabled={deleteNote.isPending} aria-label="Eliminar nota">
                      <Trash2 size={11} />
                    </button>
                  </div>
                )) : (
                  <p className="cprt-notes-empty">Las notas que escribas sobre este cliente apareceran aqui. Solo tu las puedes ver.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {accessModal && (
        <AccessDateModal
          title={accessModal.title}
          currentExpiry={accessModal.currentExpiry}
          isPending={updateAccess.isPending}
          onSave={(expiresAt) => updateAccess.mutate({ programId: accessModal.courseId, expiresAt })}
          onClose={() => setAccessModal(null)}
        />
      )}
    </div>
  );
}

/* ── Skeleton ──────────────────────────────────────────────────── */
function ProfileSkeleton() {
  return (
    <div className="cprt-root">
      <div className="cprt-hero cprt-hero--skeleton">
        <div className="cprt-hero-inner">
          <ShimmerSkeleton width={72} height={72} style={{ borderRadius: '50%', flexShrink: 0 }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <ShimmerSkeleton width={180} height={22} />
            <div style={{ display: 'flex', gap: 8 }}>
              <ShimmerSkeleton width={140} height={16} style={{ borderRadius: 8 }} />
              <ShimmerSkeleton width={100} height={16} style={{ borderRadius: 8 }} />
            </div>
          </div>
        </div>
      </div>
      <div className="cprt-columns">
        <div className="cprt-col-left">
          <div className="cprt-panel cprt-panel--skeleton">
            <div className="cprt-panel-inner">
              <ShimmerSkeleton width={160} height={14} />
              <div style={{ marginTop: 16 }}>
                <ShimmerSkeleton width="100%" height={48} style={{ borderRadius: 10 }} />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                <ShimmerSkeleton width={90} height={28} style={{ borderRadius: 8 }} />
                <ShimmerSkeleton width={70} height={28} style={{ borderRadius: 8 }} />
                <ShimmerSkeleton width={80} height={28} style={{ borderRadius: 8 }} />
                <ShimmerSkeleton width={75} height={28} style={{ borderRadius: 8 }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
                <ShimmerSkeleton width="100%" height={32} style={{ borderRadius: 8 }} />
                <ShimmerSkeleton width="100%" height={32} style={{ borderRadius: 8 }} />
                <ShimmerSkeleton width="100%" height={32} style={{ borderRadius: 8 }} />
              </div>
            </div>
          </div>
          <div className="cprt-panel cprt-panel--skeleton">
            <div className="cprt-panel-inner">
              <ShimmerSkeleton width={120} height={14} />
              <div style={{ marginTop: 12 }}>
                <ShimmerSkeleton width="100%" height={64} style={{ borderRadius: 12 }} />
              </div>
            </div>
          </div>
        </div>
        <div className="cprt-col-right">
          <div className="cprt-panel cprt-panel--skeleton cprt-panel--notes">
            <div className="cprt-panel-inner">
              <ShimmerSkeleton width={140} height={14} />
              <ShimmerSkeleton width="100%" height={72} style={{ marginTop: 12, borderRadius: 10 }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
                <ShimmerSkeleton width="100%" height={40} style={{ borderRadius: 8 }} />
                <ShimmerSkeleton width="85%" height={40} style={{ borderRadius: 8 }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Sub-components ────────────────────────────────────────────── */
function AccessDateModal({ title, currentExpiry, isPending, onSave, onClose }) {
  const [date, setDate] = useState(currentExpiry || '');
  const [noEndDate, setNoEndDate] = useState(!currentExpiry);

  return (
    <div className="cprt-modal-backdrop" onClick={onClose}>
      <div className="cprt-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cprt-modal-header">
          <h3 className="cprt-modal-title">Gestionar acceso</h3>
          <button className="cprt-modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <p className="cprt-modal-program">{title}</p>
        <div className="cprt-modal-explain">
          <Info size={14} className="cprt-modal-explain-icon" />
          <p>
            La fecha de fin de acceso determina hasta cuando tu cliente puede ver y usar
            este programa. Cuando la fecha pase, el programa aparecera como expirado
            en su app. Si no defines una fecha, el acceso sera indefinido.
          </p>
        </div>
        <div className="cprt-modal-options">
          <label className={`cprt-modal-option ${noEndDate ? 'cprt-modal-option--selected' : ''}`}>
            <input type="radio" checked={noEndDate} onChange={() => { setNoEndDate(true); setDate(''); }} />
            <span>Acceso indefinido</span>
          </label>
          <label className={`cprt-modal-option ${!noEndDate ? 'cprt-modal-option--selected' : ''}`}>
            <input type="radio" checked={!noEndDate} onChange={() => setNoEndDate(false)} />
            <span>Definir fecha de fin</span>
          </label>
        </div>
        {!noEndDate && (
          <input type="date" className="cprt-modal-date-input" value={date} onChange={(e) => setDate(e.target.value)} min={new Date().toISOString().slice(0, 10)} />
        )}
        <div className="cprt-modal-actions">
          <button className="cprt-modal-cancel" onClick={onClose}>Cancelar</button>
          <button className="cprt-modal-save" onClick={() => onSave(noEndDate ? null : date || null)} disabled={isPending || (!noEndDate && !date)}>
            {isPending ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}
