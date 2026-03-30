import { useMemo, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { GlowingEffect } from '../ui';
import './CrossTabInsights.css';

function evaluateRules(labData) {
  if (!labData) return [];
  const alerts = [];

  const rpe = labData.rpeAverage;
  const adherence = labData.adherenceRate;
  const nutritionAdherence = labData.nutritionAdherence;
  const stalledExercises = labData.stalledExercises || [];
  const readinessBreakdown = labData.readinessBreakdown || [];
  const weeklyVolume = labData.weeklyVolume || [];

  // Rule 1: High RPE + calorie deficit
  if (rpe != null && rpe > 8.5 && nutritionAdherence != null && nutritionAdherence < 85) {
    alerts.push({
      id: 'rpe-deficit',
      severity: 'warning',
      text: `Intensidad alta (RPE ${rpe.toFixed(1)}) con adherencia nutricional del ${Math.round(nutritionAdherence)}%`,
    });
  }

  // Rule 2: Nutrition adherence below 60%
  if (nutritionAdherence != null && nutritionAdherence < 60) {
    alerts.push({
      id: 'low-nutrition',
      severity: 'critical',
      text: `Adherencia nutricional baja: ${Math.round(nutritionAdherence)}% esta semana`,
    });
  }

  // Rule 3: Volume spike without calorie increase
  if (weeklyVolume.length >= 2) {
    const last = weeklyVolume[weeklyVolume.length - 1];
    const prev = weeklyVolume[weeklyVolume.length - 2];
    if (prev.totalSets > 0) {
      const volumeChange = ((last.totalSets - prev.totalSets) / prev.totalSets) * 100;
      if (volumeChange > 20) {
        alerts.push({
          id: 'volume-spike',
          severity: 'warning',
          text: `Volumen subio ${Math.round(volumeChange)}% vs la semana anterior`,
        });
      }
    }
  }

  // Rule 4: Stalled exercises (3+ weeks)
  const worstStalled = stalledExercises[0];
  if (worstStalled && worstStalled.weeksSinceLastPR >= 3) {
    alerts.push({
      id: 'stalled',
      severity: 'info',
      text: `Sin PRs en ${worstStalled.exercise} hace ${worstStalled.weeksSinceLastPR} semanas`,
    });
  }

  // Rule 5: Low sleep + high RPE
  if (readinessBreakdown.length > 0) {
    const recentSleep = readinessBreakdown.slice(-7);
    const avgSleep = recentSleep.reduce((sum, r) => sum + (r.sleep || 0), 0) / recentSleep.length;
    if (avgSleep > 0 && avgSleep < 6 && rpe != null && rpe > 7.5) {
      alerts.push({
        id: 'sleep-rpe',
        severity: 'warning',
        text: `Pocas horas de sueno (${avgSleep.toFixed(1)}h promedio) con intensidad alta`,
      });
    }
  }

  return alerts;
}

export default function CrossTabInsights({ labData }) {
  const [dismissed, setDismissed] = useState(new Set());

  const alerts = useMemo(() => evaluateRules(labData), [labData]);

  const visibleAlerts = alerts.filter(a => !dismissed.has(a.id));

  if (visibleAlerts.length === 0) return null;

  return (
    <div className="cti-container">
      {visibleAlerts.map((alert, i) => (
        <div
          key={alert.id}
          className={`cti-alert cti-alert--${alert.severity}`}
          style={{ animationDelay: `${i * 60}ms` }}
        >
          <GlowingEffect spread={20} proximity={80} borderWidth={1} />
          <div className="cti-alert-inner">
            <AlertTriangle size={13} className="cti-alert-icon" />
            <span className="cti-alert-text">{alert.text}</span>
            <button
              className="cti-alert-dismiss"
              onClick={() => setDismissed(prev => new Set([...prev, alert.id]))}
              aria-label="Cerrar"
            >
              <X size={12} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
