import React, { useState } from 'react';
import { Video, Clock, ChevronRight, Inbox } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import VideoExchangeThread from '../components/client/VideoExchangeThread';
import { useAuth } from '../contexts/AuthContext';
import useReviewInbox from '../hooks/useReviewInbox';
import './ReviewInboxScreen.css';

export default function ReviewInboxScreen() {
  const { user } = useAuth();
  const creatorId = user?.uid;
  const [selectedId, setSelectedId] = useState(null);

  const { data: items = [], isLoading, error } = useReviewInbox(creatorId);

  if (selectedId) {
    return (
      <DashboardLayout screenName="ReviewInboxDetail">
        <div className="ris-detail">
          <VideoExchangeThread
            exchangeId={selectedId}
            creatorId={creatorId}
            onBack={() => setSelectedId(null)}
          />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout screenName="ReviewInboxScreen">
      <div className="ris-container">
        <header className="ris-header">
          <div className="ris-header__title-row">
            <Inbox size={20} />
            <h1 className="ris-title">Videos por revisar</h1>
            {items.length > 0 && <span className="ris-count">{items.length}</span>}
          </div>
          <p className="ris-subtitle">
            Videos que tus clientes te han enviado y están esperando tu respuesta.
          </p>
        </header>

        {isLoading ? (
          <div className="ris-loading">
            {[1, 2, 3].map((i) => <div key={i} className="ris-skeleton" />)}
          </div>
        ) : error ? (
          <div className="ris-error">
            <p>No pudimos cargar tu bandeja. Intenta recargar.</p>
          </div>
        ) : items.length === 0 ? (
          <div className="ris-empty">
            <Video size={32} strokeWidth={1.5} />
            <p className="ris-empty__title">Todo al día</p>
            <span className="ris-empty__desc">No tienes videos pendientes por revisar.</span>
          </div>
        ) : (
          <ul className="ris-list">
            {items.map((item) => (
              <InboxRow
                key={item.id}
                item={item}
                onOpen={() => setSelectedId(item.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </DashboardLayout>
  );
}

function InboxRow({ item, onOpen }) {
  const msg = item.latestClientMessage;
  const thumb = msg?.thumbnailPath ? buildVideoUrl(msg.thumbnailPath) : null;
  const exerciseName = item.exerciseName || 'Video';
  const clientLabel = item.clientName || item.clientEmail || 'Cliente';

  return (
    <li>
      <button className="ris-row" onClick={onOpen}>
        <div className="ris-row__thumb">
          {thumb ? (
            <img src={thumb} alt="" />
          ) : (
            <Video size={18} strokeWidth={1.5} />
          )}
        </div>
        <div className="ris-row__info">
          <span className="ris-row__client">{clientLabel}</span>
          <span className="ris-row__exercise">{exerciseName}</span>
          {msg?.note && <span className="ris-row__note">{msg.note}</span>}
        </div>
        <div className="ris-row__meta">
          <span className="ris-row__time">
            <Clock size={12} />
            {formatTimeAgo(item.lastMessageAt)}
          </span>
          <ChevronRight size={16} />
        </div>
      </button>
    </li>
  );
}

function buildVideoUrl(path) {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  const bucket = 'wolf-20b8b.firebasestorage.app';
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media`;
}

function formatTimeAgo(timestamp) {
  if (!timestamp) return '';
  const date = timestamp.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp);
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `hace ${days}d`;
}
