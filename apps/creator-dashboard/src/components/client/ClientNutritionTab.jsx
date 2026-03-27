import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as nutritionDb from '../../services/nutritionFirestoreService';
import { GlowingEffect, ShimmerSkeleton } from '../ui';
import { Search, GripVertical, Dumbbell } from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import DailyCalorieBars from './DailyCalorieBars';
import './ClientNutritionTab.css';

const PIE_COLORS = [
  'rgba(129,140,248,0.7)',
  'rgba(251,191,36,0.6)',
  'rgba(248,113,113,0.6)',
];

export default function ClientNutritionTab({
  clientId, clientUserId, clientName, creatorId,
  currentWeekIndex, weekDateRange, labData,
}) {
  const [searchQuery, setSearchQuery] = useState('');

  // ── Creator's nutrition plans ────────────────────────────────
  const { data: plans = [] } = useQuery({
    queryKey: ['nutrition', 'plans', creatorId],
    queryFn: () => nutritionDb.getPlansByCreator(creatorId),
    enabled: !!creatorId,
    staleTime: 5 * 60 * 1000,
  });

  // ── Client's active assignments ──────────────────────────────
  const { data: assignments = [] } = useQuery({
    queryKey: ['nutrition', 'assignments', clientUserId],
    queryFn: () => nutritionDb.getAssignmentsByUser(clientUserId),
    enabled: !!clientUserId,
    staleTime: 2 * 60 * 1000,
  });

  const activeAssignment = useMemo(() =>
    assignments.find(a => !a.status || a.status === 'active'),
    [assignments]
  );

  const activePlan = useMemo(() => {
    if (!activeAssignment) return null;
    return plans.find(p => p.id === activeAssignment.planId) || { name: activeAssignment.planName || 'Plan asignado' };
  }, [activeAssignment, plans]);

  // ── Derive weekly nutrition data from labData ────────────────
  const weekNutrition = useMemo(() => {
    const caloriesTrend = labData?.caloriesTrend || [];
    const macrosTrend = labData?.macrosTrend || [];

    // Filter to current week if we have a date range
    let weekCalories = caloriesTrend;
    let weekMacros = macrosTrend;
    if (weekDateRange?.start && weekDateRange?.end) {
      weekCalories = caloriesTrend.filter(d => d.date >= weekDateRange.start && d.date <= weekDateRange.end);
      weekMacros = macrosTrend.filter(d => d.date >= weekDateRange.start && d.date <= weekDateRange.end);
    } else {
      // Fallback: use last 7 entries
      weekCalories = caloriesTrend.slice(-7);
      weekMacros = macrosTrend.slice(-7);
    }

    // Pad to 7 days
    const days = [];
    for (let i = 0; i < 7; i++) {
      const entry = weekCalories[i];
      days.push(entry ? { date: entry.date, actual: entry.actual } : null);
    }

    // Averages
    const withData = weekCalories.filter(d => d.actual > 0);
    const avgCalories = withData.length > 0
      ? Math.round(withData.reduce((s, d) => s + d.actual, 0) / withData.length)
      : null;

    const macroWithData = weekMacros.filter(d => d.protein > 0 || d.carbs > 0 || d.fat > 0);
    const avgProtein = macroWithData.length > 0
      ? Math.round(macroWithData.reduce((s, d) => s + d.protein, 0) / macroWithData.length)
      : null;
    const avgCarbs = macroWithData.length > 0
      ? Math.round(macroWithData.reduce((s, d) => s + d.carbs, 0) / macroWithData.length)
      : null;
    const avgFat = macroWithData.length > 0
      ? Math.round(macroWithData.reduce((s, d) => s + d.fat, 0) / macroWithData.length)
      : null;

    const target = weekCalories[0]?.target || labData?.nutritionComparison?.targetCalories || 0;
    const targetProtein = labData?.nutritionComparison?.targetProtein || 0;
    const targetCarbs = labData?.nutritionComparison?.targetCarbs || 0;
    const targetFat = labData?.nutritionComparison?.targetFat || 0;

    const adherencePct = target > 0 && avgCalories
      ? Math.round((avgCalories / target) * 100)
      : null;

    return { days, avgCalories, avgProtein, avgCarbs, avgFat, target, targetProtein, targetCarbs, targetFat, adherencePct, daysLogged: withData.length };
  }, [labData, weekDateRange]);

  // ── Pie chart data ───────────────────────────────────────────
  const macroData = useMemo(() => {
    const p = activeAssignment || activePlan;
    if (!p) return [];
    const protein = p.daily_protein_g ?? p.dailyProteinG ?? 0;
    const carbs = p.daily_carbs_g ?? p.dailyCarbsG ?? 0;
    const fat = p.daily_fat_g ?? p.dailyFatG ?? 0;
    if (!protein && !carbs && !fat) return [];
    return [
      { name: 'Proteina', value: protein },
      { name: 'Carbos', value: carbs },
      { name: 'Grasas', value: fat },
    ];
  }, [activeAssignment, activePlan]);

  const dailyCalories = activeAssignment?.daily_calories
    ?? activeAssignment?.dailyCalories
    ?? activePlan?.daily_calories
    ?? activePlan?.dailyCalories ?? 0;

  const filteredPlans = useMemo(() => {
    if (!searchQuery.trim()) return plans;
    const q = searchQuery.toLowerCase();
    return plans.filter(p => p.name?.toLowerCase().includes(q));
  }, [plans, searchQuery]);

  const hasNutritionData = weekNutrition.avgCalories != null;

  return (
    <div className="cnt-root">
      {/* ── Section 1: Adherence Dashboard ─────────────────────── */}
      <div className="cnt-adherence">
        <GlowingEffect spread={40} proximity={120} borderWidth={1} />
        <div className="cnt-adherence-inner">
          <div className="cnt-adherence-header">
            <h3 className="cnt-section-title">Adherencia esta semana</h3>
            {weekNutrition.adherencePct != null && (
              <span className={`cnt-adherence-pct ${weekNutrition.adherencePct >= 90 ? 'cnt-adherence-pct--good' : weekNutrition.adherencePct >= 70 ? 'cnt-adherence-pct--ok' : 'cnt-adherence-pct--low'}`}>
                {weekNutrition.adherencePct}%
              </span>
            )}
          </div>

          {hasNutritionData ? (
            <>
              <DailyCalorieBars
                days={weekNutrition.days}
                target={weekNutrition.target}
              />

              <div className="cnt-summary">
                <SummaryItem
                  label="Promedio"
                  actual={weekNutrition.avgCalories}
                  target={weekNutrition.target}
                  unit="kcal"
                />
                <SummaryItem
                  label="P"
                  actual={weekNutrition.avgProtein}
                  target={weekNutrition.targetProtein}
                  unit="g"
                />
                <SummaryItem
                  label="C"
                  actual={weekNutrition.avgCarbs}
                  target={weekNutrition.targetCarbs}
                  unit="g"
                />
                <SummaryItem
                  label="F"
                  actual={weekNutrition.avgFat}
                  target={weekNutrition.targetFat}
                  unit="g"
                />
              </div>
            </>
          ) : (
            <div className="cnt-no-data">
              {!weekDateRange
                ? 'Esta semana del plan aun no tiene fechas asignadas'
                : 'Sin datos de nutricion para esta semana'}
            </div>
          )}
        </div>
      </div>

      {/* ── Section 2: Assigned Plan ───────────────────────────── */}
      <div className="cnt-plan-card">
        <GlowingEffect spread={40} proximity={120} borderWidth={1} />
        <div className="cnt-plan-card-inner">
          <h3 className="cnt-section-title">Plan asignado</h3>
          {activeAssignment ? (
            <div className="cnt-plan-display">
              <div className="cnt-plan-info">
                <span className="cnt-plan-name">{activePlan?.name || 'Plan activo'}</span>
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
                  <ResponsiveContainer width={100} height={100}>
                    <PieChart>
                      <Pie data={macroData} cx="50%" cy="50%" innerRadius={30} outerRadius={45} paddingAngle={2} dataKey="value" animationDuration={800}>
                        {macroData.map((_, i) => (<Cell key={i} fill={PIE_COLORS[i]} />))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="cnt-plan-macros">
                    {macroData.map((m, i) => (
                      <div key={i} className="cnt-plan-macro-row">
                        <div className="cnt-plan-macro-dot" style={{ background: PIE_COLORS[i] }} />
                        <span className="cnt-plan-macro-label">{m.name}</span>
                        <span className="cnt-plan-macro-val">{m.value}g</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="cnt-no-data">Sin plan nutricional asignado</div>
          )}
        </div>
      </div>

      {/* ── Section 3: Plan Library ────────────────────────────── */}
      <div className="cnt-library">
        <h3 className="cnt-section-title">Planes disponibles</h3>
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
          {filteredPlans.length > 0 ? filteredPlans.map(plan => (
            <div key={plan.id} className={`cnt-library-item ${plan.id === activePlan?.id ? 'cnt-library-item--active' : ''}`}>
              <GripVertical size={10} className="cnt-library-grip" />
              <div className="cnt-library-item-info">
                <span className="cnt-library-item-name">{plan.name}</span>
                <span className="cnt-library-item-cal">{plan.daily_calories ?? plan.dailyCalories ?? '--'} kcal</span>
              </div>
              {plan.id === activePlan?.id && <span className="cnt-library-badge">Activo</span>}
            </div>
          )) : (
            <p className="cnt-library-empty">Sin planes de nutricion</p>
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
