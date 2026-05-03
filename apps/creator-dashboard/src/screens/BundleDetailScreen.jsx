import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '../components/DashboardLayout';
import ScreenSkeleton from '../components/ScreenSkeleton';
import ErrorBoundary from '../components/ErrorBoundary';
import { FullScreenError, MenuDropdown, GlowingEffect } from '../components/ui';
import BundleCover from '../components/bundles/BundleCover';
import apiClient from '../utils/apiClient';
import { queryKeys, cacheConfig } from '../config/queryClient';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import {
  useBundle,
  useBundleAnalytics,
  useCreatorBundles,
  useUpdateBundle,
  useUpdateBundleStatus,
  useDeleteBundle,
} from '../hooks/useBundles';
import './BundleDetailScreen.css';

const STATUS_LABEL = {
  draft: 'Borrador',
  published: 'Publicado',
  archived: 'Archivado',
};

const formatCOP = (n) => {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return `$${n.toLocaleString('es-CO')}`;
};

const relativeTime = (iso) => {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Math.max(0, Date.now() - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `hace ${days} d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `hace ${months} m`;
  return `hace ${Math.floor(months / 12)} a`;
};

const sameIdSet = (a, b) => {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  const sa = new Set(a);
  for (const x of b) if (!sa.has(x)) return false;
  return true;
};

const BundleDetailScreen = () => {
  const { bundleId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { showToast } = useToast();

  const { data: bundle, isLoading, error, refetch } = useBundle(bundleId);
  const { data: analytics } = useBundleAnalytics(bundleId);
  const { data: allBundles = [] } = useCreatorBundles();
  const updateMutation = useUpdateBundle();
  const statusMutation = useUpdateBundleStatus();
  const deleteMutation = useDeleteBundle();

  const { data: programs = [] } = useQuery({
    queryKey: user ? queryKeys.programs.byCreator(user.uid) : ['programs', 'none'],
    queryFn: () => apiClient.get('/creator/programs').then((r) => r.data),
    enabled: !!user?.uid,
    ...cacheConfig.otherPrograms,
  });

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priceInput, setPriceInput] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [programSearch, setProgramSearch] = useState('');
  const [errors, setErrors] = useState({});

  // Payment type is locked at create time. Derive from whichever field has a value.
  const paymentType = useMemo(() => {
    if (!bundle) return null;
    const otp = bundle.pricing?.otp;
    const sub = bundle.pricing?.subscription;
    if (typeof otp === 'number' && otp > 0) return 'otp';
    if (typeof sub === 'number' && sub > 0) return 'sub';
    return null;
  }, [bundle]);

  useEffect(() => {
    if (!bundle) return;
    setTitle(bundle.title || '');
    setDescription(bundle.description || '');
    const current = paymentType === 'otp' ? bundle.pricing?.otp : bundle.pricing?.subscription;
    setPriceInput(current != null ? String(current) : '');
    setSelectedIds(bundle.courseIds || []);
  }, [bundle, paymentType]);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const coverImages = useMemo(() => {
    const fromSelected = selectedIds
      .map((id) => programs.find((p) => p.id === id)?.imageUrl)
      .filter(Boolean);
    if (fromSelected.length > 0) return fromSelected;
    return bundle?.coverImages || [];
  }, [selectedIds, programs, bundle?.coverImages]);

  const standaloneSum = useMemo(() => {
    return selectedIds.reduce((acc, id) => {
      const p = programs.find((x) => x.id === id);
      const price = Number(p?.price);
      return acc + (Number.isFinite(price) ? price : 0);
    }, 0);
  }, [selectedIds, programs]);

  const duplicateBundle = useMemo(() => {
    if (!bundle) return null;
    return allBundles.find((b) =>
      b.id !== bundle.id &&
      b.status === 'published' &&
      sameIdSet(b.courseIds, selectedIds)
    ) || null;
  }, [allBundles, bundle, selectedIds]);

  const selectedPrograms = useMemo(() => {
    return selectedIds
      .map((id) => programs.find((p) => p.id === id))
      .filter(Boolean);
  }, [selectedIds, programs]);

  const pickerEligible = useMemo(() => {
    return programs.filter((p) => p.deliveryType !== 'one_on_one' && !selectedIds.includes(p.id));
  }, [programs, selectedIds]);

  const pickerFiltered = useMemo(() => {
    const q = programSearch.trim().toLowerCase();
    if (!q) return pickerEligible;
    return pickerEligible.filter((p) => (p.title || '').toLowerCase().includes(q));
  }, [pickerEligible, programSearch]);

  const isPublished = bundle?.status === 'published';
  const isArchived = bundle?.status === 'archived';

  // ── Save helpers ────────────────────────────────────────────────────────────
  const saveField = useCallback(async (updates) => {
    if (!bundle) return;
    try {
      await updateMutation.mutateAsync({ bundleId: bundle.id, updates });
    } catch (err) {
      showToast(err?.message || 'No pudimos guardar.', 'error');
      throw err;
    }
  }, [bundle, updateMutation, showToast]);

  const saveTitle = useCallback(async () => {
    const t = title.trim();
    if (!t) {
      setErrors((e) => ({ ...e, title: 'El título no puede estar vacío.' }));
      setTitle(bundle?.title || '');
      return;
    }
    setErrors((e) => ({ ...e, title: null }));
    if (t === (bundle?.title || '')) return;
    await saveField({ title: t });
  }, [title, bundle?.title, saveField]);

  const saveDescription = useCallback(async () => {
    const d = description.trim();
    if (d === (bundle?.description || '')) return;
    await saveField({ description: d });
  }, [description, bundle?.description, saveField]);

  const savePrice = useCallback(async () => {
    if (!paymentType) return;
    const raw = priceInput;
    const num = raw === '' ? null : Number(raw);
    const valid = typeof num === 'number' && Number.isFinite(num) && num > 0;
    if (!valid) {
      setErrors((e) => ({ ...e, price: 'Define un precio válido.' }));
      return;
    }
    setErrors((e) => ({ ...e, price: null }));
    const current = paymentType === 'otp' ? bundle?.pricing?.otp : bundle?.pricing?.subscription;
    if (num === current) return;
    const pricing = {
      otp: paymentType === 'otp' ? num : null,
      subscription: paymentType === 'sub' ? num : null,
    };
    await saveField({ pricing });
  }, [priceInput, paymentType, bundle?.pricing, saveField]);

  const saveCourseIds = useCallback(async (nextIds) => {
    if (nextIds.length < 2) {
      showToast('Un bundle necesita al menos 2 programas.', 'error');
      return;
    }
    try {
      await saveField({ courseIds: nextIds });
    } catch {
      setSelectedIds(bundle?.courseIds || []);
    }
  }, [saveField, bundle?.courseIds, showToast]);

  const addProgram = useCallback((id) => {
    const next = [...selectedIds, id];
    setSelectedIds(next);
    setProgramSearch('');
    saveCourseIds(next);
  }, [selectedIds, saveCourseIds]);

  const removeProgram = useCallback((id) => {
    const next = selectedIds.filter((x) => x !== id);
    if (next.length < 2) {
      showToast('Un bundle necesita al menos 2 programas. Agrega otro antes de remover este.', 'error');
      return;
    }
    setSelectedIds(next);
    saveCourseIds(next);
  }, [selectedIds, saveCourseIds, showToast]);

  const toggleStatus = useCallback(async () => {
    if (!bundle || statusMutation.isPending) return;
    const nextStatus = isPublished ? 'draft' : 'published';
    try {
      await statusMutation.mutateAsync({ bundleId: bundle.id, status: nextStatus });
      showToast(
        nextStatus === 'published' ? 'Bundle publicado.' : 'Bundle en borrador.',
        'success',
      );
    } catch (err) {
      showToast(err?.message || 'No pudimos cambiar el estado.', 'error');
    }
  }, [bundle, isPublished, statusMutation, showToast]);

  const handleArchive = useCallback(async () => {
    if (!bundle) return;
    if (!window.confirm('¿Archivar este bundle? Dejará de estar disponible para nuevas compras.')) return;
    try {
      await statusMutation.mutateAsync({ bundleId: bundle.id, status: 'archived' });
      showToast('Bundle archivado.', 'success');
      navigate('/programas?tab=bundles');
    } catch (err) {
      showToast(err?.message || 'No pudimos archivar.', 'error');
    }
  }, [bundle, statusMutation, showToast, navigate]);

  const handleUnarchive = useCallback(async () => {
    if (!bundle) return;
    try {
      await statusMutation.mutateAsync({ bundleId: bundle.id, status: 'draft' });
      showToast('Bundle reactivado en borrador.', 'success');
    } catch (err) {
      showToast(err?.message || 'No pudimos reactivar.', 'error');
    }
  }, [bundle, statusMutation, showToast]);

  const handleDelete = useCallback(async () => {
    if (!bundle) return;
    if (!window.confirm('¿Eliminar este bundle? Esta acción no se puede deshacer.')) return;
    try {
      await deleteMutation.mutateAsync(bundle.id);
      showToast('Bundle eliminado.', 'success');
      navigate('/programas?tab=bundles');
    } catch (err) {
      showToast(err?.message || 'No pudimos eliminar.', 'error');
    }
  }, [bundle, deleteMutation, showToast, navigate]);

  const enrollments = analytics?.enrollments ?? 0;
  const revenueTotal = analytics?.revenueTotal ?? 0;
  const otpCount = analytics?.otpCount ?? 0;
  const subCount = analytics?.subCount ?? 0;
  const recent = analytics?.recentPurchases ?? [];

  // ── Render ──────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <DashboardLayout screenName="Bundle" backPath="/programas?tab=bundles" showBackButton>
        <ScreenSkeleton />
      </DashboardLayout>
    );
  }

  if (error || !bundle) {
    return (
      <DashboardLayout screenName="Bundle" backPath="/programas?tab=bundles" showBackButton>
        <FullScreenError
          title="No pudimos cargar este bundle"
          message="Puede que haya sido eliminado."
          onRetry={refetch}
        />
      </DashboardLayout>
    );
  }

  const menuItems = [
    ...(isArchived
      ? [{ label: 'Reactivar', onClick: handleUnarchive }]
      : [{ label: 'Archivar', onClick: handleArchive }]),
    { divider: true },
    { label: 'Eliminar', onClick: handleDelete, danger: true },
  ];

  return (
    <DashboardLayout
      screenName={bundle.title || 'Bundle'}
      backPath="/programas?tab=bundles"
      showBackButton
      headerRight={
        <div className="bds-header-right">
          <button
            type="button"
            className={`bds-status-btn bds-status-btn--${bundle.status}`}
            onClick={toggleStatus}
            disabled={statusMutation.isPending || isArchived}
            title={isArchived ? 'Reactiva el bundle para cambiar su estado' : (isPublished ? 'Cambiar a borrador' : 'Publicar bundle')}
          >
            {statusMutation.isPending ? 'Cambiando…' : (STATUS_LABEL[bundle.status] || bundle.status)}
          </button>
          <MenuDropdown
            trigger={
              <button type="button" className="bds-menu-btn" aria-label="Más acciones">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <circle cx="12" cy="5" r="1.5" fill="currentColor" />
                  <circle cx="12" cy="12" r="1.5" fill="currentColor" />
                  <circle cx="12" cy="19" r="1.5" fill="currentColor" />
                </svg>
              </button>
            }
            items={menuItems}
          />
        </div>
      }
    >
      <ErrorBoundary>
        <div className="bds-root">
          {/* Header */}
          <section className="bds-hero">
            <BundleCover imageUrls={coverImages} size="header" title={bundle.title} />
            <div className="bds-hero__meta">
              <input
                type="text"
                className="bds-title-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={saveTitle}
                placeholder="Título del bundle"
                maxLength={120}
              />
              {errors.title && <span className="bds-field-error">{errors.title}</span>}
              <textarea
                className="bds-description-input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={saveDescription}
                placeholder="Cuenta qué incluye y para quién es"
                maxLength={2000}
                rows={2}
              />
            </div>
          </section>

          {duplicateBundle && (
            <div className="bds-notice bds-notice--warn">
              Ya tienes otro bundle publicado con estos mismos programas:{' '}
              <strong>{duplicateBundle.title || 'Sin nombre'}</strong>. No es un error, pero puede confundir a tus compradores.
            </div>
          )}

          {/* Bento grid */}
          <div className="bds-bento">
            {/* Metric: Inscritos */}
            <div className="bds-card bds-card--metric">
              <GlowingEffect spread={24} proximity={40} inactiveZone={0.6} />
              <span className="bds-card__label">Inscritos</span>
              <span className="bds-card__big">{enrollments}</span>
              <span className="bds-card__sub">
                {enrollments === 1 ? 'persona' : 'personas'} con acceso
              </span>
            </div>

            {/* Metric: Ingresos */}
            <div className="bds-card bds-card--metric">
              <GlowingEffect spread={24} proximity={40} inactiveZone={0.6} />
              <span className="bds-card__label">Ingresos totales</span>
              <span className="bds-card__big">{formatCOP(revenueTotal)}</span>
              <span className="bds-card__sub">
                {otpCount} pago{otpCount === 1 ? '' : 's'} único{otpCount === 1 ? '' : 's'} · {subCount} cobro{subCount === 1 ? '' : 's'} de suscripción
              </span>
            </div>

            {/* Price editor */}
            <div className="bds-card bds-card--price">
              <GlowingEffect spread={24} proximity={40} inactiveZone={0.6} />
              <div className="bds-card__head">
                <span className="bds-card__label">Precio</span>
                <span className={`bds-type-tag bds-type-tag--${paymentType || 'none'}`}>
                  {paymentType === 'otp' ? 'Pago único · 1 año' : paymentType === 'sub' ? 'Suscripción mensual' : 'Sin precio'}
                </span>
              </div>
              {paymentType ? (
                <>
                  <div className="bds-price-inline">
                    <span className="bds-price-currency">$</span>
                    <input
                      type="number"
                      min="0"
                      step="1000"
                      className="bds-price-input-big"
                      value={priceInput}
                      onChange={(e) => setPriceInput(e.target.value)}
                      onBlur={savePrice}
                      placeholder="0"
                    />
                    <span className="bds-price-suffix">
                      COP{paymentType === 'sub' ? ' / mes' : ''}
                    </span>
                  </div>
                  {errors.price && <span className="bds-field-error">{errors.price}</span>}
                  {paymentType === 'otp' && standaloneSum > 0 && (
                    <span className="bds-card__sub">
                      Suma individual: {formatCOP(standaloneSum)} COP
                    </span>
                  )}
                  <span className="bds-card__hint">
                    El tipo de cobro se fija al crear el bundle y no se puede cambiar aquí.
                  </span>
                </>
              ) : (
                <span className="bds-card__sub">
                  Este bundle se creó sin precio. Crea uno nuevo para ofrecerlo a la venta.
                </span>
              )}
            </div>

            {/* Programs editor */}
            <div className="bds-card bds-card--programs">
              <GlowingEffect spread={24} proximity={40} inactiveZone={0.6} />
              <div className="bds-card__head">
                <span className="bds-card__label">Programas incluidos</span>
                <span className="bds-card__count">{selectedPrograms.length}</span>
              </div>

              <ul className="bds-program-list">
                {selectedPrograms.map((p) => (
                  <li key={p.id} className="bds-program-row">
                    {p.imageUrl ? (
                      <img src={p.imageUrl} alt="" className="bds-program-thumb" />
                    ) : (
                      <div className="bds-program-thumb bds-program-thumb--placeholder" />
                    )}
                    <div className="bds-program-meta">
                      <span className="bds-program-title">{p.title || 'Sin nombre'}</span>
                      {p.price != null && (
                        <span className="bds-program-price">{formatCOP(Number(p.price))} COP</span>
                      )}
                    </div>
                    <button
                      type="button"
                      className="bds-program-remove"
                      onClick={() => removeProgram(p.id)}
                      title="Remover del bundle"
                      aria-label={`Remover ${p.title || 'programa'} del bundle`}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                    </button>
                  </li>
                ))}
              </ul>

              {!isPickerOpen ? (
                <button
                  type="button"
                  className="bds-add-program-btn"
                  onClick={() => setIsPickerOpen(true)}
                  disabled={pickerEligible.length === 0}
                >
                  + Agregar programa
                </button>
              ) : (
                <div className="bds-picker">
                  <input
                    type="text"
                    className="bds-picker-search"
                    placeholder="Buscar por nombre"
                    value={programSearch}
                    onChange={(e) => setProgramSearch(e.target.value)}
                    autoFocus
                  />
                  <div className="bds-picker-list">
                    {pickerFiltered.length === 0 ? (
                      <p className="bds-picker-empty">
                        {pickerEligible.length === 0
                          ? 'Ya agregaste todos tus programas elegibles.'
                          : `Ningún programa coincide con "${programSearch}".`}
                      </p>
                    ) : (
                      pickerFiltered.map((p) => {
                        const bundleOnly = p.bundleOnly ?? (p.visibility === 'bundle-only');
                        const isDraft = p.status !== 'published';
                        return (
                          <button
                            key={p.id}
                            type="button"
                            className="bds-picker-row"
                            onClick={() => addProgram(p.id)}
                          >
                            {p.imageUrl ? (
                              <img src={p.imageUrl} alt="" className="bds-program-thumb" />
                            ) : (
                              <div className="bds-program-thumb bds-program-thumb--placeholder" />
                            )}
                            <div className="bds-program-meta">
                              <span className="bds-program-title">{p.title || 'Sin nombre'}</span>
                              <div className="bds-program-chips">
                                {isDraft && !bundleOnly && (
                                  <span className="bds-chip bds-chip--draft">Borrador</span>
                                )}
                                {bundleOnly && (
                                  <span className="bds-chip bds-chip--bundle-only">Solo bundles</span>
                                )}
                              </div>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                  <button
                    type="button"
                    className="bds-picker-close"
                    onClick={() => { setIsPickerOpen(false); setProgramSearch(''); }}
                  >
                    Listo
                  </button>
                </div>
              )}
            </div>

            {/* Recent purchases */}
            <div className="bds-card bds-card--activity">
              <GlowingEffect spread={24} proximity={40} inactiveZone={0.6} />
              <div className="bds-card__head">
                <span className="bds-card__label">Últimas compras</span>
                <span className="bds-card__count">{recent.length}</span>
              </div>
              {recent.length === 0 ? (
                <p className="bds-card__sub bds-activity-empty">
                  Aún no hay compras registradas para este bundle.
                </p>
              ) : (
                <ul className="bds-activity-list">
                  {recent.map((r, i) => (
                    <li key={`${r.paymentId || i}`} className="bds-activity-row">
                      <span className="bds-activity-name">
                        {r.userName || 'Usuario'}
                      </span>
                      <span className="bds-activity-meta">
                        <span className={`bds-chip bds-chip--${r.kind === 'otp' ? 'otp' : 'sub'}`}>
                          {r.kind === 'otp' ? 'Único' : 'Susc.'}
                        </span>
                        <span className="bds-activity-amount">{formatCOP(r.amount)} COP</span>
                        <span className="bds-activity-time">{relativeTime(r.date)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </ErrorBoundary>
    </DashboardLayout>
  );
};

export default BundleDetailScreen;
