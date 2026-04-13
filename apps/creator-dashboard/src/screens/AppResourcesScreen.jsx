import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Navigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import MediaPickerModal from '../components/MediaPickerModal';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import apiClient from '../utils/apiClient';
import './AppResourcesScreen.css';

const AppResourcesScreen = () => {
  const { isAdmin } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [heroImages, setHeroImages] = useState([]);
  const [cardImages, setCardImages] = useState([]);
  const [dosFormas, setDosFormas] = useState('');
  const [dirty, setDirty] = useState(false);

  // Which picker is open: null | 'hero' | 'cards' | 'dosFormas'
  const [pickerTarget, setPickerTarget] = useState(null);
  const pickerTargetRef = useRef(null);

  // Preview: { url, section, index }
  const [preview, setPreview] = useState(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'app-resources'],
    queryFn: async () => {
      const res = await apiClient.get('/app-resources');
      const docs = res.data || res;
      if (Array.isArray(docs)) {
        const landing = docs.find((d) => d.id === 'landing');
        return landing || {};
      }
      return docs;
    },
    enabled: isAdmin,
  });

  useEffect(() => {
    if (!data) return;
    setHeroImages(Array.isArray(data.mainHeroLanding) ? data.mainHeroLanding : []);
    setCardImages(Array.isArray(data.cards) ? data.cards : []);
    setDosFormas(typeof data.dosFormas === 'string' ? data.dosFormas : '');
    setDirty(false);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      apiClient.put('/app-resources/landing', {
        mainHeroLanding: heroImages,
        cards: cardImages,
        dosFormas: dosFormas || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'app-resources'] });
      showToast('Recursos actualizados', 'success');
      setDirty(false);
    },
    onError: () => {
      showToast('Error al guardar. Intenta de nuevo.', 'error');
    },
  });

  const removeHeroImage = useCallback((index) => {
    setHeroImages((prev) => prev.filter((_, i) => i !== index));
    setDirty(true);
    setPreview((p) => (p?.section === 'hero' && p?.index === index) ? null : p);
  }, []);

  const removeCardImage = useCallback((index) => {
    setCardImages((prev) => prev.filter((_, i) => i !== index));
    setDirty(true);
    setPreview((p) => (p?.section === 'cards' && p?.index === index) ? null : p);
  }, []);

  const openPicker = useCallback((target) => {
    pickerTargetRef.current = target;
    setPickerTarget(target);
  }, []);

  const closePicker = useCallback(() => {
    setPickerTarget(null);
    // Don't clear the ref — upload callbacks fire after close
  }, []);

  const handleMediaSelect = useCallback((item) => {
    if (!item?.url) return;
    const target = pickerTargetRef.current;
    if (target === 'hero') {
      setHeroImages((prev) => [...prev, item.url]);
    } else if (target === 'cards') {
      setCardImages((prev) => [...prev, item.url]);
    } else if (target === 'dosFormas') {
      setDosFormas(item.url);
    }
    setDirty(true);
  }, []);

  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  return (
    <DashboardLayout screenName="Recursos de la app">
      <div className="ar-screen">
        {isLoading && <div className="ar-loading">Cargando...</div>}
        {isError && <p className="ar-error">Error al cargar los recursos.</p>}

        {!isLoading && !isError && (
          <div className={`ar-layout ${preview ? 'ar-layout--with-preview' : ''}`}>
            <div className="ar-content">
              {/* ── Hero Slideshow ──────────────────────────────── */}
              <div className="ar-section">
                <p className="ar-section-label">Hero Slideshow</p>
                <p className="ar-section-desc">Imagenes del carrusel principal en la landing page.</p>
                <div className="ar-card">
                  {heroImages.length === 0 ? (
                    <div className="ar-empty">Sin imagenes.</div>
                  ) : (
                    <div className="ar-image-grid">
                      {heroImages.map((url, i) => (
                        <div
                          key={`${url}-${i}`}
                          className={`ar-image-item ${preview?.section === 'hero' && preview?.index === i ? 'ar-image-item--selected' : ''}`}
                          onClick={() => setPreview({ url, section: 'hero', index: i })}
                        >
                          <img src={url} alt="" loading="lazy" />
                          <div className="ar-image-item__overlay">
                            <button
                              className="ar-image-item__remove"
                              onClick={(e) => { e.stopPropagation(); removeHeroImage(i); }}
                              aria-label="Eliminar imagen"
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="ar-add-row">
                    <button
                      className="ar-add-btn"
                      onClick={() => openPicker('hero')}
                    >
                      Agregar imagen
                    </button>
                  </div>
                </div>
              </div>

              {/* ── Cards ──────────────────────────────────────── */}
              <div className="ar-section">
                <p className="ar-section-label">Cards</p>
                <p className="ar-section-desc">Imagenes de las tarjetas de la landing (3 recomendadas).</p>
                <div className="ar-card">
                  {cardImages.length === 0 ? (
                    <div className="ar-empty">Sin imagenes.</div>
                  ) : (
                    <div className="ar-image-grid">
                      {cardImages.map((url, i) => (
                        <div
                          key={`${url}-${i}`}
                          className={`ar-image-item ${preview?.section === 'cards' && preview?.index === i ? 'ar-image-item--selected' : ''}`}
                          onClick={() => setPreview({ url, section: 'cards', index: i })}
                        >
                          <img src={url} alt="" loading="lazy" />
                          <div className="ar-image-item__overlay">
                            <button
                              className="ar-image-item__remove"
                              onClick={(e) => { e.stopPropagation(); removeCardImage(i); }}
                              aria-label="Eliminar imagen"
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="ar-add-row">
                    <button
                      className="ar-add-btn"
                      onClick={() => openPicker('cards')}
                    >
                      Agregar imagen
                    </button>
                  </div>
                </div>
              </div>

              {/* ── Dos Formas Image ────────────────────────────── */}
              <div className="ar-section">
                <p className="ar-section-label">Imagen "Dos Formas"</p>
                <p className="ar-section-desc">Imagen de la seccion dos formas en la landing.</p>
                <div className="ar-card">
                  {dosFormas ? (
                    <div className="ar-image-grid">
                      <div
                        className={`ar-image-item ${preview?.section === 'dosFormas' ? 'ar-image-item--selected' : ''}`}
                        onClick={() => setPreview({ url: dosFormas, section: 'dosFormas', index: 0 })}
                      >
                        <img src={dosFormas} alt="" loading="lazy" />
                        <div className="ar-image-item__overlay">
                          <button
                            className="ar-image-item__remove"
                            onClick={(e) => { e.stopPropagation(); setDosFormas(''); setDirty(true); setPreview(null); }}
                            aria-label="Eliminar imagen"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="ar-add-row" style={{ marginTop: 0 }}>
                      <button
                        className="ar-add-btn"
                        onClick={() => openPicker('dosFormas')}
                      >
                        Elegir imagen
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Save bar ────────────────────────────────────── */}
              {dirty && (
                <div className="ar-save-bar">
                  <span className="ar-unsaved-label">Cambios sin guardar</span>
                  <button
                    className="ar-save-btn"
                    onClick={() => saveMutation.mutate()}
                    disabled={saveMutation.isPending}
                  >
                    {saveMutation.isPending ? 'Guardando...' : 'Guardar'}
                  </button>
                </div>
              )}
            </div>

            {/* ── Preview panel ─────────────────────────────────── */}
            {preview && (
              <aside className="ar-preview">
                <div className="ar-preview__header">
                  <p className="ar-preview__label">Vista previa</p>
                  <button
                    className="ar-preview__close"
                    onClick={() => setPreview(null)}
                    aria-label="Cerrar vista previa"
                  >
                    ×
                  </button>
                </div>
                <div className="ar-preview__image-wrap">
                  <img src={preview.url} alt="" className="ar-preview__image" />
                </div>
                <p className="ar-preview__url">{preview.url}</p>
              </aside>
            )}
          </div>
        )}
      </div>

      <MediaPickerModal
        isOpen={pickerTarget !== null}
        onClose={closePicker}
        onSelect={handleMediaSelect}
        accept="image/*"
        multiple={pickerTarget === 'hero' || pickerTarget === 'cards'}
      />
    </DashboardLayout>
  );
};

export default AppResourcesScreen;
