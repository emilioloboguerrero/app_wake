import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import UserDashboardLayout from '../components/UserDashboardLayout';
import Button from '../components/Button';
import Modal from '../components/Modal';
import Input from '../components/Input';
import { getCourse } from '../services/firestoreService';
import purchaseService from '../services/purchaseService';
import programService from '../services/programService';
import { getAccessDurationLabel, getAccessTypeLabel } from '../utils/durationHelper';
import './CoursePurchaseScreen.css';

const CoursePurchaseScreen = () => {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [purchaseError, setPurchaseError] = useState(null);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [mercadopagoEmail, setMercadopagoEmail] = useState('');
  const [emailError, setEmailError] = useState(null);

  // Fetch course details
  const { data: course, isLoading: courseLoading, error: courseError } = useQuery({
    queryKey: ['course', courseId],
    queryFn: () => getCourse(courseId),
    enabled: !!courseId,
  });

  // Fetch modules with session counts
  const { data: modules = [], isLoading: modulesLoading } = useQuery({
    queryKey: ['courseModules', courseId],
    queryFn: async () => {
      if (!courseId) return [];
      try {
        // Use getModulesWithCounts which already orders modules and provides counts
        const modulesList = await programService.getModulesWithCounts(courseId);
        
        if (!modulesList || modulesList.length === 0) {
          return [];
        }
        
        // Fetch sessions for each module to get accurate session counts
        // (sessionCount from getModulesWithCounts may be denormalized, so we verify)
        const modulesWithSessions = await Promise.all(
          modulesList.map(async (module) => {
            try {
              const sessions = await programService.getSessionsByModule(courseId, module.id);
              return {
                ...module,
                sessions: sessions || [],
                sessionCount: sessions?.length || module.sessionCount || 0
              };
            } catch (error) {
              console.error(`Error fetching sessions for module ${module.id}:`, error);
              return {
                ...module,
                sessions: [],
                sessionCount: module.sessionCount || 0
              };
            }
          })
        );
        
        // Modules from getModulesWithCounts are already sorted by order
        return modulesWithSessions;
      } catch (error) {
        console.error('Error fetching modules:', error);
        return [];
      }
    },
    enabled: !!courseId,
  });

  // Fetch user course state (ownership, trial history)
  const { data: userCourseState, isLoading: stateLoading } = useQuery({
    queryKey: ['userCourseState', user?.uid, courseId],
    queryFn: () => purchaseService.getUserCourseState(user?.uid, courseId),
    enabled: !!user && !!courseId,
  });

  // Calculate program statistics
  const programStats = useMemo(() => {
    if (!modules || modules.length === 0) {
      return {
        totalModules: 0,
        totalSessions: 0,
        totalExercises: 0
      };
    }

    const totalModules = modules.length;
    const totalSessions = modules.reduce((sum, module) => sum + (module.sessionCount || 0), 0);
    
    // For now, we don't have exercise counts easily accessible, so we'll show 0
    // This could be enhanced later if needed
    const totalExercises = 0;

    return {
      totalModules,
      totalSessions,
      totalExercises
    };
  }, [modules]);

  const ownsCourse = userCourseState?.ownsCourse || false;
  const isLoading = courseLoading || stateLoading;
  const hasError = courseError;

  const handlePurchase = async () => {
    if (!user) {
      navigate('/login');
      return;
    }

    setIsPurchasing(true);
    setPurchaseError(null);

    try {
      const result = await purchaseService.preparePurchase(user.uid, courseId);
      
      if (result.success && result.checkoutURL) {
        // Redirect to Mercado Pago checkout
        window.location.href = result.checkoutURL;
      } else if (result.requiresAlternateEmail) {
        // Show email input modal for subscription
        setIsPurchasing(false);
        setShowEmailModal(true);
        setEmailError(null);
      } else {
        setPurchaseError(result.error || 'Error al preparar el pago');
        setIsPurchasing(false);
      }
    } catch (error) {
      console.error('Purchase error:', error);
      setPurchaseError(error.message || 'Error al procesar la compra');
      setIsPurchasing(false);
    }
  };

  const handleEmailSubmit = async () => {
    if (!mercadopagoEmail || !mercadopagoEmail.trim()) {
      setEmailError('Por favor ingresa un email válido');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(mercadopagoEmail.trim())) {
      setEmailError('Por favor ingresa un email válido');
      return;
    }

    setIsPurchasing(true);
    setEmailError(null);
    setShowEmailModal(false);

    try {
      // Check if it's a subscription (monthly)
      if (course?.access_duration === 'monthly') {
        const result = await purchaseService.prepareSubscription(
          user.uid,
          courseId,
          mercadopagoEmail.trim()
        );

        if (result.success && result.checkoutURL) {
          // Redirect to Mercado Pago checkout
          window.location.href = result.checkoutURL;
        } else if (result.requiresAlternateEmail) {
          // Still requires email, show modal again
          setIsPurchasing(false);
          setShowEmailModal(true);
          setEmailError(result.error || 'Por favor ingresa un email válido de Mercado Pago');
        } else {
          setPurchaseError(result.error || 'Error al crear la suscripción');
          setIsPurchasing(false);
        }
      } else {
        // One-time payment - shouldn't need email, but handle just in case
        setPurchaseError('Error: Este programa no requiere email de Mercado Pago');
        setIsPurchasing(false);
      }
    } catch (error) {
      console.error('Subscription error:', error);
      setPurchaseError(error.message || 'Error al procesar la suscripción');
      setIsPurchasing(false);
    }
  };

  const handleCloseEmailModal = () => {
    setShowEmailModal(false);
    setMercadopagoEmail('');
    setEmailError(null);
    setIsPurchasing(false);
  };

  const handleStartTrial = async () => {
    if (!user) {
      navigate('/login');
      return;
    }

    setIsPurchasing(true);
    setPurchaseError(null);

    try {
      // Default trial duration: 7 days
      const result = await purchaseService.startLocalTrial(user.uid, courseId, 7);
      
      if (result.success) {
        // Refresh user course state and redirect to biblioteca
        navigate('/user/biblioteca');
      } else {
        setPurchaseError(result.error || 'Error al iniciar la prueba');
        setIsPurchasing(false);
      }
    } catch (error) {
      console.error('Trial error:', error);
      setPurchaseError(error.message || 'Error al iniciar la prueba');
      setIsPurchasing(false);
    }
  };

  const handleGoToBiblioteca = () => {
    navigate('/user/biblioteca');
  };

  const handleOpenInApp = () => {
    // Deep link to open the program in the app
    const deepLink = `wake://program/${courseId}`;
    
    // Try to open the app
    window.location.href = deepLink;
    
    // Fallback: If app doesn't open within a short time, show a message
    // (This is a simple implementation - in production you might want to use
    // a library like react-native-deep-linking or similar)
    setTimeout(() => {
      // If we're still here after 2 seconds, the app might not be installed
      // You could show a message or redirect to app store
      console.log('App may not be installed or deep link failed');
    }, 2000);
  };

  if (isLoading || modulesLoading) {
    return (
      <UserDashboardLayout screenName="Programa">
        <div className="course-purchase-loading">
          <div className="spinner"></div>
          <p>Cargando programa...</p>
        </div>
      </UserDashboardLayout>
    );
  }

  if (hasError || !course) {
    return (
      <UserDashboardLayout screenName="Programa">
        <div className="course-purchase-error">
          <h2>Error</h2>
          <p>No se pudo cargar el programa. Por favor intenta de nuevo.</p>
          <Button
            title="Volver a Biblioteca"
            onClick={handleGoToBiblioteca}
            variant="primary"
          />
        </div>
      </UserDashboardLayout>
    );
  }

  const accessType = getAccessTypeLabel(course.access_duration);
  const accessDuration = getAccessDurationLabel(course.access_duration);
  const hasUsedTrial = userCourseState?.trialHistory?.consumed || false;
  const trialConfig = course?.free_trial || {};
  const trialDurationDays = trialConfig?.duration_days || 0;
  const isTrialFeatureEnabled = Boolean(trialConfig?.active && trialDurationDays > 0);
  const canStartTrial = !ownsCourse && !hasUsedTrial && isTrialFeatureEnabled;
  const hasVideoIntro = Boolean(course.video_intro_url);

  // Render purchase actions section (reused for desktop sidebar and mobile sticky)
  const renderPurchaseActions = (hideExpiration = false) => (
    <>
      {/* Purchase Error */}
      {purchaseError && (
        <div className="course-purchase-error-message">
          <p>{purchaseError}</p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="course-purchase-actions">
        {ownsCourse ? (
          <div className="course-purchase-owned">
            <p className="course-purchase-owned-message">
              ✓ Ya tienes acceso a este programa
            </p>
            {!hideExpiration && userCourseState?.courseData?.expires_at && (
              <p className="course-purchase-expiration">
                Expira: {new Date(userCourseState.courseData.expires_at).toLocaleDateString('es-ES')}
              </p>
            )}
            <Button
              title="Abrir en la App"
              onClick={handleOpenInApp}
              variant="primary"
            />
            <Button
              title="Ir a Mi Biblioteca"
              onClick={handleGoToBiblioteca}
              variant="outline"
            />
          </div>
        ) : (
          <>
            {canStartTrial ? (
              <button
                className="course-purchase-button course-purchase-button-trial"
                onClick={handleStartTrial}
                disabled={isPurchasing}
              >
                {isPurchasing ? (
                  <div className="course-purchase-button-loading">
                    <div className="spinner-small"></div>
                    <span>Iniciando prueba...</span>
                  </div>
                ) : (
                  <div className="course-purchase-button-content">
                    <span className="course-purchase-button-main-text">
                      Probar GRATIS por {trialDurationDays || 7} días
                    </span>
                    {course.price && (
                      <span className="course-purchase-button-price-text">
                        ${course.price} COP{course.access_duration === 'monthly' ? '/mes' : ''} después
                      </span>
                    )}
                  </div>
                )}
              </button>
            ) : (
              <button
                className="course-purchase-button"
                onClick={handlePurchase}
                disabled={isPurchasing}
              >
                {isPurchasing ? (
                  <div className="course-purchase-button-loading">
                    <div className="spinner-small"></div>
                    <span>Procesando compra...</span>
                  </div>
                ) : (
                  <div className="course-purchase-button-content">
                    <span className="course-purchase-button-main-text">
                      Empezar ahora
                    </span>
                    {course.price && (
                      <span className="course-purchase-button-price-text">
                        ${course.price} COP{course.access_duration === 'monthly' ? '/mes' : ''}
                      </span>
                    )}
                  </div>
                )}
              </button>
            )}
          </>
        )}
      </div>
    </>
  );

  return (
    <UserDashboardLayout screenName={course.title || 'Programa'}>
      <div className="course-purchase-container">
        <div className="course-purchase-content">
          {/* Header Section with Image or Video */}
          <div className="course-purchase-header">
            {hasVideoIntro ? (
              <div className="course-purchase-video-container">
                <video
                  className="course-purchase-video"
                  src={course.video_intro_url}
                  controls
                  poster={course.image_url}
                >
                  Tu navegador no soporta la reproducción de video.
                </video>
              </div>
            ) : course.image_url ? (
              <div 
                className="course-purchase-image"
                style={{ backgroundImage: `url(${course.image_url})` }}
              />
            ) : null}
          </div>

          {/* Mobile Purchase Button Section - Sticky after video */}
          <div className="course-purchase-mobile-cta">
            {renderPurchaseActions(true)}
          </div>

          {/* Main Content Grid */}
          <div className="course-purchase-main-grid">
            {/* Left Column - Main Info */}
            <div className="course-purchase-main-info">
              <h1 className="course-purchase-title">
                {course.title || 'Programa sin título'}
              </h1>

              {course.creatorName || course.creator_name ? (
                <p className="course-purchase-creator">
                  Por {course.creatorName || course.creator_name}
                </p>
              ) : null}

              {course.description && (
                <div className="course-purchase-description">
                  <p>{course.description}</p>
                </div>
              )}

              {/* Program Statistics */}
              {(programStats.totalModules > 0 || programStats.totalSessions > 0) && (
                <div className="course-purchase-stats">
                  <h3 className="course-purchase-stats-title">Contenido del Programa</h3>
                  <div className="course-purchase-stats-grid">
                    {programStats.totalModules > 0 && (
                      <div className="course-stat-item">
                        <span className="course-stat-value">{programStats.totalModules}</span>
                        <span className="course-stat-label">
                          {programStats.totalModules === 1 ? 'Módulo' : 'Módulos'}
                        </span>
                      </div>
                    )}
                    {programStats.totalSessions > 0 && (
                      <div className="course-stat-item">
                        <span className="course-stat-value">{programStats.totalSessions}</span>
                        <span className="course-stat-label">
                          {programStats.totalSessions === 1 ? 'Sesión' : 'Sesiones'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Modules List */}
              {modules && modules.length > 0 && (
                <div className="course-purchase-modules">
                  <h3 className="course-purchase-modules-title">Módulos</h3>
                  <div className="course-modules-list">
                    {modules.map((module, index) => (
                      <div key={module.id} className="course-module-item">
                        <div className="course-module-number">{index + 1}</div>
                        <div className="course-module-info">
                          <h4 className="course-module-title">{module.title || `Módulo ${index + 1}`}</h4>
                          {module.sessionCount > 0 && (
                            <span className="course-module-sessions">
                              {module.sessionCount} {module.sessionCount === 1 ? 'sesión' : 'sesiones'}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Course Details Card - Mobile only, shown in main content */}
              <div className="course-purchase-details-card course-purchase-details-mobile">
                <h3 className="course-details-card-title">Detalles</h3>
                <div className="course-details-list">
                  {course.discipline && (
                    <div className="course-detail-row">
                      <span className="course-detail-label">Disciplina:</span>
                      <span className="course-detail-value">{course.discipline}</span>
                    </div>
                  )}
                  
                  {course.access_duration && (
                    <div className="course-detail-row">
                      <span className="course-detail-label">Tipo:</span>
                      <span className="course-detail-value">{accessType}</span>
                    </div>
                  )}

                  {course.duration && (
                    <div className="course-detail-row">
                      <span className="course-detail-label">Duración:</span>
                      <span className="course-detail-value">{course.duration}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right Column - Sidebar (Desktop only) */}
            <div className="course-purchase-sidebar">
              {/* Course Details Card */}
              <div className="course-purchase-details-card">
                <h3 className="course-details-card-title">Detalles</h3>
                <div className="course-details-list">
                  {course.discipline && (
                    <div className="course-detail-row">
                      <span className="course-detail-label">Disciplina:</span>
                      <span className="course-detail-value">{course.discipline}</span>
                    </div>
                  )}
                  
                  {course.access_duration && (
                    <div className="course-detail-row">
                      <span className="course-detail-label">Tipo:</span>
                      <span className="course-detail-value">{accessType}</span>
                    </div>
                  )}

                  {course.duration && (
                    <div className="course-detail-row">
                      <span className="course-detail-label">Duración:</span>
                      <span className="course-detail-value">{course.duration}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Desktop Purchase Actions */}
              {renderPurchaseActions()}
            </div>
          </div>
        </div>
      </div>

      {/* Mercado Pago Email Modal */}
      <Modal
        isOpen={showEmailModal}
        onClose={handleCloseEmailModal}
        title="Email de Mercado Pago"
      >
        <div className="email-modal-content">
          <p className="email-modal-message">
            Por favor ingresa tu correo de Mercado Pago para continuar con la suscripción:
          </p>
          <Input
            type="email"
            placeholder="correo@mercadopago.com"
            value={mercadopagoEmail}
            onChange={(e) => {
              setMercadopagoEmail(e.target.value);
              setEmailError(null);
            }}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                handleEmailSubmit();
              }
            }}
          />
          {emailError && (
            <p className="email-modal-error">{emailError}</p>
          )}
          <div className="email-modal-actions">
            <Button
              title="Continuar"
              onClick={handleEmailSubmit}
              variant="primary"
              disabled={isPurchasing}
              loading={isPurchasing}
            />
            <Button
              title="Cancelar"
              onClick={handleCloseEmailModal}
              variant="outline"
            />
          </div>
        </div>
      </Modal>
    </UserDashboardLayout>
  );
};

export default CoursePurchaseScreen;
