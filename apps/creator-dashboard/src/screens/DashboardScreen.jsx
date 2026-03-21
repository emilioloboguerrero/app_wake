import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LayoutGrid, Columns3, GripVertical } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import ErrorBoundary from '../components/ErrorBoundary';
import { BentoGrid, BentoCard, GlowingEffect, SpotlightTutorial } from '../components/ui';
import { FullScreenError } from '../components/ui/ErrorStates';
import {
  ClientsWidget,
  CallsWidget,
  RevenueWidget,
  AdherenceWidget,
  SessionsWidget,
  UpcomingCallsWidget,
} from '../components/dashboard';
import { cacheConfig } from '../config/queryClient';
import apiClient from '../utils/apiClient';
import '../components/creator/RevenueCard.css';
import './DashboardScreen.css';

// ── Constants ─────────────────────────────────────────────────────────────────

const LAYOUT_KEY = 'wake_dashboard_layout';
const WIDGET_ORDER_KEY = 'wake_dashboard_widget_order';

const DEFAULT_WIDGET_ORDER = [
  'revenue',
  'clients',
  'calls',
  'adherence',
  'sessions',
  'upcoming-calls',
];

const TUTORIAL_STEPS = [
  {
    selector: '.ds-bento--compact, .ds-bento--wide',
    title: 'Tu centro de control',
    body: 'Este es tu centro de control. Puedes arrastrar las tarjetas para organizar tu dashboard.',
  },
  {
    selector: '.widget-revenue',
    title: 'Tus ingresos',
    body: 'Aqui ves tus ingresos. Toca para ver el desglose completo.',
  },
  {
    selector: '.widget-clients',
    title: 'Tus clientes',
    body: 'Tu roster de clientes activos. Clickea cualquier avatar para ir a su perfil.',
  },
  {
    selector: '.spt-fab',
    title: 'Feedback',
    body: 'Algo que no funcione o que quieras ver? Mandanos feedback directo desde aca.',
  },
];

