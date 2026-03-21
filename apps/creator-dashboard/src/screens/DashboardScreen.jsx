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
import {
  BentoGrid,
  BentoCard,
  GlowingEffect,
  NumberTicker,
  ProgressRing,
  AnimatedList,
  SkeletonCard,
  SpotlightTutorial,
} from '../components/ui';
import { cacheConfig } from '../config/queryClient';
import apiClient from '../utils/apiClient';
import './DashboardScreen.css';

// ── Constants ─────────────────────────────────────────────────────────────────

const LAYOUT_KEY = 'wake_dashboard_layout';
const WIDGET_ORDER_KEY = 'wake_dashboard_widget_order';

const DEFAULT_WIDGET_ORDER = [
  'clients',
  'calls',
  'revenue',
  'adherence',
  'sessions',
  'upcoming-calls',
];

const TUTORIAL_STEPS = [
  {
    selector: '.widget-adherence',
    title: 'Tasa de adherencia',
    body: 'Aquí ves cuántos de tus clientes están siguiendo su plan al pie de la letra. Un número alto = programa que funciona.',
  },
  {
    selector: '.widget-calls',
    title: 'Llamadas esta semana',
    body: 'Tus próximas sesiones en un vistazo. Nunca más te sorprenda una llamada sin preparación.',
  },
  {
    selector: '.ds-layout-toggle',
    title: 'Cambia la vista',
    body: 'Alterna entre vista Compacta (2 columnas) y Amplia (3 columnas) según cuánta información quieras ver de un vistazo.',
  },
];

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
    const valid = DEFAULT_WIDGET_ORDER.every(id => parsed.includes(id));
    return valid ? parsed : DEFAULT_WIDGET_ORDER;
  } catch {
    return DEFAULT_WIDGET_ORDER;
  }
}

function formatTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '—';
  }
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function WidgetLabel({ children }) {
  return <p className="ds-widget-label">{children}</p>;
}

function WidgetTitle({ children }) {
  return <p className="ds-widget-title">{children}</p>;
}

function WidgetEmpty({ message }) {
  return <p className="ds-widget-empty">{message}</p>;
}

function CallItem({ booking }) {
  const clientName = booking?.clientName ?? booking?.userName ?? 'Cliente';
  const startAt = booking?.startAt ?? booking?.scheduledAt ?? null;
  return (
    <div className="ds-call-item">
      <div className="ds-call-item__avatar">{clientName.charAt(0).toUpperCase()}</div>
      <div className="ds-call-item__info">
        <span className="ds-call-item__name">{clientName}</span>
        <span className="ds-call-item__time">
          {startAt ? `${formatDate(startAt)} · ${formatTime(startAt)}` : 'Sin horario'}
        </span>
      </div>
    </div>
  );
}

function DragHandle({ listeners, attributes }) {
  return (
    <button
      className="ds-drag-handle"
      aria-label="Arrastrar widget"
      {...listeners}
      {...attributes}
    >
      <GripVertical size={14} />
    </button>
  );
}

// ── Sortable Widget Wrapper ──────────────────────────────────────────────────

function SortableWidget({ id, span, className, children }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 10 : 'auto',
  };

  return (
    <BentoCard
      ref={setNodeRef}
      span={span}
      className={`${className} ds-sortable-widget`}
      style={style}
    >
      <DragHandle listeners={listeners} attributes={attributes} />
      {children}
    </BentoCard>
  );
}

// ── Static Widget Content (used in both sortable + drag overlay) ─────────────

function WidgetClients({ clientsQuery, clientCount }) {
  return (
    <>
      <GlowingEffect />
      <div className="ds-widget-inner">
        <WidgetTitle>Clientes activos</WidgetTitle>
        {clientsQuery.isLoading ? (
          <SkeletonCard />
        ) : clientsQuery.isError ? (
          <WidgetEmpty message="No se pudieron cargar los clientes." />
        ) : (
          <>
            <p className="ds-widget-number">
              <NumberTicker value={clientCount} />
            </p>
            {clientCount === 0
              ? <WidgetEmpty message="Aún no tienes clientes. ¡A conseguir el primero!" />
              : <WidgetLabel>{clientCount === 1 ? 'cliente activo' : 'clientes activos'}</WidgetLabel>
            }
          </>
        )}
      </div>
    </>
  );
}

