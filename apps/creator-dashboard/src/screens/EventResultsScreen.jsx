import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, getDocs, orderBy, query, deleteDoc, updateDoc, increment } from 'firebase/firestore';
import { firestore } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import './EventResultsScreen.css';

function relativeLuminance(r, g, b) {
  return [r, g, b]
    .map(v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); })
    .reduce((acc, c, i) => acc + c * [0.2126, 0.7152, 0.0722][i], 0);
}

export default function EventResultsScreen() {
  const { eventId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState('loading');
  const [event, setEvent] = useState(null);
  const [registrations, setRegistrations] = useState([]);
  const [waitlist, setWaitlist] = useState([]);
  const [accentRgb, setAccentRgb] = useState([255, 255, 255]);

  useEffect(() => {
    if (!user) return;

    getDoc(doc(firestore, 'events', eventId)).then(async snap => {
      if (!snap.exists() || snap.data().creator_id !== user.uid) {
        navigate('/events', { replace: true });
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
    }).catch(() => navigate('/events', { replace: true }));
  }, [eventId, user, navigate]);

  // Color extraction from flyer
  useEffect(() => {
    if (!event?.image_url) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const size = 64;
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        let bestR = 255, bestG = 255, bestB = 255, bestScore = -1;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
          if (a < 128) continue;
          const max = Math.max(r, g, b), min = Math.min(r, g, b);
          if (max < 40 || max > 245) continue;
          const sat = max === 0 ? 0 : (max - min) / max;
          const score = sat * (max / 255);
          if (score > bestScore) { bestScore = score; bestR = r; bestG = g; bestB = b; }
        }
        setAccentRgb([bestR, bestG, bestB]);
      } catch {}
    };
    img.src = event.image_url;
  }, [event?.image_url]);

  function exportCSV() {
    const headers = ['Nombre', 'Email', 'Teléfono', 'Edad', 'Género', 'Fecha', 'Check-in'];
    const rows = registrations.map(r => [
      r.nombre,
      r.email,
      r.telefono,
      r.edad,
      r.genero,
      r.created_at?.toDate().toLocaleDateString('es-CO') ?? '',
      r.checked_in ? 'Sí' : 'No',
    ]);
    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `registros-${eventId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function formatDate(ts) {
    if (!ts) return '—';
    return ts.toDate().toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  async function admitFromWaitlist(waitId) {
    try {
      await Promise.all([
        deleteDoc(doc(firestore, 'event_signups', eventId, 'waitlist', waitId)),
        event?.max_registrations != null
          ? updateDoc(doc(firestore, 'events', eventId), { max_registrations: increment(1) })
          : Promise.resolve(),
      ]);
      setWaitlist(prev => prev.filter(w => w.id !== waitId));
      if (event?.max_registrations != null) {
        setEvent(prev => ({ ...prev, max_registrations: (prev.max_registrations ?? 0) + 1 }));
      }
    } catch (err) {
      console.error('[EventResults] admit failed', err);
    }
  }

  const cssVars = {
    '--er-accent-r': accentRgb[0],
    '--er-accent-g': accentRgb[1],
    '--er-accent-b': accentRgb[2],
  };

  return (
    <DashboardLayout
      screenName={event?.title ?? 'Resultados'}
      showBackButton
      backPath="/events"
    >
      <div className="event-results-screen" style={cssVars}>
        {/* Ambient orbs */}
        <div className="er-orbs" aria-hidden="true">
          <div className="er-orb er-orb-1" />
          <div className="er-orb er-orb-2" />
        </div>

        {status === 'loading' ? (
          <div className="event-results-empty">Cargando...</div>
        ) : (
          <>
            <div className="event-results-header">
              <div>
                <h1 className="event-results-title">{event?.title}</h1>
                <span className="event-results-count">
                  {registrations.length} registros
                  {event?.max_registrations != null && ` · ${event.max_registrations} cupos`}
                  {waitlist.length > 0 && ` · ${waitlist.length} en lista de espera`}
                </span>
                {event?.max_registrations != null && (
                  <div className="er-capacity-bar-outer">
                    <div
                      className="er-capacity-bar-fill"
                      style={{ width: `${Math.min((event.registration_count ?? 0) / event.max_registrations * 100, 100)}%` }}
                    />
                  </div>
                )}
              </div>
              {registrations.length > 0 && (
                <button className="event-results-export-btn" onClick={exportCSV}>
                  Exportar CSV
                </button>
              )}
            </div>

            {registrations.length === 0 ? (
              <div className="event-results-empty">Aún no hay registros.</div>
            ) : (
              <div className="event-results-table-wrap">
                <table className="event-results-table">
                  <thead>
                    <tr>
                      <th>Nombre</th>
                      <th>Email</th>
                      <th>Teléfono</th>
                      <th>Edad</th>
                      <th>Género</th>
                      <th>Fecha</th>
                      <th>Check-in</th>
                    </tr>
                  </thead>
                  <tbody>
                    {registrations.map(r => (
                      <tr key={r.id}>
                        <td>{r.nombre}</td>
                        <td>{r.email}</td>
                        <td>{r.telefono}</td>
                        <td>{r.edad}</td>
                        <td>{r.genero}</td>
                        <td>{formatDate(r.created_at)}</td>
                        <td>
                          <span className={`event-results-checkin ${r.checked_in ? 'event-results-checkin-yes' : ''}`}>
                            {r.checked_in ? 'Sí' : 'No'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {waitlist.length > 0 && (
              <div className="er-waitlist-section">
                <h2 className="er-waitlist-title">Lista de espera <span className="er-waitlist-count">{waitlist.length}</span></h2>
                <div className="event-results-table-wrap">
                  <table className="event-results-table">
                    <thead>
                      <tr>
                        <th>Contacto</th>
                        <th>Fecha</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {waitlist.map(w => (
                        <tr key={w.id}>
                          <td>{w.contact}</td>
                          <td>{formatDate(w.created_at)}</td>
                          <td>
                            <button className="er-admit-btn" onClick={() => admitFromWaitlist(w.id)}>
                              Admitir
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
