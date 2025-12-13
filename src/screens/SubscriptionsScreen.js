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
  Dimensions,
} from 'react-native';
import { collection, onSnapshot } from 'firebase/firestore';
import { firestore } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import logger from '../utils/logger';
import { FixedWakeHeader, WakeHeaderSpacer } from '../components/WakeHeader';
import SvgInfo from '../components/icons/SvgInfo';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');


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
  const { user } = useAuth();
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionState, setActionState] = useState({});
  const [isInfoModalVisible, setInfoModalVisible] = useState(false);
  const [showCancelSurvey, setShowCancelSurvey] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [pendingCancelSubscription, setPendingCancelSubscription] =
    useState(null);
  const [showSubscriptionInfoModal, setShowSubscriptionInfoModal] = useState(false);

  const createInitialSurveyAnswers = () => ({
    reason: null,
    satisfaction: null,
    resubscribeLikelihood: null,
    improvement: null,
  });
  const [cancelSurveyAnswers, setCancelSurveyAnswers] = useState(
    createInitialSurveyAnswers,
  );

  useEffect(() => {
    if (!user?.uid) {
      setSubscriptions([]);
      setLoading(false);
      return;
    }

    const subscriptionsRef = collection(
      firestore,
      'users',
      user.uid,
      'subscriptions',
    );

    const unsubscribe = onSnapshot(
      subscriptionsRef,
      (snapshot) => {
        const items = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
        setSubscriptions(items);
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
    const allowedStatuses = new Set(['active', 'authorized', 'cancelled']);

    return [...subscriptions]
      .filter((subscription) =>
        allowedStatuses.has((subscription.status || '').toLowerCase()),
      )
      .sort((a, b) => {
        const aTime =
          (a.updated_at && a.updated_at.toMillis?.()) ||
          (a.created_at && a.created_at.toMillis?.()) ||
          0;
        const bTime =
          (b.updated_at && b.updated_at.toMillis?.()) ||
          (b.created_at && b.created_at.toMillis?.()) ||
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

    if (currentStatus === 'cancelled') {
      return null;
    }

    // Disabled: Show single button that opens info modal instead of action buttons
    return (
      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => setShowSubscriptionInfoModal(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.actionButtonText}>Gestionar</Text>
        </TouchableOpacity>
      </View>
    );
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
    <SafeAreaView style={styles.container}>
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
      <WakeHeaderSpacer />
      <ScrollView contentContainerStyle={styles.contentContainer}>
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
                  <Text style={styles.courseTitle}>
                    {subscription.course_title || 'Programa'}
                  </Text>
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

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Próximo cobro:</Text>
                  <Text style={styles.infoValue}>
                    {formatDate(subscription.next_billing_date)}
                  </Text>
                </View>

                {renderActions(subscription)}
              </View>
            );
          })
        )}
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
                  Las suscripciones y compras no se administran dentro de la app.{'\n\n'}
                  El acceso a los programas disponibles en tu biblioteca corresponde únicamente a contenido adquirido previamente fuera de Wake.
                </Text>
              </ScrollView>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  contentContainer: {
    paddingHorizontal: 0,
    paddingTop: 32,
    paddingBottom: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
  },
  titleWrapper: {
    paddingHorizontal: 40,
    marginBottom: 24,
  },
  titleButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  titleIcon: {
    marginLeft: 8,
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
  courseTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
    marginRight: 12,
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
    backgroundColor: '#2a2a2a',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
  },
  actionButtonDisabled: {
    opacity: 0.6,
  },
  actionButtonText: {
    color: '#ffffff',
    fontWeight: '600',
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
    backgroundColor: '#3a3a3a',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  infoModalButtonText: {
    color: '#ffffff',
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

export default SubscriptionsScreen;

