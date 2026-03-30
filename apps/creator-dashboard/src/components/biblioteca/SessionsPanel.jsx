import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
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
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import { GlowingEffect, MenuDropdown, ConfirmDeleteModal } from '../ui';
import MuscleSilhouetteSVG from '../MuscleSilhouetteSVG';
import { extractAccentFromImage } from '../events/eventFieldComponents';
import PanelShell from './PanelShell';
import ShimmerSkeleton from '../ui/ShimmerSkeleton';
import libraryService from '../../services/libraryService';
import { cacheConfig, queryKeys } from '../../config/queryClient';
import '../../screens/ProgramasScreen.css';

function SessionsPanelSkeleton() {
  return (
    <div className="pgs-list">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="pgs-card"
          style={{ pointerEvents: 'none', animation: 'none' }}
        >
          <div className="pgs-card__image-side">
            <ShimmerSkeleton width="100%" height="100%" borderRadius="0" />
          </div>
          <div className="pgs-card__content" style={{ gap: 10 }}>
            <ShimmerSkeleton width="55%" height="18px" borderRadius="6px" />
            <ShimmerSkeleton width="35%" height="13px" borderRadius="4px" />
          </div>
          <div className="pgs-card__muscle-heatmap" style={{ opacity: 0.15 }}>
            <ShimmerSkeleton width="80px" height="140px" borderRadius="8px" />
          </div>
        </div>
      ))}
    </div>
  );
}

function computeMuscleVolumes(exercises) {
  if (!exercises?.length) return null;
  const muscleSets = {};
  exercises.forEach((ex) => {
    const setCount = ex.sets?.length || 1;

    if (ex.muscle_activation && typeof ex.muscle_activation === 'object') {
      Object.entries(ex.muscle_activation).forEach(([muscle, pct]) => {
        const num = typeof pct === 'string' ? parseFloat(pct) : pct;
        if (!Number.isNaN(num) && num > 0) {
          muscleSets[muscle] = (muscleSets[muscle] || 0) + setCount * (num / 100);
        }
      });
    } else {
      const muscles = ex.primaryMuscles || [];
      muscles.forEach((m) => {
        muscleSets[m] = (muscleSets[m] || 0) + setCount;
      });
    }
  });
  const max = Math.max(...Object.values(muscleSets), 1);
  const normalized = {};
  Object.entries(muscleSets).forEach(([m, v]) => {
    normalized[m] = v / max;
  });
  return Object.keys(normalized).length > 0 ? normalized : null;
}

function SortableSessionCard({ session, onNavigate, onDelete, index }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: session.id });

  const [accent, setAccent] = useState(null);

  useEffect(() => {
    if (!session.image_url) return;
    return extractAccentFromImage(session.image_url, setAccent);
  }, [session.image_url]);

  const accentRgb = accent ? `${accent[0]}, ${accent[1]}, ${accent[2]}` : null;
  const titleColor = accentRgb ? `rgb(${accentRgb})` : 'var(--text-primary, #fff)';

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 'auto',
  };

  const exerciseCount = session.exercises?.length || session.exerciseCount || 0;
  const muscleVolumes = useMemo(() => computeMuscleVolumes(session.exercises), [session.exercises]);

  const menuItems = [
    { label: 'Eliminar', onClick: () => onDelete?.(session), danger: true },
  ];

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, '--card-index': index }}
      className="pgs-card"
      role="button"
      tabIndex={0}
      onClick={() => onNavigate(session.id)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onNavigate(session.id); }}
      {...attributes}
      {...listeners}
    >
      <GlowingEffect spread={24} proximity={60} inactiveZone={0.6} />

      <div className="pgs-card__image-side">
        {session.image_url ? (
          <>
            <img
              src={session.image_url}
              alt={session.title || 'Sesion'}
              className="pgs-card__img"
              loading="lazy"
            />
            <div className="pgs-card__img-gradient" />
          </>
        ) : (
          <div className="pgs-card__placeholder">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M4 22v-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        )}
      </div>

      <div className="pgs-card__content">
        <div className="pgs-card__top-row">
          <h3 className="pgs-card__title" style={{ color: titleColor }}>{session.title || 'Sin nombre'}</h3>
        </div>

        {exerciseCount > 0 && (
          <span className="pgs-stat__label">{exerciseCount} ejercicio{exerciseCount !== 1 ? 's' : ''}</span>
        )}
      </div>

      <div className="pgs-card__muscle-heatmap">
        <MuscleSilhouetteSVG muscleVolumes={muscleVolumes || {}} accentRgb={accent} />
      </div>

      <div className="pgs-card__menu-col" onClick={(e) => e.stopPropagation()}>
        <MenuDropdown
          trigger={
            <button type="button" className="pgs-card__menu-btn" aria-label="Opciones">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                <circle cx="12" cy="5" r="1.5" fill="currentColor" />
                <circle cx="12" cy="12" r="1.5" fill="currentColor" />
                <circle cx="12" cy="19" r="1.5" fill="currentColor" />
              </svg>
            </button>
          }
          items={menuItems}
        />
      </div>
    </div>
  );
}

