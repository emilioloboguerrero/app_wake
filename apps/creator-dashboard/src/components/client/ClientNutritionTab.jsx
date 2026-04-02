import { useState, useMemo, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as nutritionDb from '../../services/nutritionFirestoreService';
import { GlowingEffect, ShimmerSkeleton } from '../ui';
import { Search, Pencil, Trash2, Plus, Apple, Target, AlertTriangle } from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import DailyCalorieBars from './DailyCalorieBars';
import './ClientNutritionTab.css';

const PIE_COLORS = [
  'rgba(129,140,248,0.7)',
  'rgba(251,191,36,0.6)',
  'rgba(248,113,113,0.6)',
];

const NUTRITION_GOAL_LABELS = {
  cut: 'Deficit', bulk: 'Superavit', maintain: 'Mantenimiento',
  energy: 'Energia', unsure: 'Sin definir',
};

export default function ClientNutritionTab({
  clientId, clientUserId, clientName, creatorId,
  labData,
  nutritionGoal, dietaryRestrictions = [],
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [assigningPlanId, setAssigningPlanId] = useState(null);
  const [rangeDays, setRangeDays] = useState(7);

  // ── Creator's nutrition plans ────────────────────────────────
  const { data: plans = [], isLoading: plansLoading } = useQuery({
    queryKey: ['nutrition', 'plans', creatorId],
    queryFn: () => nutritionDb.getPlansByCreator(creatorId),
    enabled: !!creatorId,
    staleTime: 5 * 60 * 1000,
    refetchOnMount: true,
  });

  // ── Client's active assignments ──────────────────────────────
  const { data: assignments = [], isLoading: assignmentsLoading } = useQuery({
    queryKey: ['nutrition', 'assignments', clientUserId],
    queryFn: () => nutritionDb.getAssignmentsByUser(clientUserId),
    enabled: !!clientUserId,
    staleTime: 2 * 60 * 1000,
    refetchOnMount: false,
  });

  // nutritionGoal and dietaryRestrictions are passed as props from ClientScreen

  const activeAssignment = useMemo(() =>
    assignments.find(a => !a.status || a.status === 'active'),
    [assignments]
  );

  const activePlan = useMemo(() => {
    if (!activeAssignment) return null;
    return plans.find(p => p.id === activeAssignment.planId) || null;
  }, [activeAssignment, plans]);

  // ── Assign mutation ──────────────────────────────────────────
  const assignMutation = useMutation({
    mutationKey: ['nutrition', 'assign', clientUserId],
    mutationFn: (planId) => nutritionDb.createAssignment({
      userId: clientUserId,
      planId,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nutrition', 'assignments', clientUserId] });
      queryClient.invalidateQueries({ queryKey: ['analytics', 'client-lab', clientUserId] });
      setAssigningPlanId(null);
    },
  });

  // ── Remove mutation ──────────────────────────────────────────
  const removeMutation = useMutation({
    mutationKey: ['nutrition', 'unassign', clientUserId],
    mutationFn: () => nutritionDb.deleteAssignment(activeAssignment.id, clientUserId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nutrition', 'assignments', clientUserId] });
      queryClient.invalidateQueries({ queryKey: ['analytics', 'client-lab', clientUserId] });
      setConfirmRemove(false);
    },
  });

  // ── Derive nutrition data (last N days) ──
  const rangeNutrition = useMemo(() => {
    const caloriesTrend = labData?.caloriesTrend || [];
    const macrosTrend = labData?.macrosTrend || [];

    const rangeCalories = caloriesTrend.slice(-rangeDays);
    const rangeMacros = macrosTrend.slice(-rangeDays);

    const days = [];
    for (let i = 0; i < rangeDays; i++) {
      const entry = rangeCalories[i];
      days.push(entry ? { date: entry.date, actual: entry.actual } : null);
    }

    const withData = rangeCalories.filter(d => d.actual > 0);
    const avgCalories = withData.length > 0
      ? Math.round(withData.reduce((s, d) => s + d.actual, 0) / withData.length)
      : null;

    const macroWithData = rangeMacros.filter(d => d.protein > 0 || d.carbs > 0 || d.fat > 0);
    const avgProtein = macroWithData.length > 0
      ? Math.round(macroWithData.reduce((s, d) => s + d.protein, 0) / macroWithData.length)
      : null;
    const avgCarbs = macroWithData.length > 0
      ? Math.round(macroWithData.reduce((s, d) => s + d.carbs, 0) / macroWithData.length)
      : null;
    const avgFat = macroWithData.length > 0
      ? Math.round(macroWithData.reduce((s, d) => s + d.fat, 0) / macroWithData.length)
      : null;

    const target = activeAssignment?.daily_calories || rangeCalories[0]?.target || labData?.nutritionComparison?.targetCalories || 0;
    const targetProtein = activeAssignment?.daily_protein_g || labData?.nutritionComparison?.targetProtein || 0;
    const targetCarbs = activeAssignment?.daily_carbs_g || labData?.nutritionComparison?.targetCarbs || 0;
    const targetFat = activeAssignment?.daily_fat_g || labData?.nutritionComparison?.targetFat || 0;

    const adherencePct = target > 0 && avgCalories
      ? Math.round((avgCalories / target) * 100)
      : null;

    return { days, avgCalories, avgProtein, avgCarbs, avgFat, target, targetProtein, targetCarbs, targetFat, adherencePct, daysLogged: withData.length };
  }, [labData, rangeDays, activeAssignment]);

  // ── Pie chart data from assignment ───────────────────────────
  const macroData = useMemo(() => {
    const source = activeAssignment || activePlan;
    if (!source) return [];
    const protein = source.daily_protein_g ?? 0;
    const carbs = source.daily_carbs_g ?? 0;
    const fat = source.daily_fat_g ?? 0;
    if (!protein && !carbs && !fat) return [];
    return [
      { name: 'Proteina', value: protein },
      { name: 'Carbos', value: carbs },
      { name: 'Grasas', value: fat },
    ];
  }, [activeAssignment, activePlan]);

  const dailyCalories = activeAssignment?.daily_calories ?? activePlan?.daily_calories ?? 0;

  // nutritionGoal and dietaryRestrictions received as props

  // ── Filtered plans for library ───────────────────────────────
  const filteredPlans = useMemo(() => {
    if (!searchQuery.trim()) return plans;
    const q = searchQuery.toLowerCase();
    return plans.filter(p => p.name?.toLowerCase().includes(q));
  }, [plans, searchQuery]);

  const hasNutritionData = rangeNutrition.avgCalories != null;

  // ── Handlers ─────────────────────────────────────────────────
  const handleEditPlan = useCallback(() => {
    if (!activeAssignment) return;
    const planIdToEdit = activeAssignment.planId;
    navigate(`/nutrition/plans/${planIdToEdit}`, {
      state: {
        editScope: 'assignment',
        assignmentId: activeAssignment.id,
        assignmentPlanId: planIdToEdit,
        clientName,
        clientId: clientUserId,
        returnTo: location.pathname,
        returnState: { tab: 'contenido', subtab: 'nutricion' },
      },
    });
  }, [activeAssignment, clientName, clientUserId, navigate, location.pathname]);

  const handleAssignPlan = useCallback((planId) => {
    setAssigningPlanId(planId);
    assignMutation.mutate(planId);
  }, [assignMutation]);

  const handleConfirmRemove = useCallback(() => {
    removeMutation.mutate();
  }, [removeMutation]);

  const isLoading = plansLoading || assignmentsLoading;

  if (isLoading) {
    return (
      <div className="cnt-root">
        {/* Stats card skeleton */}
        <div className="cnt-stats-card">
          <div className="cnt-stats-inner">
            <div className="cnt-stats-header">
              <ShimmerSkeleton style={{ width: 140, height: 11, borderRadius: 4 }} />
              <ShimmerSkeleton style={{ width: 32, height: 18, borderRadius: 4 }} />
            </div>
            <div className="cnt-profile-chips">
              <ShimmerSkeleton style={{ width: 64, height: 18, borderRadius: 6 }} />
              <ShimmerSkeleton style={{ width: 52, height: 18, borderRadius: 6 }} />
            </div>
            <div className="dcb-container">
              <div className="dcb-chart">
                <div className="dcb-bars">
                  {[65, 40, 80, 55, 30, 70, 45].map((h, i) => (
                    <div key={i} className="dcb-bar-col">
                      <div className="dcb-bar-track">
                        <ShimmerSkeleton style={{ width: '100%', height: `${h}%`, borderRadius: '4px 4px 2px 2px' }} />
                      </div>
                      <ShimmerSkeleton style={{ width: 8, height: 10, borderRadius: 2 }} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="cnt-summary">
              <ShimmerSkeleton style={{ width: 90, height: 13, borderRadius: 4 }} />
              <ShimmerSkeleton style={{ width: 40, height: 13, borderRadius: 4 }} />
              <ShimmerSkeleton style={{ width: 40, height: 13, borderRadius: 4 }} />
              <ShimmerSkeleton style={{ width: 40, height: 13, borderRadius: 4 }} />
            </div>
          </div>
        </div>
        {/* Plan card skeleton */}
        <div className="cnt-plan-card">
          <div className="cnt-plan-card-inner">
            <ShimmerSkeleton style={{ width: 90, height: 11, borderRadius: 4 }} />
            <div className="cnt-plan-display">
              <div className="cnt-plan-info">
                <ShimmerSkeleton style={{ width: '60%', height: 15, borderRadius: 5 }} />
                <div className="cnt-plan-dates">
                  <ShimmerSkeleton style={{ width: 80, height: 11, borderRadius: 4 }} />
                  <ShimmerSkeleton style={{ width: 70, height: 11, borderRadius: 4 }} />
                </div>
                <div className="cnt-plan-cal">
                  <ShimmerSkeleton style={{ width: 50, height: 24, borderRadius: 6 }} />
                  <ShimmerSkeleton style={{ width: 36, height: 11, borderRadius: 4 }} />
                </div>
              </div>
              <div className="cnt-plan-pie">
                <ShimmerSkeleton style={{ width: 80, height: 80, borderRadius: '50%' }} />
                <div className="cnt-plan-macros">
                  {[48, 44, 40].map((w, i) => (
                    <div key={i} className="cnt-plan-macro-row">
                      <ShimmerSkeleton style={{ width: 7, height: 7, borderRadius: '50%' }} />
                      <ShimmerSkeleton style={{ width: w, height: 10, borderRadius: 3 }} />
                      <ShimmerSkeleton style={{ width: 22, height: 11, borderRadius: 3 }} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="cnt-plan-actions">
              <ShimmerSkeleton style={{ width: 90, height: 30, borderRadius: 8 }} />
              <ShimmerSkeleton style={{ width: 60, height: 30, borderRadius: 8 }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="cnt-root">
      {/* ── Section 1: Nutrition Stats ─────────────────────────── */}
      <div className="cnt-stats-card">
        <GlowingEffect spread={40} proximity={120} borderWidth={1} />
        <div className="cnt-stats-inner">
          <div className="cnt-stats-header">
            <div className="cnt-stats-header-left">
              <h3 className="cnt-section-title">Nutricion</h3>
              {rangeNutrition.adherencePct != null && (
                <span className={`cnt-adherence-badge ${rangeNutrition.adherencePct >= 90 && rangeNutrition.adherencePct <= 110 ? 'cnt-adherence-badge--good' : rangeNutrition.adherencePct >= 70 ? 'cnt-adherence-badge--ok' : 'cnt-adherence-badge--low'}`}>
                  {rangeNutrition.adherencePct}%
                </span>
              )}
            </div>
            <div className="cnt-range-toggle">
              <button
                className={`cnt-range-btn ${rangeDays === 7 ? 'cnt-range-btn--active' : ''}`}
                onClick={() => setRangeDays(7)}
              >
                7d
              </button>
              <button
                className={`cnt-range-btn ${rangeDays === 30 ? 'cnt-range-btn--active' : ''}`}
                onClick={() => setRangeDays(30)}
              >
                30d
              </button>
            </div>
          </div>

          {/* Profile chips */}
          {(nutritionGoal || dietaryRestrictions.length > 0) && (
            <div className="cnt-profile-chips">
              {nutritionGoal && nutritionGoal !== 'unsure' && (
                <span className="cnt-chip">
                  <Target size={11} />
                  {NUTRITION_GOAL_LABELS[nutritionGoal] || nutritionGoal}
                </span>
              )}
              {dietaryRestrictions.map(r => (
                <span key={r} className="cnt-chip">
                  <AlertTriangle size={11} />
                  {r}
                </span>
              ))}
            </div>
          )}

          {hasNutritionData ? (
            <>
              <DailyCalorieBars
                days={rangeNutrition.days}
                target={rangeNutrition.target}
              />

              <div className="cnt-summary">
                <SummaryItem
                  label="Promedio"
                  actual={rangeNutrition.avgCalories}
                  target={rangeNutrition.target}
                  unit="kcal"
                />
                <SummaryItem label="P" actual={rangeNutrition.avgProtein} target={rangeNutrition.targetProtein} unit="g" />
                <SummaryItem label="C" actual={rangeNutrition.avgCarbs} target={rangeNutrition.targetCarbs} unit="g" />
                <SummaryItem label="F" actual={rangeNutrition.avgFat} target={rangeNutrition.targetFat} unit="g" />
              </div>
            </>
          ) : (
            <div className="cnt-no-data">
              Sin datos de nutricion registrados
            </div>
          )}
        </div>
      </div>

      {/* ── Section 2: Assigned Plan or Assign Flow ───────────── */}
      <div className="cnt-plan-card">
        <GlowingEffect spread={40} proximity={120} borderWidth={1} />
        <div className="cnt-plan-card-inner">
          <h3 className="cnt-section-title">Plan asignado</h3>

          {activeAssignment ? (
            <>
              <div className="cnt-plan-display">
                <div className="cnt-plan-info">
                  <span className="cnt-plan-name">
                    {activePlan?.name || activeAssignment.planName || 'Plan activo'}
                  </span>
                  <div className="cnt-plan-dates">
                    {activeAssignment.startDate && <span>Inicio: {activeAssignment.startDate}</span>}
                    {activeAssignment.endDate && <span>Fin: {activeAssignment.endDate}</span>}
                  </div>
                  <div className="cnt-plan-cal">
                    <span className="cnt-plan-cal-value">{dailyCalories}</span>
                    <span className="cnt-plan-cal-unit">kcal/dia</span>
                  </div>
                </div>
                {macroData.length > 0 && (
                  <div className="cnt-plan-pie">
                    <ResponsiveContainer width={90} height={90}>
                      <PieChart>
                        <Pie data={macroData} cx="50%" cy="50%" innerRadius={26} outerRadius={40} paddingAngle={2} dataKey="value" animationDuration={800}>
                          {macroData.map((_, i) => (<Cell key={i} fill={PIE_COLORS[i]} />))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="cnt-plan-macros">
                      {macroData.map((m, i) => (
                        <div key={i} className="cnt-plan-macro-row">
                          <div className="cnt-plan-macro-dot" style={{ background: PIE_COLORS[i] }} />
                          <span className="cnt-plan-macro-label">{m.name}</span>
                          <span className="cnt-plan-macro-val">{Math.round(m.value)}g</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="cnt-plan-actions">
                <button className="cnt-btn cnt-btn--edit" onClick={handleEditPlan}>
                  <Pencil size={13} />
                  Editar plan
                </button>
                {confirmRemove ? (
                  <div className="cnt-confirm-row">
                    <span className="cnt-confirm-text">Quitar plan?</span>
                    <button
                      className="cnt-btn cnt-btn--danger"
                      onClick={handleConfirmRemove}
                      disabled={removeMutation.isPending}
                    >
                      {removeMutation.isPending ? 'Quitando...' : 'Confirmar'}
                    </button>
                    <button className="cnt-btn cnt-btn--ghost" onClick={() => setConfirmRemove(false)}>
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button className="cnt-btn cnt-btn--remove" onClick={() => setConfirmRemove(true)}>
                    <Trash2 size={13} />
                    Quitar
                  </button>
                )}
              </div>
            </>
          ) : (
            /* ── No plan assigned → show library to assign ──── */
            <div className="cnt-assign-flow">
              <div className="cnt-assign-empty">
                <Apple size={20} className="cnt-assign-empty-icon" />
                <p>Sin plan nutricional asignado</p>
              </div>

              {plans.length > 0 && (
                <>
                  <div className="cnt-library-search">
                    <Search size={13} className="cnt-search-icon" />
                    <input
                      type="text"
                      className="cnt-search-input"
                      placeholder="Buscar plan..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <div className="cnt-library-list">
                    {filteredPlans.map(plan => (
                      <div key={plan.id} className="cnt-library-item">
                        <div className="cnt-library-item-info">
                          <span className="cnt-library-item-name">{plan.name}</span>
                          <span className="cnt-library-item-cal">
                            {plan.daily_calories ?? '--'} kcal
                            {plan.daily_protein_g ? ` · ${Math.round(plan.daily_protein_g)}P` : ''}
                            {plan.daily_carbs_g ? ` / ${Math.round(plan.daily_carbs_g)}C` : ''}
                            {plan.daily_fat_g ? ` / ${Math.round(plan.daily_fat_g)}F` : ''}
                          </span>
                        </div>
                        <button
                          className="cnt-btn cnt-btn--assign"
                          onClick={() => handleAssignPlan(plan.id)}
                          disabled={assignMutation.isPending}
                        >
                          {assigningPlanId === plan.id && assignMutation.isPending ? (
                            'Asignando...'
                          ) : (
                            <><Plus size={13} /> Asignar</>
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {plans.length === 0 && (
                <p className="cnt-library-empty">
                  No tienes planes nutricionales. Crea uno en la biblioteca.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryItem({ label, actual, target, unit }) {
  if (actual == null) return null;
  const pct = target > 0 ? Math.round((actual / target) * 100) : null;
  return (
    <div className="cnt-summary-item">
      <span className="cnt-summary-label">{label}</span>
      <span className="cnt-summary-actual">{actual}{unit}</span>
      {target > 0 && (
        <span className="cnt-summary-target">/ {target}{unit}</span>
      )}
      {pct != null && (
        <span className={`cnt-summary-pct ${pct >= 90 && pct <= 110 ? 'cnt-summary-pct--good' : ''}`}>
          ({pct}%)
        </span>
      )}
    </div>
  );
}
