import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import Input from '../Input';
import { GlowingEffect } from '../ui';
import * as nutritionDb from '../../services/nutritionFirestoreService';
import { queryKeys, cacheConfig } from '../../config/queryClient';
import '../PlanningLibrarySidebar.css';

export const DRAG_TYPE_NUTRITION_PLAN = 'nutrition/library-plan';

const DraggablePlanItem = ({ plan }) => {
  const handleDragStart = (e) => {
    const payload = {
      type: DRAG_TYPE_NUTRITION_PLAN,
      planId: plan.id,
      title: plan.name || 'Plan',
    };
    e.dataTransfer.effectAllowed = 'all';
    e.dataTransfer.setData('application/json', JSON.stringify(payload));
    e.dataTransfer.setData('text/plain', JSON.stringify(payload));
    e.currentTarget.classList.add('plan-structure-item-dragging');
  };

  const handleDragEnd = (e) => {
    e.currentTarget.classList.remove('plan-structure-item-dragging');
  };

  return (
    <div
      className="planning-sidebar-program-item plan-structure-library-item"
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <GlowingEffect spread={16} proximity={70} borderWidth={1} />
      <div className="planning-sidebar-program-content" style={{ position: 'relative', zIndex: 2 }}>
        <div
          className="planning-sidebar-program-image-placeholder"
          style={{ width: 28, height: 28, fontSize: 12 }}
        >
          {plan.name?.charAt(0) || 'P'}
        </div>
        <div className="planning-sidebar-program-info">
          <span className="planning-sidebar-program-name">
            {plan.name || `Plan ${plan.id?.slice(0, 8)}`}
          </span>
        </div>
      </div>
      <div className="plan-structure-drag-hint" style={{ position: 'relative', zIndex: 2 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M9 5L15 5M9 12L15 12M9 19L15 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
};

const NutritionLibrarySidebar = ({ creatorId, searchQuery = '', onSearchChange }) => {
  const { data: plans = [], isLoading, isError } = useQuery({
    queryKey: queryKeys.nutrition.plans(creatorId),
    queryFn: () => nutritionDb.getPlansByCreator(creatorId),
    enabled: !!creatorId,
    ...cacheConfig.otherPrograms,
  });

  const q = (searchQuery || '').trim().toLowerCase();
  const filteredPlans = useMemo(() => {
    if (!q) return plans;
    return plans.filter((p) =>
      (p.name || '').toLowerCase().includes(q) ||
      (p.description || '').toLowerCase().includes(q)
    );
  }, [plans, q]);

  return (
    <div className="planning-library-sidebar">
      <div className="plan-structure-search">
        <Input
          placeholder="Buscar planes..."
          value={searchQuery}
          onChange={(e) => onSearchChange?.(e.target.value)}
          type="text"
          light
        />
      </div>

      <div className="planning-sidebar-content">
        {isLoading ? (
          <div className="planning-sidebar-loading">
            <p>Cargando...</p>
          </div>
        ) : isError ? (
          <div className="planning-sidebar-empty">
            <p>No se pudo cargar la biblioteca. Intenta de nuevo.</p>
          </div>
        ) : filteredPlans.length === 0 ? (
          <div className="planning-sidebar-empty">
            <p>{q ? 'No hay coincidencias' : 'No tienes planes nutricionales. Crea uno en la biblioteca primero.'}</p>
          </div>
        ) : (
          <div className="planning-sidebar-section">
            <h4 className="planning-sidebar-section-title">Arrastra a un día</h4>
            <div className="planning-sidebar-programs-list">
              {filteredPlans.map((plan) => (
                <DraggablePlanItem key={plan.id} plan={plan} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default NutritionLibrarySidebar;
