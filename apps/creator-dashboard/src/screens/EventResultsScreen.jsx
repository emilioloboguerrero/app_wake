import { useState, useEffect, useRef, useMemo, useCallback, Fragment } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import eventService from '../services/eventService';
import { queryKeys, cacheConfig } from '../config/queryClient';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, Area, ComposedChart,
} from 'recharts';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates,
  verticalListSortingStrategy, arrayMove
} from '@dnd-kit/sortable';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import apiClient from '../utils/apiClient';
import DashboardLayout from '../components/DashboardLayout';
import { GlowingEffect, TubelightNavBar, FullScreenError, InlineError, KeepAlivePane } from '../components/ui';
import ShimmerSkeleton from '../components/ui/ShimmerSkeleton';
import ErrorBoundary from '../components/ErrorBoundary';
import {
  DEFAULT_FIELD_IDS, DEFAULT_FIELDS, UNDELETABLE_FIELD_IDS,
  relativeLuminance, extractAccentFromImage,
  SortableField, LockedField, FieldTypePicker, NumberStepper,
} from '../components/events/eventFieldComponents';
import MediaPickerModal from '../components/MediaPickerModal';
import logger from '../utils/logger';
import DatePicker from '../components/DatePicker';
import './EventResultsScreen.css';
import './EventEditorScreen.css';

// ─── Shared helpers ────────────────────────────────────────────────

function formatDate(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTime(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

function formatDay(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
}

function formatDateForInput(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toISOString().split('T')[0];
}

// ─── Results helpers ───────────────────────────────────────────────

function isV2Registration(reg) {
  return Boolean(reg.responses && typeof reg.responses === 'object');
}

function getCellValue(reg, colId) {
  if (isV2Registration(reg)) {
    const val = reg.responses?.[colId];
    if (Array.isArray(val)) return val.join(', ');
    return val ?? '—';
  }
  return reg[colId] ?? '—';
}

function buildColumns(event) {
  if (event.fields && event.fields.length > 0) {
    return event.fields.map(f => ({ id: f.id, label: f.label }));
  }
  return [
    { id: 'nombre',   label: 'Nombre' },
    { id: 'email',    label: 'Email' },
    { id: 'telefono', label: 'Teléfono' },
    { id: 'edad',     label: 'Edad' },
    { id: 'genero',   label: 'Género' },
  ];
}

function getDisplayName(reg, columns) {
  if (reg.nombre) return reg.nombre;
  if (reg.responses) {
    const nameCol = columns.find(c =>
      c.label.toLowerCase().includes('nombre') || c.label.toLowerCase().includes('name')
    );
    if (nameCol) return reg.responses[nameCol.id] || 'Registrado';
    return Object.values(reg.responses).find(v => typeof v === 'string' && v.includes(' ')) || 'Registrado';
  }
  return 'Registrado';
}

// ─── Analytics engine ──────────────────────────────────────────────

function toDate(ts) {
  if (!ts) return null;
  return ts.toDate ? ts.toDate() : new Date(ts);
}

function groupByDay(registrations) {
  const map = {};
  registrations.forEach(r => {
    const key = formatDay(r.created_at);
    if (!key) return;
    map[key] = (map[key] || 0) + 1;
  });
  return Object.entries(map).map(([day, count]) => ({ day, count }));
}

function buildTimelineData(registrations) {
  const sorted = [...registrations].sort((a, b) => {
    const da = toDate(a.created_at), db = toDate(b.created_at);
    return (da?.getTime() || 0) - (db?.getTime() || 0);
  });
  const dayMap = {};
  sorted.forEach(r => {
    const d = toDate(r.created_at);
    if (!d) return;
    const key = d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
    dayMap[key] = (dayMap[key] || 0) + 1;
  });
  let cumulative = 0;
  return Object.entries(dayMap).map(([day, daily]) => {
    cumulative += daily;
    return { day, daily, cumulative };
  });
}

function buildTimelineInsights(timelineData, total) {
  if (timelineData.length < 2) return [];
  const insights = [];
  const halfTotal = total / 2;
  const firstHalfIdx = timelineData.findIndex(d => d.cumulative >= halfTotal);
  if (firstHalfIdx >= 0 && firstHalfIdx < timelineData.length / 3) {
    const firstHalfPct = Math.round(timelineData[firstHalfIdx].cumulative / total * 100);
    insights.push(`El ${firstHalfPct}% de los registros llegaron en los primeros ${firstHalfIdx + 1} dia${firstHalfIdx > 0 ? 's' : ''}.`);
  }
  const peakDay = timelineData.reduce((max, d) => d.daily > max.daily ? d : max, timelineData[0]);
  const avgDaily = total / timelineData.length;
  if (peakDay.daily > avgDaily * 2) {
    insights.push(`Hubo un pico el ${peakDay.day} con ${peakDay.daily} registros — revisa si publicaste algo ese dia.`);
  }
  const lastThird = timelineData.slice(Math.floor(timelineData.length * 0.66));
  const lastThirdTotal = lastThird.reduce((s, d) => s + d.daily, 0);
  if (lastThirdTotal < total * 0.1 && timelineData.length > 3) {
    insights.push('Los registros se frenaron en los ultimos dias del periodo.');
  }
  return insights;
}

function computeFillTime(registrations, capacity) {
  if (!capacity) return null;
  const sorted = [...registrations].sort((a, b) => {
    const da = toDate(a.created_at), db = toDate(b.created_at);
    return (da?.getTime() || 0) - (db?.getTime() || 0);
  });
  if (sorted.length < capacity) return null;
  const first = toDate(sorted[0]?.created_at);
  const atCap = toDate(sorted[capacity - 1]?.created_at);
  if (!first || !atCap) return null;
  const diffMs = atCap.getTime() - first.getTime();
  const days = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  const dateStr = atCap.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
  return { days, dateStr };
}

function buildSmartFieldAnalysis(event, registrations) {
  const fields = event?.fields || [];
  if (!fields.length || !registrations.length) return [];
  const total = registrations.length;
  const results = [];

  for (const field of fields) {
    const values = registrations.map(r => {
      if (r.responses) return r.responses[field.id];
      return r[field.id];
    }).filter(v => v != null && v !== '');

    if (values.length < 3) continue;

    const labelLower = field.label.toLowerCase();
    if (field.id === 'f_nombre' || labelLower.includes('nombre') || labelLower.includes('name')) continue;

    if (field.type === 'number' || field.id === 'f_edad') {
      const nums = values.map(Number).filter(n => !isNaN(n));
      if (nums.length < 3) continue;
      nums.sort((a, b) => a - b);
      const avg = Math.round(nums.reduce((s, n) => s + n, 0) / nums.length);
      const median = nums[Math.floor(nums.length / 2)];
      const min = nums[0];
      const max = nums[nums.length - 1];
      const range = max - min;
      const bucketSize = range <= 10 ? 2 : range <= 30 ? 5 : range <= 100 ? 10 : 20;
      const bucketStart = Math.floor(min / bucketSize) * bucketSize;
      const buckets = {};
      nums.forEach(n => {
        const bStart = Math.floor(n / bucketSize) * bucketSize;
        const label = `${bStart}-${bStart + bucketSize - 1}`;
        buckets[label] = (buckets[label] || 0) + 1;
      });
      const histogram = Object.entries(buckets).map(([label, count]) => ({ label, count }));
      const maxBucket = histogram.reduce((m, b) => b.count > m.count ? b : m, histogram[0]);
      const maxBucketPct = Math.round(maxBucket.count / nums.length * 100);

      results.push({
        field,
        type: 'number',
        stats: { avg, median, min, max },
        histogram,
        insight: `Tu audiencia promedio tiene ${avg} ${field.label.toLowerCase()}. El grupo mas grande es ${maxBucket.label} (${maxBucketPct}%).`,
      });
      continue;
    }

    if (['select', 'radio'].includes(field.type)) {
      const counts = {};
      values.forEach(v => { counts[v] = (counts[v] || 0) + 1; });
      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      if (sorted.length === 1 && sorted[0][1] === values.length) {
        results.push({ field, type: 'uniform', value: sorted[0][0], count: sorted[0][1] });
        continue;
      }
      const bars = sorted.map(([name, count]) => ({
        name, count, pct: Math.round(count / values.length * 100),
      }));
      const topPct = bars[0]?.pct || 0;
      const insight = topPct > 50
        ? `La mayoria selecciono ${bars[0].name} (${topPct}%).`
        : `${bars[0].name} fue la respuesta mas comun (${topPct}%).`;

      results.push({ field, type: 'select', bars, insight });
      continue;
    }

    if (field.type === 'multiselect') {
      const counts = {};
      values.forEach(v => {
        const arr = Array.isArray(v) ? v : [v];
        arr.forEach(opt => { if (opt) counts[opt] = (counts[opt] || 0) + 1; });
      });
      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      const totalResponses = Object.values(counts).reduce((s, c) => s + c, 0);
      const bars = sorted.map(([name, count]) => ({
        name, count, pct: Math.round(count / totalResponses * 100),
      }));
      const insight = `${bars[0]?.name} fue la opcion mas popular (${bars[0]?.count} respuestas).`;
      results.push({ field, type: 'multiselect', bars, insight });
      continue;
    }

    if (field.type === 'email' || field.id === 'f_email') continue;
    if (field.type === 'tel' || field.id === 'f_telefono') continue;

    if (['text', 'textarea'].includes(field.type)) {
      const counts = {};
      values.forEach(v => {
        const norm = String(v).trim().toLowerCase();
        counts[norm] = (counts[norm] || 0) + 1;
      });
      const unique = Object.keys(counts).length;
      if (unique > 20) {
        results.push({ field, type: 'text-many', uniqueCount: unique });
        continue;
      }
      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
      const bars = sorted.map(([name, count]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        count,
        pct: Math.round(count / values.length * 100),
      }));
      results.push({ field, type: 'text-few', bars, insight: `${bars[0]?.name} fue la respuesta mas comun (${bars[0]?.pct}%).` });
      continue;
    }
  }

  return results;
}

function buildCrossTab(event, registrations) {
  const fields = event?.fields || [];
  const selectFields = fields.filter(f => ['select', 'radio'].includes(f.type) && f.id !== 'f_email' && f.id !== 'f_telefono');
  if (selectFields.length < 2 || registrations.length < 10) return null;

  let bestPair = null;
  let bestScore = 0;

  for (let i = 0; i < selectFields.length; i++) {
    for (let j = i + 1; j < selectFields.length; j++) {
      const fA = selectFields[i];
      const fB = selectFields[j];
      const groupedA = {};
      registrations.forEach(r => {
        const vA = r.responses?.[fA.id] ?? r[fA.id];
        const vB = r.responses?.[fB.id] ?? r[fB.id];
        if (!vA || !vB) return;
        if (!groupedA[vA]) groupedA[vA] = {};
        groupedA[vA][vB] = (groupedA[vA][vB] || 0) + 1;
      });
      const groups = Object.keys(groupedA);
      if (groups.length < 2) continue;
      const allBValues = [...new Set(registrations.map(r => r.responses?.[fB.id] ?? r[fB.id]).filter(Boolean))];
      if (allBValues.length < 2 || allBValues.length > 6) continue;

      let maxDiff = 0;
      for (const bVal of allBValues) {
        const pcts = groups.map(g => {
          const groupTotal = Object.values(groupedA[g]).reduce((s, c) => s + c, 0);
          return groupTotal > 0 ? (groupedA[g][bVal] || 0) / groupTotal : 0;
        });
        const diff = Math.max(...pcts) - Math.min(...pcts);
        if (diff > maxDiff) maxDiff = diff;
      }

      if (maxDiff > bestScore) {
        bestScore = maxDiff;
        bestPair = { rowField: fA, colField: fB, grouped: groupedA, allColValues: allBValues };
      }
    }
  }

  if (!bestPair || bestScore < 0.15) return null;

  const { rowField, colField, grouped, allColValues } = bestPair;
  const rows = Object.entries(grouped).map(([rowVal, colCounts]) => {
    const rowTotal = Object.values(colCounts).reduce((s, c) => s + c, 0);
    const cells = allColValues.map(cv => ({
      value: cv,
      count: colCounts[cv] || 0,
      pct: rowTotal > 0 ? Math.round((colCounts[cv] || 0) / rowTotal * 100) : 0,
    }));
    return { label: rowVal, total: rowTotal, cells };
  });

  let insightParts = [];
  if (rows.length >= 2 && allColValues.length >= 1) {
    const topCol = allColValues[0];
    const row0 = rows[0];
    const row1 = rows[1];
    const pct0 = row0.cells.find(c => c.value === topCol)?.pct || 0;
    const pct1 = row1.cells.find(c => c.value === topCol)?.pct || 0;
    if (Math.abs(pct0 - pct1) > 15) {
      insightParts.push(
        `De los ${row0.label.toLowerCase()}, el ${pct0}% selecciono ${topCol}. En ${row1.label.toLowerCase()} solo el ${pct1}%.`
      );
    }
  }

  return {
    rowField,
    colField,
    rows,
    colValues: allColValues,
    insight: insightParts.join(' '),
  };
}

function buildCheckinTimeline(registrations) {
  const checkedIn = registrations.filter(r => r.checked_in && r.checked_in_at);
  if (checkedIn.length < 3) return null;

  const times = checkedIn.map(r => {
    const d = toDate(r.checked_in_at);
    return d ? d.getHours() + d.getMinutes() / 60 : null;
  }).filter(Boolean);

  if (!times.length) return null;
  times.sort((a, b) => a - b);

  const minHour = Math.floor(Math.min(...times));
  const maxHour = Math.ceil(Math.max(...times));
  const slotMinutes = 15;
  const slots = [];

  for (let h = minHour; h <= maxHour; h++) {
    for (let m = 0; m < 60; m += slotMinutes) {
      const slotStart = h + m / 60;
      const slotEnd = slotStart + slotMinutes / 60;
      const count = times.filter(t => t >= slotStart && t < slotEnd).length;
      const label = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      slots.push({ label, count, hour: h, minute: m });
    }
  }

  const peakSlot = slots.reduce((m, s) => s.count > m.count ? s : m, slots[0]);
  const peakEnd = `${String(peakSlot.hour).padStart(2, '0')}:${String(peakSlot.minute + slotMinutes).padStart(2, '0')}`;
  const insight = `La mayoria llego entre ${peakSlot.label} y ${peakEnd}.`;

  return { slots, insight, peakLabel: peakSlot.label };
}

function buildNoShowProfile(event, registrations) {
  const fields = event?.fields || [];
  const total = registrations.length;
  const noShows = registrations.filter(r => !r.checked_in);
  if (noShows.length < 3 || total < 10) return null;

  const segmentFields = fields.filter(f =>
    ['select', 'radio', 'number'].includes(f.type) || f.id === 'f_edad' || f.id === 'f_genero'
  );

  const segments = [];
  for (const field of segmentFields) {
    const isNumber = field.type === 'number' || field.id === 'f_edad';

    if (isNumber) {
      const getVal = r => {
        const v = r.responses?.[field.id] ?? r[field.id];
        return v != null ? Number(v) : NaN;
      };
      const allNums = registrations.map(getVal).filter(n => !isNaN(n));
      if (allNums.length < 5) continue;
      const med = allNums.sort((a, b) => a - b)[Math.floor(allNums.length / 2)];
      const groups = [
        { label: `${field.label} <= ${med}`, filter: r => getVal(r) <= med },
        { label: `${field.label} > ${med}`, filter: r => getVal(r) > med },
      ];
      for (const g of groups) {
        const groupRegs = registrations.filter(g.filter);
        const groupNoShows = groupRegs.filter(r => !r.checked_in);
        if (groupRegs.length < 3) continue;
        const rate = Math.round(groupNoShows.length / groupRegs.length * 100);
        segments.push({ label: g.label, rate, count: groupNoShows.length, total: groupRegs.length });
      }
    } else {
      const counts = {};
      registrations.forEach(r => {
        const v = r.responses?.[field.id] ?? r[field.id];
        if (!v) return;
        if (!counts[v]) counts[v] = { total: 0, noShow: 0 };
        counts[v].total++;
        if (!r.checked_in) counts[v].noShow++;
      });
      Object.entries(counts).forEach(([val, c]) => {
        if (c.total < 3) return;
        const rate = Math.round(c.noShow / c.total * 100);
        segments.push({ label: val, rate, count: c.noShow, total: c.total });
      });
    }
  }

  if (segments.length < 2) return null;
  segments.sort((a, b) => b.rate - a.rate);

  const highest = segments[0];
  const lowest = segments[segments.length - 1];
  let insight = '';
  if (highest.rate - lowest.rate > 15) {
    insight = `Los no-shows fueron mas comunes en ${highest.label} (${highest.rate}% no asistio) vs ${lowest.label} (solo ${lowest.rate}%).`;
  }

  return { segments: segments.slice(0, 6), insight };
}

const CHART_COLORS = [
  'rgba(255,255,255,0.75)',
  'rgba(255,255,255,0.5)',
  'rgba(255,255,255,0.35)',
  'rgba(255,255,255,0.2)',
  'rgba(255,255,255,0.12)',
];


// ─── Editor sub-components (imported from components/events/eventFieldComponents) ──

// ─── Results sub-components ────────────────────────────────────────

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="er-tooltip">
      <p className="er-tooltip-label">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="er-tooltip-value">{p.name === 'cumulative' ? `Total: ${p.value}` : p.value}</p>
      ))}
    </div>
  );
}

