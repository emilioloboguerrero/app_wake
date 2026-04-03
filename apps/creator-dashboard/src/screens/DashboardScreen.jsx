import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LayoutGrid, Grid3X3, Pencil, Check, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import ErrorBoundary from '../components/ErrorBoundary';
import { BentoGrid, BentoCard, GlowingEffect, Marquee } from '../components/ui';
import ContextualHint from '../components/hints/ContextualHint';
import { FullScreenError } from '../components/ui/ErrorStates';
import {
  ClientsWidget,
  CallsWidget,
  RevenueWidget,
  AdherenceWidget,
  SessionsWidget,
  UpcomingCallsWidget,
  ClientActivityWidget,
  ClientTrendWidget,
  ProgramsSoldWidget,
  RevenueTrendWidget,
  CalendarPreviewWidget,
  ExpiringAccessWidget,
} from '../components/dashboard';
import { cacheConfig } from '../config/queryClient';
import apiClient from '../utils/apiClient';
import '../components/creator/RevenueCard.css';
import './DashboardScreen.css';

// ── Layout definitions ──────────────────────────────────────────────────────

const LAYOUT_KEY = 'wake_dashboard_layout';
const SLOT_KEY = 'wake_dashboard_slots';

const LAYOUTS = {
  '5-panel': { slots: ['A', 'B', 'C', 'D', 'E'], count: 5 },
  '7-panel': { slots: ['A', 'B', 'C', 'D', 'E', 'F', 'G'], count: 7 },
};

const WIDGET_LIST = [
  { id: 'revenue',          Component: RevenueWidget,        label: 'Ingresos' },
  { id: 'clients',          Component: ClientsWidget,        label: 'Clientes' },
  { id: 'calls',            Component: CallsWidget,          label: 'Llamadas' },
  { id: 'adherence',        Component: AdherenceWidget,      label: 'Adherencia' },
  { id: 'sessions',         Component: SessionsWidget,       label: 'Sesiones' },
  { id: 'upcoming-calls',   Component: UpcomingCallsWidget,  label: 'Próximas llamadas' },
  { id: 'client-activity',  Component: ClientActivityWidget, label: 'Actividad clientes' },
  { id: 'client-trend',     Component: ClientTrendWidget,    label: 'Tendencia clientes' },
  { id: 'programs-sold',    Component: ProgramsSoldWidget,   label: 'Programas vendidos' },
  { id: 'revenue-trend',    Component: RevenueTrendWidget,   label: 'Tendencia ingresos' },
  { id: 'calendar-preview', Component: CalendarPreviewWidget,label: 'Agenda' },
  { id: 'expiring-access',  Component: ExpiringAccessWidget, label: 'Accesos por vencer' },
];

const WIDGETS = Object.fromEntries(WIDGET_LIST.map(w => [w.id, w]));