export default function SessionsPanel({ searchQuery = '', sortKey, onCreateSession }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [sessionOrder, setSessionOrder] = useState(null);
  const reorderTimeoutRef = useRef(null);

  const isDragEnabled = !sortKey || sortKey === 'name_asc';
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const { data: rawSessions = [], isLoading, isError } = useQuery({
    queryKey: queryKeys.library.sessions(user?.uid),
    queryFn: () => libraryService.getSessionLibraryWithExercises(),
    enabled: !!user?.uid,
    ...cacheConfig.librarySessions,
  });

  const sessions = useMemo(() => {
    if (sessionOrder && sessionOrder.length === rawSessions.length) {
      const byId = Object.fromEntries(rawSessions.map((s) => [s.id, s]));
      return sessionOrder.map((id) => byId[id]).filter(Boolean);
    }
    return rawSessions;
  }, [rawSessions, sessionOrder]);

  const q = searchQuery.trim().toLowerCase();
  const filtered = useMemo(() => {
    let result = q ? sessions.filter((s) => s.title?.toLowerCase().includes(q)) : [...sessions];
    if (sortKey === 'name_asc') result.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    else if (sortKey === 'name_desc') result.sort((a, b) => (b.title || '').localeCompare(a.title || ''));
    else if (sortKey === 'date_newest') result.sort((a, b) => (b.created_at?._seconds || 0) - (a.created_at?._seconds || 0));
    else if (sortKey === 'date_oldest') result.sort((a, b) => (a.created_at?._seconds || 0) - (b.created_at?._seconds || 0));
    return result;
  }, [sessions, q, sortKey]);

  const [deleteTarget, setDeleteTarget] = useState(null);

  const deleteMutation = useMutation({
    mutationFn: (sessionId) => libraryService.deleteLibrarySession(user?.uid, sessionId),
    onSuccess: () => {
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.library.sessions(user?.uid) });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: (order) => libraryService.reorderSessions(order),
    onError: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.library.sessions(user?.uid) });
    },
  });

  useEffect(() => {
    return () => {
      if (reorderTimeoutRef.current) clearTimeout(reorderTimeoutRef.current);
    };
  }, []);

  const handleDeleteSession = useCallback((session) => {
    setDeleteTarget(session);
  }, []);

  const confirmDelete = useCallback(() => {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id);
  }, [deleteTarget, deleteMutation]);

  const handleDragEnd = useCallback((event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = sessions.map((s) => s.id);
    const from = ids.indexOf(active.id);
    const to = ids.indexOf(over.id);
    const newOrder = arrayMove(ids, from, to);
    setSessionOrder(newOrder);

    if (reorderTimeoutRef.current) clearTimeout(reorderTimeoutRef.current);
    reorderTimeoutRef.current = setTimeout(() => {
      reorderMutation.mutate(newOrder);
    }, 500);
  }, [sessions, reorderMutation]);

  return (
    <PanelShell
      isLoading={isLoading}
      isError={isError}
      isEmpty={!filtered.length && !isLoading}
      emptyTitle="Sin sesiones guardadas"
      emptySub="Crea una sesion y reutilizala en multiples programas."
      emptyCta="+ Nueva sesion"
      onCta={onCreateSession || (() => navigate('/library/sessions/new'))}
      onRetry={() => window.location.reload()}
      renderSkeleton={() => <SessionsPanelSkeleton />}
    >
      <DndContext sensors={isDragEnabled ? sensors : undefined} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={filtered.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <div className="pgs-list">
            <AnimatePresence mode="popLayout">
              {filtered.map((session, i) => (
                <motion.div
                  key={session.id}
                  layout
                  exit={{ opacity: 0, scale: 0.92, x: -30, filter: 'blur(4px)' }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                >
                  <SortableSessionCard
                    session={session}
                    index={i}
                    onNavigate={(id) => navigate(`/content/sessions/${id}`)}
                    onDelete={handleDeleteSession}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </SortableContext>
      </DndContext>

      <ConfirmDeleteModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        itemName={deleteTarget?.title || 'esta sesion'}
        description="Esta accion no se puede deshacer."
        isDeleting={deleteMutation.isPending}
      />
    </PanelShell>
  );
}
