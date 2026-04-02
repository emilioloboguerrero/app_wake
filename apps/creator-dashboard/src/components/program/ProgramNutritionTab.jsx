import { useState, useMemo, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as nutritionDb from '../../services/nutritionFirestoreService';
import { GlowingEffect, ShimmerSkeleton } from '../ui';
import { Search, Pencil, Trash2, Plus, Apple } from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import './ProgramNutritionTab.css';

const PIE_COLORS = [
  'rgba(129,140,248,0.7)',
  'rgba(251,191,36,0.6)',
  'rgba(248,113,113,0.6)',
];

export default function ProgramNutritionTab({ programId, creatorId }) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [assigningPlanId, setAssigningPlanId] = useState(null);

  // ── Creator's nutrition plans ────────────────────────────────
  const { data: plans = [], isLoading: plansLoading } = useQuery({
    queryKey: ['nutrition', 'plans', creatorId],
    queryFn: () => nutritionDb.getPlansByCreator(creatorId),
    enabled: !!creatorId,
    staleTime: 5 * 60 * 1000,
  });

  // ── Program's active assignments ──────────────────────────────
  const { data: assignments = [], isLoading: assignmentsLoading } = useQuery({
    queryKey: ['nutrition', 'program-assignments', programId],
    queryFn: () => nutritionDb.getProgramNutritionAssignments(programId),
    enabled: !!programId,
    staleTime: 2 * 60 * 1000,
  });

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
    mutationKey: ['nutrition', 'program-assign', programId],
    mutationFn: (planId) => nutritionDb.createProgramNutritionAssignment(programId, planId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nutrition', 'program-assignments', programId] });
      setAssigningPlanId(null);
    },
  });

  // ── Remove mutation ──────────────────────────────────────────
  const removeMutation = useMutation({
    mutationKey: ['nutrition', 'program-unassign', programId],
    mutationFn: () => nutritionDb.deleteProgramNutritionAssignment(programId, activeAssignment.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nutrition', 'program-assignments', programId] });
      setConfirmRemove(false);
    },
  });

  // ── Pie chart data ───────────────────────────────────────────
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

  // ── Filtered plans for library ───────────────────────────────
  const filteredPlans = useMemo(() => {
    if (!searchQuery.trim()) return plans;
    const q = searchQuery.toLowerCase();
    return plans.filter(p => p.name?.toLowerCase().includes(q));
  }, [plans, searchQuery]);

  // ── Handlers ─────────────────────────────────────────────────
  const handleEditPlan = useCallback(() => {
    if (!activeAssignment) return;
    const planIdToEdit = activeAssignment.planId;
    navigate(`/nutrition/plans/${planIdToEdit}`, {
      state: {
        editScope: 'assignment',
        assignmentId: activeAssignment.id,
        assignmentPlanId: planIdToEdit,
        programId,
        returnTo: location.pathname,
        returnState: { tab: 'contenido', subtab: 'nutricion' },
      },
    });
  }, [activeAssignment, programId, navigate, location.pathname]);

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
      <div className="pnt-root">
        <div className="pnt-plan-card">
          <div className="pnt-plan-card-inner">
            <ShimmerSkeleton style={{ width: 90, height: 11, borderRadius: 4 }} />
            <div className="pnt-plan-display">
              <div className="pnt-plan-info">
                <ShimmerSkeleton style={{ width: '60%', height: 15, borderRadius: 5 }} />
                <div className="pnt-plan-cal">
                  <ShimmerSkeleton style={{ width: 50, height: 24, borderRadius: 6 }} />
                  <ShimmerSkeleton style={{ width: 36, height: 11, borderRadius: 4 }} />
                </div>
              </div>
              <div className="pnt-plan-pie">
                <ShimmerSkeleton style={{ width: 80, height: 80, borderRadius: '50%' }} />
                <div className="pnt-plan-macros">
                  {[48, 44, 40].map((w, i) => (
                    <div key={i} className="pnt-plan-macro-row">
                      <ShimmerSkeleton style={{ width: 7, height: 7, borderRadius: '50%' }} />
                      <ShimmerSkeleton style={{ width: w, height: 10, borderRadius: 3 }} />
                      <ShimmerSkeleton style={{ width: 22, height: 11, borderRadius: 3 }} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="pnt-plan-actions">
              <ShimmerSkeleton style={{ width: 90, height: 30, borderRadius: 8 }} />
              <ShimmerSkeleton style={{ width: 60, height: 30, borderRadius: 8 }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pnt-root">
      <div className="pnt-plan-card">
        <GlowingEffect spread={40} proximity={120} borderWidth={1} />
        <div className="pnt-plan-card-inner">
          <h3 className="pnt-section-title">Plan nutricional del programa</h3>

          {activeAssignment ? (
            <>
              <div className="pnt-plan-display">
                <div className="pnt-plan-info">
                  <span className="pnt-plan-name">
                    {activePlan?.name || activeAssignment.planName || 'Plan activo'}
                  </span>
                  <div className="pnt-plan-cal">
                    <span className="pnt-plan-cal-value">{dailyCalories}</span>
                    <span className="pnt-plan-cal-unit">kcal/dia</span>
                  </div>
                </div>
                {macroData.length > 0 && (
                  <div className="pnt-plan-pie">
                    <ResponsiveContainer width={90} height={90}>
                      <PieChart>
                        <Pie data={macroData} cx="50%" cy="50%" innerRadius={26} outerRadius={40} paddingAngle={2} dataKey="value" animationDuration={800}>
                          {macroData.map((_, i) => (<Cell key={i} fill={PIE_COLORS[i]} />))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pnt-plan-macros">
                      {macroData.map((m, i) => (
                        <div key={i} className="pnt-plan-macro-row">
                          <div className="pnt-plan-macro-dot" style={{ background: PIE_COLORS[i] }} />
                          <span className="pnt-plan-macro-label">{m.name}</span>
                          <span className="pnt-plan-macro-val">{Math.round(m.value)}g</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="pnt-plan-actions">
                <button className="pnt-btn pnt-btn--edit" onClick={handleEditPlan}>
                  <Pencil size={13} />
                  Editar plan
                </button>
                {confirmRemove ? (
                  <div className="pnt-confirm-row">
                    <span className="pnt-confirm-text">Quitar plan?</span>
                    <button
                      className="pnt-btn pnt-btn--danger"
                      onClick={handleConfirmRemove}
                      disabled={removeMutation.isPending}
                    >
                      {removeMutation.isPending ? 'Quitando...' : 'Confirmar'}
                    </button>
                    <button className="pnt-btn pnt-btn--ghost" onClick={() => setConfirmRemove(false)}>
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button className="pnt-btn pnt-btn--remove" onClick={() => setConfirmRemove(true)}>
                    <Trash2 size={13} />
                    Quitar
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="pnt-assign-flow">
              <div className="pnt-assign-empty">
                <Apple size={20} className="pnt-assign-empty-icon" />
                <p>Sin plan nutricional asignado al programa</p>
              </div>

              {plans.length > 0 && (
                <>
                  <div className="pnt-library-search">
                    <Search size={13} className="pnt-search-icon" />
                    <input
                      type="text"
                      className="pnt-search-input"
                      placeholder="Buscar plan..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <div className="pnt-library-list">
                    {filteredPlans.map(plan => (
                      <div key={plan.id} className="pnt-library-item">
                        <div className="pnt-library-item-info">
                          <span className="pnt-library-item-name">{plan.name}</span>
                          <span className="pnt-library-item-cal">
                            {plan.daily_calories ?? '--'} kcal
                            {plan.daily_protein_g ? ` · ${Math.round(plan.daily_protein_g)}P` : ''}
                            {plan.daily_carbs_g ? ` / ${Math.round(plan.daily_carbs_g)}C` : ''}
                            {plan.daily_fat_g ? ` / ${Math.round(plan.daily_fat_g)}F` : ''}
                          </span>
                        </div>
                        <button
                          className="pnt-btn pnt-btn--assign"
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
                <p className="pnt-library-empty">
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