function StatCard({ label, value, sub, badge, badgeColor, comparison }) {
  return (
    <div className="er-stat-card er-fade-in" style={{ position: 'relative' }}>
      <GlowingEffect />
      <span className="er-stat-label">{label}</span>
      <span className="er-stat-value">{value}</span>
      {badge && (
        <span className={`er-stat-badge er-stat-badge--${badgeColor || 'neutral'}`}>{badge}</span>
      )}
      {comparison && (
        <span className={`er-stat-comparison er-stat-comparison--${comparison.direction}`}>
          {comparison.direction === 'up' ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 19V5m-7 7 7-7 7 7"/></svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 5v14m-7-7 7 7 7-7"/></svg>
          )}
          {comparison.text}
        </span>
      )}
      {sub && <span className="er-stat-sub">{sub}</span>}
    </div>
  );
}

function SectionTitle({ children }) {
  return <h2 className="er-section-title">{children}</h2>;
}

function InsightText({ children }) {
  if (!children) return null;
  return <p className="er-insight-text">{children}</p>;
}

function HBarChart({ bars, accentFirst }) {
  if (!bars?.length) return null;
  return (
    <div className="er-hbar-list">
      {bars.map((bar, i) => (
        <div key={bar.name} className="er-hbar-item">
          <span className="er-hbar-label">{bar.name}</span>
          <div className="er-hbar-track">
            <div
              className={`er-hbar-fill${accentFirst && i === 0 ? ' er-hbar-fill--accent' : ''}`}
              style={{ width: `${Math.max(bar.pct, 2)}%` }}
            >
              {bar.pct >= 15 && <span className="er-hbar-pct">{bar.pct}%</span>}
            </div>
          </div>
          <span className="er-hbar-count">{bar.count}</span>
        </div>
      ))}
    </div>
  );
}

function AnalyticsCard({ title, insight, children, className }) {
  return (
    <div className={`er-analytics-card er-fade-in ${className || ''}`} style={{ position: 'relative' }}>
      <GlowingEffect />
      {title && <h3 className="er-analytics-card-title">{title}</h3>}
      {insight && <InsightText>{insight}</InsightText>}
      {children}
    </div>
  );
}

