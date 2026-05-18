import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import {
  WEEKDAY_LABELS,
  monthLabelFull,
  monthShortSentence,
  shortUnlockLabel,
  isoToYMD,
  ymdToMondayIso,
  nextFirstMondayBogota,
  firstMondayOfMonth,
  moduleActivationMonday,
  resolveActiveDropForWeek,
  buildMonthGrid,
  monthsForward,
  unlocksAtToIso,
} from '../../utils/cadence';
import { DRAG_TYPE_LIBRARY_SESSION } from '../PlanningLibrarySidebar';
import programService from '../../services/programService';
import apiClient from '../../utils/apiClient';
import { useToast } from '../../contexts/ToastContext';
import './ProgramCadenceCalendar.css';

const DRAG_TYPE_TEMPLATE_SESSION = 'cadence_template_session';
const DEFAULT_MONTHS_AHEAD = 6;

// ProgramCadenceCalendar — multi-month editor for `block_cadence:
// 'monthly_first_monday'` programs. Each module = one weekly template
// that replays every week the drop is live; absent drops carry over the
// previous one. First week of each drop is the canonical edit surface;
// subsequent weeks render as dimmed mirrors so coaches can't accidentally
// author intra-month variation the data model can't express.
export default function ProgramCadenceCalendar({
  programId,
  program,
  modules,
  onModulesChange,
}) {
  const navigate = useNavigate();
  const { showToast } = useToast();

  // ─── Visible window: current month + N months forward ─────────
  const [monthsAhead, setMonthsAhead] = useState(DEFAULT_MONTHS_AHEAD);
  const baseFromMonth = useMemo(() => new Date(), []);
  const monthsToRender = useMemo(
    () => monthsForward(baseFromMonth, monthsAhead),
    [baseFromMonth, monthsAhead],
  );

  // ─── Baseline for module activation math ──────────────────────
  // program_state.current_block_started_at + current_block_index pin a
  // known module to a known Monday. From that we derive activation for any
  // other module by order-offset. When state is absent we anchor to "next
  // first-Monday-from-now" with order 0.
  const baseline = useMemo(() => {
    const startedAtIso = program?.current_block_started_at;
    const startedAtTs = typeof startedAtIso === 'string'
      ? Date.parse(startedAtIso)
      : startedAtIso?.toDate?.()?.getTime?.();
    if (Number.isFinite(startedAtTs)) {
      return {
        firstMonday: firstMondayOfMonth(new Date(startedAtTs)),
        order: program?.current_block_index ?? 0,
      };
    }
    return {
      firstMonday: nextFirstMondayBogota(new Date()) || firstMondayOfMonth(new Date()),
      order: 0,
    };
  }, [program?.current_block_started_at, program?.current_block_index]);

  // ─── Drop bar / unlock / menu state ───────────────────────────
  const [unlockEditingId, setUnlockEditingId] = useState(null);
  const [unlockDraftYmd, setUnlockDraftYmd] = useState('');
  const [unlockAnchorRect, setUnlockAnchorRect] = useState(null);
  const [publishBusyId, setPublishBusyId] = useState(null);
  const [menuOpenId, setMenuOpenId] = useState(null);
  const [menuAnchorRect, setMenuAnchorRect] = useState(null);
  const [draggingSession, setDraggingSession] = useState(null);
  const [dragOverDay, setDragOverDay] = useState(null);
  const [pendingDropId, setPendingDropId] = useState(null);

  const refresh = useCallback(() => {
    if (typeof onModulesChange === 'function') onModulesChange();
  }, [onModulesChange]);

  // Close popovers / menus on outside click
  useEffect(() => {
    if (!menuOpenId) return;
    const close = (e) => {
      if (e.target.closest('.pcc-drop-bar__menu') || e.target.closest('.pcc-drop-bar__menu-portal')) return;
      setMenuOpenId(null);
      setMenuAnchorRect(null);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [menuOpenId]);

  useEffect(() => {
    if (!unlockEditingId) return;
    const close = (e) => {
      if (e.target.closest('.pcc-unlock-popover') || e.target.closest('.pcc-unlock-chip')) return;
      setUnlockEditingId(null);
      setUnlockAnchorRect(null);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [unlockEditingId]);

  // ─── Per-week drop resolution ─────────────────────────────────
  // For each visible week, find which module's template drives it. Tag the
  // first week of each drop's run so we only render the drop bar once and
  // only let editing fire there.
  const monthSections = useMemo(() => {
    const sections = monthsToRender.map((monthDate) => buildMonthGrid(monthDate));

    console.log('[CADENCE-RENDER] monthSections recompute',
      'modules.length=', modules?.length,
      'baseline=', { firstMonday: baseline.firstMonday?.toISOString?.(), order: baseline.order },
      'modulesWithUnlocks=', modules?.filter?.((m) => m?.unlocks_at)?.map?.((m) => ({ id: m.id, order: m.order, unlocks_at: typeof m.unlocks_at === 'string' ? m.unlocks_at : m.unlocks_at?.toDate?.()?.toISOString?.(), sessionCount: m.sessions?.length ?? 0 })),
    );

    // Flatten weeks to mark drop transitions across month boundaries.
    let prevDropId = null;
    sections.forEach((section) => {
      section.weeks.forEach((week) => {
        const drop = resolveActiveDropForWeek(
          modules,
          week.monday,
          baseline.firstMonday,
          baseline.order,
        );
        week.drop = drop;
        week.isFirstWeekOfDrop = drop ? drop.id !== prevDropId : false;
        prevDropId = drop?.id ?? null;
      });
      // A month "owns a drop" if any of its weeks are the first week of a drop
      // whose activation month equals this month.
      section.ownsDropId = section.weeks
        .filter((w) => w.isFirstWeekOfDrop && w.drop)
        .find((w) => {
          const activates = moduleActivationMonday(w.drop, baseline.firstMonday, baseline.order);
          return activates.getMonth() === section.monthDate.getMonth() &&
                 activates.getFullYear() === section.monthDate.getFullYear();
        })?.drop?.id ?? null;

      console.log('[CADENCE-RENDER] section', section.monthDate.toISOString().slice(0, 7),
        'weeks=', section.weeks.map((w) => ({
          monday: w.monday.toISOString().slice(0, 10),
          dropId: w.drop?.id ?? null,
          dropOrder: w.drop?.order ?? null,
          dropSessions: w.drop?.sessions?.length ?? 0,
          isFirst: w.isFirstWeekOfDrop,
        })),
      );
    });
    return sections;
  }, [monthsToRender, modules, baseline.firstMonday, baseline.order]);

  // ─── Drop bar actions ─────────────────────────────────────────
  const handleTogglePublish = useCallback(async (mod) => {
    if (!mod || publishBusyId === mod.id) return;
    setPublishBusyId(mod.id);
    try {
      await programService.updateModule(programId, mod.id, {
        published_at: mod.published_at ? null : new Date().toISOString(),
      });
      refresh();
    } catch (err) {
      showToast(err?.message || 'No pudimos actualizar el bloque.', 'error');
    } finally {
      setPublishBusyId(null);
    }
  }, [programId, publishBusyId, refresh, showToast]);

  const handleEditTitle = useCallback(async (mod, newTitle) => {
    const trimmed = (newTitle || '').trim();
    if (!trimmed || trimmed === mod.title) return;
    try {
      await programService.updateModule(programId, mod.id, { title: trimmed });
      refresh();
    } catch (err) {
      showToast(err?.message || 'No pudimos guardar el título.', 'error');
    }
  }, [programId, refresh, showToast]);

  const handleSaveUnlock = useCallback(async (mod) => {
    const iso = ymdToMondayIso(unlockDraftYmd);
    setUnlockEditingId(null);
    setUnlockAnchorRect(null);
    try {
      await programService.updateModule(programId, mod.id, { unlocks_at: iso });
      refresh();
    } catch (err) {
      showToast(err?.message || 'No pudimos guardar la fecha.', 'error');
    }
  }, [programId, unlockDraftYmd, refresh, showToast]);

  const handleClearUnlock = useCallback(async (mod) => {
    setUnlockEditingId(null);
    setUnlockAnchorRect(null);
    try {
      await programService.updateModule(programId, mod.id, { unlocks_at: null });
      refresh();
    } catch (err) {
      showToast(err?.message || 'No pudimos limpiar la fecha.', 'error');
    }
  }, [programId, refresh, showToast]);

  const handleDeleteDrop = useCallback(async (mod) => {
    setMenuOpenId(null);
    setMenuAnchorRect(null);
    if (!window.confirm(`¿Eliminar "${mod.title}"? Los meses que lo usaban volverán al drop anterior.`)) return;
    try {
      await programService.deleteModule(programId, mod.id);
      refresh();
    } catch (err) {
      showToast(err?.message || 'No pudimos eliminar el bloque.', 'error');
    }
  }, [programId, refresh, showToast]);

  // ─── Create drop for an empty month ───────────────────────────
  // Anchors the new module's unlocks_at to the first Monday of `monthDate`
  // so the cron picks it up at the right calendar moment. Uses
  // `modules.length` from the already-loaded prop instead of a fresh
  // network round-trip; on slow connections the legacy
  // `programService.createModule` re-fetched modules+sessions (1+N reads)
  // before posting, which on Bogotá networks could exceed the apiClient
  // timeout mid-drop and silently abort the chain.
  const handleCreateDropForMonth = useCallback(async (monthDate) => {
    if (pendingDropId) return;
    const monthMonday = firstMondayOfMonth(monthDate);
    const order = modules?.length ?? 0;
    const monthName = monthShortSentence(monthDate);
    setPendingDropId(`new-${monthDate.getTime()}`);
    try {
      // POST validateBody only accepts title+order (creator.ts:7889) — set
      // unlocks_at in a follow-up PATCH. Two round-trips, but still saves the
      // 1+N fan-out the legacy programService.createModule did before posting.
      const created = await apiClient.post(`/creator/programs/${programId}/modules`, {
        title: `Mes ${order + 1} — ${monthName}`,
        order,
      });
      const newId = created?.data?.id ?? created?.data?.moduleId ?? created?.id;
      if (!newId) throw new Error('No se pudo crear el bloque');
      await apiClient.patch(`/creator/programs/${programId}/modules/${newId}`, {
        unlocks_at: monthMonday.toISOString(),
      });
      // No refresh here — caller (handleDropOnDay) refreshes once after the
      // session POST so we don't fire two back-to-back modules refetches.
      return newId;
    } catch (err) {
      showToast(err?.message || 'No pudimos crear el bloque.', 'error');
      return null;
    } finally {
      setPendingDropId(null);
    }
  }, [programId, modules, refresh, showToast, pendingDropId]);

  // ─── Session interactions ─────────────────────────────────────
  const handleSessionClick = useCallback((mod, session) => {
    navigate(`/programs/${programId}/modules/${mod.id}/sessions/${session.id}/edit`);
  }, [navigate, programId]);

  const handleSessionDragStart = useCallback((e, mod, session) => {
    e.stopPropagation();
    e.dataTransfer.setData('application/json', JSON.stringify({
      type: DRAG_TYPE_TEMPLATE_SESSION,
      moduleId: mod.id,
      sessionId: session.id,
      fromDayIndex: session.dayIndex ?? session.order ?? 0,
    }));
    e.dataTransfer.effectAllowed = 'move';
    setDraggingSession({ moduleId: mod.id, sessionId: session.id });
  }, []);

  const handleSessionDragEnd = useCallback(() => {
    setDraggingSession(null);
    setDragOverDay(null);
  }, []);

  // dayIndex 1..7 = L..D
  const dayIndexFromColumn = (col) => col + 1;

  const handleDropOnDay = useCallback(async (e, week, dayCol, monthDate) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverDay(null);
    const rawData = e.dataTransfer.getData('application/json');
    console.log('[CADENCE-DROP] fired', { dayCol, rawDataLength: rawData?.length, hasDrop: !!week.drop, isFirstWeekOfDrop: week.isFirstWeekOfDrop, monthDate: monthDate?.toISOString?.() });
    if (!rawData) { console.log('[CADENCE-DROP] abort: no application/json payload'); return; }
    let data;
    try { data = JSON.parse(rawData); } catch (err) { console.log('[CADENCE-DROP] abort: JSON parse failed', err); return; }
    console.log('[CADENCE-DROP] payload', data);

    const targetDayIndex = dayIndexFromColumn(dayCol);
    let activeDrop = week.drop;

    // Empty-month drop target: create the drop first, then route the session
    // into the freshly created template.
    if (!activeDrop && data?.type === DRAG_TYPE_LIBRARY_SESSION) {
      console.log('[CADENCE-DROP] branch: empty-month → create drop + add session', { targetDayIndex });
      const newId = await handleCreateDropForMonth(monthDate);
      if (!newId) { console.log('[CADENCE-DROP] abort: handleCreateDropForMonth returned null'); return; }
      // Newly created module isn't in `modules` yet; we'll add the session
      // via API directly using the returned id.
      try {
        const libRef = data.librarySessionRef || data.sourceLibrarySessionId;
        console.log('[CADENCE-DROP] POST sessions (empty-month)', { newModuleId: newId, librarySessionRef: libRef, targetDayIndex, title: data.title });
        await programService.createSessionFromLibrary(
          programId, newId, libRef,
          targetDayIndex - 1, null, targetDayIndex, data.title || null,
        );
        console.log('[CADENCE-DROP] POST sessions OK (empty-month) → refresh');
        refresh();
      } catch (err) {
        console.log('[CADENCE-DROP] POST sessions FAILED (empty-month)', err);
        showToast(err?.message || 'No pudimos añadir la sesión.', 'error');
      }
      return;
    }

    if (!activeDrop) { console.log('[CADENCE-DROP] abort: no activeDrop, type=', data?.type); return; }

    // Library session into existing drop's template
    if (data?.type === DRAG_TYPE_LIBRARY_SESSION) {
      const libSessionId = data.librarySessionRef || data.sourceLibrarySessionId;
      if (!libSessionId) { console.log('[CADENCE-DROP] abort: library payload missing librarySessionRef', data); return; }
      console.log('[CADENCE-DROP] branch: existing drop ← library session', { moduleId: activeDrop.id, librarySessionRef: libSessionId, targetDayIndex, title: data.title });
      try {
        await programService.createSessionFromLibrary(
          programId, activeDrop.id, libSessionId,
          targetDayIndex - 1, null, targetDayIndex, data.title || null,
        );
        console.log('[CADENCE-DROP] POST sessions OK → refresh');
        refresh();
      } catch (err) {
        console.log('[CADENCE-DROP] POST sessions FAILED', err);
        showToast(err?.message || 'No pudimos añadir la sesión.', 'error');
      }
      return;
    }

    // Template session reorder within the same drop (dayIndex change)
    if (data?.type === DRAG_TYPE_TEMPLATE_SESSION) {
      console.log('[CADENCE-DROP] branch: template reorder', { sameModule: data.moduleId === activeDrop.id, fromDayIndex: data.fromDayIndex, targetDayIndex });
      if (data.moduleId !== activeDrop.id) { console.log('[CADENCE-DROP] abort: cross-drop reorder not supported'); return; }
      if (data.fromDayIndex === targetDayIndex) { console.log('[CADENCE-DROP] abort: same dayIndex'); return; }
      try {
        await programService.updateSession(
          programId, activeDrop.id, data.sessionId,
          { dayIndex: targetDayIndex, order: targetDayIndex - 1 },
        );
        console.log('[CADENCE-DROP] PATCH session OK → refresh');
        refresh();
      } catch (err) {
        console.log('[CADENCE-DROP] PATCH session FAILED', err);
        showToast(err?.message || 'No pudimos mover la sesión.', 'error');
      }
      return;
    }

    console.log('[CADENCE-DROP] abort: payload type not recognized', data?.type);
  }, [programId, handleCreateDropForMonth, refresh, showToast]);

  const handleDeleteSession = useCallback(async (e, mod, session) => {
    e.stopPropagation();
    if (!window.confirm(`¿Eliminar "${session.title || 'Sesión'}" del template?`)) return;
    try {
      await programService.deleteSession(programId, mod.id, session.id);
      refresh();
    } catch (err) {
      showToast(err?.message || 'No pudimos eliminar la sesión.', 'error');
    }
  }, [programId, refresh, showToast]);

  // ─── Rendering helpers ────────────────────────────────────────
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const isToday = (date) => date.getTime() === today.getTime();

  const renderDropBar = (mod, isLive, weekKey) => {
    const isPublished = !!mod.published_at;
    const isBusy = publishBusyId === mod.id;
    return (
      <div
        className={`pcc-drop-bar ${isLive ? 'pcc-drop-bar--live' : ''} ${!isPublished ? 'pcc-drop-bar--draft' : ''}`}
        key={`bar-${weekKey}`}
      >
        <div className="pcc-drop-bar__rail" aria-hidden />
        <div className="pcc-drop-bar__body">
        <input
          type="text"
          className="pcc-drop-bar__title"
          defaultValue={mod.title || `Mes ${(mod.order ?? 0) + 1}`}
          onBlur={(e) => handleEditTitle(mod, e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        />
        <button
          type="button"
          className={`pcc-drop-bar__publish ${isLive ? 'pcc-drop-bar__publish--live' : ''}`}
          onClick={() => handleTogglePublish(mod)}
          disabled={isBusy}
          title={isPublished ? 'Quitar publicación' : 'Publicar bloque'}
        >
          <span className="pcc-drop-bar__publish-dot" />
          {isBusy ? 'Guardando…' : (isLive ? 'En vivo' : (isPublished ? 'Publicado' : 'Borrador'))}
        </button>
        <button
          type="button"
          className="pcc-drop-bar__menu"
          aria-label="Opciones del bloque"
          onClick={(e) => {
            e.stopPropagation();
            if (menuOpenId === mod.id) {
              setMenuOpenId(null);
              setMenuAnchorRect(null);
            } else {
              setMenuOpenId(mod.id);
              setMenuAnchorRect(e.currentTarget.getBoundingClientRect());
            }
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <circle cx="12" cy="6" r="1.5" />
            <circle cx="12" cy="12" r="1.5" />
            <circle cx="12" cy="18" r="1.5" />
          </svg>
        </button>
        </div>
      </div>
    );
  };

  const sessionsForDayIndex = (mod, dayIndex) => {
    if (!mod?.sessions) return [];
    return mod.sessions.filter((s) => {
      const di = s.dayIndex != null ? s.dayIndex : (s.order != null ? s.order + 1 : null);
      return di === dayIndex;
    });
  };

  // Find which module activates *in this month* (for the month header
  // "Mes 2 — Volumen · lun 1 jun" or "Sin drop · sigue Mes 1 — Base").
  const moduleActivatingInMonth = useCallback((monthDate) => {
    if (!Array.isArray(modules)) return null;
    return modules.find((m) => {
      if (!m) return false;
      const activates = moduleActivationMonday(m, baseline.firstMonday, baseline.order);
      return activates.getMonth() === monthDate.getMonth() &&
             activates.getFullYear() === monthDate.getFullYear();
    }) ?? null;
  }, [modules, baseline.firstMonday, baseline.order]);

  // Current live drop (highest-order module whose activation is ≤ today)
  const liveDropId = program?.current_block_id ?? null;

  // ─── Render ───────────────────────────────────────────────────
  if (!Array.isArray(modules)) {
    return <div className="pcc-empty-state">Cargando…</div>;
  }

  return (
    <div className="pcc-root">
      <div className="pcc-toolbar">
        <span className="pcc-toolbar__title">Calendario de drops</span>
        <button
          type="button"
          className="pcc-toolbar__load-more"
          onClick={() => setMonthsAhead((n) => n + 3)}
        >
          Cargar más meses
        </button>
      </div>

      {monthSections.map((section, sectionIdx) => {
        const monthDate = section.monthDate;
        const monthName = monthLabelFull(monthDate);
        const activatingMod = moduleActivatingInMonth(monthDate);
        const carryOverMod = !activatingMod
          ? section.weeks[0]?.drop ?? null
          : null;

        return (
          <div
            key={`month-${monthDate.getTime()}`}
            className="pcc-month"
          >
            <div className="pcc-month-head">
              <div className="pcc-month-head__left">
                <span className="pcc-month-head__name">{monthName}</span>
                {activatingMod ? (
                  <span className="pcc-month-head__drop">
                    {activatingMod.title || `Mes ${(activatingMod.order ?? 0) + 1}`} ·{' '}
                    {activatingMod.published_at
                      ? `lun ${shortUnlockLabel(moduleActivationMonday(activatingMod, baseline.firstMonday, baseline.order).toISOString())}`
                      : 'Borrador'}
                  </span>
                ) : carryOverMod ? (
                  <span className="pcc-month-head__drop pcc-month-head__drop--carry">
                    Sin drop · sigue {carryOverMod.title || `Mes ${(carryOverMod.order ?? 0) + 1}`}
                  </span>
                ) : (
                  <span className="pcc-month-head__drop pcc-month-head__drop--carry">
                    Sin drop
                  </span>
                )}
              </div>
              <div className="pcc-month-head__right">
                {!activatingMod && (
                  <button
                    type="button"
                    className="pcc-create-drop-btn"
                    onClick={async () => {
                      const id = await handleCreateDropForMonth(monthDate);
                      if (id) refresh();
                    }}
                    disabled={!!pendingDropId}
                  >
                    + Crear drop
                  </button>
                )}
              </div>
            </div>

            <div className="pcc-weekdays">
              <div className="pcc-weekday" />
              {WEEKDAY_LABELS.map((label) => (
                <div key={label} className="pcc-weekday">{label}</div>
              ))}
            </div>

            {section.weeks.map((week, weekIdx) => {
              const weekKey = `${monthDate.getTime()}-${weekIdx}`;
              const drop = week.drop;
              const isFirst = week.isFirstWeekOfDrop;
              const isLive = drop?.id && drop.id === liveDropId;
              const isMirror = drop && !isFirst;

              return (
                <div
                  key={weekKey}
                  className={`pcc-week-wrap ${isMirror ? 'pcc-week-wrap--mirror' : ''}`}
                >
                  {isFirst && drop && renderDropBar(drop, isLive, weekKey)}
                  <div className="pcc-week">
                  <div
                    className={`pcc-drop-rail ${drop ? (isLive ? 'pcc-drop-rail--live' : 'pcc-drop-rail--owned') : 'pcc-drop-rail--empty'}`}
                  >
                    {isMirror && <span className="pcc-mirror-tag">espejo</span>}
                  </div>

                  {week.days.map((dayCell, dayCol) => {
                    const dayIndex = dayIndexFromColumn(dayCol);
                    const sessions = drop ? sessionsForDayIndex(drop, dayIndex) : [];
                    const isDragOver = dragOverDay === `${weekKey}-${dayCol}`;
                    const interactive = isFirst || !drop; // mirror = read-only; empty = drop target
                    return (
                      <div
                        key={`d-${dayCol}`}
                        className={`pcc-day ${!dayCell.inMonth ? 'pcc-day--out-of-month' : ''} ${isToday(dayCell.date) ? 'pcc-day--today' : ''} ${isDragOver ? 'pcc-day--drag-over' : ''} ${!drop ? 'pcc-day--empty-month-drop-target' : ''}`}
                        onDragOver={interactive ? (e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                          if (dragOverDay !== `${weekKey}-${dayCol}`) {
                            console.log('[CADENCE-DRAG] over interactive cell', { weekKey, dayCol, hasDrop: !!drop, isFirstWeekOfDrop: isFirst });
                          }
                          setDragOverDay(`${weekKey}-${dayCol}`);
                        } : (e) => {
                          if (e.target.dataset.cadenceLoggedOnce !== '1') {
                            e.target.dataset.cadenceLoggedOnce = '1';
                            console.log('[CADENCE-DRAG] over NON-interactive cell (mirror week — drop will not fire)', { weekKey, dayCol });
                          }
                        }}
                        onDragLeave={interactive ? () => setDragOverDay(null) : undefined}
                        onDrop={interactive ? (e) => handleDropOnDay(e, week, dayCol, monthDate) : undefined}
                      >
                        <span className="pcc-day__number">{dayCell.date.getDate()}</span>
                        {sessions.length > 0 && (
                          <div className="pcc-day__sessions">
                            {sessions.map((session) => {
                              const isDragging = draggingSession?.sessionId === session.id;
                              return (
                                <div
                                  key={session.id}
                                  className={`pcc-session ${isDragging ? 'pcc-session--dragging' : ''}`}
                                  draggable={interactive}
                                  onDragStart={interactive ? (e) => handleSessionDragStart(e, drop, session) : undefined}
                                  onDragEnd={handleSessionDragEnd}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (interactive) handleSessionClick(drop, session);
                                  }}
                                  title={session.title || 'Sesión'}
                                >
                                  <span>{session.title || 'Sesión'}</span>
                                  {interactive && (
                                    <button
                                      type="button"
                                      className="pcc-session__delete"
                                      onClick={(e) => handleDeleteSession(e, drop, session)}
                                      aria-label="Eliminar sesión"
                                    >
                                      ×
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      {/* Drop bar menu portal */}
      {menuOpenId && menuAnchorRect && (() => {
        const mod = modules.find((m) => m.id === menuOpenId);
        if (!mod) return null;
        const menuWidth = 180;
        const style = {
          position: 'fixed',
          top: menuAnchorRect.bottom + 4,
          left: Math.min(menuAnchorRect.right - menuWidth, window.innerWidth - menuWidth - 8),
          zIndex: 10000,
        };
        return createPortal(
          <div className="pcc-drop-bar__menu-portal" style={style} role="menu">
            <button
              type="button"
              className="pcc-drop-bar__menu-item"
              onClick={() => {
                setMenuOpenId(null);
                setMenuAnchorRect(null);
                const rect = { top: menuAnchorRect.top, left: menuAnchorRect.left, bottom: menuAnchorRect.bottom, right: menuAnchorRect.right };
                setUnlockEditingId(mod.id);
                setUnlockAnchorRect(rect);
                setUnlockDraftYmd(isoToYMD(unlocksAtToIso(mod.unlocks_at)));
              }}
            >
              Editar fecha de drop
            </button>
            <button
              type="button"
              className="pcc-drop-bar__menu-item pcc-drop-bar__menu-item--danger"
              onClick={() => handleDeleteDrop(mod)}
            >
              Eliminar bloque
            </button>
          </div>,
          document.body,
        );
      })()}

      {/* Unlock-date popover portal */}
      {unlockEditingId && unlockAnchorRect && (() => {
        const mod = modules.find((m) => m.id === unlockEditingId);
        if (!mod) return null;
        const style = {
          top: unlockAnchorRect.bottom + 8,
          left: Math.min(unlockAnchorRect.left, window.innerWidth - 280),
        };
        return createPortal(
          <div className="pcc-unlock-popover" style={style}>
            <input
              type="date"
              value={unlockDraftYmd}
              onChange={(e) => setUnlockDraftYmd(e.target.value)}
              autoFocus
            />
            <div className="pcc-unlock-popover__actions">
              {mod.unlocks_at && (
                <button type="button" onClick={() => handleClearUnlock(mod)}>Limpiar</button>
              )}
              <button type="button" onClick={() => { setUnlockEditingId(null); setUnlockAnchorRect(null); }}>Cancelar</button>
              <button type="button" onClick={() => handleSaveUnlock(mod)}>Guardar</button>
            </div>
          </div>,
          document.body,
        );
      })()}
    </div>
  );
}
