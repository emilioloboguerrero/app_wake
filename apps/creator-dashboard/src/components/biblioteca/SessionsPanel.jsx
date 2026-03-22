import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import { GlowingEffect, SkeletonCard, FullScreenError } from '../ui';
import libraryService from '../../services/libraryService';
import { cacheConfig, queryKeys } from '../../config/queryClient';

const GripIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
    <circle cx="9"  cy="5"  r="1.5" fill="currentColor" />
    <circle cx="15" cy="5"  r="1.5" fill="currentColor" />
    <circle cx="9"  cy="12" r="1.5" fill="currentColor" />
    <circle cx="15" cy="12" r="1.5" fill="currentColor" />
    <circle cx="9"  cy="19" r="1.5" fill="currentColor" />
    <circle cx="15" cy="19" r="1.5" fill="currentColor" />
  </svg>
);

function SortableSessionCard({ session, onNavigate }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: session.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 'auto',
  };

  const exerciseCount = session.exercises?.length ?? 0;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="lib-session-card"
      onClick={() => onNavigate(session.id)}
    >
      <GlowingEffect spread={24} borderWidth={1} />
      <div className="lib-session-card-top">
        <button
          className="lib-drag-handle"
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          aria-label="Arrastrar sesión"
        >
          <GripIcon />
        </button>
        <h3 className="lib-session-title">
          {session.title || `Sesión ${session.id?.slice(0, 6)}`}
        </h3>
        <span className="lib-count-badge">
          {exerciseCount} {exerciseCount === 1 ? 'ejercicio' : 'ejercicios'}
        </span>
      </div>
      {session.muscleGroups?.length > 0 && (
        <div className="lib-session-muscles">
          {session.muscleGroups.slice(0, 3).map((mg) => (
            <span key={mg} className="lib-muscle-pill lib-muscle-pill--dim">{mg}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function SkeletonGrid({ count = 6 }) {
  return (
    <div className="lib-skeleton-grid" style={{ '--lib-grid-cols': 2 }}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

export default function SessionsPanel({ searchQuery = '' }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [sessionOrder, setSessionOrder] = useState(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const { data: rawSessions = [], isLoading, isError } = useQuery({
    queryKey: queryKeys.library.sessions(user?.uid),
    queryFn: () => libraryService.getSessionLibrary(),
    enabled: !!user?.uid,
    ...cacheConfig.programStructure,
  });

  const sessions = useMemo(() => {
    if (sessionOrder && sessionOrder.length === rawSessions.length) {
      const byId = Object.fromEntries(rawSessions.map((s) => [s.id, s]));
      return sessionOrder.map((id) => byId[id]).filter(Boolean);
    }
    return rawSessions;
  }, [rawSessions, sessionOrder]);

  const q = searchQuery.trim().toLowerCase();
  const filtered = useMemo(
    () => (q ? sessions.filter((s) => s.title?.toLowerCase().includes(q)) : sessions),
    [sessions, q]
  );

  const handleDragEnd = useCallback((event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = sessions.map((s) => s.id);
    const from = ids.indexOf(active.id);
    const to = ids.indexOf(over.id);
    setSessionOrder(arrayMove(ids, from, to));
  }, [sessions]);

  if (isLoading) return <SkeletonGrid />;
  if (isError) return <FullScreenError title="No se pudieron cargar las sesiones" message="Verifica tu conexion e intenta de nuevo." onRetry={() => window.location.reload()} />;
  if (!filtered.length) {
    return (
      <div className="lib-empty">
        <p className="lib-empty-title">Sin sesiones guardadas</p>
        <p className="lib-empty-sub">Crea una sesion y reutilizala en multiples programas.</p>
        <button className="lib-empty-cta" onClick={() => navigate('/library/sessions/new')}>+ Nueva sesión</button>
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={filtered.map((s) => s.id)} strategy={verticalListSortingStrategy}>
        <div className="lib-sessions-grid">
          {filtered.map((session) => (
            <SortableSessionCard
              key={session.id}
              session={session}
              onNavigate={(id) => navigate(`/content/sessions/${id}`)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