function RowModal({ reg, columns, onClose, onCheckIn, onRemoveCheckIn, onDelete }) {
  const isCheckedIn = reg.checked_in;
  const [actionLoading, setActionLoading] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRemoveCheckIn, setConfirmRemoveCheckIn] = useState(false);

  async function handleCheckIn() {
    setActionLoading('checkin');
    await onCheckIn();
    setActionLoading(null);
  }

  async function handleRemoveCheckIn() {
    setActionLoading('uncheckin');
    await onRemoveCheckIn();
    setActionLoading(null);
    setConfirmRemoveCheckIn(false);
  }

  async function handleDelete() {
    setActionLoading('delete');
    await onDelete();
    setActionLoading(null);
  }

  return (
    <div className="er-modal-backdrop" onClick={onClose}>
      <div className="er-modal er-fade-in" onClick={e => e.stopPropagation()}>
        <button className="er-modal-close" onClick={onClose} aria-label="Cerrar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className="er-modal-header">
          <h2 className="er-modal-name">{getDisplayName(reg, columns)}</h2>
          <span className={`er-modal-checkin-badge${isCheckedIn ? ' er-modal-checkin-badge--yes' : ''}`}>
            {isCheckedIn ? 'Check-in ✓' : 'Sin check-in'}
          </span>
        </div>

        <div className="er-modal-fields">
          {columns.map(col => (
            <div key={col.id} className="er-modal-field">
              <span className="er-modal-field-label">{col.label}</span>
              <span className="er-modal-field-value">{getCellValue(reg, col.id)}</span>
            </div>
          ))}
          <div className="er-modal-field">
            <span className="er-modal-field-label">Fecha de registro</span>
            <span className="er-modal-field-value">{formatDate(reg.created_at)}</span>
          </div>
          {isCheckedIn && reg.checked_in_at && (
            <div className="er-modal-field">
              <span className="er-modal-field-label">Hora de check-in</span>
              <span className="er-modal-field-value">{formatTime(reg.checked_in_at)}</span>
            </div>
          )}
        </div>

        {!isCheckedIn && (
          <button
            className="er-modal-checkin-btn"
            onClick={handleCheckIn}
            disabled={actionLoading !== null}
          >
            {actionLoading === 'checkin' ? 'Registrando…' : 'Marcar check-in manual'}
          </button>
        )}

        {isCheckedIn && (
          confirmRemoveCheckIn ? (
            <div className="er-modal-confirm-row">
              <span className="er-modal-confirm-text">¿Deshacer el check-in? La inscripción se mantiene.</span>
              <button
                className="er-modal-confirm-yes"
                onClick={handleRemoveCheckIn}
                disabled={actionLoading !== null}
              >
                {actionLoading === 'uncheckin' ? 'Deshaciendo…' : 'Deshacer'}
              </button>
              <button className="er-modal-confirm-no" onClick={() => setConfirmRemoveCheckIn(false)}>
                Cancelar
              </button>
            </div>
          ) : (
            <button
              className="er-modal-checkin-btn"
              onClick={() => setConfirmRemoveCheckIn(true)}
              disabled={actionLoading !== null}
            >
              Deshacer check-in
            </button>
          )
        )}

        {confirmDelete ? (
          <div className="er-modal-confirm-row">
            <span className="er-modal-confirm-text">¿Eliminar este registro?</span>
            <button
              className="er-modal-confirm-yes"
              onClick={handleDelete}
              disabled={actionLoading !== null}
            >
              {actionLoading === 'delete' ? 'Eliminando…' : 'Eliminar'}
            </button>
            <button className="er-modal-confirm-no" onClick={() => setConfirmDelete(false)}>
              Cancelar
            </button>
          </div>
        ) : (
          <button className="er-modal-delete-btn" onClick={() => setConfirmDelete(true)}>
            Eliminar registro
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main screen ───────────────────────────────────────────────────

export default function EventResultsScreen() {
  const { eventId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const defaultTab = routerLocation.pathname.endsWith('/edit') ? 'editar' : 'analytics';

  const { data: event, isLoading: eventLoading, isError: eventError } = useQuery({
    queryKey: queryKeys.events.detail(eventId),
    queryFn: async () => {
      const result = await eventService.getEvent(eventId);
      return result;
    },
    enabled: !!user && !!eventId,
    ...cacheConfig.events,
    refetchOnMount: false,
  });

  const { data: registrations = [], isLoading: regsLoading } = useQuery({
    queryKey: queryKeys.events.registrations(eventId),
    queryFn: () => eventService.getEventRegistrations(eventId),
    enabled: !!user && !!eventId,
    ...cacheConfig.events,
    refetchOnMount: false,
  });

  const { data: waitlist = [], isLoading: waitlistLoading } = useQuery({
    queryKey: queryKeys.events.waitlist(eventId),
    queryFn: () => eventService.getEventWaitlist(eventId),
    enabled: !!user && !!eventId,
    ...cacheConfig.events,
    refetchOnMount: false,
  });

  const { data: allCreatorEvents = [] } = useQuery({
    queryKey: queryKeys.events.byCreator(user?.uid),
    queryFn: () => eventService.getEventsByCreator(user.uid),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const isLoading = eventLoading || regsLoading || waitlistLoading;

  const [selectedReg, setSelectedReg] = useState(null);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [visitedTabs, setVisitedTabs] = useState(() => new Set([defaultTab]));

  const [accentRgb, setAccentRgb] = useState([255, 255, 255]);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventLocation, setEventLocation] = useState('');
  const [access, setAccess] = useState('public');
  const [maxRegistrations, setMaxRegistrations] = useState('');
  const [confirmationMessage, setConfirmationMessage] = useState('');
  const [sendConfirmationEmail, setSendConfirmationEmail] = useState(false);
  const [enableQrCheckin, setEnableQrCheckin] = useState(false);
  const [eventStatus, setEventStatus] = useState('draft');
  const [fields, setFields] = useState(DEFAULT_FIELDS);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [imageUrl, setImageUrl] = useState('');
  const [uploadProgress, setUploadProgress] = useState(null);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [showFieldPicker, setShowFieldPicker] = useState(false);
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const imageInputRef = useRef(null);
  const savedRef = useRef(null);

  // ─── Email tab state ───────────────────────────────────────────
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [emailAudienceMode, setEmailAudienceMode] = useState('all'); // all | checked_in | no_show | filtered | manual
  const [emailFilters, setEmailFilters] = useState({}); // { fieldId: value }
  const [emailManualIds, setEmailManualIds] = useState(new Set());
  const [emailImages, setEmailImages] = useState([]); // [{ url, id }]
  const [emailMediaPickerOpen, setEmailMediaPickerOpen] = useState(false);
  const [emailAudienceModalOpen, setEmailAudienceModalOpen] = useState(false);
  const [emailPreviewOpen, setEmailPreviewOpen] = useState(false);
  const [emailConfirmOpen, setEmailConfirmOpen] = useState(false);

  useEffect(() => {
    if (!event) return;
    if (event.creator_id !== user?.uid) {
      navigate('/events', { replace: true });
      return;
    }
    const d = event;
    setTitle(d.title || '');
    setDescription(d.description || '');
    setEventDate(d.date ? formatDateForInput(d.date) : '');
    setEventLocation(d.location || '');
    setAccess(d.access || 'public');
    setMaxRegistrations(d.max_registrations != null ? String(d.max_registrations) : '');
    setConfirmationMessage(d.settings?.confirmation_message || '');
    setSendConfirmationEmail(d.settings?.send_confirmation_email === true);
    setEnableQrCheckin(d.settings?.enable_qr_checkin === true);
    setEventStatus(d.status || 'draft');
    const loadedFields = d.fields || [];
    const mergedDefaults = DEFAULT_FIELDS.map(def => {
      const saved = loadedFields.find(f => f.id === def.id);
      return saved ? { ...def, ...saved, locked: true } : def;
    });
    const customFields = loadedFields.filter(f => !DEFAULT_FIELD_IDS.includes(f.id));
    const initialFields = [...mergedDefaults, ...customFields];
    setFields(initialFields);
    setImageUrl(d.image_url || '');
    setImagePreview(d.image_url || null);
    savedRef.current = {
      title: d.title || '',
      description: d.description || '',
      eventDate: d.date ? formatDateForInput(d.date) : '',
      eventLocation: d.location || '',
      access: d.access || 'public',
      maxRegistrations: d.max_registrations != null ? String(d.max_registrations) : '',
      confirmationMessage: d.settings?.confirmation_message || '',
      sendConfirmationEmail: d.settings?.send_confirmation_email === true,
      enableQrCheckin: d.settings?.enable_qr_checkin === true,
      eventStatus: d.status || 'draft',
      fields: JSON.stringify(initialFields),
      imageUrl: d.image_url || '',
    };
  }, [event, user, navigate]);

  useEffect(() => {
    if (!imagePreview) return;
    return extractAccentFromImage(imagePreview, setAccentRgb);
  }, [imagePreview]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(ev) {
    const { active, over } = ev;
    if (active.id !== over?.id) {
      setFields(items => {
        const locked = items.filter(f => f.locked);
        const custom = items.filter(f => !f.locked);
        const oldIdx = custom.findIndex(f => f.id === active.id);
        const newIdx = custom.findIndex(f => f.id === over.id);
        return [...locked, ...arrayMove(custom, oldIdx, newIdx)];
      });
    }
  }

  function addField(type) {
    const id = `f${Date.now()}`;
    const hasOptions = ['select', 'radio', 'multiselect'].includes(type);
    setFields(prev => [...prev, {
      id, type,
      label: '',
      placeholder: '',
      required: false,
      options: hasOptions ? ['', ''] : undefined,
    }]);
    setShowFieldPicker(false);
  }

  function updateField(id, changes) {
    setFields(prev => prev.map(f => f.id === id ? { ...f, ...changes } : f));
  }

  function removeField(id) {
    setFields(prev => prev.filter(f => f.id !== id));
  }

  function handleImageChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result);
    reader.readAsDataURL(file);
  }

  async function uploadImage() {
    if (!imageFile) return imageUrl;
    const contentType = imageFile.type || 'image/jpeg';
    const { data } = await apiClient.post(`/creator/events/${eventId}/image/upload-url`, { contentType });
    await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', data.uploadUrl);
      xhr.setRequestHeader('Content-Type', contentType);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`)));
      xhr.onerror = () => reject(new Error('Network error during upload'));
      xhr.timeout = 120000;
      xhr.ontimeout = () => reject(new Error('Upload timed out'));
      xhr.send(imageFile);
    });
    const confirmRes = await apiClient.post(`/creator/events/${eventId}/image/confirm`, { storagePath: data.storagePath });
    setImageFile(null);
    setUploadProgress(null);
    const url = confirmRes.data.imageUrl;
    setImageUrl(url);
    return url;
  }

  async function handleSave(targetStatus = eventStatus) {
    const errors = {};
    if (!title.trim()) errors.title = 'El titulo es obligatorio';
    if (!eventDate) errors.date = 'La fecha es obligatoria';
    if (maxRegistrations && Number(maxRegistrations) <= 0) errors.capacity = 'Los cupos deben ser un numero positivo';
    if (Object.keys(errors).length > 0) { setFieldErrors(errors); return; }
    setFieldErrors({});
    setSaving(true);

    let finalImageUrl = imageUrl;
    if (imageFile) {
      try {
        finalImageUrl = await uploadImage();
      } catch (err) {
        logger.error('[EventResults] image upload failed', err);
        showToast('No pudimos subir la imagen. Intenta de nuevo.', 'error');
        setUploadProgress(null);
        setSaving(false);
        return;
      }
    }

    const validFields = fields
      .filter(f => f.locked || f.label.trim())
      .map(f => ({
        id: f.id,
        label: f.label.trim(),
        type: f.type,
        required: Boolean(f.required),
        placeholder: f.placeholder || '',
        locked: Boolean(f.locked),
        ...(f.options ? { options: f.options.filter(o => o.trim()) } : {}),
      }));

    const eventData = {
      title: title.trim(),
      description: description.trim(),
      date: eventService.makeDateTimestamp(eventDate),
      location: eventLocation.trim(),
      access,
      max_registrations: maxRegistrations ? Number(maxRegistrations) : null,
      settings: {
        confirmation_message: confirmationMessage.trim(),
        send_confirmation_email: sendConfirmationEmail,
        enable_qr_checkin: enableQrCheckin,
        show_registration_count: false,
      },
      status: targetStatus,
      fields: validFields,
      image_url: finalImageUrl,
    };

    const detailKey = queryKeys.events.detail(eventId);
    const previousEvent = queryClient.getQueryData(detailKey);

    queryClient.setQueryData(detailKey, old => old ? { ...old, ...eventData, image_url: finalImageUrl } : old);
    setEventStatus(targetStatus);
    savedRef.current = {
      title,
      description,
      eventDate,
      eventLocation,
      access,
      maxRegistrations,
      confirmationMessage,
      sendConfirmationEmail,
      enableQrCheckin,
      eventStatus: targetStatus,
      fields: JSON.stringify(fields),
      imageUrl: finalImageUrl,
    };
    setSaving(false);
    showToast('Cambios guardados');

    eventService.updateEvent(eventId, eventData).then(() => {
      queryClient.invalidateQueries({ queryKey: queryKeys.events.byCreator(user.uid) });
    }).catch(err => {
      logger.error('[EventResults] save failed', err);
      queryClient.setQueryData(detailKey, previousEvent);
      savedRef.current = null;
      showToast('No pudimos guardar los cambios. Intenta de nuevo.', 'error');
      queryClient.invalidateQueries({ queryKey: detailKey });
    });
  }

  function exportCSV() {
    const cols = event ? buildColumns(event) : [];
    const headers = [...cols.map(c => c.label), 'Fecha', 'Check-in'];
    const rows = filteredRegs.map(r => [
      ...cols.map(c => String(getCellValue(r, c.id) ?? '')),
      formatDate(r.created_at) ?? '',
      r.checked_in ? 'Sí' : 'No',
    ]);
    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `registros-${eventId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleManualCheckIn(regId) {
    try {
      await eventService.checkInRegistration(eventId, regId);
      queryClient.invalidateQueries({ queryKey: queryKeys.events.registrations(eventId) });
    } catch (err) {
      logger.error('[EventResults] check-in failed', err);
      showToast('No pudimos hacer el check-in. Intenta de nuevo.', 'error');
    }
  }

  async function handleRemoveCheckIn(regId) {
    try {
      await eventService.removeCheckIn(eventId, regId);
      queryClient.invalidateQueries({ queryKey: queryKeys.events.registrations(eventId) });
      setSelectedReg(prev => prev?.id === regId ? { ...prev, checked_in: false, checked_in_at: null } : prev);
      showToast('Check-in removido');
    } catch (err) {
      logger.error('[EventResults] remove check-in failed', err);
      showToast('No pudimos deshacer el check-in. Intenta de nuevo.', 'error');
    }
  }

  async function handleDeleteRegistration(regId) {
    try {
      await eventService.deleteRegistration(eventId, regId);
      queryClient.invalidateQueries({ queryKey: queryKeys.events.registrations(eventId) });
      setSelectedReg(null);
    } catch (err) {
      logger.error('[EventResults] delete registration failed', err);
      showToast('No pudimos eliminar el registro. Intenta de nuevo.', 'error');
    }
  }

  async function admitFromWaitlist(waitId) {
    try {
      await eventService.admitFromWaitlist(eventId, waitId, event?.max_registrations != null);
      queryClient.invalidateQueries({ queryKey: queryKeys.events.waitlist(eventId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.events.detail(eventId) });
    } catch (err) {
      logger.error('[EventResults] admit failed', err);
      showToast('No pudimos admitir desde la lista de espera. Intenta de nuevo.', 'error');
    }
  }

  const columns = event ? buildColumns(event) : [];

  const isDirty = (() => {
    const s = savedRef.current;
    if (!s) return false;
    return (
      title !== s.title ||
      description !== s.description ||
      eventDate !== s.eventDate ||
      eventLocation !== s.eventLocation ||
      access !== s.access ||
      maxRegistrations !== s.maxRegistrations ||
      confirmationMessage !== s.confirmationMessage ||
      sendConfirmationEmail !== s.sendConfirmationEmail ||
      enableQrCheckin !== s.enableQrCheckin ||
      eventStatus !== s.eventStatus ||
      imageFile !== null ||
      imageUrl !== s.imageUrl ||
      JSON.stringify(fields) !== s.fields
    );
  })();
  const accentCss = `rgba(${accentRgb[0]},${accentRgb[1]},${accentRgb[2]},0.85)`;
  const lum = relativeLuminance(...accentRgb);
  const accentText = lum > 0.35 ? '#111' : '#fff';

  const filteredRegs = search.trim()
    ? registrations.filter(r => {
        const q = search.toLowerCase();
        if (isV2Registration(r)) {
          return Object.values(r.responses || {}).some(v =>
            typeof v === 'string' && v.toLowerCase().includes(q)
          );
        }
        return ['nombre', 'email', 'telefono'].some(k =>
          String(r[k] || '').toLowerCase().includes(q)
        );
      })
    : registrations;

  const total = registrations.length;
  const checkedIn = registrations.filter(r => r.checked_in).length;
  const checkinRate = total > 0 ? Math.round(checkedIn / total * 100) : 0;
  const noShows = total - checkedIn;
  const capacity = event?.max_registrations;
  const capacityPct = capacity ? Math.min(Math.round(total / capacity * 100), 100) : null;

  const timelineData = useMemo(() => buildTimelineData(registrations), [registrations]);
  const timelineInsights = useMemo(() => buildTimelineInsights(timelineData, total), [timelineData, total]);
  const fillTime = useMemo(() => computeFillTime(registrations, capacity), [registrations, capacity]);
  const fieldAnalysis = useMemo(() => buildSmartFieldAnalysis(event, registrations), [event, registrations]);
  const crossTab = useMemo(() => buildCrossTab(event, registrations), [event, registrations]);
  const checkinTimeline = useMemo(() => buildCheckinTimeline(registrations), [registrations]);
  const noShowProfile = useMemo(() => buildNoShowProfile(event, registrations), [event, registrations]);
  const peakDaily = useMemo(() => {
    if (!timelineData.length) return 0;
    return Math.max(...timelineData.map(d => d.daily));
  }, [timelineData]);

  const otherEvents = useMemo(() => {
    if (!allCreatorEvents.length || !eventId) return [];
    return allCreatorEvents
      .filter(e => e.id !== eventId)
      .sort((a, b) => {
        const da = toDate(a.date || a.created_at);
        const db = toDate(b.date || b.created_at);
        return (db?.getTime() || 0) - (da?.getTime() || 0);
      })
      .slice(0, 5);
  }, [allCreatorEvents, eventId]);

  const checkinBadgeColor = checkinRate >= 80 ? 'green' : checkinRate >= 50 ? 'yellow' : 'red';

  // ─── Email: filterable fields ─────────────────────────────────────
  const filterableFields = useMemo(() => {
    if (!event?.fields) return [];
    return event.fields.filter(f =>
      ['select', 'radio', 'multiselect', 'checkbox'].includes(f.type) ||
      f.id === 'f_genero'
    );
  }, [event]);

  const numberFields = useMemo(() => {
    if (!event?.fields) return [];
    return event.fields.filter(f => f.type === 'number' || f.id === 'f_edad');
  }, [event]);

  // ─── Email: resolve recipients based on audience mode + filters ───
  const emailRecipients = useMemo(() => {
    let pool = registrations;

    // Step 1: audience mode filter
    if (emailAudienceMode === 'checked_in') {
      pool = pool.filter(r => r.checked_in);
    } else if (emailAudienceMode === 'no_show') {
      pool = pool.filter(r => !r.checked_in);
    } else if (emailAudienceMode === 'manual') {
      pool = pool.filter(r => emailManualIds.has(r.id));
    }

    // Step 2: field filters (applied in all modes except manual)
    if (emailAudienceMode !== 'manual' && Object.keys(emailFilters).length > 0) {
      pool = pool.filter(r => {
        return Object.entries(emailFilters).every(([fieldId, filterValue]) => {
          if (!filterValue || filterValue === '__all__') return true;
          const val = r.responses?.[fieldId] ?? r[fieldId];
          // Number range filter (lte:X or gt:X)
          if (typeof filterValue === 'string' && filterValue.startsWith('lte:')) {
            const threshold = Number(filterValue.slice(4));
            return Number(val) <= threshold;
          }
          if (typeof filterValue === 'string' && filterValue.startsWith('gt:')) {
            const threshold = Number(filterValue.slice(3));
            return Number(val) > threshold;
          }
          if (Array.isArray(val)) return val.includes(filterValue);
          return String(val) === String(filterValue);
        });
      });
    }

    // Step 3: only keep those with a valid email
    return pool.filter(r => {
      if (typeof r.email === 'string' && r.email.includes('@')) return true;
      if (r.responses) {
        return Object.entries(r.responses).some(
          ([k, v]) => k.toLowerCase().includes('email') && typeof v === 'string' && v.includes('@')
        );
      }
      return false;
    });
  }, [registrations, emailAudienceMode, emailFilters, emailManualIds]);

  // ─── Email: send mutation ─────────────────────────────────────────
  const sendEmailMutation = useMutation({
    mutationFn: async () => {
      const recipientIds = emailAudienceMode === 'all' && Object.keys(emailFilters).every(k => emailFilters[k] === '__all__')
        ? undefined
        : emailRecipients.map(r => r.id);

      // Convert plain text body to simple HTML (preserve line breaks)
      const bodyHtml = emailBody
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br/>')
        .replace(/\{\{nombre\}\}/g, '{{nombre}}');

      // Build image HTML
      const imagesHtml = emailImages.length > 0
        ? emailImages.map(img =>
            `<div style="margin:16px 0;"><img src="${img.url}" alt="" style="max-width:100%;border-radius:12px;display:block;" /></div>`
          ).join('')
        : '';

      const wrappedHtml = `<div style="color:rgba(255,255,255,0.85);font-size:1rem;line-height:1.6;">${bodyHtml}${imagesHtml}</div>`;

      return apiClient.post('/creator/email/send', {
        subject: emailSubject,
        bodyHtml: wrappedHtml,
        recipients: {
          type: 'event',
          eventId,
          ...(recipientIds ? { recipientIds } : {}),
        },
      });
    },
    onSuccess: (res) => {
      showToast(`Email enviado a ${res.data.recipientCount} personas`);
      setEmailSubject('');
      setEmailBody('');
      setEmailImages([]);
      setEmailConfirmOpen(false);
      setEmailAudienceMode('all');
      setEmailFilters({});
      setEmailManualIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['email', 'sends', eventId] });
    },
    onError: () => {
      // Error is displayed inline in the confirm modal — keep it open
    },
  });

  // ─── Email: send history query ────────────────────────────────────
  const { data: emailSends = [], isLoading: emailSendsLoading } = useQuery({
    queryKey: ['email', 'sends', eventId],
    queryFn: async () => {
      const res = await apiClient.get('/creator/email/sends');
      // Filter to only sends for this event
      return (res.data || []).filter(s => s.sourceId === eventId);
    },
    enabled: !!user && !!eventId && visitedTabs.has('email'),
    staleTime: 30_000,
  });

  const toggleManualRecipient = useCallback((regId) => {
    setEmailManualIds(prev => {
      const next = new Set(prev);
      if (next.has(regId)) next.delete(regId);
      else next.add(regId);
      return next;
    });
  }, []);

  const canSendEmail = emailSubject.trim() && emailBody.trim() && emailRecipients.length > 0;

  const cssVars = {
    '--er-accent-r': accentRgb[0],
    '--er-accent-g': accentRgb[1],
    '--er-accent-b': accentRgb[2],
    '--ee-accent': `rgb(${accentRgb[0]},${accentRgb[1]},${accentRgb[2]})`,
    '--ee-accent-r': accentRgb[0],
    '--ee-accent-g': accentRgb[1],
    '--ee-accent-b': accentRgb[2],
    '--ee-accent-text': accentText,
  };

  return (
    <ErrorBoundary>
    <DashboardLayout
      screenName={event?.title ?? 'Evento'}
      showBackButton
      backPath="/events"
    >
      <div className="event-results-screen" style={cssVars}>
        {isLoading ? (
          <div className="er-skeleton-wrap">
            {/* Header */}
            <div className="er-skel-header">
              <div>
                <ShimmerSkeleton width="220px" height="24px" borderRadius="8px" />
                <ShimmerSkeleton width="140px" height="14px" borderRadius="4px" className="er-skel-mt8" />
              </div>
              <div className="er-skel-actions">
                <ShimmerSkeleton width="90px" height="32px" borderRadius="8px" />
                <ShimmerSkeleton width="100px" height="32px" borderRadius="8px" />
                <ShimmerSkeleton width="110px" height="32px" borderRadius="8px" />
              </div>
            </div>

            {/* Tab bar */}
            <div className="er-skel-tabs">
              <ShimmerSkeleton width="80px" height="32px" borderRadius="8px" />
              <ShimmerSkeleton width="80px" height="32px" borderRadius="8px" />
              <ShimmerSkeleton width="64px" height="32px" borderRadius="8px" />
            </div>

            {/* Section: Resumen */}
            <ShimmerSkeleton width="90px" height="12px" borderRadius="4px" className="er-skel-mt20" />
            <div className="er-skeleton-stats">
              {[1, 2, 3].map(i => (
                <div key={i} className="er-skel-stat-card">
                  <ShimmerSkeleton width="70px" height="10px" borderRadius="4px" />
                  <ShimmerSkeleton width="48px" height="28px" borderRadius="6px" />
                  <ShimmerSkeleton width="90px" height="10px" borderRadius="4px" />
                </div>
              ))}
            </div>

            {/* Section: Ritmo de inscripcion (chart) */}
            <ShimmerSkeleton width="160px" height="12px" borderRadius="4px" className="er-skel-mt20" />
            <div className="er-skel-chart-card">
              <ShimmerSkeleton width="100%" height="13px" borderRadius="4px" />
              <ShimmerSkeleton width="100%" height="180px" borderRadius="8px" />
            </div>

            {/* Section: Quien se registro (field analysis) */}
            <ShimmerSkeleton width="140px" height="12px" borderRadius="4px" className="er-skel-mt20" />
            <div className="er-skel-analysis-card">
              <ShimmerSkeleton width="60px" height="10px" borderRadius="4px" />
              <ShimmerSkeleton width="100%" height="13px" borderRadius="4px" />
              {[100, 72, 45].map((w, i) => (
                <div key={i} className="er-skel-hbar">
                  <ShimmerSkeleton width="80px" height="12px" borderRadius="4px" />
                  <ShimmerSkeleton width={`${w}%`} height="28px" borderRadius="6px" />
                  <ShimmerSkeleton width="28px" height="12px" borderRadius="4px" />
                </div>
              ))}
            </div>

            {/* Section: Asistencia (two-col) */}
            <ShimmerSkeleton width="100px" height="12px" borderRadius="4px" className="er-skel-mt20" />
            <div className="er-skel-two-col">
              <div className="er-skel-analysis-card">
                <ShimmerSkeleton width="100px" height="10px" borderRadius="4px" />
                <ShimmerSkeleton width="64px" height="28px" borderRadius="6px" />
                <ShimmerSkeleton width="100%" height="8px" borderRadius="4px" />
                <ShimmerSkeleton width="100%" height="13px" borderRadius="4px" />
              </div>
              <div className="er-skel-analysis-card">
                <ShimmerSkeleton width="120px" height="10px" borderRadius="4px" />
                <ShimmerSkeleton width="48px" height="28px" borderRadius="6px" />
                <ShimmerSkeleton width="100%" height="13px" borderRadius="4px" />
              </div>
            </div>
          </div>
        ) : eventError ? (
          <FullScreenError
            title="No pudimos cargar este evento"
            message="Verifica tu conexion e intenta de nuevo."
            onRetry={() => {
              queryClient.invalidateQueries({ queryKey: queryKeys.events.detail(eventId) });
              queryClient.invalidateQueries({ queryKey: queryKeys.events.registrations(eventId) });
            }}
          />
        ) : (
          <>
            {/* Header */}
            <div className="event-results-header">
              <div>
                <h1 className="event-results-title">{event?.title}</h1>
                <span className="event-results-count">
                  {registrations.length} registros
                  {event?.max_registrations != null && ` · ${event.max_registrations} cupos`}
                  {waitlist.length > 0 && ` · ${waitlist.length} en lista de espera`}
                  <button
                    className="er-refresh-btn"
                    title="Buscar nuevos registros"
                    onClick={() => {
                      queryClient.invalidateQueries({ queryKey: queryKeys.events.registrations(eventId) });
                      queryClient.invalidateQueries({ queryKey: queryKeys.events.waitlist(eventId) });
                      queryClient.invalidateQueries({ queryKey: queryKeys.events.detail(eventId) });
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="23 4 23 10 17 10" />
                      <polyline points="1 20 1 14 7 14" />
                      <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                    </svg>
                  </button>
                </span>
                {event?.max_registrations != null && (
                  <div className="er-capacity-bar-outer">
                    <div
                      className="er-capacity-bar-fill"
                      style={{ width: `${Math.min((event.registration_count ?? 0) / event.max_registrations * 100, 100)}%` }}
                    />
                  </div>
                )}
              </div>
              <div className="er-header-actions">
                <button
                  className="ee-btn ee-btn--ghost"
                  onClick={() => navigate(`/events/${eventId}/checkin`)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 12l2 2 4-4" />
                    <path d="M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9 9 4.03 9 9z" />
                  </svg>
                  Check-in
                </button>
                <button
                  className="ee-btn ee-btn--ghost"
                  onClick={() => window.open(`https://wakelab.co/e/${eventId}`, '_blank')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                    <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                  Vista previa
                </button>
                <button
                  className="ee-btn ee-btn--ghost"
                  onClick={() => {
                    navigator.clipboard.writeText(`https://wakelab.co/e/${eventId}`);
                    showToast('Enlace copiado');
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                  </svg>
                  Copiar enlace
                </button>
                {eventStatus !== 'active' && (
                  <button
                    className="ee-btn ee-btn--publish"
                    onClick={() => handleSave('active')}
                    disabled={saving}
                  >
                    Publicar
                  </button>
                )}
                {isDirty && (
                  <>
                    <button
                      className="ee-btn ee-btn--discard"
                      onClick={() => {
                        const s = savedRef.current;
                        if (!s) return;
                        setTitle(s.title);
                        setDescription(s.description);
                        setEventDate(s.eventDate);
                        setEventLocation(s.eventLocation);
                        setAccess(s.access);
                        setMaxRegistrations(s.maxRegistrations);
                        setConfirmationMessage(s.confirmationMessage);
                        setSendConfirmationEmail(s.sendConfirmationEmail);
                        setEnableQrCheckin(s.enableQrCheckin);
                        setEventStatus(s.eventStatus);
                        setFields(JSON.parse(s.fields));
                        setImageFile(null);
                        setImagePreview(s.imageUrl || null);
                        setImageUrl(s.imageUrl);
                      }}
                      aria-label="Descartar cambios"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                    <button
                      className="ee-btn ee-btn--save"
                      onClick={() => handleSave(eventStatus)}
                      disabled={saving}
                      style={{
                        background: `rgba(${accentRgb[0]},${accentRgb[1]},${accentRgb[2]},0.85)`,
                        color: accentText,
                      }}
                    >
                      {saving
                        ? (uploadProgress != null ? `Subiendo ${uploadProgress}%…` : 'Guardando…')
                        : 'Guardar cambios'}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Tabs */}
            <TubelightNavBar
              items={[
                { id: 'analytics', label: 'Analytics' },
                { id: 'registros', label: 'Registros' },
                { id: 'email', label: 'Email' },
                { id: 'editar', label: 'Editar' },
              ]}
              activeId={activeTab}
              onSelect={(tab) => {
                setActiveTab(tab);
                setVisitedTabs(prev => prev.has(tab) ? prev : new Set(prev).add(tab));
              }}
            />

            {/* ── Registros tab ── */}
            {visitedTabs.has('registros') && (
              <KeepAlivePane active={activeTab === 'registros'}>
                {registrations.length > 0 && (
                  <div className="er-search-row">
                    <div className="er-search-wrap">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                      </svg>
                      <input
                        className="er-search-input"
                        placeholder="Buscar registros…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                      />
                      {search && (
                        <button className="er-search-clear" onClick={() => setSearch('')}>×</button>
                      )}
                    </div>
                    <button className="event-results-export-btn" onClick={exportCSV}>
                      Exportar CSV
                    </button>
                  </div>
                )}

                {filteredRegs.length === 0 ? (
                  <div className="event-results-empty">
                    {search ? 'Sin resultados para esa busqueda.' : 'Nadie se ha registrado todavia. Comparte el link de tu evento.'}
                  </div>
                ) : (
                  <div className="event-results-table-wrap">
                    <table className="event-results-table">
                      <thead>
                        <tr>
                          {columns.map(col => (
                            <th key={col.id}>{col.label}</th>
                          ))}
                          <th>Fecha</th>
                          <th>Check-in</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRegs.map(r => (
                          <tr
                            key={r.id}
                            className="er-table-row"
                            onClick={() => setSelectedReg(r)}
                            style={{ cursor: 'pointer' }}
                          >
                            {columns.map(col => (
                              <td key={col.id}>{getCellValue(r, col.id)}</td>
                            ))}
                            <td>{formatDate(r.created_at)}</td>
                            <td onClick={e => e.stopPropagation()}>
                              {r.checked_in ? (
                                <span className="event-results-checkin event-results-checkin-yes">Sí</span>
                              ) : (
                                <button
                                  className="er-checkin-btn"
                                  onClick={() => handleManualCheckIn(r.id)}
                                >
                                  Marcar
                                </button>
                              )}
                            </td>
                            <td onClick={e => e.stopPropagation()}>
                              <button
                                className="er-detail-btn"
                                onClick={() => setSelectedReg(r)}
                                aria-label="Ver detalle"
                              >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" />
                                </svg>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {waitlist.length > 0 && (
                  <div className="er-waitlist-section">
                    <h2 className="er-waitlist-title">
                      Lista de espera <span className="er-waitlist-count">{waitlist.length}</span>
                    </h2>
                    <div className="event-results-table-wrap">
                      <table className="event-results-table">
                        <thead>
                          <tr>
                            <th>Contacto</th>
                            <th>Fecha</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {waitlist.map(w => (
                            <tr key={w.id}>
                              <td>{w.contact}</td>
                              <td>{formatDate(w.created_at)}</td>
                              <td>
                                <button className="er-admit-btn" onClick={() => admitFromWaitlist(w.id)}>
                                  Admitir
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </KeepAlivePane>
            )}

            {/* ── Analytics tab ── */}
            {visitedTabs.has('analytics') && (
              <KeepAlivePane active={activeTab === 'analytics'}>
              <div className="er-analytics">
                {total === 0 ? (
                  <div className="er-analytics-empty er-fade-in">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
                      <path d="M18 20V10M12 20V4M6 20v-6" />
                    </svg>
                    <p>Aun no hay datos. Los analytics apareceran cuando lleguen los primeros registros.</p>
                  </div>
                ) : (
                  <>
                    {/* ── Section 1: Resumen ── */}
                    <SectionTitle>Resumen</SectionTitle>
                    <div className="er-stats-row">
                      <StatCard label="Registros" value={total} />
                      <StatCard
                        label="Asistencia"
                        value={checkedIn}
                        badge={`${checkinRate}% check-in`}
                        badgeColor={checkinBadgeColor}
                      />
                      {capacity != null && (
                        <StatCard
                          label="Capacidad"
                          value={`${total} / ${capacity}`}
                          badge={total > capacity ? 'Sobrecupo' : `${capacityPct}% lleno`}
                          badgeColor={total > capacity ? 'red' : capacityPct >= 90 ? 'yellow' : 'green'}
                        />
                      )}
                      {fillTime && (
                        <StatCard
                          label="Tiempo de llenado"
                          value={`${fillTime.days} dia${fillTime.days !== 1 ? 's' : ''}`}
                          sub={`Se lleno el ${fillTime.dateStr}`}
                        />
                      )}
                      {waitlist.length > 0 && (
                        <StatCard
                          label="Lista de espera"
                          value={waitlist.length}
                          sub="No alcanzaron cupo"
                        />
                      )}
                    </div>

                    {/* ── Section 2: Ritmo de inscripcion ── */}
                    {timelineData.length > 1 && (
                      <>
                        <SectionTitle>Ritmo de inscripcion</SectionTitle>
                        <AnalyticsCard insight={timelineInsights.join(' ')}>
                          <div className="er-chart-wrap">
                            <ResponsiveContainer width="100%" height={220}>
                              <ComposedChart data={timelineData} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
                                <defs>
                                  <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor={accentCss} stopOpacity={0.25} />
                                    <stop offset="100%" stopColor={accentCss} stopOpacity={0} />
                                  </linearGradient>
                                </defs>
                                <XAxis
                                  dataKey="day"
                                  tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }}
                                  axisLine={{ stroke: 'rgba(255,255,255,0.07)' }}
                                  tickLine={false}
                                />
                                <YAxis
                                  yAxisId="left"
                                  allowDecimals={false}
                                  tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }}
                                  axisLine={false}
                                  tickLine={false}
                                />
                                <YAxis yAxisId="right" orientation="right" hide />
                                <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.08)' }} />
                                <Area
                                  yAxisId="right"
                                  type="monotone"
                                  dataKey="cumulative"
                                  fill="url(#areaGradient)"
                                  stroke={accentCss}
                                  strokeWidth={2}
                                  dot={false}
                                  name="cumulative"
                                />
                                <Bar
                                  yAxisId="left"
                                  dataKey="daily"
                                  fill="rgba(255,255,255,0.12)"
                                  radius={[3, 3, 0, 0]}
                                  name="daily"
                                />
                              </ComposedChart>
                            </ResponsiveContainer>
                          </div>
                        </AnalyticsCard>
                      </>
                    )}

                    {/* ── Section 3: Quien se registro ── */}
                    {fieldAnalysis.length > 0 && (
                      <>
                        <SectionTitle>Quien se registro</SectionTitle>

                        {fieldAnalysis.map((fa) => {
                          if (fa.type === 'number') {
                            return (
                              <AnalyticsCard key={fa.field.id} title={fa.field.label} insight={fa.insight}>
                                <div className="er-number-stats">
                                  <div className="er-number-stat">
                                    <span className="er-number-stat-label">Promedio</span>
                                    <span className="er-number-stat-value">{fa.stats.avg}</span>
                                  </div>
                                  <div className="er-number-stat">
                                    <span className="er-number-stat-label">Mediana</span>
                                    <span className="er-number-stat-value">{fa.stats.median}</span>
                                  </div>
                                  <div className="er-number-stat">
                                    <span className="er-number-stat-label">Rango</span>
                                    <span className="er-number-stat-value">{fa.stats.min} – {fa.stats.max}</span>
                                  </div>
                                </div>
                                <div className="er-histogram">
                                  {fa.histogram.map((b, i) => {
                                    const maxCount = Math.max(...fa.histogram.map(h => h.count));
                                    const heightPct = maxCount > 0 ? (b.count / maxCount * 100) : 0;
                                    return (
                                      <div
                                        key={i}
                                        className={`er-histogram-bar${heightPct >= 80 ? ' er-histogram-bar--active' : ''}`}
                                        style={{ height: `${Math.max(heightPct, 4)}%` }}
                                        title={`${b.label}: ${b.count}`}
                                      />
                                    );
                                  })}
                                </div>
                                <div className="er-histogram-labels">
                                  {fa.histogram.map((b, i) => (
                                    <span key={i}>{b.label}</span>
                                  ))}
                                </div>
                              </AnalyticsCard>
                            );
                          }

                          if (fa.type === 'uniform') {
                            return (
                              <AnalyticsCard key={fa.field.id} title={fa.field.label}>
                                <p className="er-insight-text">Todos seleccionaron <strong>{fa.value}</strong> ({fa.count} registros).</p>
                              </AnalyticsCard>
                            );
                          }

                          if (fa.type === 'select' || fa.type === 'multiselect' || fa.type === 'text-few') {
                            return (
                              <AnalyticsCard key={fa.field.id} title={fa.field.label} insight={fa.insight}>
                                <HBarChart bars={fa.bars} accentFirst />
                              </AnalyticsCard>
                            );
                          }

                          if (fa.type === 'text-many') {
                            return (
                              <AnalyticsCard key={fa.field.id} title={fa.field.label}>
                                <p className="er-insight-text">{fa.uniqueCount} respuestas unicas.</p>
                              </AnalyticsCard>
                            );
                          }

                          return null;
                        })}

                        {crossTab && (
                          <AnalyticsCard
                            title={`Cruce: ${crossTab.rowField.label} × ${crossTab.colField.label}`}
                            insight={crossTab.insight}
                          >
                            <div className="er-crosstab-grid" style={{
                              gridTemplateColumns: `auto repeat(${crossTab.colValues.length}, 1fr)`,
                            }}>
                              <div className="er-crosstab-cell er-crosstab-cell--header" />
                              {crossTab.colValues.map(cv => (
                                <div key={cv} className="er-crosstab-cell er-crosstab-cell--header">{cv}</div>
                              ))}
                              {crossTab.rows.map(row => (
                                <Fragment key={row.label}>
                                  <div className="er-crosstab-cell er-crosstab-cell--row-header">{row.label}</div>
                                  {row.cells.map(cell => {
                                    const isMax = cell.pct === Math.max(...row.cells.map(c => c.pct)) && cell.pct > 0;
                                    return (
                                      <div
                                        key={`${row.label}-${cell.value}`}
                                        className={`er-crosstab-cell${isMax ? ' er-crosstab-cell--highlight' : ''}`}
                                      >
                                        {cell.pct}%
                                      </div>
                                    );
                                  })}
                                </Fragment>
                              ))}
                            </div>
                          </AnalyticsCard>
                        )}
                      </>
                    )}

                    {/* ── Section 4: Asistencia ── */}
                    {checkedIn > 0 && (
                      <>
                        <SectionTitle>Asistencia</SectionTitle>
                        <div className="er-two-col">
                          <AnalyticsCard title="Tasa de check-in">
                            <div className="er-checkin-rate-row">
                              <span className={`er-checkin-pct er-checkin-pct--${checkinBadgeColor}`}>{checkinRate}%</span>
                              <span className="er-checkin-sub-inline">{checkedIn} de {total} asistieron</span>
                            </div>
                            <div className="er-checkin-bar-outer">
                              <div className={`er-checkin-bar-fill er-checkin-bar-fill--${checkinBadgeColor}`} style={{ width: `${checkinRate}%` }} />
                            </div>
                            <p className="er-insight-text" style={{ marginTop: 12 }}>
                              <strong>{noShows} persona{noShows !== 1 ? 's' : ''} no asisti{noShows !== 1 ? 'eron' : 'o'}</strong> ({100 - checkinRate}%).
                              {checkinRate >= 80 ? ' Un no-show menor al 20% es excelente.' : checkinRate >= 50 ? ' Considera enviar recordatorios antes del evento.' : ' Un no-show alto sugiere revisar la estrategia de confirmacion.'}
                            </p>
                          </AnalyticsCard>

                          <AnalyticsCard title="Velocidad de llenado">
                            <div className="er-velocity-stat">
                              <span className="er-velocity-value">{peakDaily}</span>
                              <span className="er-velocity-unit">registros/dia en el pico</span>
                            </div>
                            {fillTime && (
                              <p className="er-insight-text">
                                Alcanzaste capacidad en <strong>{fillTime.days} dia{fillTime.days !== 1 ? 's' : ''}</strong>.
                              </p>
                            )}
                          </AnalyticsCard>
                        </div>

                        {checkinTimeline && (
                          <AnalyticsCard title="Hora de llegada (check-in)" insight={checkinTimeline.insight}>
                            <div className="er-arrival-bars">
                              {checkinTimeline.slots.map((slot, i) => {
                                const maxCount = Math.max(...checkinTimeline.slots.map(s => s.count));
                                const heightPct = maxCount > 0 ? (slot.count / maxCount * 100) : 0;
                                const isPeak = slot.label === checkinTimeline.peakLabel;
                                return (
                                  <div
                                    key={i}
                                    className={`er-arrival-bar${isPeak ? ' er-arrival-bar--peak' : ''}`}
                                    style={{ height: `${Math.max(heightPct, 3)}%` }}
                                    title={`${slot.label}: ${slot.count}`}
                                  />
                                );
                              })}
                            </div>
                            <div className="er-arrival-labels">
                              {checkinTimeline.slots.filter((_, i) => i % 2 === 0).map((s, i) => (
                                <span key={i}>{s.label}</span>
                              ))}
                            </div>
                          </AnalyticsCard>
                        )}

                        {noShowProfile && (
                          <AnalyticsCard title="Perfil de no-shows" insight={noShowProfile.insight}>
                            <div className="er-noshow-grid">
                              {noShowProfile.segments.map((seg, i) => (
                                <div key={i} className="er-noshow-segment">
                                  <div className="er-noshow-segment-label">{seg.label}</div>
                                  <div className={`er-noshow-segment-value ${seg.rate >= 30 ? 'er-noshow--red' : seg.rate >= 15 ? 'er-noshow--yellow' : 'er-noshow--green'}`}>
                                    {seg.rate}%
                                  </div>
                                  <div className="er-noshow-segment-sub">no asistio ({seg.count} de {seg.total})</div>
                                </div>
                              ))}
                            </div>
                          </AnalyticsCard>
                        )}
                      </>
                    )}

                    {/* ── Section 5: Comparar con eventos anteriores ── */}
                    {otherEvents.length > 0 && (() => {
                      const prevEvent = otherEvents[0];
                      const prevRegs = prevEvent?.registration_count;
                      const regDiff = prevRegs > 0 ? Math.round((total - prevRegs) / prevRegs * 100) : null;
                      const prevCheckinRate = prevEvent?.registration_count && prevEvent?.checkin_count != null
                        ? Math.round(prevEvent.checkin_count / prevEvent.registration_count * 100)
                        : null;
                      const checkinDiff = prevCheckinRate != null ? checkinRate - prevCheckinRate : null;

                      const insightParts = [];
                      if (regDiff != null && regDiff !== 0) {
                        insightParts.push(`Tus registros ${regDiff > 0 ? 'crecieron' : 'bajaron'} un ${Math.abs(regDiff)}% vs tu ultimo evento.`);
                      }
                      if (checkinDiff != null && Math.abs(checkinDiff) >= 3) {
                        insightParts.push(`Tu asistencia ${checkinDiff > 0 ? 'mejoro' : 'bajo'} ${Math.abs(checkinDiff)} puntos porcentuales.`);
                      }

                      return (
                        <>
                          <SectionTitle>Comparar con eventos anteriores</SectionTitle>
                          <AnalyticsCard insight={insightParts.join(' ') || undefined}>
                            <table className="er-compare-table">
                              <thead>
                                <tr>
                                  <th>Evento</th>
                                  <th>Registros</th>
                                  <th>Check-in</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr className="er-compare-current">
                                  <td>{event?.title}</td>
                                  <td>
                                    {total}
                                    {regDiff != null && regDiff !== 0 && (
                                      <span className={`er-compare-badge er-compare-badge--${regDiff > 0 ? 'up' : 'down'}`}>
                                        {regDiff > 0 ? '+' : ''}{regDiff}%
                                      </span>
                                    )}
                                  </td>
                                  <td>{checkinRate}%</td>
                                </tr>
                                {otherEvents.map(oe => {
                                  const oeCheckin = oe.registration_count && oe.checkin_count != null
                                    ? `${Math.round(oe.checkin_count / oe.registration_count * 100)}%`
                                    : '—';
                                  return (
                                    <tr key={oe.id}>
                                      <td>{oe.title}</td>
                                      <td>{oe.registration_count ?? '—'}</td>
                                      <td>{oeCheckin}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </AnalyticsCard>
                        </>
                      );
                    })()}

                  </>
                )}
              </div>
              </KeepAlivePane>
            )}

            {/* ── Email tab ── */}
            {visitedTabs.has('email') && (
              <KeepAlivePane active={activeTab === 'email'}>
                <div className="em-tab">

                  {/* ── Compose + Recipients ── */}
                  <div className="em-compose-area em-enter">
                    <div className="em-compose-main" style={{ position: 'relative' }}>
                      <GlowingEffect />

                      <div className="em-subject-row">
                        <input
                          className="em-subject-input"
                          placeholder={`Asunto — ej. Novedades sobre ${event?.title || 'el evento'}`}
                          value={emailSubject}
                          onChange={e => setEmailSubject(e.target.value)}
                          maxLength={200}
                        />
                        {emailSubject.length >= 160 && (
                          <span className="em-subject-counter">{emailSubject.length}/200</span>
                        )}
                      </div>

                      <div className="em-compose-divider" />

                      <textarea
                        className="em-body-input"
                        placeholder={"Hola {{nombre}},\n\nEscribe tu mensaje aqui...\n\nUsa {{nombre}} para personalizar con el nombre de cada persona."}
                        value={emailBody}
                        onChange={e => setEmailBody(e.target.value)}
                        rows={10}
                      />

                      {emailImages.length > 0 && (
                        <div className="em-attached-images">
                          {emailImages.map((img, i) => (
                            <div key={img.url} className="em-attached-img">
                              <img src={img.url} alt="" />
                              <button
                                className="em-attached-img-remove"
                                onClick={() => setEmailImages(prev => prev.filter((_, j) => j !== i))}
                              >
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="em-toolbar">
                        <button className="em-toolbar-btn" onClick={() => setEmailMediaPickerOpen(true)}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                            <rect x="3" y="3" width="18" height="18" rx="2" />
                            <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" strokeWidth="0" />
                            <polyline points="21 15 16 10 5 21" />
                          </svg>
                          Imagen
                        </button>
                        <button
                          className="em-toolbar-btn"
                          onClick={() => setEmailPreviewOpen(true)}
                          disabled={!emailBody.trim()}
                          title={!emailBody.trim() ? 'Escribe un mensaje para ver la vista previa' : undefined}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                          Vista previa
                        </button>

                        <div className="em-toolbar-spacer" />

                        <button
                          className="em-send-btn"
                          onClick={() => { sendEmailMutation.reset(); setEmailConfirmOpen(true); }}
                          disabled={!canSendEmail || sendEmailMutation.isPending}
                          title={!canSendEmail ? (!emailSubject.trim() ? 'Agrega un asunto' : !emailBody.trim() ? 'Escribe un mensaje' : 'Sin destinatarios') : undefined}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="22" y1="2" x2="11" y2="13" />
                            <polygon points="22 2 15 22 11 13 2 9 22 2" />
                          </svg>
                          {sendEmailMutation.isPending ? 'Enviando...' : `Enviar a ${emailRecipients.length}`}
                        </button>
                      </div>
                    </div>

                    {/* ── Recipients list ── */}
                    <div className="em-recipients-panel" style={{ position: 'relative' }}>
                      <GlowingEffect />
                      <div className="em-recipients-header">
                        <div className="em-recipients-header-left">
                          <span className="em-recipients-count">{emailRecipients.length}</span>
                          <span className="em-recipients-label">Destinatarios</span>
                        </div>
                        <button className="em-audience-config-btn" onClick={() => setEmailAudienceModalOpen(true)}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
                          </svg>
                          Configurar audiencia
                        </button>
                      </div>

                      {/* Active filters summary */}
                      {(emailAudienceMode !== 'all' || Object.values(emailFilters).some(v => v && v !== '__all__')) && (
                        <div className="em-active-filters">
                          {emailAudienceMode === 'checked_in' && <span className="em-active-tag">Asistieron</span>}
                          {emailAudienceMode === 'no_show' && <span className="em-active-tag">No asistieron</span>}
                          {emailAudienceMode === 'manual' && <span className="em-active-tag">{emailManualIds.size} seleccionados</span>}
                          {Object.entries(emailFilters).map(([fieldId, value]) => {
                            if (!value || value === '__all__') return null;
                            const field = event?.fields?.find(f => f.id === fieldId);
                            const label = field?.label || fieldId;
                            const displayValue = value.startsWith('lte:') ? `${label} <= ${value.slice(4)}` :
                              value.startsWith('gt:') ? `${label} > ${value.slice(3)}` :
                              `${label}: ${value}`;
                            return <span key={fieldId} className="em-active-tag">{displayValue}</span>;
                          })}
                        </div>
                      )}

                      <div className="em-recipients-list">
                        {emailRecipients.length === 0 ? (
                          <div className="em-recipients-empty">
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
                              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2" />
                              <circle cx="9" cy="7" r="4" />
                            </svg>
                            <p>Sin destinatarios</p>
                          </div>
                        ) : (
                          emailRecipients.map(r => {
                            const name = getDisplayName(r, columns);
                            const email = r.email || (r.responses && Object.entries(r.responses).find(([k, v]) => k.toLowerCase().includes('email') && typeof v === 'string')?.[1]) || '';
                            return (
                              <div key={r.id} className="em-recipient-row">
                                <div className="em-recipient-avatar">{name.charAt(0).toUpperCase()}</div>
                                <div className="em-recipient-info">
                                  <span className="em-recipient-name">{name}</span>
                                  <span className="em-recipient-email">{email}</span>
                                </div>
                                {r.checked_in && <span className="em-recipient-badge-check">Asistio</span>}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>

                  {/* ── Send history ── */}
                  {emailSends.length > 0 && (
                    <div className="em-history em-enter" style={{ animationDelay: '80ms' }}>
                      <div className="em-history-header">
                        <h3 className="em-history-title">Enviados</h3>
                        <button
                          className="em-ghost-btn"
                          onClick={() => queryClient.invalidateQueries({ queryKey: ['email', 'sends', eventId] })}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="23 4 23 10 17 10" />
                            <polyline points="1 20 1 14 7 14" />
                            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                          </svg>
                          Actualizar
                        </button>
                      </div>
                      <div className="em-history-timeline">
                        {emailSends.map(send => (
                          <div key={send.sendId} className="em-history-card">
                            <div className={`em-history-dot em-history-dot--${send.status}`} />
                            <div className="em-history-card-body">
                              <div className="em-history-card-top">
                                <span className="em-history-card-subject">{send.subject}</span>
                                <span className={`em-history-badge em-history-badge--${send.status}`}>
                                  {send.status === 'completed' ? 'Enviado' : send.status === 'processing' ? 'Enviando' : send.status === 'queued' ? 'En cola' : 'Fallido'}
                                </span>
                              </div>
                              <div className="em-history-card-meta">
                                <span>{send.stats?.total || 0} destinatarios</span>
                                {send.stats?.sent > 0 && <span className="em-history-card-sent">{send.stats.sent} enviados</span>}
                                {send.stats?.failed > 0 && <span className="em-history-card-failed">{send.stats.failed} fallidos</span>}
                                {send.createdAt && (
                                  <span className="em-history-card-date">
                                    {new Date(send.createdAt._seconds ? send.createdAt._seconds * 1000 : send.createdAt).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </KeepAlivePane>
            )}

            {/* ── Audience config modal ── */}
            {emailAudienceModalOpen && (
              <div className="er-modal-backdrop" onClick={() => setEmailAudienceModalOpen(false)}>
                <div className="em-audience-modal em-enter" onClick={e => e.stopPropagation()}>
                  <button className="er-modal-close" onClick={() => setEmailAudienceModalOpen(false)} aria-label="Cerrar">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>

                  <div className="em-aud-header">
                    <div className="em-aud-icon">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
                      </svg>
                    </div>
                    <h3 className="em-aud-title">Configurar audiencia</h3>
                    <p className="em-aud-sub">Selecciona a quienes les quieres enviar el email</p>
                  </div>

                  {/* Audience mode */}
                  <div className="em-aud-section">
                    <span className="em-aud-label">Grupo</span>
                    <div className="em-aud-options">
                      {[
                        { id: 'all', label: 'Todos los registrados', desc: `${registrations.length} personas` },
                        { id: 'checked_in', label: 'Solo los que asistieron', desc: `${registrations.filter(r => r.checked_in).length} personas` },
                        { id: 'no_show', label: 'Solo los que no asistieron', desc: `${registrations.filter(r => !r.checked_in).length} personas` },
                        { id: 'manual', label: 'Seleccionar manualmente', desc: emailManualIds.size > 0 ? `${emailManualIds.size} seleccionados` : 'Elige uno por uno' },
                      ].map(opt => (
                        <button
                          key={opt.id}
                          className={`em-aud-option${emailAudienceMode === opt.id ? ' em-aud-option--on' : ''}`}
                          onClick={() => {
                            setEmailAudienceMode(opt.id);
                            if (opt.id !== 'manual') setEmailManualIds(new Set());
                          }}
                        >
                          <div className={`em-aud-radio${emailAudienceMode === opt.id ? ' em-aud-radio--on' : ''}`} />
                          <div className="em-aud-option-text">
                            <span className="em-aud-option-label">{opt.label}</span>
                            <span className="em-aud-option-desc">{opt.desc}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Field filters */}
                  {emailAudienceMode !== 'manual' && (filterableFields.length > 0 || numberFields.length > 0) && (
                    <div className="em-aud-section">
                      <span className="em-aud-label">Filtrar por campos</span>
                      <div className="em-aud-filters">
                        {filterableFields.map(field => {
                          const options = field.id === 'f_genero'
                            ? ['Masculino', 'Femenino', 'Otro', 'Prefiero no decir']
                            : (field.options || []);
                          if (options.length === 0) return null;
                          return (
                            <div key={field.id} className="em-aud-filter-row">
                              <span className="em-aud-filter-name">{field.label}</span>
                              <select
                                className="em-aud-select"
                                value={emailFilters[field.id] || '__all__'}
                                onChange={e => setEmailFilters(prev => ({ ...prev, [field.id]: e.target.value }))}
                              >
                                <option value="__all__">Todos</option>
                                {options.filter(Boolean).map(opt => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            </div>
                          );
                        })}
                        {numberFields.map(field => {
                          const values = registrations
                            .map(r => Number(r.responses?.[field.id] ?? r[field.id]))
                            .filter(n => !isNaN(n));
                          if (values.length < 3) return null;
                          values.sort((a, b) => a - b);
                          const median = values[Math.floor(values.length / 2)];
                          return (
                            <div key={field.id} className="em-aud-filter-row">
                              <span className="em-aud-filter-name">{field.label}</span>
                              <select
                                className="em-aud-select"
                                value={emailFilters[field.id] || '__all__'}
                                onChange={e => setEmailFilters(prev => ({ ...prev, [field.id]: e.target.value }))}
                              >
                                <option value="__all__">Todos</option>
                                <option value={`lte:${median}`}>&le; {median}</option>
                                <option value={`gt:${median}`}>&gt; {median}</option>
                              </select>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Manual selection */}
                  {emailAudienceMode === 'manual' && (
                    <div className="em-aud-section">
                      <div className="em-aud-manual-header">
                        <span className="em-aud-label">Seleccionar personas</span>
                        <div className="em-aud-manual-actions">
                          <button className="em-ghost-btn" onClick={() => {
                            const allIds = new Set(registrations.filter(r => {
                              if (typeof r.email === 'string' && r.email.includes('@')) return true;
                              if (r.responses) return Object.entries(r.responses).some(([k, v]) => k.toLowerCase().includes('email') && typeof v === 'string' && v.includes('@'));
                              return false;
                            }).map(r => r.id));
                            setEmailManualIds(allIds);
                          }}>Todos</button>
                          <button className="em-ghost-btn" onClick={() => setEmailManualIds(new Set())}>Ninguno</button>
                        </div>
                      </div>
                      <div className="em-aud-manual-list">
                        {registrations.map(r => {
                          const name = getDisplayName(r, columns);
                          const email = r.email || (r.responses && Object.entries(r.responses).find(([k, v]) => k.toLowerCase().includes('email') && typeof v === 'string')?.[1]) || '';
                          if (!email || !email.includes('@')) return null;
                          const selected = emailManualIds.has(r.id);
                          return (
                            <label key={r.id} className={`em-aud-person${selected ? ' em-aud-person--on' : ''}`}>
                              <div className={`em-aud-check${selected ? ' em-aud-check--on' : ''}`}>
                                {selected && (
                                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                )}
                              </div>
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() => toggleManualRecipient(r.id)}
                                className="em-aud-hidden-input"
                              />
                              <div className="em-aud-person-info">
                                <span className="em-aud-person-name">{name}</span>
                                <span className="em-aud-person-email">{email}</span>
                              </div>
                              {r.checked_in && <span className="em-aud-person-badge">Asistio</span>}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Result */}
                  <div className="em-aud-result">
                    <span className="em-aud-result-count">{emailRecipients.length}</span>
                    <span className="em-aud-result-label">persona{emailRecipients.length !== 1 ? 's' : ''} recibiran el email</span>
                  </div>

                  <button className="em-send-btn em-aud-done-btn" onClick={() => setEmailAudienceModalOpen(false)}>
                    Listo
                  </button>
                </div>
              </div>
            )}

            {/* ── Email preview modal ── */}
            {emailPreviewOpen && (
              <div className="er-modal-backdrop" onClick={() => setEmailPreviewOpen(false)}>
                <div className="em-preview-modal em-enter" onClick={e => e.stopPropagation()}>
                  <button className="er-modal-close" onClick={() => setEmailPreviewOpen(false)} aria-label="Cerrar">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                  <div className="em-preview-chrome">
                    <span className="em-preview-dot" />
                    <span className="em-preview-dot" />
                    <span className="em-preview-dot" />
                  </div>
                  <div className="em-preview-envelope">
                    <div className="em-preview-meta">
                      <span className="em-preview-from">Wake &lt;notificaciones@wakelab.co&gt;</span>
                      <span className="em-preview-to">para: {emailRecipients[0]?.email || 'destinatario@ejemplo.com'}</span>
                    </div>
                    <div className="em-preview-subject-line">{emailSubject || '(sin asunto)'}</div>
                  </div>
                  <div className="em-preview-frame">
                    <div className="em-preview-body">
                      {emailBody.split('\n').map((line, i) => (
                        <p key={i}>{line.replace(/\{\{nombre\}\}/g, emailRecipients[0]?.name?.split(' ')[0] || 'Juan') || '\u00A0'}</p>
                      ))}
                      {emailImages.map((img, i) => (
                        <img key={i} src={img.url} alt="" style={{ maxWidth: '100%', borderRadius: 12, display: 'block', margin: '16px 0' }} />
                      ))}
                    </div>
                    <div className="em-preview-footer-bar">
                      Cancelar suscripcion · Enviado por Wake · wakelab.co
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Email send confirmation modal ── */}
            {emailConfirmOpen && (
              <div className="er-modal-backdrop" onClick={() => !sendEmailMutation.isPending && setEmailConfirmOpen(false)}>
                <div className="em-confirm-modal em-enter" role="dialog" aria-label="Confirmar envio de email" onClick={e => e.stopPropagation()}>
                  <div className={`em-confirm-icon${sendEmailMutation.isError ? ' em-confirm-icon--error' : ''}`}>
                    {sendEmailMutation.isError ? (
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                      </svg>
                    ) : (
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <line x1="22" y1="2" x2="11" y2="13" />
                        <polygon points="22 2 15 22 11 13 2 9 22 2" />
                      </svg>
                    )}
                  </div>
                  <h3 className="em-confirm-title">{sendEmailMutation.isError ? 'Error al enviar' : 'Enviar email'}</h3>
                  {sendEmailMutation.isError ? (
                    <p className="em-confirm-text em-confirm-text--error">
                      {sendEmailMutation.error?.message || 'No pudimos enviar el email. Intenta de nuevo.'}
                    </p>
                  ) : (
                    <p className="em-confirm-text">
                      <strong>{emailRecipients.length}</strong> persona{emailRecipients.length !== 1 ? 's' : ''} recibiran <strong>"{emailSubject}"</strong>
                    </p>
                  )}
                  <div className="em-confirm-actions">
                    <button className="em-ghost-btn em-ghost-btn--lg" onClick={() => { sendEmailMutation.reset(); setEmailConfirmOpen(false); }} disabled={sendEmailMutation.isPending}>
                      {sendEmailMutation.isError ? 'Cerrar' : 'Cancelar'}
                    </button>
                    <button className="em-send-btn" onClick={() => sendEmailMutation.mutate()} disabled={sendEmailMutation.isPending}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="22" y1="2" x2="11" y2="13" />
                        <polygon points="22 2 15 22 11 13 2 9 22 2" />
                      </svg>
                      {sendEmailMutation.isPending ? 'Enviando...' : sendEmailMutation.isError ? 'Reintentar' : 'Confirmar envio'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Editar tab ── */}
            {visitedTabs.has('editar') && (
              <KeepAlivePane active={activeTab === 'editar'}>
              <div style={{ paddingBottom: 48 }}>
                {/* Status pills */}
                <div className="ee-status-pills" style={{ marginBottom: 16 }}>
                  {['draft', 'active', 'closed'].map(s => (
                    <button
                      key={s}
                      className={`ee-status-pill${eventStatus === s ? ' ee-status-pill--on' : ''}`}
                      onClick={() => setEventStatus(s)}
                    >
                      {s === 'draft' ? 'Borrador' : s === 'active' ? 'Activo' : 'Cerrado'}
                    </button>
                  ))}
                </div>

                {/* Two-panel layout */}
                <div className="ee-panels">
                  {/* ── Left: Metadata ── */}
                  <div className="ee-panel ee-panel--meta" style={{ position: 'relative' }}>
                    <GlowingEffect />
                    <h2 className="ee-panel-title">Detalles del evento</h2>

                    <div className="ee-field-group">
                      <label className="ee-label">Imagen del evento</label>
                      {imagePreview ? (
                        <div className="ee-image-preview-wrap">
                          <img
                            src={imagePreview}
                            alt="Preview"
                            className="ee-image-preview ee-image-preview--clickable"
                            onClick={() => setLightboxOpen(true)}
                          />
                          <button
                            className="ee-image-remove"
                            onClick={() => { setImagePreview(null); setImageFile(null); setImageUrl(''); }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </button>
                        </div>
                      ) : (
                        <button
                          className="ee-image-upload-area"
                          onClick={() => setShowMediaPicker(true)}
                        >
                          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <rect x="3" y="3" width="18" height="18" rx="2" />
                            <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" strokeWidth="0" />
                            <polyline points="21 15 16 10 5 21" />
                          </svg>
                          <span>Elegir imagen</span>
                        </button>
                      )}
                    </div>

                    <div className="ee-field-group">
                      <label className="ee-label">Título <span className="ee-required">*</span></label>
                      <input
                        className="ee-input"
                        placeholder="Ej. Run Club Marzo 2026"
                        value={title}
                        onChange={e => { setTitle(e.target.value); setFieldErrors(prev => ({ ...prev, title: undefined })); }}
                      />
                      <InlineError message={fieldErrors.title} field="title" />
                    </div>

                    <div className="ee-field-group">
                      <label className="ee-label">Descripción</label>
                      <textarea
                        className="ee-input ee-input--textarea"
                        placeholder="Describe el evento…"
                        rows={4}
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                      />
                    </div>

                    <div className="ee-field-group">
                      <label className="ee-label">Fecha <span className="ee-required">*</span></label>
                      <DatePicker
                        value={eventDate}
                        onChange={e => { setEventDate(e.target.value); setFieldErrors(prev => ({ ...prev, date: undefined })); }}
                        placeholder="Selecciona la fecha del evento"
                        allowFuture
                      />
                      <InlineError message={fieldErrors.date} field="date" />
                    </div>

                    <div className="ee-field-group">
                      <label className="ee-label">Lugar</label>
                      <input
                        className="ee-input"
                        placeholder="Ej. Parque El Virrey, Bogotá"
                        value={eventLocation}
                        onChange={e => setEventLocation(e.target.value)}
                      />
                    </div>

                    <div className="ee-field-group">
                      <label className="ee-label">Cupos máximos</label>
                      <NumberStepper
                        value={maxRegistrations}
                        onChange={(v) => { setMaxRegistrations(v); setFieldErrors(prev => ({ ...prev, capacity: undefined })); }}
                        placeholder="Ilimitado"
                        min={1}
                      />
                      <InlineError message={fieldErrors.capacity} field="capacity" />
                    </div>

                    <div className="ee-field-group">
                      <label className="ee-label">Mensaje de confirmación</label>
                      <textarea
                        className="ee-input ee-input--textarea"
                        placeholder="Ej. ¡Nos vemos el sábado en el parque!"
                        rows={3}
                        value={confirmationMessage}
                        onChange={e => setConfirmationMessage(e.target.value)}
                      />
                    </div>

                    <div className="ee-field-group">
                      <label className="ee-label">Funcionalidades</label>
                      <div className="ee-feature-toggles">
                        <div className="ee-feature-row">
                          <div className="ee-feature-info">
                            <span className="ee-feature-name">Email de confirmación</span>
                            <span className="ee-feature-desc">Enviar email con detalles al registrarse</span>
                          </div>
                          <button
                            className={`ee-toggle${sendConfirmationEmail ? ' ee-toggle--on' : ''}`}
                            onClick={() => setSendConfirmationEmail(v => !v)}
                            aria-pressed={sendConfirmationEmail}
                          >
                            <span className="ee-toggle-thumb" />
                          </button>
                        </div>
                        <div className="ee-feature-row">
                          <div className="ee-feature-info">
                            <span className="ee-feature-name">QR de check-in</span>
                            <span className="ee-feature-desc">Generar código QR para entrada al evento</span>
                          </div>
                          <button
                            className={`ee-toggle${enableQrCheckin ? ' ee-toggle--on' : ''}`}
                            onClick={() => setEnableQrCheckin(v => !v)}
                            aria-pressed={enableQrCheckin}
                          >
                            <span className="ee-toggle-thumb" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Acceso section hidden for now
                    <div className="ee-field-group">
                      <label className="ee-label">Acceso</label>
                      <div className="ee-access-toggle">
                        <button
                          className={`ee-access-opt${access === 'public' ? ' ee-access-opt--on' : ''}`}
                          onClick={() => setAccess('public')}
                        >
                          Publico
                        </button>
                        <button
                          className={`ee-access-opt${access === 'wake_users_only' ? ' ee-access-opt--on' : ''}`}
                          onClick={() => setAccess('wake_users_only')}
                        >
                          Solo usuarios Wake
                        </button>
                      </div>
                    </div>
                    */}
                  </div>

                  {/* ── Right: Field Builder ── */}
                  <div className="ee-panel ee-panel--builder" style={{ position: 'relative' }}>
                    <GlowingEffect />
                    <div className="ee-panel-title-row">
                      <h2 className="ee-panel-title">Campos del formulario</h2>
                      {(() => {
                        const customCount = fields.filter(f => !f.locked).length;
                        return customCount > 0
                          ? <span className="ee-field-count">+{customCount} personalizado{customCount !== 1 ? 's' : ''}</span>
                          : null;
                      })()}
                    </div>

                    <div className="ee-fields-section-label">Campos base</div>
                    <div className="ee-fields-list ee-fields-list--locked">
                      {fields.filter(f => f.locked).map(field => (
                        <LockedField
                          key={field.id}
                          field={field}
                          onUpdate={changes => updateField(field.id, changes)}
                          onRemove={() => removeField(field.id)}
                        />
                      ))}
                    </div>

                    <div className="ee-fields-section-label ee-fields-section-label--custom">Campos adicionales</div>
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                      <SortableContext
                        items={fields.filter(f => !f.locked).map(f => f.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="ee-fields-list">
                          {fields.filter(f => !f.locked).map(field => (
                            <SortableField
                              key={field.id}
                              field={field}
                              onUpdate={changes => updateField(field.id, changes)}
                              onRemove={() => removeField(field.id)}
                            />
                          ))}
                          {fields.filter(f => !f.locked).length === 0 && (
                            <div className="ee-fields-empty">
                              <p>Agrega campos personalizados para recopilar más información</p>
                            </div>
                          )}
                        </div>
                      </SortableContext>
                    </DndContext>

                    <button className="ee-add-field-btn" onClick={() => setShowFieldPicker(true)}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                      Agregar campo
                    </button>
                  </div>
                </div>
              </div>
              </KeepAlivePane>
            )}
          </>
        )}


      {selectedReg && (
        <RowModal
          reg={selectedReg}
          columns={columns}
          onClose={() => setSelectedReg(null)}
          onCheckIn={() => handleManualCheckIn(selectedReg.id)}
          onRemoveCheckIn={() => handleRemoveCheckIn(selectedReg.id)}
          onDelete={() => handleDeleteRegistration(selectedReg.id)}
        />
      )}

      </div>

      {showFieldPicker && (
        <FieldTypePicker
          onPick={addField}
          onClose={() => setShowFieldPicker(false)}
        />
      )}

      <MediaPickerModal
        isOpen={showMediaPicker}
        onClose={() => setShowMediaPicker(false)}
        accept="image/*"
        onSelect={(media) => {
          setImagePreview(media.url);
          setImageUrl(media.url);
          setImageFile(null);
        }}
      />

      <MediaPickerModal
        isOpen={emailMediaPickerOpen}
        onClose={() => setEmailMediaPickerOpen(false)}
        accept="image/*"
        onSelect={(media) => {
          setEmailImages(prev => [...prev, { url: media.url }]);
          setEmailMediaPickerOpen(false);
        }}
      />

      {lightboxOpen && imagePreview && (
        <div className="ee-lightbox" onClick={() => setLightboxOpen(false)}>
          <button className="ee-lightbox-close" aria-label="Cerrar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          <img
            src={imagePreview}
            alt="Imagen del evento"
            className="ee-lightbox-img"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </DashboardLayout>
    </ErrorBoundary>
  );
}
