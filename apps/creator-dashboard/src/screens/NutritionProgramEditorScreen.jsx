import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, Trash2, Plus, X, Check, Search, ArrowLeft } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import Modal from '../components/Modal';
import { GlowingEffect, FullScreenError } from '../components/ui';
import ShimmerSkeleton from '../components/ui/ShimmerSkeleton';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { cacheConfig, queryKeys } from '../config/queryClient';
import * as nutritionDb from '../services/nutritionFirestoreService';
import './NutritionProgramEditorScreen.css';

const DAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const emptyWeek = () => ({ days: [null, null, null, null, null, null, null] });

export default function NutritionProgramEditorScreen() {
  const { programId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { showToast } = useToast();
  const creatorId = user?.uid ?? '';

  const programQuery = useQuery({
    queryKey: queryKeys.nutrition.program(creatorId, programId),
    queryFn: () => nutritionDb.getProgramById(creatorId, programId),
    enabled: !!creatorId && !!programId,
    ...cacheConfig.programStructure,
  });

  const daysQuery = useQuery({
    queryKey: queryKeys.nutrition.plans(creatorId),
    queryFn: () => nutritionDb.getPlansByCreator(creatorId),
    enabled: !!creatorId,
    ...cacheConfig.otherPrograms,
    refetchOnMount: true,
  });

  const daysById = useMemo(() => {
    const map = new Map();
    (daysQuery.data ?? []).forEach((d) => map.set(d.id, d));
    return map;
  }, [daysQuery.data]);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [weeks, setWeeks] = useState([emptyWeek()]);
  const [pickerSlot, setPickerSlot] = useState(null); // { weekIndex, dayIndex }
  const [pickerSearch, setPickerSearch] = useState('');
  const [dirty, setDirty] = useState(false);

  // Hydrate local state when program loads
  useEffect(() => {
    if (!programQuery.data) return;
    setName(programQuery.data.name ?? '');
    setDescription(programQuery.data.description ?? '');
    const ws = Array.isArray(programQuery.data.weeks) && programQuery.data.weeks.length > 0
      ? programQuery.data.weeks.map((w) => ({
          days: Array.isArray(w?.days) && w.days.length === 7
            ? w.days.map((d) => (typeof d === 'string' ? d : null))
            : [null, null, null, null, null, null, null],
        }))
      : [emptyWeek()];
    setWeeks(ws);
    setDirty(false);
  }, [programQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () => nutritionDb.updateProgram(creatorId, programId, { name, description, weeks }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.nutrition.program(creatorId, programId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.nutrition.programs(creatorId) });
      setDirty(false);
      showToast('Plan guardado', 'success');
    },
    onError: (err) => showToast(err?.message || 'No pudimos guardar el plan.', 'error'),
  });

  const handleAddWeek = useCallback(() => {
    setWeeks((ws) => [...ws, emptyWeek()]);
    setDirty(true);
  }, []);

  const handleDuplicateWeek = useCallback((weekIndex) => {
    setWeeks((ws) => {
      const copy = { days: [...ws[weekIndex].days] };
      return [...ws.slice(0, weekIndex + 1), copy, ...ws.slice(weekIndex + 1)];
    });
    setDirty(true);
  }, []);

  const handleDeleteWeek = useCallback((weekIndex) => {
    setWeeks((ws) => {
      if (ws.length <= 1) return [emptyWeek()];
      return ws.filter((_, i) => i !== weekIndex);
    });
    setDirty(true);
  }, []);

  const handleClearSlot = useCallback((weekIndex, dayIndex) => {
    setWeeks((ws) => ws.map((w, wi) => (
      wi === weekIndex
        ? { days: w.days.map((d, di) => (di === dayIndex ? null : d)) }
        : w
    )));
    setDirty(true);
  }, []);

  const handlePickDay = useCallback((dayId) => {
    if (!pickerSlot) return;
    const { weekIndex, dayIndex } = pickerSlot;
    setWeeks((ws) => ws.map((w, wi) => (
      wi === weekIndex
        ? { days: w.days.map((d, di) => (di === dayIndex ? dayId : d)) }
        : w
    )));
    setDirty(true);
    setPickerSlot(null);
    setPickerSearch('');
  }, [pickerSlot]);

  const handleNameChange = useCallback((e) => { setName(e.target.value); setDirty(true); }, []);
  const handleDescChange = useCallback((e) => { setDescription(e.target.value); setDirty(true); }, []);

  const filteredDays = useMemo(() => {
    const list = daysQuery.data ?? [];
    const q = pickerSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter((d) => (d.name ?? '').toLowerCase().includes(q));
  }, [daysQuery.data, pickerSearch]);

  if (programQuery.isLoading) {
    return (
      <DashboardLayout screenName="Plan nutricional">
        <div className="np-editor-root">
          <ShimmerSkeleton width={240} height={28} borderRadius={6} />
          <div style={{ height: 16 }} />
          <ShimmerSkeleton width="100%" height={120} borderRadius={10} />
        </div>
      </DashboardLayout>
    );
  }

  if (programQuery.isError || !programQuery.data) {
    return (
      <DashboardLayout screenName="Plan nutricional">
        <FullScreenError
          message="No pudimos cargar este plan."
          onRetry={() => programQuery.refetch()}
        />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout screenName="Plan nutricional">
      <div className="np-editor-root">
        <div className="np-editor-header">
          <button className="np-back-btn" onClick={() => navigate('/biblioteca?domain=nutricion&tab=programas_nutri')}>
            <ArrowLeft size={14} /> Volver
          </button>
          <button
            className="np-save-btn"
            onClick={() => saveMutation.mutate()}
            disabled={!dirty || saveMutation.isPending}
          >
            {saveMutation.isPending ? 'Guardando...' : (dirty ? 'Guardar' : <><Check size={14} /> Guardado</>)}
          </button>
        </div>

        <div className="np-editor-meta">
          <input
            className="np-name-input"
            value={name}
            onChange={handleNameChange}
            placeholder="Nombre del plan"
            maxLength={200}
          />
          <textarea
            className="np-desc-input"
            value={description}
            onChange={handleDescChange}
            placeholder="Descripcion (opcional)"
            rows={2}
            maxLength={2000}
          />
        </div>

        <div className="np-weeks-list">
          {weeks.map((week, wi) => (
            <div key={wi} className="np-week-card">
              <GlowingEffect spread={20} borderWidth={1} />
              <div className="np-week-header">
                <span className="np-week-title">Semana {wi + 1}</span>
                <div className="np-week-actions">
                  <button
                    className="np-week-action"
                    onClick={() => handleDuplicateWeek(wi)}
                    title="Duplicar semana"
                  >
                    <Copy size={13} /> Duplicar
                  </button>
                  <button
                    className="np-week-action np-week-action--danger"
                    onClick={() => handleDeleteWeek(wi)}
                    title="Eliminar semana"
                    disabled={weeks.length === 1}
                  >
                    <Trash2 size={13} /> Eliminar
                  </button>
                </div>
              </div>
              <div className="np-day-grid">
                {week.days.map((dayId, di) => {
                  const day = dayId ? daysById.get(dayId) : null;
                  return (
                    <div key={di} className="np-day-cell">
                      <div className="np-day-label">{DAY_LABELS[di]}</div>
                      {day ? (
                        <div className="np-day-slot np-day-slot--filled">
                          <span className="np-day-slot-name" title={day.name}>{day.name}</span>
                          <button
                            className="np-day-slot-clear"
                            onClick={() => handleClearSlot(wi, di)}
                            aria-label="Quitar"
                          >
                            <X size={11} />
                          </button>
                        </div>
                      ) : dayId ? (
                        <div className="np-day-slot np-day-slot--missing">
                          <span className="np-day-slot-name">Día borrado</span>
                          <button
                            className="np-day-slot-clear"
                            onClick={() => handleClearSlot(wi, di)}
                            aria-label="Quitar"
                          >
                            <X size={11} />
                          </button>
                        </div>
                      ) : (
                        <button
                          className="np-day-slot np-day-slot--empty"
                          onClick={() => setPickerSlot({ weekIndex: wi, dayIndex: di })}
                        >
                          <Plus size={14} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <button className="np-add-week-btn" onClick={handleAddWeek}>
          <Plus size={14} /> Agregar semana
        </button>
      </div>

      <Modal
        isOpen={!!pickerSlot}
        onClose={() => { setPickerSlot(null); setPickerSearch(''); }}
        title="Elegir día de alimentación"
      >
        <div className="np-picker">
          <div className="np-picker-search">
            <Search size={13} className="np-picker-search-icon" />
            <input
              autoFocus
              className="np-picker-search-input"
              value={pickerSearch}
              onChange={(e) => setPickerSearch(e.target.value)}
              placeholder="Buscar día..."
            />
          </div>
          <div className="np-picker-list">
            {daysQuery.isLoading ? (
              <div className="np-picker-empty">Cargando...</div>
            ) : filteredDays.length === 0 ? (
              <div className="np-picker-empty">
                {(daysQuery.data ?? []).length === 0
                  ? 'No tienes días de alimentación. Crea uno en la biblioteca primero.'
                  : 'Sin resultados.'}
              </div>
            ) : (
              filteredDays.map((d) => (
                <button key={d.id} className="np-picker-item" onClick={() => handlePickDay(d.id)}>
                  <span className="np-picker-item-name">{d.name || 'Sin nombre'}</span>
                  <span className="np-picker-item-meta">
                    {d.daily_calories ? `${Math.round(d.daily_calories)} kcal` : '—'}
                    {d.daily_protein_g ? ` · ${Math.round(d.daily_protein_g)}P` : ''}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
}