const DEFAULT_SLOTS = {
  '5-panel': {
    A: 'revenue',
    B: 'calls',
    C: 'client-activity',
    D: 'sessions',
    E: 'upcoming-calls',
  },
  '7-panel': {
    A: 'revenue-trend',
    B: 'clients',
    C: 'calls',
    D: 'client-activity',
    E: 'adherence',
    F: 'sessions',
    G: 'expiring-access',
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function getStoredLayout() {
  try {
    const v = localStorage.getItem(LAYOUT_KEY);
    return v === '7-panel' ? '7-panel' : '5-panel';
  } catch {
    return '5-panel';
  }
}

function getStoredSlots(layout) {
  try {
    const raw = localStorage.getItem(SLOT_KEY);
    if (!raw) return DEFAULT_SLOTS[layout];
    const all = JSON.parse(raw);
    return all[layout] ?? DEFAULT_SLOTS[layout];
  } catch {
    return DEFAULT_SLOTS[layout];
  }
}

function persistSlots(layout, slots) {
  try {
    const raw = localStorage.getItem(SLOT_KEY);
    const all = raw ? JSON.parse(raw) : {};
    all[layout] = slots;
    localStorage.setItem(SLOT_KEY, JSON.stringify(all));
  } catch { /* noop */ }
}

const WIDGET_CLASSNAMES = {
  revenue: 'widget-revenue',
  clients: 'widget-clients',
  calls: 'widget-calls',
  adherence: 'widget-adherence',
  sessions: 'widget-sessions',
  'upcoming-calls': 'widget-upcoming-calls',
  'client-activity': 'widget-client-activity',
  'client-trend': 'widget-client-trend',
  'programs-sold': 'widget-programs-sold',
  'revenue-trend': 'widget-revenue-trend',
  'calendar-preview': 'widget-calendar-preview',
  'expiring-access': 'widget-expiring-access',
};

// ── Sub-components ──────────────────────────────────────────────────────────

function SlotPicker({ slot, currentWidgetId, assignedWidgetIds, onSelect, onClear }) {
  return (
    <div className="ds-slot-picker">
      <p className="ds-slot-picker__label">Panel {slot}</p>
      <div className="ds-slot-picker__options">
        {WIDGET_LIST.map(w => {
          const isAssigned = assignedWidgetIds.includes(w.id) && w.id !== currentWidgetId;
          return (
            <button
              key={w.id}
              className={`ds-slot-picker__option ${w.id === currentWidgetId ? 'ds-slot-picker__option--active' : ''}`}
              disabled={isAssigned}
              onClick={() => onSelect(slot, w.id)}
            >
              {w.label}
            </button>
          );
        })}
        {currentWidgetId && (
          <button className="ds-slot-picker__option ds-slot-picker__option--clear" onClick={() => onClear(slot)}>
            <X size={12} /> Vaciar
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

function useGreeting(displayName) {
  const firstName = displayName?.split(' ')[0];
  const h = new Date().getHours();
  if (h < 12) return firstName ? `Buenos días, ${firstName}` : 'Buenos días';
  if (h < 19) return firstName ? `Buenas tardes, ${firstName}` : 'Buenas tardes';
  return firstName ? `Buenas noches, ${firstName}` : 'Buenas noches';
}

const DashboardScreen = () => {
  const { user } = useAuth();
  const greeting = useGreeting(user?.displayName);
  const [layout, setLayout] = useState(getStoredLayout);
  const [slotAssignments, setSlotAssignments] = useState(() => getStoredSlots(getStoredLayout()));
  const [editing, setEditing] = useState(false);
  const [editingSlot, setEditingSlot] = useState(null);
  const [draftSlots, setDraftSlots] = useState(null);

  const toggleLayout = useCallback(() => {
    setEditing(false);
    setEditingSlot(null);
    setLayout(prev => {
      const next = prev === '5-panel' ? '7-panel' : '5-panel';
      try { localStorage.setItem(LAYOUT_KEY, next); } catch { /* noop */ }
      const nextSlots = getStoredSlots(next);
      setSlotAssignments(nextSlots);
      return next;
    });
  }, []);

  const startEditing = useCallback(() => {
    setDraftSlots({ ...slotAssignments });
    setEditing(true);
    setEditingSlot(null);
  }, [slotAssignments]);

  const cancelEditing = useCallback(() => {
    setEditing(false);
    setEditingSlot(null);
    setDraftSlots(null);
  }, []);

  const saveEditing = useCallback(() => {
    if (draftSlots) {
      setSlotAssignments(draftSlots);
      persistSlots(layout, draftSlots);
    }
    setEditing(false);
    setEditingSlot(null);
    setDraftSlots(null);
  }, [draftSlots, layout]);

  const handleSlotSelect = useCallback((slot, widgetId) => {
    setDraftSlots(prev => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        if (next[key] === widgetId) next[key] = null;
      }
      next[slot] = widgetId;
      return next;
    });
    setEditingSlot(null);
  }, []);

  const handleSlotClear = useCallback((slot) => {
    setDraftSlots(prev => ({ ...prev, [slot]: null }));
    setEditingSlot(null);
  }, []);

  // ── Queries ───────────────────────────────────────────────────────────────

  const dashboardQuery = useQuery({
    queryKey: ['analytics', 'dashboard', user?.uid],
    queryFn: () => apiClient.get('/analytics/dashboard'),
    enabled: !!user?.uid,
    ...cacheConfig.analytics,
  });

  const bookingsQuery = useQuery({
    queryKey: ['bookings', 'creator', user?.uid],
    queryFn: () => apiClient.get('/creator/bookings'),
    enabled: !!user?.uid,
    ...cacheConfig.events,
  });

  const isLoading = dashboardQuery.isLoading;
  const dashData = dashboardQuery.data?.data;
  const dashErrors = dashboardQuery.data?.errors ?? {};
  const isError = dashboardQuery.isError;
  const bookingsLoading = bookingsQuery.isLoading;
  const bookingsError = bookingsQuery.isError;

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

  // Recent activity items for marquee
  const activityItems = useMemo(() => {
    const items = [];
    const activity = dashData?.clientActivity;
    if (activity?.recentSessions?.length) {
      activity.recentSessions.slice(0, 8).forEach(s => {
        items.push(`${s.clientName || 'Cliente'} completo ${s.sessionTitle || 'una sesion'}`);
      });
    }
    if (activity?.recentEnrollments?.length) {
      activity.recentEnrollments.slice(0, 4).forEach(e => {
        items.push(`${e.clientName || 'Nuevo cliente'} se inscribio a ${e.programTitle || 'un programa'}`);
      });
    }
    return items;
  }, [dashData?.clientActivity]);

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
    const lt = dashData?.revenue?.lowTicket;
    return { salesCount: lt?.salesCount ?? 0, netRevenue: lt?.netRevenue ?? 0 };
  }, [dashData?.revenue]);

  const oneOnOne = useMemo(() => {
    const oo = dashData?.revenue?.oneOnOne;
    return { clientCount: oo?.clientCount ?? 0, callCount: oo?.callCount ?? 0 };
  }, [dashData?.revenue]);

  const revenueGross = useMemo(
    () => dashData?.revenue?.lowTicket?.grossRevenue ?? 0,
    [dashData?.revenue]
  );

  const revenueByProgram = useMemo(
    () => dashData?.revenue?.byProgram ?? [],
    [dashData?.revenue]
  );

  const overallWorkoutAdherence = useMemo(
    () => dashData?.adherence?.overallWorkoutAdherence ?? dashData?.adherence?.overallAdherence ?? 0,
    [dashData?.adherence]
  );

  const overallNutritionAdherence = useMemo(
    () => dashData?.adherence?.overallNutritionAdherence ?? null,
    [dashData?.adherence]
  );

  const byProgram = useMemo(
    () => dashData?.adherence?.byProgram ?? [],
    [dashData?.adherence]
  );

  const sessionsCompleted = useMemo(
    () => byProgram.reduce((sum, p) => sum + (p.completedSessions ?? 0), 0),
    [byProgram]
  );

  const programs = useMemo(
    () => dashData?.revenue?.programs ?? [],
    [dashData?.revenue]
  );

  const activityData = useMemo(() => dashData?.clientActivity ?? null, [dashData?.clientActivity]);
  const trendData = useMemo(() => dashData?.clientTrend ?? null, [dashData?.clientTrend]);
  const revenueTrendData = useMemo(() => dashData?.revenueTrend ?? null, [dashData?.revenueTrend]);
  const calendarData = useMemo(() => dashData?.calendarPreview ?? null, [dashData?.calendarPreview]);
  const expiringData = useMemo(() => dashData?.expiringAccess ?? null, [dashData?.expiringAccess]);

  // ── All queries failed → FullScreenError ──────────────────────────────────

  const allFailed = bookingsQuery.isError && dashboardQuery.isError;

  const handleRetryAll = useCallback(() => {
    bookingsQuery.refetch();
    dashboardQuery.refetch();
  }, [bookingsQuery, dashboardQuery]);

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

  // ── Widget props ──────────────────────────────────────────────────────────

  const widgetProps = {
    revenue: { isLoading, isError: isError || !!dashErrors.revenue, lowTicket, oneOnOne, programs, grossRevenue: revenueGross, byProgram: revenueByProgram },
    clients: { isLoading, isError: isError || !!dashErrors.revenue, oneOnOne },
    calls: { isLoading: bookingsLoading, isError: bookingsError, callCountThisWeek, nextCallTime },
    adherence: { isLoading, isError: isError || !!dashErrors.adherence, overallWorkoutAdherence, overallNutritionAdherence, byProgram },
    sessions: { isLoading, isError: isError || !!dashErrors.adherence, sessionsCompleted },
    'upcoming-calls': { isLoading: bookingsLoading, isError: bookingsError, upcomingBookings },
    'client-activity': { isLoading, isError: isError || !!dashErrors.clientActivity, activityData },
    'client-trend': { isLoading, isError: isError || !!dashErrors.clientTrend, trendData },
    'programs-sold': { isLoading, isError: isError || !!dashErrors.clientTrend, trendData },
    'revenue-trend': { isLoading, isError: isError || !!dashErrors.revenueTrend, trendData: revenueTrendData },
    'calendar-preview': { isLoading, isError: isError || !!dashErrors.calendarPreview, calendarData },
    'expiring-access': { isLoading, isError: isError || !!dashErrors.expiringAccess, expiringData },
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const slots = LAYOUTS[layout].slots;
  const currentSlots = editing ? draftSlots : slotAssignments;
  const assignedWidgetIds = Object.values(currentSlots).filter(Boolean);
  const panelCount = LAYOUTS[layout].count;

  return (
    <ErrorBoundary>
      <DashboardLayout screenName={greeting}>
        <div className="ds-canvas">
          <div className="ds-toolbar">
            <div className="ds-greeting" />
            <div className="ds-toolbar__actions">
              {editing ? (
                <>
                  <button className="ds-toolbar-btn ds-toolbar-btn--cancel" onClick={cancelEditing}>
                    <X size={14} />
                    <span>Cancelar</span>
                  </button>
                  <button className="ds-toolbar-btn ds-toolbar-btn--save" onClick={saveEditing}>
                    <Check size={14} />
                    <span>Guardar</span>
                  </button>
                </>
              ) : (
                <>
                  <button className="ds-toolbar-btn" onClick={startEditing}>
                    <Pencil size={14} />
                    <span>Editar</span>
                  </button>
                  <button
                    className="ds-toolbar-btn"
                    onClick={toggleLayout}
                    aria-label={`Cambiar a ${layout === '5-panel' ? '7' : '5'} paneles`}
                  >
                    {layout === '5-panel' ? <Grid3X3 size={14} /> : <LayoutGrid size={14} />}
                    <span>{panelCount} paneles</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {activityItems.length > 0 && !editing && (
            <Marquee
              pauseOnHover
              className="ds-activity-marquee"
              style={{ '--duration': '35s', '--gap': '2rem', marginBottom: 16 }}
            >
              {activityItems.map((item, i) => (
                <span key={i} className="ds-activity-marquee__item">{item}</span>
              ))}
            </Marquee>
          )}

          <BentoGrid key={layout} layout={layout} className={editing ? 'ds-bento--editing' : ''}>
            {slots.map((slot, index) => {
              const widgetId = currentSlots[slot];
              const widget = widgetId ? WIDGETS[widgetId] : null;
              const widgetClass = widgetId ? (WIDGET_CLASSNAMES[widgetId] ?? '') : '';
              const isPickerOpen = editing && editingSlot === slot;

              return (
                <BentoCard
                  key={slot}
                  area={slot}
                  className={`${widgetClass} ds-widget-stagger ${editing ? 'ds-card--editing' : ''}`}
                  style={{ animationDelay: `${index * 80}ms` }}
                  onClick={editing ? () => setEditingSlot(isPickerOpen ? null : slot) : undefined}
                >
                  <GlowingEffect spread={40} proximity={140} borderWidth={1} disabled={editing} />
                  {isPickerOpen ? (
                    <SlotPicker
                      slot={slot}
                      currentWidgetId={widgetId}
                      assignedWidgetIds={assignedWidgetIds}
                      onSelect={handleSlotSelect}
                      onClear={handleSlotClear}
                    />
                  ) : widget ? (
                    <>
                      {editing && <div className="ds-card-edit-badge">{widget.label}</div>}
                      <widget.Component {...widgetProps[widgetId]} />
                    </>
                  ) : (
                    <div className="ds-widget-inner ds-slot-empty">
                      <p className="ds-widget-empty">{editing ? 'Toca para elegir widget' : 'Panel vacío'}</p>
                    </div>
                  )}
                </BentoCard>
              );
            })}
          </BentoGrid>

          <ContextualHint screenKey="dashboard" />
        </div>
      </DashboardLayout>
    </ErrorBoundary>
  );
};

export default DashboardScreen;