function WidgetCalls({ bookingsQuery, callCountThisWeek, nextCallTime }) {
  return (
    <>
      <GlowingEffect />
      <div className="ds-widget-inner">
        <WidgetTitle>Llamadas esta semana</WidgetTitle>
        {bookingsQuery.isLoading ? (
          <SkeletonCard />
        ) : bookingsQuery.isError ? (
          <WidgetEmpty message="No se pudieron cargar las llamadas." />
        ) : (
          <>
            <p className="ds-widget-number">
              <NumberTicker value={callCountThisWeek} />
            </p>
            {callCountThisWeek === 0
              ? <WidgetEmpty message="Sin llamadas programadas esta semana." />
              : (
                <>
                  <WidgetLabel>{callCountThisWeek === 1 ? 'llamada' : 'llamadas'}</WidgetLabel>
                  {nextCallTime && (
                    <p className="ds-widget-next-call">Próxima: {nextCallTime}</p>
                  )}
                </>
              )
            }
          </>
        )}
      </div>
    </>
  );
}

function WidgetRevenue({ revenueQuery, totalRevenue }) {
  return (
    <>
      <GlowingEffect />
      <div className="ds-widget-inner">
        <WidgetTitle>Ingresos recientes</WidgetTitle>
        {revenueQuery.isLoading ? (
          <SkeletonCard />
        ) : revenueQuery.isError ? (
          <WidgetEmpty message="No se pudieron cargar los ingresos." />
        ) : (
          <>
            <p className="ds-widget-number ds-widget-number--revenue">
              <NumberTicker value={totalRevenue} prefix="$" />
            </p>
            {totalRevenue === 0
              ? <WidgetEmpty message="Aquí verás tus ingresos cuando empiecen a llegar." />
              : <WidgetLabel>COP este período</WidgetLabel>
            }
          </>
        )}
      </div>
    </>
  );
}

function WidgetAdherence({ adherenceQuery, adherenceRate }) {
  return (
    <>
      <GlowingEffect />
      <div className="ds-widget-inner ds-widget-inner--adherence">
        <WidgetTitle>Tasa de adherencia</WidgetTitle>
        {adherenceQuery.isLoading ? (
          <SkeletonCard />
        ) : adherenceQuery.isError ? (
          <WidgetEmpty message="No se pudieron cargar los datos de adherencia." />
        ) : (
          <>
            <div className="ds-adherence-ring">
              <ProgressRing
                percent={adherenceRate}
                size={96}
                strokeWidth={6}
                color="rgba(255,255,255,0.85)"
                label={`${Math.round(adherenceRate)}%`}
              />
            </div>
            {adherenceRate === 0
              ? <WidgetEmpty message="Sin datos de adherencia aún. Los verás cuando tus clientes completen sesiones." />
              : <WidgetLabel>de adherencia promedio</WidgetLabel>
            }
          </>
        )}
      </div>
    </>
  );
}

function WidgetSessions({ adherenceQuery, sessionsCompleted }) {
  return (
    <>
      <GlowingEffect />
      <div className="ds-widget-inner">
        <WidgetTitle>Sesiones completadas</WidgetTitle>
        {adherenceQuery.isLoading ? (
          <SkeletonCard />
        ) : adherenceQuery.isError ? (
          <WidgetEmpty message="No se pudieron cargar las sesiones." />
        ) : (
          <>
            <p className="ds-widget-number">
              <NumberTicker value={sessionsCompleted} />
            </p>
            {sessionsCompleted === 0
              ? <WidgetEmpty message="Las sesiones completadas por tus clientes aparecerán aquí." />
              : <WidgetLabel>{sessionsCompleted === 1 ? 'sesión completada' : 'sesiones completadas'}</WidgetLabel>
            }
          </>
        )}
      </div>
    </>
  );
}

