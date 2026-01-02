import React, { useState, useEffect } from 'react';
import plansService from '../services/plansService';
import './PlanningSidebar.css';

const PlansSidebar = ({ 
  creatorId, 
  selectedPlanId, 
  onPlanSelect 
}) => {
  const [plans, setPlans] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadPlans();
  }, [creatorId]);

  const loadPlans = async () => {
    if (!creatorId) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const allPlans = await plansService.getPlansByCreator(creatorId);
      setPlans(allPlans);
      
      // Auto-select first plan if no selection
      if (!selectedPlanId && allPlans.length > 0 && onPlanSelect) {
        onPlanSelect(allPlans[0].id);
      }
    } catch (error) {
      console.error('Error loading plans:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePlanClick = (planId) => {
    if (onPlanSelect) {
      onPlanSelect(planId);
    }
  };

  if (isLoading) {
    return (
      <div className="planning-sidebar">
        <div className="planning-sidebar-header">
          <h3 className="planning-sidebar-title">Planes</h3>
        </div>
        <div className="planning-sidebar-loading">
          <p>Cargando planes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="planning-sidebar">
      <div className="planning-sidebar-header">
        <h3 className="planning-sidebar-title">Planes</h3>
      </div>

      <div className="planning-sidebar-content">
        {plans.length > 0 ? (
          <div className="planning-sidebar-section">
            <h4 className="planning-sidebar-section-title">Disponibles</h4>
            <div className="planning-sidebar-programs-list">
              {plans.map((plan) => (
                <div
                  key={plan.id}
                  className={`planning-sidebar-program-item planning-sidebar-program-item-draggable ${
                    selectedPlanId === plan.id ? 'planning-sidebar-program-item-selected' : ''
                  }`}
                  draggable={true}
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('application/json', JSON.stringify({
                      planId: plan.id,
                      planTitle: plan.title,
                      type: 'plan'
                    }));
                    e.currentTarget.classList.add('planning-sidebar-program-item-dragging');
                  }}
                  onDragEnd={(e) => {
                    e.currentTarget.classList.remove('planning-sidebar-program-item-dragging');
                  }}
                  onClick={() => handlePlanClick(plan.id)}
                >
                  <div className="planning-sidebar-program-content">
                    <div className="planning-sidebar-program-image-placeholder">
                      {plan.title?.charAt(0) || 'P'}
                    </div>
                    <div className="planning-sidebar-program-info">
                      <span className="planning-sidebar-program-name">
                        {plan.title || `Plan ${plan.id.slice(0, 8)}`}
                      </span>
                      {plan.description && (
                        <span className="planning-sidebar-program-description">
                          {plan.description}
                        </span>
                      )}
                      {selectedPlanId === plan.id && (
                        <span className="planning-sidebar-program-selected-indicator">Seleccionado</span>
                      )}
                    </div>
                  </div>
                  <div className="planning-sidebar-program-drag-handle">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M9 5L15 5M9 12L15 12M9 19L15 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="planning-sidebar-empty">
            <p>No hay planes disponibles</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default PlansSidebar;