const WIDGET_CONFIG = {
  revenue: { span: '2x1', className: 'widget-revenue', Component: RevenueWidget },
  clients: { span: '2x1', className: 'widget-clients', Component: ClientsWidget },
  calls: { span: '1x1', className: 'widget-calls', Component: CallsWidget },
  adherence: { span: '1x1', className: 'widget-adherence', Component: AdherenceWidget },
  sessions: { span: '1x1', className: 'widget-sessions', Component: SessionsWidget },
  'upcoming-calls': { span: '1x1', className: 'widget-upcoming-calls', Component: UpcomingCallsWidget },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getStoredLayout() {
  try {
    const v = localStorage.getItem(LAYOUT_KEY);
    return v === 'wide' ? 'wide' : 'compact';
  } catch {
    return 'compact';
  }
}

function getStoredWidgetOrder() {
  try {
    const v = localStorage.getItem(WIDGET_ORDER_KEY);
    if (!v) return DEFAULT_WIDGET_ORDER;
    const parsed = JSON.parse(v);
    if (!Array.isArray(parsed) || parsed.length !== DEFAULT_WIDGET_ORDER.length) {
      return DEFAULT_WIDGET_ORDER;
    }
    return DEFAULT_WIDGET_ORDER.every(id => parsed.includes(id)) ? parsed : DEFAULT_WIDGET_ORDER;
  } catch {
    return DEFAULT_WIDGET_ORDER;
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function DragHandle({ listeners, attributes }) {
  return (
    <button className="ds-drag-handle" aria-label="Arrastrar widget" {...listeners} {...attributes}>
      <GripVertical size={14} />
    </button>
  );
}

function SortableWidget({ id, span, className, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 10 : 'auto',
  };

  return (
    <BentoCard ref={setNodeRef} span={span} className={`${className} ds-sortable-widget`} style={style}>
      <GlowingEffect spread={24} borderWidth={1} />
      <DragHandle listeners={listeners} attributes={attributes} />
      {children}
    </BentoCard>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

const DashboardScreen = () => {
  const { user } = useAuth();
  const [layout, setLayout] = useState(getStoredLayout);
  const [widgetOrder, setWidgetOrder] = useState(getStoredWidgetOrder);
  const [activeId, setActiveId] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const isWide = layout === 'wide';

  const toggleLayout = useCallback(() => {
    setLayout(prev => {
      const next = prev === 'compact' ? 'wide' : 'compact';
      try { localStorage.setItem(LAYOUT_KEY, next); } catch { /* noop */ }
      return next;
    });
  }, []);

  const handleDragStart = useCallback((e) => setActiveId(e.active.id), []);
  const handleDragCancel = useCallback(() => setActiveId(null), []);

  const handleDragEnd = useCallback((event) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setWidgetOrder(prev => {
      const oldIndex = prev.indexOf(active.id);
      const newIndex = prev.indexOf(over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      const next = arrayMove(prev, oldIndex, newIndex);
      try { localStorage.setItem(WIDGET_ORDER_KEY, JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  }, []);

  // ── Queries ──────────────────────────────────────────────────────────────

  const bookingsQuery = useQuery({
    queryKey: ['bookings', 'creator', user?.uid],
    queryFn: () => apiClient.get('/creator/bookings'),
    enabled: !!user?.uid,
    ...cacheConfig.events,
  });

  const revenueQuery = useQuery({
    queryKey: ['analytics', 'revenue', user?.uid],
    queryFn: () => apiClient.get('/analytics/revenue'),
    enabled: !!user?.uid,
    ...cacheConfig.analytics,
  });

  const adherenceQuery = useQuery({
    queryKey: ['analytics', 'adherence', user?.uid],
    queryFn: () => apiClient.get('/analytics/adherence'),
    enabled: !!user?.uid,
    ...cacheConfig.analytics,
  });

  // ── Derived values ────────────────────────────────────────────────────────

  const upcomingBookings = useMemo(() => {
    const raw = bookingsQuery.data?.data ?? bookingsQuery.data ?? [];
    if (!Array.isArray(raw)) return [];
    const now = Date.now();
    return raw
      .filter(b => {
        const t = b.startAt ?? b.scheduledAt;
        return t ? new Date(t).getTime() >= now : true;
      })
      .sort((a, b) => {
        const ta = new Date(a.startAt ?? a.scheduledAt ?? 0).getTime();
        const tb = new Date(b.startAt ?? b.scheduledAt ?? 0).getTime();
        return ta - tb;
      });
  }, [bookingsQuery.data]);

  const callCountThisWeek = useMemo(() => {
    const raw = bookingsQuery.data?.data ?? bookingsQuery.data ?? [];
    if (!Array.isArray(raw)) return 0;
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);
    return raw.filter(b => {
      const t = b.startAt ?? b.scheduledAt;
      if (!t) return false;
      const d = new Date(t);
      return d >= weekStart && d < weekEnd;
    }).length;
  }, [bookingsQuery.data]);

  const nextCallTime = useMemo(() => {
    if (!upcomingBookings.length) return null;
    const t = upcomingBookings[0].startAt ?? upcomingBookings[0].scheduledAt;
    if (!t) return null;
    try {
      const d = new Date(t);
      const date = d.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' });
      const time = d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
      return `${date} \u00B7 ${time}`;
    } catch {
      return null;
    }
  }, [upcomingBookings]);

  const lowTicket = useMemo(() => {
    const lt = revenueQuery.data?.data?.lowTicket;
    return { salesCount: lt?.salesCount ?? 0, netRevenue: lt?.netRevenue ?? 0 };
  }, [revenueQuery.data]);

  const oneOnOne = useMemo(() => {
    const oo = revenueQuery.data?.data?.oneOnOne;
    return { clientCount: oo?.clientCount ?? 0, callCount: oo?.callCount ?? 0 };
  }, [revenueQuery.data]);

  const overallAdherence = useMemo(
    () => adherenceQuery.data?.data?.overallAdherence ?? 0,
    [adherenceQuery.data]
  );

  const byProgram = useMemo(
    () => adherenceQuery.data?.data?.byProgram ?? [],
    [adherenceQuery.data]
  );

  const sessionsCompleted = useMemo(
    () => byProgram.reduce((sum, p) => sum + (p.completedSessions ?? 0), 0),
    [byProgram]
  );

  const programs = useMemo(
    () => revenueQuery.data?.data?.programs ?? [],
    [revenueQuery.data]
  );

  // ── All queries failed → FullScreenError ────────────────────────────────

  const allFailed = bookingsQuery.isError && revenueQuery.isError && adherenceQuery.isError;

  const handleRetryAll = useCallback(() => {
    bookingsQuery.refetch();
    revenueQuery.refetch();
    adherenceQuery.refetch();
  }, [bookingsQuery, revenueQuery, adherenceQuery]);

  if (allFailed) {
    return (
      <ErrorBoundary>
        <DashboardLayout screenName="Inicio">
          <FullScreenError
            title="Algo no esta funcionando"
            message="Revisa tu conexion e intenta de nuevo."
            onRetry={handleRetryAll}
          />
        </DashboardLayout>
      </ErrorBoundary>
    );
  }

  // ── Widget props ────────────────────────────────────────────────────────

  const widgetProps = {
    revenue: { revenueQuery, lowTicket, oneOnOne, programs },
    clients: { revenueQuery, oneOnOne },
    calls: { bookingsQuery, callCountThisWeek, nextCallTime },
    adherence: { adherenceQuery, overallAdherence, byProgram },
    sessions: { adherenceQuery, sessionsCompleted },
    'upcoming-calls': { bookingsQuery, upcomingBookings },
  };

  function renderOverlayContent() {
    if (!activeId) return null;
    const config = WIDGET_CONFIG[activeId];
    if (!config) return null;
    const { Component } = config;
    return (
      <BentoCard span={config.span} className={`${config.className} ds-drag-overlay`}>
        <Component {...widgetProps[activeId]} />
      </BentoCard>
    );
  }

  return (
    <ErrorBoundary>
      <DashboardLayout screenName="Inicio">
        <div className={`ds-canvas ds-canvas--${layout}`}>
          <div className="ds-toolbar">
            <button
              className="ds-layout-toggle"
              onClick={toggleLayout}
              aria-label={isWide ? 'Vista compacta' : 'Vista amplia'}
              title={isWide ? 'Vista compacta' : 'Vista amplia'}
            >
              {isWide ? <LayoutGrid size={14} /> : <Columns3 size={14} />}
              <span>{isWide ? 'Compacto' : 'Amplio'}</span>
            </button>
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <SortableContext items={widgetOrder} strategy={rectSortingStrategy}>
              <BentoGrid className={`ds-bento--${layout}`}>
                {widgetOrder.map(id => {
                  const config = WIDGET_CONFIG[id];
                  if (!config) return null;
                  const { Component } = config;
                  return (
                    <SortableWidget key={id} id={id} span={config.span} className={config.className}>
                      <Component {...widgetProps[id]} />
                    </SortableWidget>
                  );
                })}
              </BentoGrid>
            </SortableContext>

            <DragOverlay dropAnimation={{ duration: 280, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }}>
              {renderOverlayContent()}
            </DragOverlay>
          </DndContext>

          <SpotlightTutorial screenKey="dashboard" steps={TUTORIAL_STEPS} />
        </div>
      </DashboardLayout>
    </ErrorBoundary>
  );
};

export default DashboardScreen;
