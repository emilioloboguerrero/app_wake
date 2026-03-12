import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { firestore } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import './EventsScreen.css';

export default function EventsScreen() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [registrationCounts, setRegistrationCounts] = useState({});

  useEffect(() => {
    if (!user) return;

    console.log('[EventsScreen] loading events for user', user.uid);
    getDocs(query(
      collection(firestore, 'events'),
      where('creator_id', '==', user.uid),
      orderBy('created_at', 'desc')
    )).then(async snap => {
      const eventsData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      console.log('[EventsScreen] events loaded', eventsData.length);
      setEvents(eventsData);

      const counts = {};
      await Promise.all(eventsData.map(async ev => {
        const regSnap = await getDocs(collection(firestore, 'event_signups', ev.id, 'registrations'));
        counts[ev.id] = regSnap.size;
        console.log('[EventsScreen] registrations for', ev.id, regSnap.size);
      }));
      setRegistrationCounts(counts);
      setLoading(false);
    }).catch(err => { console.error('[EventsScreen] query failed', err); setLoading(false); });
  }, [user]);

  function statusLabel(status) {
    if (status === 'active') return { text: 'Activo', className: 'events-status-active' };
    if (status === 'closed') return { text: 'Cerrado', className: 'events-status-closed' };
    return { text: status, className: '' };
  }

  return (
    <DashboardLayout screenName="Eventos">
      <div className="events-screen">
        <div className="events-header">
          <h1 className="events-title">Eventos</h1>
        </div>

        {loading ? (
          <div className="events-empty">Cargando...</div>
        ) : events.length === 0 ? (
          <div className="events-empty">No tienes eventos aún.</div>
        ) : (
          <div className="events-list">
            {events.map(ev => {
              const { text, className } = statusLabel(ev.status);
              const count = registrationCounts[ev.id] ?? '—';
              return (
                <div key={ev.id} className="events-row">
                  {ev.image_url && (
                    <div className="events-row-cover" style={{ backgroundImage: `url(${ev.image_url})` }} />
                  )}
                  <div className="events-row-info">
                    <span className="events-row-title">{ev.title}</span>
                    <span className={`events-row-status ${className}`}>{text}</span>
                  </div>
                  <div className="events-row-meta">
                    <span className="events-row-count">{count} registros</span>
                    <button
                      className="events-row-btn"
                      onClick={() => navigate(`/events/${ev.id}/results`)}
                    >
                      Ver resultados
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