function WidgetUpcomingCalls({ bookingsQuery, upcomingBookings }) {
  return (
    <>
      <GlowingEffect />
      <div className="ds-widget-inner">
        <WidgetTitle>Próximas llamadas</WidgetTitle>
        {bookingsQuery.isLoading ? (
          <SkeletonCard />
        ) : bookingsQuery.isError ? (
          <WidgetEmpty message="No se pudieron cargar las llamadas agendadas." />
        ) : upcomingBookings.length === 0 ? (
          <WidgetEmpty message="No hay llamadas agendadas. Comparte tu link de disponibilidad con tus clientes." />
        ) : (
          <div className="ds-upcoming-list">
            <AnimatedList stagger={70}>
              {upcomingBookings.slice(0, 3).map((booking, i) => (
                <CallItem key={booking.id ?? i} booking={booking} />
              ))}
            </AnimatedList>
          </div>
        )}
      </div>
    </>
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

  const toggleLayout = useCallback(() => {
    setLayout(prev => {
      const next = prev === 'compact' ? 'wide' : 'compact';
      try { localStorage.setItem(LAYOUT_KEY, next); } catch { /* noop */ }
      return next;
    });
  }, []);

  const handleDragStart = useCallback((event) => {
    setActiveId(event.active.id);
  }, []);

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

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
  }, []);

  // ── Queries ──────────────────────────────────────────────────────────────

  const clientsQuery = useQuery({
    queryKey: ['clients', 'creator', user?.uid],
    queryFn: () => apiClient.get('/clients'),
    enabled: !!user?.uid,
    ...cacheConfig.userProfile,
  });

  const bookingsQuery = useQuery({
    queryKey: ['bookings', 'creator', user?.uid],
    queryFn: () => apiClient.get('/bookings'),
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

  const clientCount = useMemo(
    () => clientsQuery.data?.data?.length ?? clientsQuery.data?.length ?? 0,
    [clientsQuery.data]
  );

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
    const next = upcomingBookings[0];
    const t = next.startAt ?? next.scheduledAt;
    return t ? `${formatDate(t)} · ${formatTime(t)}` : null;
  }, [upcomingBookings]);

  const totalRevenue = useMemo(
    () => revenueQuery.data?.data?.totalRevenue ?? revenueQuery.data?.totalRevenue ?? 0,
    [revenueQuery.data]
  );

  const adherenceRate = useMemo(
    () => adherenceQuery.data?.data?.adherenceRate ?? adherenceQuery.data?.adherenceRate ?? 0,
    [adherenceQuery.data]
  );

  const sessionsCompleted = useMemo(
    () => adherenceQuery.data?.data?.sessionsCompleted ?? adherenceQuery.data?.sessionsCompleted ?? 0,
    [adherenceQuery.data]
  );

  const isWide = layout === 'wide';

  // ── Widget config map ────────────────────────────────────────────────────

  const widgetProps = useMemo(() => ({
    clients: { clientsQuery, clientCount },
    calls: { bookingsQuery, callCountThisWeek, nextCallTime },
    revenue: { revenueQuery, totalRevenue },
    adherence: { adherenceQuery, adherenceRate },
    sessions: { adherenceQuery, sessionsCompleted },
    'upcoming-calls': { bookingsQuery, upcomingBookings },
  }), [
    clientsQuery, clientCount,
    bookingsQuery, callCountThisWeek, nextCallTime, upcomingBookings,
    revenueQuery, totalRevenue,
    adherenceQuery, adherenceRate, sessionsCompleted,
  ]);

  const WIDGET_CONFIG = {
    clients: { span: '1x1', className: 'widget-clients', Component: WidgetClients },
    calls: { span: '1x1', className: 'widget-calls', Component: WidgetCalls },
    revenue: { spanWide: '1x1', spanCompact: '2x1', className: 'widget-revenue', Component: WidgetRevenue },
    adherence: { spanWide: '1x2', spanCompact: '2x1', className: 'widget-adherence', Component: WidgetAdherence },
    sessions: { span: '1x1', className: 'widget-sessions', Component: WidgetSessions },
    'upcoming-calls': { span: '2x1', className: 'widget-upcoming-calls', Component: WidgetUpcomingCalls },
  };

  function getSpan(config) {
    if (config.span) return config.span;
    return isWide ? config.spanWide : config.spanCompact;
  }

  function renderOverlayContent() {
    if (!activeId) return null;
    const config = WIDGET_CONFIG[activeId];
    if (!config) return null;
    const { Component } = config;
    return (
      <BentoCard span={getSpan(config)} className={`${config.className} ds-drag-overlay`}>
        <Component {...widgetProps[activeId]} />
      </BentoCard>
    );
  }

  return (
    <ErrorBoundary>
      <DashboardLayout screenName="Inicio">
        <div className={`ds-canvas ds-canvas--${layout}`}>

          {/* ── Layout toggle ─────────────────────────────────────── */}
          <div className="ds-toolbar">
            <button
              className="ds-layout-toggle"
              onClick={toggleLayout}
              aria-label={isWide ? 'Vista compacta' : 'Vista amplia'}
              title={isWide ? 'Vista compacta' : 'Vista amplia'}
            >
              {isWide
                ? <LayoutGrid size={14} />
                : <Columns3 size={14} />
              }
              <span>{isWide ? 'Compacto' : 'Amplio'}</span>
            </button>
          </div>

          {/* ── Widget grid ───────────────────────────────────────── */}
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
                    <SortableWidget
                      key={id}
                      id={id}
                      span={getSpan(config)}
                      className={config.className}
                    >
                      <Component {...widgetProps[id]} />
                    </SortableWidget>
                  );
                })}
              </BentoGrid>
            </SortableContext>

            <DragOverlay dropAnimation={{
              duration: 280,
              easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
            }}>
              {renderOverlayContent()}
            </DragOverlay>
          </DndContext>

          {/* ── Tutorial ──────────────────────────────────────────── */}
          <SpotlightTutorial screenKey="dashboard" steps={TUTORIAL_STEPS} />
        </div>
      </DashboardLayout>
    </ErrorBoundary>
  );
};

export default DashboardScreen;
