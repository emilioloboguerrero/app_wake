import React, { useEffect, useMemo, useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  useWindowDimensions,
  Linking,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { collection, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { firestore, auth } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import logger from '../utils/logger';
import { FixedWakeHeader, GAP_AFTER_HEADER } from '../components/WakeHeader';
import BottomSpacer from '../components/BottomSpacer';
import SvgInfo from '../components/icons/SvgInfo';

const statusLabels = {
  pending: 'Pendiente',
  authorized: 'Activa',
  active: 'Activa',
  paused: 'Pausada',
  cancelled: 'Cancelada',
};

const statusColors = {
  pending: '#f1c40f',
  authorized: '#2ecc71',
  active: '#2ecc71',
  paused: '#e67e22',
  cancelled: '#e74c3c',
};

const SubscriptionsScreen = ({ navigation }) => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const headerHeight = Platform.OS === 'web' ? 32 : Math.max(40, Math.min(44, screenHeight * 0.055));
  const safeAreaTopForSpacer = Platform.OS === 'web' ? Math.max(0, insets.top) : Math.max(0, insets.top - 8);
  const headerTotalHeight = headerHeight + safeAreaTopForSpacer;
  const { user: contextUser } = useAuth();
  
  // CRITICAL: Use Firebase auth directly as fallback if AuthContext user isn't available yet
  // This handles the case where Firebase has restored auth from IndexedDB but AuthContext hasn't updated
  const user = contextUser || auth.currentUser;
  
  // Log user state when component mounts and when user changes
  useEffect(() => {
    logger.log('🔍 SubscriptionsScreen: Component mounted/updated');
    logger.log('🔍 SubscriptionsScreen: User from useAuth():', {
      hasContextUser: !!contextUser,
      contextUserId: contextUser?.uid || 'NO_UID',
      hasFirebaseUser: !!auth.currentUser,
      firebaseUserId: auth.currentUser?.uid || 'NO_UID',
      hasEffectiveUser: !!user,
      effectiveUserId: user?.uid || 'NO_UID',
      userEmail: user?.email || 'NO_EMAIL',
      userDisplayName: user?.displayName || 'NO_DISPLAY_NAME',
      userProviderId: user?.providerData?.[0]?.providerId || 'NO_PROVIDER',
      fullUserObject: user ? {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        emailVerified: user.emailVerified,
        providerId: user.providerData?.[0]?.providerId
      } : null
    });
  }, [user, contextUser]);
  
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionState, setActionState] = useState({});
  const [isInfoModalVisible, setInfoModalVisible] = useState(false);
  const [showCancelSurvey, setShowCancelSurvey] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [pendingCancelSubscription, setPendingCancelSubscription] =
    useState(null);
  const [showSubscriptionInfoModal, setShowSubscriptionInfoModal] = useState(false);

  // Create styles with current dimensions - memoized to prevent recalculation
  const styles = useMemo(
    () => createStyles(screenWidth, screenHeight, headerTotalHeight),
    [screenWidth, screenHeight, headerTotalHeight],
  );

  const createInitialSurveyAnswers = () => ({
    reason: null,
    satisfaction: null,
    resubscribeLikelihood: null,
    improvement: null,
  });
  const [cancelSurveyAnswers, setCancelSurveyAnswers] = useState(
    createInitialSurveyAnswers,
  );

  // Load all subscriptions from subscriptions collection (primary source)
  useEffect(() => {
    logger.log('🔄 SubscriptionsScreen: useEffect triggered for subscriptions loading');
    logger.log('🔄 SubscriptionsScreen: User check - hasUser:', !!user, 'hasUid:', !!user?.uid);
    
    if (!user?.uid) {
      logger.warn('⚠️ SubscriptionsScreen: No user or user.uid, setting empty subscriptions');
      setSubscriptions([]);
      setLoading(false);
      return;
    }

    logger.log('✅ SubscriptionsScreen: User.uid found:', user.uid);
    logger.log('✅ SubscriptionsScreen: Setting up Firestore listener for user:', user.uid);
    
    const subscriptionsRef = collection(
      firestore,
      'users',
      user.uid,
      'subscriptions',
    );

    const unsubscribe = onSnapshot(
      subscriptionsRef,
      async (snapshot) => {
        logger.log('📥 SubscriptionsScreen: Firestore snapshot received');
        logger.log('📥 SubscriptionsScreen: Snapshot size:', snapshot.size, 'docs');
        logger.log('📥 SubscriptionsScreen: User.uid used in query:', user.uid);
        
        const allItems = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));

        logger.log('📥 SubscriptionsScreen: All items from Firestore:', allItems.length);

        // Filter only MercadoPago subscriptions
        const mercadopagoItems = allItems
          .filter((sub) => !sub.type || sub.type === 'mercadopago')
          .map((sub) => ({
            ...sub,
            type: 'mercadopago',
          }));

        logger.log('✅ SubscriptionsScreen: MercadoPago subscriptions filtered:', mercadopagoItems.length);
        logger.log('✅ SubscriptionsScreen: Setting subscriptions state');
        
        setSubscriptions(mercadopagoItems);
        
        setLoading(false);
      },
      (error) => {
        logger.error('Error loading subscriptions:', error);
        setLoading(false);
        Alert.alert(
          'Error',
          'No se pudieron cargar tus suscripciones. Intenta más tarde.',
        );
      },
    );

    return () => unsubscribe();
  }, [user?.uid]);

  const filteredSubscriptions = useMemo(() => {
    const allowedStatuses = new Set(['active', 'authorized', 'cancelled', 'expired']);

    // Only MercadoPago subscriptions
    const allSubscriptions = [...subscriptions];

    return allSubscriptions
      .filter((subscription) =>
        allowedStatuses.has((subscription.status || '').toLowerCase()),
      )
      .sort((a, b) => {
        const aTime =
          (a.updated_at && a.updated_at.toMillis?.()) ||
          (a.created_at && a.created_at?.toDate ? a.created_at.toDate().getTime() : (a.created_at?.toMillis?.() || 0)) ||
          0;
        const bTime =
          (b.updated_at && b.updated_at.toMillis?.()) ||
          (b.created_at && b.created_at?.toDate ? b.created_at.toDate().getTime() : (b.created_at?.toMillis?.() || 0)) ||
          0;
        return bTime - aTime;
      });
  }, [subscriptions]);

  const formatDate = (value) => {
    if (!value) {
      return 'N/A';
    }

    let dateValue = value;

    if (typeof value?.toDate === 'function') {
      dateValue = value.toDate();
    } else if (typeof value === 'string') {
      dateValue = new Date(value);
    }

    if (!(dateValue instanceof Date) || Number.isNaN(dateValue.getTime())) {
      return 'N/A';
    }

    return dateValue.toLocaleDateString('es-CO', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatCurrency = (amount, currency = 'COP') => {
    if (typeof amount !== 'number') {
      return '--';
    }

    try {
      return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(amount);
    } catch (error) {
      logger.warn('Error formatting currency, falling back to string.', error);
      return `${amount} ${currency}`;
    }
  };




  const renderActions = (subscription) => {
    const currentStatus = subscription.status || 'pending';

    if (currentStatus === 'cancelled' || currentStatus === 'expired') {
      return null;
    }

    // MercadoPago subscriptions - show manage button
    const handleManageSubscription = async () => {
      // If subscription has a management URL, open it
      if (subscription.management_url) {
        try {
          const canOpen = await Linking.canOpenURL(subscription.management_url);
          if (canOpen) {
            await Linking.openURL(subscription.management_url);
          } else {
            Alert.alert('Error', 'No se pudo abrir la página de gestión de suscripciones');
          }
        } catch (error) {
          logger.error('Error opening management URL:', error);
          Alert.alert('Error', 'No se pudo abrir la página de gestión de suscripciones');
        }
      } else {
        // Fallback: Show cancel survey flow if no management URL
        handleCancelIntent(subscription);
      }
    };

    return (
      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={handleManageSubscription}
          activeOpacity={0.7}
        >
          <Text style={styles.actionButtonText}>Gestionar</Text>
        </TouchableOpacity>
      </View>
    );
  };

  // Perform action on MercadoPago subscription (cancel, pause, resume)
  const performAction = async (subscriptionId, action, options = {}) => {
    if (!user?.uid) {
      Alert.alert('Error', 'No hay usuario autenticado');
      return;
    }

    try {
      setActionState(prev => ({ ...prev, [subscriptionId]: { loading: true } }));

      const response = await fetch(
        'https://us-central1-wolf-20b8b.cloudfunctions.net/updateSubscriptionStatus',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId: user.uid,
            subscriptionId,
            action,
            survey: options.survey,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Error al procesar la acción');
      }

      Alert.alert('Éxito', 'La suscripción ha sido actualizada correctamente');
      setActionState(prev => ({ ...prev, [subscriptionId]: { loading: false } }));
    } catch (error) {
      logger.error('Error performing subscription action:', error);
      Alert.alert('Error', error.message || 'No se pudo procesar la acción');
      setActionState(prev => ({ ...prev, [subscriptionId]: { loading: false, error: error.message } }));
    }
  };

  const reasonOptions = [
    { value: 'cost', label: 'El costo es muy alto' },
    { value: 'no_time', label: 'No tengo tiempo para entrenar' },
    {
      value: 'content_not_fit',
      label: 'El contenido no se ajusta a mis objetivos',
    },
    { value: 'goals_met', label: 'Ya cumplí mis metas / no lo necesito' },
    { value: 'other', label: 'Otro motivo' },
  ];

  const satisfactionOptions = [
    { value: 'very_satisfied', label: 'Muy satisfecho(a)' },
    { value: 'satisfied', label: 'Satisfecho(a)' },
    { value: 'neutral', label: 'Neutral' },
    { value: 'unsatisfied', label: 'Insatisfecho(a)' },
    { value: 'very_unsatisfied', label: 'Muy insatisfecho(a)' },
  ];

  const resubscribeOptions = [
    { value: 'very_likely', label: 'Muy probable' },
    { value: 'likely', label: 'Probable' },
    { value: 'not_sure', label: 'No estoy seguro(a)' },
    { value: 'unlikely', label: 'Poco probable' },
    { value: 'very_unlikely', label: 'Nada probable' },
  ];

  const improvementOptions = [
    { value: 'more_variety', label: 'Más variedad en los planes' },
    { value: 'better_support', label: 'Mejor seguimiento / acompañamiento' },
    {
      value: 'integration',
      label: 'Integración con otros dispositivos / apps',
    },
    {
      value: 'faster_support',
      label: 'Soporte al cliente más ágil',
    },
    { value: 'other', label: 'Otra sugerencia' },
  ];

  const handleSurveyOptionSelect = (questionKey, optionValue) => {
    setCancelSurveyAnswers((prev) => ({
      ...prev,
      [questionKey]: prev[questionKey] === optionValue ? null : optionValue,
    }));
  };

  const isSurveyComplete =
    cancelSurveyAnswers.reason &&
    cancelSurveyAnswers.satisfaction &&
    cancelSurveyAnswers.resubscribeLikelihood &&
    cancelSurveyAnswers.improvement;

  const resetCancelFlow = () => {
    setCancelSurveyAnswers(createInitialSurveyAnswers());
    setPendingCancelSubscription(null);
    setShowCancelSurvey(false);
    setShowCancelConfirm(false);
  };

  const handleCancelIntent = (subscription) => {
    setCancelSurveyAnswers(createInitialSurveyAnswers());
    setPendingCancelSubscription(subscription);
    setShowCancelConfirm(false);
    setShowCancelSurvey(true);
  };

  const handleSurveySubmit = () => {
    if (!isSurveyComplete) return;
    setShowCancelSurvey(false);
    setShowCancelConfirm(true);
  };

  const handleCancelConfirm = () => {
    if (!pendingCancelSubscription) {
      resetCancelFlow();
      return;
    }

    logger.log('Cancel subscription survey result', {
      subscriptionId: pendingCancelSubscription.id,
      answers: cancelSurveyAnswers,
    });

    const courseId =
      pendingCancelSubscription?.course_id ||
      pendingCancelSubscription?.courseId ||
      pendingCancelSubscription?.program_id ||
      null;

    const courseTitle =
      pendingCancelSubscription?.course_title ||
      pendingCancelSubscription?.courseTitle ||
      null;

    performAction(pendingCancelSubscription.id, 'cancel', {
      survey: {
        answers: cancelSurveyAnswers,
        source: 'in_app_cancel_flow_v1',
        courseId,
        courseTitle,
        subscriptionStatusBefore: pendingCancelSubscription?.status || null,
      },
    });
    resetCancelFlow();
  };

  return (
    <SafeAreaView style={styles.container} edges={Platform.OS === 'web' ? ['left', 'right'] : ['bottom', 'left', 'right']}>
      <Modal
        visible={showCancelSurvey}
        transparent
        animationType="fade"
        onRequestClose={resetCancelFlow}
      >
        <View style={styles.infoModalOverlay}>
          <View style={styles.surveyModalContent}>
            <Text style={styles.infoModalTitle}>Ayúdanos a mejorar</Text>
            <ScrollView
              style={styles.surveyScroll}
              contentContainerStyle={styles.surveyScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.surveyQuestion}>
                <Text style={styles.surveyQuestionTitle}>
                  ¿Cuál es el motivo principal de la cancelación?
                </Text>
                {reasonOptions.map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.surveyOption,
                      cancelSurveyAnswers.reason === option.value &&
                        styles.surveyOptionSelected,
                    ]}
                    activeOpacity={0.7}
                    onPress={() => handleSurveyOptionSelect('reason', option.value)}
                  >
                    <Text
                      style={[
                        styles.surveyOptionText,
                        cancelSurveyAnswers.reason === option.value &&
                          styles.surveyOptionTextSelected,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.surveyQuestion}>
                <Text style={styles.surveyQuestionTitle}>
                  ¿Qué tan satisfecho(a) estabas con el programa?
                </Text>
                {satisfactionOptions.map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.surveyOption,
                      cancelSurveyAnswers.satisfaction === option.value &&
                        styles.surveyOptionSelected,
                    ]}
                    activeOpacity={0.7}
                    onPress={() =>
                      handleSurveyOptionSelect('satisfaction', option.value)
                    }
                  >
                    <Text
                      style={[
                        styles.surveyOptionText,
                        cancelSurveyAnswers.satisfaction === option.value &&
                          styles.surveyOptionTextSelected,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.surveyQuestion}>
                <Text style={styles.surveyQuestionTitle}>
                  ¿Qué tan probable es que vuelvas a suscribirte en el futuro?
                </Text>
                {resubscribeOptions.map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.surveyOption,
                      cancelSurveyAnswers.resubscribeLikelihood === option.value &&
                        styles.surveyOptionSelected,
                    ]}
                    activeOpacity={0.7}
                    onPress={() =>
                      handleSurveyOptionSelect('resubscribeLikelihood', option.value)
                    }
                  >
                    <Text
                      style={[
                        styles.surveyOptionText,
                        cancelSurveyAnswers.resubscribeLikelihood === option.value &&
                          styles.surveyOptionTextSelected,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.surveyQuestion}>
                <Text style={styles.surveyQuestionTitle}>
                  ¿Qué mejorarías en WAKE para continuar?
                </Text>
                {improvementOptions.map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.surveyOption,
                      cancelSurveyAnswers.improvement === option.value &&
                        styles.surveyOptionSelected,
                    ]}
                    activeOpacity={0.7}
                    onPress={() =>
                      handleSurveyOptionSelect('improvement', option.value)
                    }
                  >
                    <Text
                      style={[
                        styles.surveyOptionText,
                        cancelSurveyAnswers.improvement === option.value &&
                          styles.surveyOptionTextSelected,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <TouchableOpacity
              style={[
                styles.surveySubmitButton,
                !isSurveyComplete && styles.surveySubmitButtonDisabled,
              ]}
              activeOpacity={0.7}
              onPress={handleSurveySubmit}
              disabled={!isSurveyComplete}
            >
              <Text
                style={[
                  styles.surveySubmitButtonText,
                  !isSurveyComplete && styles.surveySubmitButtonTextDisabled,
                ]}
              >
                Enviar
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.surveyCancelButton}
              activeOpacity={0.7}
              onPress={resetCancelFlow}
            >
              <Text style={styles.surveyCancelButtonText}>Volver</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <Modal
        visible={showCancelConfirm}
        transparent
        animationType="fade"
        onRequestClose={resetCancelFlow}
      >
        <View style={styles.infoModalOverlay}>
          <View style={styles.confirmModalContent}>
            <Text style={styles.infoModalTitle}>¿Estás seguro?</Text>
            <Text style={styles.confirmModalMessage}>
              Aún tendrás acceso al programa hasta que termine el periodo de facturación actual. Después podrás reactivarla cuando quieras.
            </Text>
            <View style={styles.confirmButtonsRow}>
              <TouchableOpacity
                style={styles.confirmSecondaryButton}
                activeOpacity={0.7}
                onPress={resetCancelFlow}
              >
                <Text style={styles.confirmSecondaryButtonText}>Volver</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmPrimaryButton}
                activeOpacity={0.7}
                onPress={handleCancelConfirm}
              >
                <Text style={styles.confirmPrimaryButtonText}>Cancelar suscripción</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={isInfoModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setInfoModalVisible(false)}
      >
        <View style={styles.infoModalOverlay}>
          <View style={styles.infoModalContent}>
            <Text style={styles.infoModalTitle}>Pagos y Suscripciones</Text>
            <Text style={styles.infoModalMessage}>
              Para reembolsos, preguntas o PQRS escribe a
              {' '}
              <Text style={styles.infoModalEmail}>
                emilioloboguerrero@gmail.com
              </Text>
            </Text>
            <TouchableOpacity
              style={styles.infoModalButton}
              onPress={() => setInfoModalVisible(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.infoModalButtonText}>Entendido</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <FixedWakeHeader
        showBackButton
        onBackPress={() => navigation.goBack()}
      />
      <ScrollView contentContainerStyle={styles.contentContainer}>
        {/* Spacer for fixed header - matches header height */}
        <View style={{ height: headerTotalHeight }} />
        <View style={{ paddingTop: GAP_AFTER_HEADER }}>
        <View style={styles.titleWrapper}>
          <TouchableOpacity
            style={styles.titleButton}
            activeOpacity={0.7}
            onPress={() => setInfoModalVisible(true)}
          >
            <Text style={styles.title}>Pagos y Suscripciones</Text>
            <SvgInfo
              width={16}
              height={16}
              color="rgba(255, 255, 255, 0.6)"
              style={styles.titleIcon}
            />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#ffffff" />
            <Text style={styles.loadingText}>Cargando...</Text>
          </View>
        ) : filteredSubscriptions.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No tienes suscripciones.</Text>
            <Text style={styles.emptySubtitle}>
              Cuando suscribas un programa aparecerá aquí.
            </Text>
          </View>
        ) : (
          filteredSubscriptions.map((subscription) => {
            const statusKey = subscription.status || 'pending';
            const statusLabel = statusLabels[statusKey] || statusKey;
            const statusColor = statusColors[statusKey] || '#ffffff';

            return (
              <View key={subscription.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardHeaderLeft}>
                  <Text style={styles.courseTitle}>
                    {subscription.course_title || 'Programa'}
                  </Text>
                  </View>
                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: `${statusColor}20` },
                      { borderColor: statusColor },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusText,
                        { color: statusColor },
                      ]}
                    >
                      {statusLabel}
                    </Text>
                  </View>
                </View>

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Monto:</Text>
                  <Text style={styles.infoValue}>
                    {formatCurrency(
                      subscription.transaction_amount,
                      subscription.currency_id || 'COP',
                    )}
                  </Text>
                </View>

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Email de pago:</Text>
                  <Text style={styles.infoValue}>
                    {subscription.payer_email || 'No disponible'}
                  </Text>
                </View>

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Creada:</Text>
                  <Text style={styles.infoValue}>
                    {formatDate(subscription.created_at)}
                  </Text>
                </View>

                {subscription.renewal_date && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Fecha de renovación:</Text>
                    <Text style={styles.infoValue}>
                      {formatDate(subscription.renewal_date)}
                    </Text>
                  </View>
                )}
                {subscription.expires_at && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Fecha de expiración:</Text>
                    <Text style={styles.infoValue}>
                      {formatDate(subscription.expires_at)}
                    </Text>
                  </View>
                )}
                {!subscription.renewal_date && !subscription.expires_at && subscription.next_billing_date && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Próximo cobro:</Text>
                  <Text style={styles.infoValue}>
                    {formatDate(subscription.next_billing_date)}
                  </Text>
                </View>
                )}

                {renderActions(subscription)}
              </View>
            );
          })
        )}

        <BottomSpacer />
        </View>
      </ScrollView>

      {/* Subscription Management Info Modal */}
      <Modal
        visible={showSubscriptionInfoModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowSubscriptionInfoModal(false)}
      >
        <View style={styles.subscriptionInfoModalOverlay}>
          <TouchableOpacity 
            style={styles.subscriptionInfoModalBackdrop}
            activeOpacity={1}
            onPress={() => setShowSubscriptionInfoModal(false)}
          />
          <View style={styles.subscriptionInfoModalContent}>
            <View style={styles.subscriptionInfoModalHeader}>
              <Text style={styles.subscriptionInfoModalTitle}>Información</Text>
              <TouchableOpacity 
                style={styles.subscriptionInfoCloseButton}
                onPress={() => setShowSubscriptionInfoModal(false)}
              >
                <Text style={styles.subscriptionInfoCloseButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <View style={styles.subscriptionInfoScrollContainer}>
              <ScrollView 
                style={styles.subscriptionInfoScrollView}
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.subscriptionInfoModalDescription}>
                  Las suscripciones de MercadoPago se pueden gestionar desde aquí.{'\n\n'}
                  Para cancelar tu suscripción, usa el botón "Gestionar" y completa el formulario.{'\n\n'}
                  El acceso a los programas disponibles en tu biblioteca corresponde únicamente a contenido adquirido previamente.
                </Text>
              </ScrollView>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const createStyles = (screenWidth, screenHeight, headerTotalHeight) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  contentContainer: {
    paddingHorizontal: 0,
    paddingTop: 0, // No extra padding - spacer handles it
    paddingBottom: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
  },
  titleWrapper: {
    paddingHorizontal: 40,
    marginTop: 0, // No margin - spacer positions it correctly
    marginBottom: 24,
  },
  titleButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  titleIcon: {
    marginLeft: 8,
  },
  restorePurchasesContainer: {
    marginTop: 30,
    marginBottom: 20,
    paddingHorizontal: 24,
  },
  restorePurchasesButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  restorePurchasesButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 60,
  },
  loadingText: {
    marginTop: 12,
    color: '#cccccc',
  },
  emptyState: {
    alignItems: 'center',
    marginTop: 80,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptySubtitle: {
    color: '#999999',
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#2a2a2a',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    marginHorizontal: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
    overflow: 'visible',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  cardHeaderLeft: {
    flex: 1,
    marginRight: 12,
  },
  courseTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  subscriptionTypeBadge: {
    color: '#cccccc',
    fontSize: 12,
    fontWeight: '500',
  },
  statusBadge: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  infoLabel: {
    color: '#bbbbbb',
    fontSize: 14,
  },
  infoValue: {
    color: '#ffffff',
    fontSize: 14,
    maxWidth: '60%',
    textAlign: 'right',
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  actionButton: {
    flex: 1,
    marginHorizontal: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  actionButtonPrimary: {
    backgroundColor: 'rgba(191, 168, 77, 0.2)',
    borderColor: 'rgba(191, 168, 77, 0.5)',
  },
  actionButtonDisabled: {
    opacity: 0.6,
  },
  actionButtonText: {
    color: 'rgba(191, 168, 77, 1)',
    fontWeight: '600',
    fontSize: 14,
  },
  actionButtonTextSecondary: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 14,
  },
  infoModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  infoModalContent: {
    backgroundColor: '#2a2a2a',
    borderRadius: 20,
    paddingVertical: 24,
    paddingHorizontal: 24,
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  infoModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 12,
  },
  infoModalMessage: {
    fontSize: 14,
    color: '#cccccc',
    lineHeight: 20,
    marginBottom: 20,
  },
  infoModalEmail: {
    color: '#ffffff',
    fontWeight: '600',
  },
  infoModalButton: {
    backgroundColor: 'rgba(191, 168, 77, 0.2)',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(191, 168, 77, 0.5)',
  },
  infoModalButtonText: {
    color: 'rgba(191, 168, 77, 1)',
    fontWeight: '600',
  },
  surveyModalContent: {
    backgroundColor: '#2a2a2a',
    borderRadius: 20,
    paddingVertical: 24,
    paddingHorizontal: 24,
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    maxHeight: '85%',
  },
  surveyScroll: {
    flexGrow: 0,
  },
  surveyScrollContent: {
    paddingBottom: 16,
  },
  surveyQuestion: {
    marginBottom: 20,
  },
  surveyQuestionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 12,
  },
  surveyOption: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    marginBottom: 8,
    backgroundColor: '#2a2a2a',
  },
  surveyOptionSelected: {
    borderColor: 'rgba(191, 168, 77, 0.8)',
    backgroundColor: 'rgba(191, 168, 77, 0.12)',
  },
  surveyOptionText: {
    color: '#cccccc',
    fontSize: 14,
  },
  surveyOptionTextSelected: {
    color: 'rgba(191, 168, 77, 1)',
    fontWeight: '600',
  },
  surveySubmitButton: {
    backgroundColor: 'rgba(191, 168, 77, 0.2)',
    height: Math.max(44, screenHeight * 0.05),
    width: Math.max(160, screenWidth * 0.4),
    borderRadius: Math.max(10, screenWidth * 0.035),
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginTop: 16,
  },
  surveySubmitButtonDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowOpacity: 0,
    elevation: 0,
  },
  surveySubmitButtonText: {
    color: 'rgba(191, 168, 77, 1)',
    fontSize: 16,
    fontWeight: '600',
  },
  surveySubmitButtonTextDisabled: {
    color: 'rgba(255, 255, 255, 0.5)',
  },
  surveyCancelButton: {
    backgroundColor: 'transparent',
    height: Math.max(44, screenHeight * 0.05),
    width: Math.max(160, screenWidth * 0.4),
    borderRadius: Math.max(10, screenWidth * 0.035),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    alignSelf: 'center',
  },
  surveyCancelButtonText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 14,
    fontWeight: '500',
  },
  confirmModalContent: {
    backgroundColor: '#2a2a2a',
    borderRadius: 20,
    paddingVertical: 24,
    paddingHorizontal: 24,
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  confirmModalMessage: {
    fontSize: 14,
    color: '#cccccc',
    lineHeight: 20,
    marginTop: 12,
    marginBottom: 24,
  },
  confirmButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmSecondaryButton: {
    flex: 1,
    height: Math.max(44, screenHeight * 0.05),
    borderRadius: Math.max(10, screenWidth * 0.035),
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    backgroundColor: '#2a2a2a',
    marginRight: 12,
  },
  confirmSecondaryButtonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 14,
  },
  confirmPrimaryButton: {
    flex: 1,
    height: Math.max(44, screenHeight * 0.05),
    borderRadius: Math.max(10, screenWidth * 0.035),
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    backgroundColor: '#c0392b',
  },
  confirmPrimaryButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
    textAlign: 'center',
  },
  // Subscription Info Modal Styles
  subscriptionInfoModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  subscriptionInfoModalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  subscriptionInfoModalContent: {
    backgroundColor: '#2a2a2a',
    borderRadius: Math.max(12, screenWidth * 0.04),
    width: Math.max(350, screenWidth * 0.9),
    maxWidth: 400,
    height: Math.max(300, screenHeight * 0.4),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
    overflow: 'visible',
    padding: Math.max(24, screenWidth * 0.06),
  },
  subscriptionInfoScrollContainer: {
    flex: 1,
    position: 'relative',
  },
  subscriptionInfoScrollView: {
    flex: 1,
  },
  subscriptionInfoModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Math.max(16, screenHeight * 0.02),
  },
  subscriptionInfoModalTitle: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.06, 24),
    fontWeight: '600',
  },
  subscriptionInfoCloseButton: {
    width: Math.max(30, screenWidth * 0.075),
    height: Math.max(30, screenWidth * 0.075),
    borderRadius: Math.max(15, screenWidth * 0.037),
    backgroundColor: '#44454B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  subscriptionInfoCloseButtonText: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.04, 16),
    fontWeight: '600',
  },
  subscriptionInfoModalDescription: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.045, 18),
    fontWeight: '400',
    lineHeight: Math.max(24, screenHeight * 0.03),
    textAlign: 'left',
  },
});

export { SubscriptionsScreen as SubscriptionsScreenBase };
export default SubscriptionsScreen;

