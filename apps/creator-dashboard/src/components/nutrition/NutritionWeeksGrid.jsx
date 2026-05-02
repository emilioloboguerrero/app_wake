import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Search } from 'lucide-react';
import Modal from '../Modal';
import ShimmerSkeleton from '../ui/ShimmerSkeleton';
import { GlowingEffect } from '../ui';
import { DRAG_TYPE_NUTRITION_PLAN } from './NutritionLibrarySidebar';
import '../../screens/ProgramDetailScreen.css';
import '../../screens/SharedScreenLayout.css';
import '../PlanWeeksGrid.css';
import '../ProgramWeeksGrid.css';
import '../CreateFlowOverlay.css';

const SLOTS = [1, 2, 3, 4, 5, 6, 7];
const DRAG_TYPE_PROGRAM_DAY = 'nutrition/program-day';

const NutritionWeeksGrid = ({
  weeks,
  daysById,
  plans,
  isLoadingPlans,
  onAddWeek,
  onDeleteWeek,
  onDuplicateWeek,
  onAssignPlan,
  onClearSlot,
  onMoveDay,
  onDuplicateDay,
  showToast,
}) => {
  const [openWeekMenu, setOpenWeekMenu] = useState(null);
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState(null);
  const [openDayMenu, setOpenDayMenu] = useState(null);
  const [menuAnchorEl, setMenuAnchorEl] = useState(null);
  const [pickerSlot, setPickerSlot] = useState(null);
  const [pickerSearch, setPickerSearch] = useState('');
  const [dragMoveTarget, setDragMoveTarget] = useState(null);
  const isDraggingDayRef = useRef(false);
  const [dragOverWeekId, setDragOverWeekId] = useState(null);

  useEffect(() => {
    if (!openWeekMenu) return;
    const closeMenu = () => setOpenWeekMenu(null);
    const t = setTimeout(() => document.addEventListener('click', closeMenu), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('click', closeMenu);
    };
  }, [openWeekMenu]);

  useEffect(() => {
    if (!openDayMenu) return;
    const closeMenu = () => {
      setOpenDayMenu(null);
      setMenuAnchorEl(null);
    };
    const t = setTimeout(() => document.addEventListener('click', closeMenu), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('click', closeMenu);
    };
  }, [openDayMenu]);

  const filteredPlans = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    if (!q) return plans;
    return plans.filter((p) => (p.name ?? '').toLowerCase().includes(q));
  }, [plans, pickerSearch]);

  const handleCellDragOver = (e) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes('application/json')) {
      e.dataTransfer.dropEffect = 'copy';
      e.currentTarget.classList.add('plan-weeks-cell-drag-over');
    }
  };

  const handleCellDragLeave = (e) => {
    e.currentTarget.classList.remove('plan-weeks-cell-drag-over');
  };

  const handleCellDrop = (weekIndex, dayIndex, e) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('plan-weeks-cell-drag-over');
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      if (data.type === DRAG_TYPE_NUTRITION_PLAN && data.planId) {
        onAssignPlan(weekIndex, dayIndex, data.planId);
        return;
      }
      if (data.type === DRAG_TYPE_PROGRAM_DAY) {
        if (data.weekIndex === weekIndex && data.dayIndex === dayIndex) return;
        const targetPlanId = weeks[weekIndex]?.days?.[dayIndex];
        if (targetPlanId) {
          showToast?.('Ese día ya tiene un plan. Elimínalo o muévelo primero.', 'error');
          return;
        }
        setDragMoveTarget({
          fromWeekIndex: data.weekIndex,
          fromDayIndex: data.dayIndex,
          toWeekIndex: weekIndex,
          toDayIndex: dayIndex,
          planId: data.planId,
        });
      }
    } catch (_) {}
  };

  const handleDayDragStart = (e, weekIndex, dayIndex, planId) => {
    const payload = {
      type: DRAG_TYPE_PROGRAM_DAY,
      weekIndex,
      dayIndex,
      planId,
    };
    e.dataTransfer.setData('application/json', JSON.stringify(payload));
    e.dataTransfer.effectAllowed = 'copyMove';
    const img = new Image();
    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    e.dataTransfer.setDragImage(img, 0, 0);
    e.currentTarget.classList.add('plan-weeks-session-card--dragging');
    isDraggingDayRef.current = true;
  };

  const handleDayDragEnd = (e) => {
    e.currentTarget.classList.remove('plan-weeks-session-card--dragging');
    isDraggingDayRef.current = false;
  };

  const handleConfirmDeleteWeek = () => {
    if (!deleteConfirmTarget) return;
    const { weekIndex } = deleteConfirmTarget;
    onDeleteWeek(weekIndex);
    setDeleteConfirmTarget(null);
  };

  const handleConfirmMove = () => {
    if (!dragMoveTarget) return;
    onMoveDay(dragMoveTarget);
    setDragMoveTarget(null);
  };

  const handleConfirmDuplicate = () => {
    if (!dragMoveTarget) return;
    onDuplicateDay(dragMoveTarget);
    setDragMoveTarget(null);
  };

  const handlePickPlan = (planId) => {
    if (!pickerSlot) return;
    onAssignPlan(pickerSlot.weekIndex, pickerSlot.dayIndex, planId);
    setPickerSlot(null);
    setPickerSearch('');
  };

  return (
    <div className="plan-weeks-grid">
      <div className="plan-weeks-grid-header">
        <button type="button" className="plan-weeks-add-week-btn" onClick={onAddWeek}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Añadir semana
        </button>
      </div>

      <div className="plan-weeks-list-wrap">
        {weeks.length > 0 && (
          <div className="plan-weeks-days-header">
            {SLOTS.map((d) => (
              <div key={d} className="plan-weeks-days-header-cell">Día {d}</div>
            ))}
          </div>
        )}
        {weeks.length === 0 ? (
          <div className="plan-weeks-empty">No hay semanas. Pulsa «Añadir semana» para crear la primera.</div>
        ) : (
          weeks.map((week, weekIndex) => (
            <div key={weekIndex} className="plan-weeks-week-block">
              <GlowingEffect spread={25} proximity={80} borderWidth={1} />
              <div
                className={`plan-weeks-week-header ${dragOverWeekId === weekIndex ? 'plan-weeks-week-header--drag-over' : ''}`}
                onDragOver={(e) => {
                  if (isDraggingDayRef.current) return;
                  e.preventDefault();
                  if (e.dataTransfer.types.includes('application/json')) {
                    e.dataTransfer.dropEffect = 'copy';
                    setDragOverWeekId(weekIndex);
                  }
                }}
                onDragLeave={() => setDragOverWeekId(null)}
              >
                <span className="plan-weeks-week-title">Semana {weekIndex + 1}</span>
                <div className="plan-weeks-week-menu-wrap">
                  <button
                    type="button"
                    className="plan-weeks-week-menu-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setOpenWeekMenu(openWeekMenu === weekIndex ? null : weekIndex);
                    }}
                    title="Opciones de semana"
                    aria-label="Opciones de semana"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 13C12.5523 13 13 12.5523 13 12C13 11.4477 12.5523 11 12 11C11.4477 11 11 11.4477 11 12C11 12.5523 11.4477 13 12 13Z" stroke="currentColor" strokeWidth="2" />
                      <path d="M12 6C12.5523 6 13 5.55228 13 5C13 4.44772 12.5523 4 12 4C11.4477 4 11 4.44772 11 5C11 5.55228 11.4477 6 12 6Z" stroke="currentColor" strokeWidth="2" />
                      <path d="M12 20C12.5523 20 13 19.5523 13 19C13 18.4477 12.5523 18 12 18C11.4477 18 11 18.4477 11 19C11 19.5523 11.4477 20 12 20Z" stroke="currentColor" strokeWidth="2" />
                    </svg>
                  </button>
                  {openWeekMenu === weekIndex && (
                    <div className="plan-weeks-week-menu" role="menu">
                      <button
                        type="button"
                        className="plan-weeks-session-menu-item"
                        onClick={() => {
                          setOpenWeekMenu(null);
                          onDuplicateWeek?.(weekIndex);
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                        Duplicar
                      </button>
                      <button
                        type="button"
                        className="plan-weeks-session-menu-item plan-weeks-week-menu-item-delete"
                        onClick={() => {
                          setOpenWeekMenu(null);
                          setDeleteConfirmTarget({ weekIndex });
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        Eliminar
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <div className="plan-weeks-week-days">
                {SLOTS.map((_, dayIndex) => {
                  const planId = week.days?.[dayIndex] ?? null;
                  const plan = planId ? daysById.get(planId) : null;
                  const isMissing = !!planId && !plan;
                  return (
                    <div
                      key={dayIndex}
                      className="plan-weeks-day-cell"
                      onDragOver={handleCellDragOver}
                      onDragLeave={handleCellDragLeave}
                      onDrop={(e) => handleCellDrop(weekIndex, dayIndex, e)}
                    >
                      {plan ? (
                        <div
                          className="plan-weeks-session-card"
                          draggable
                          onDragStart={(e) => handleDayDragStart(e, weekIndex, dayIndex, planId)}
                          onDragEnd={handleDayDragEnd}
                        >
                          <GlowingEffect spread={30} proximity={60} borderWidth={1} />
                          <div className="plan-weeks-session-card-body">
                            <span className="plan-weeks-session-title">
                              {plan.name || `Plan ${plan.id?.slice(0, 8)}`}
                            </span>
                          </div>
                          <div className="plan-weeks-session-card-menu">
                            <button
                              type="button"
                              className="plan-weeks-session-menu-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                const isOpen = openDayMenu?.weekIndex === weekIndex && openDayMenu?.dayIndex === dayIndex;
                                if (isOpen) {
                                  setOpenDayMenu(null);
                                  setMenuAnchorEl(null);
                                } else {
                                  setOpenDayMenu({ weekIndex, dayIndex });
                                  setMenuAnchorEl(e.currentTarget);
                                }
                              }}
                              title="Más opciones"
                              aria-label="Más opciones"
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M12 13C12.5523 13 13 12.5523 13 12C13 11.4477 12.5523 11 12 11C11.4477 11 11 11.4477 11 12C11 12.5523 11.4477 13 12 13Z" stroke="currentColor" strokeWidth="2" />
                                <path d="M12 6C12.5523 6 13 5.55228 13 5C13 4.44772 12.5523 4 12 4C11.4477 4 11 4.44772 11 5C11 5.55228 11.4477 6 12 6Z" stroke="currentColor" strokeWidth="2" />
                                <path d="M12 20C12.5523 20 13 19.5523 13 19C13 18.4477 12.5523 18 12 18C11.4477 18 11 18.4477 11 19C11 19.5523 11.4477 20 12 20Z" stroke="currentColor" strokeWidth="2" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      ) : isMissing ? (
                        <div
                          className="plan-weeks-session-card"
                          title="Este plan fue eliminado"
                          style={{ opacity: 0.55 }}
                        >
                          <div className="plan-weeks-session-card-body">
                            <span className="plan-weeks-session-title">Plan eliminado</span>
                          </div>
                          <div className="plan-weeks-session-card-menu">
                            <button
                              type="button"
                              className="plan-weeks-session-menu-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                onClearSlot(weekIndex, dayIndex);
                              }}
                              title="Quitar"
                              aria-label="Quitar"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="plan-weeks-cell-add"
                          onClick={() => setPickerSlot({ weekIndex, dayIndex })}
                          title="Añadir plan o arrastrar desde la biblioteca"
                        >
                          +
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Day cell menu portal */}
      {openDayMenu && menuAnchorEl && (() => {
        const rect = menuAnchorEl.getBoundingClientRect();
        const menuWidth = 120;
        const menuStyle = {
          top: rect.bottom + 2,
          left: Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8),
        };
        if (menuStyle.left < 8) menuStyle.left = 8;
        return createPortal(
          <div
            className="plan-weeks-session-menu-portal"
            style={menuStyle}
            role="menu"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="plan-weeks-session-menu-item plan-weeks-week-menu-item-delete"
              onClick={() => {
                onClearSlot(openDayMenu.weekIndex, openDayMenu.dayIndex);
                setOpenDayMenu(null);
                setMenuAnchorEl(null);
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Quitar
            </button>
          </div>,
          document.body
        );
      })()}

      {/* Delete-week confirm modal */}
      <Modal
        isOpen={!!deleteConfirmTarget}
        onClose={() => setDeleteConfirmTarget(null)}
        title="Eliminar semana"
      >
        <div className="plan-weeks-delete-modal-body">
          <p className="plan-weeks-delete-modal-message">
            {`¿Eliminar "Semana ${(deleteConfirmTarget?.weekIndex ?? 0) + 1}" y todos sus días? Esta acción no se puede deshacer.`}
          </p>
          <div className="plan-weeks-delete-modal-actions">
            <button
              type="button"
              className="plan-btn plan-btn--secondary"
              onClick={() => setDeleteConfirmTarget(null)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="plan-btn plan-btn--danger"
              onClick={handleConfirmDeleteWeek}
            >
              Eliminar
            </button>
          </div>
        </div>
      </Modal>

      {/* Move/Duplicate choice overlay */}
      {dragMoveTarget && (
        <div className="cfo-overlay" onClick={() => setDragMoveTarget(null)}>
          <div className="cfo-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <GlowingEffect spread={40} borderWidth={1} />
            <div className="cfo-topbar">
              <div />
              <button type="button" className="cfo-close" onClick={() => setDragMoveTarget(null)} aria-label="Cerrar">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="cfo-body">
              <div className="cfo-step">
                <div className="cfo-step__header">
                  <h1 className="cfo-step__title">¿Mover o duplicar?</h1>
                  <p className="cfo-step__desc">¿Qué quieres hacer con <strong>{daysById.get(dragMoveTarget.planId)?.name || 'este plan'}</strong>?</p>
                </div>
                <div className="cfo-step__content">
                  <div className="cfo-choice">
                    <button type="button" className="cfo-choice-card" onClick={handleConfirmMove}>
                      <span className="cfo-choice-card__icon">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 9l4-4 4 4M9 5v14M15 19l4-4-4-4M19 15H5" />
                        </svg>
                      </span>
                      <span className="cfo-choice-card__text">
                        <span className="cfo-choice-card__label">Mover aquí</span>
                        <span className="cfo-choice-card__desc">El plan se mueve a esta posición</span>
                      </span>
                    </button>
                    <button type="button" className="cfo-choice-card" onClick={handleConfirmDuplicate}>
                      <span className="cfo-choice-card__icon">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2M8 16h10a2 2 0 002-2V8a2 2 0 00-2-2H8a2 2 0 00-2 2v6a2 2 0 002 2z" />
                        </svg>
                      </span>
                      <span className="cfo-choice-card__text">
                        <span className="cfo-choice-card__label">Duplicar aquí</span>
                        <span className="cfo-choice-card__desc">Se asigna el mismo plan en esta posición</span>
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Plan picker (click "+" fallback) */}
      <Modal
        isOpen={!!pickerSlot}
        onClose={() => { setPickerSlot(null); setPickerSearch(''); }}
        title="Elegir plan de alimentación"
      >
        <div className="np-picker">
          <div className="np-picker-search">
            <Search size={13} className="np-picker-search-icon" />
            <input
              autoFocus
              className="np-picker-search-input"
              value={pickerSearch}
              onChange={(e) => setPickerSearch(e.target.value)}
              placeholder="Buscar plan..."
            />
          </div>
          <div className="np-picker-list">
            {isLoadingPlans ? (
              <ShimmerSkeleton width="100%" height={64} borderRadius={8} />
            ) : filteredPlans.length === 0 ? (
              <div className="np-picker-empty">
                {plans.length === 0
                  ? 'No tienes planes nutricionales. Crea uno en la biblioteca primero.'
                  : 'Sin resultados.'}
              </div>
            ) : (
              filteredPlans.map((p) => (
                <button key={p.id} className="np-picker-item" onClick={() => handlePickPlan(p.id)}>
                  <span className="np-picker-item-name">{p.name || 'Sin nombre'}</span>
                  <span className="np-picker-item-meta">
                    {p.daily_calories ? `${Math.round(p.daily_calories)} kcal` : '—'}
                    {p.daily_protein_g ? ` · ${Math.round(p.daily_protein_g)}P` : ''}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default NutritionWeeksGrid;
