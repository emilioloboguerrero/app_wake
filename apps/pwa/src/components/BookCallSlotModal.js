import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Modal, TouchableOpacity, Text, ActivityIndicator, ScrollView, StyleSheet, Animated, TouchableWithoutFeedback } from 'react-native';
import { useWindowDimensions } from 'react-native';
import { getAvailableSlots, createBooking, cancelBooking } from '../services/callBookingService';
import WakeLoader from './WakeLoader';
import SvgChevronLeft from './icons/vectors_fig/Arrow/ChevronLeft';

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function formatDateLabel(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const dayName = DAYS[date.getDay()];
  return `${dayName}, ${d} ${MONTHS[m - 1]} ${y}`;
}

function formatSlotTime(utcIso) {
  const d = new Date(utcIso);
  return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false });
}

const ANIM_DURATION = 300;

export default function BookCallSlotModal({ visible, onClose, creatorId, creatorName, courseId, clientUserId, existingBooking, onSuccess }) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [isClosing, setIsClosing] = useState(false);
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const panelTranslateY = useRef(new Animated.Value(800)).current;

  const [loading, setLoading] = useState(false);
  const [booking, setBooking] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState(null);
  const [dates, setDates] = useState([]);
  const [slotsByDate, setSlotsByDate] = useState({});
  const [expandedDate, setExpandedDate] = useState(null);
  const [rescheduleMode, setRescheduleMode] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const isManageMode = existingBooking && new Date(existingBooking.slotEndUtc) > new Date();

  const fetchSlots = useCallback(async () => {
    if (!creatorId) return;
    setLoading(true);
    setError(null);
    setDates([]);
    setSlotsByDate({});
    setExpandedDate(null);
    try {
      const today = new Date();
      const fromStr = today.toISOString().slice(0, 10);
      const toDate = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);
      const toStr = toDate.toISOString().slice(0, 10);
      const result = await getAvailableSlots(creatorId, fromStr, toStr);
      setDates(result.dates);
      setSlotsByDate(result.slotsByDate);
    } catch (e) {
      setError(e?.message || 'No se pudieron cargar los horarios.');
    } finally {
      setLoading(false);
    }
  }, [creatorId]);

  useEffect(() => {
    if (visible && creatorId) {
      fetchSlots();
    }
  }, [visible, creatorId, fetchSlots]);

  useEffect(() => {
    if (visible && isManageMode) {
      setRescheduleMode(false);
    }
  }, [visible, isManageMode]);

  // Open animation: panel slides up from bottom (only when becoming visible)
  const prevVisibleRef = useRef(false);
  useEffect(() => {
    const justOpened = visible && !prevVisibleRef.current && !isClosing;
    prevVisibleRef.current = visible;
    if (justOpened) {
      overlayOpacity.setValue(0);
      panelTranslateY.setValue(screenHeight);
      Animated.parallel([
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: ANIM_DURATION,
          useNativeDriver: true,
        }),
        Animated.timing(panelTranslateY, {
          toValue: 0,
          duration: ANIM_DURATION,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, isClosing, screenHeight, overlayOpacity, panelTranslateY]);

  const handleCloseRequest = useCallback(() => {
    setIsClosing(true);
    Animated.parallel([
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: ANIM_DURATION,
        useNativeDriver: true,
      }),
      Animated.timing(panelTranslateY, {
        toValue: screenHeight,
        duration: ANIM_DURATION,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setIsClosing(false);
      onClose();
    });
  }, [onClose, overlayOpacity, panelTranslateY, screenHeight]);

  const handleConfirmSlot = async (slot) => {
    if (!clientUserId || !creatorId || booking) return;
    setBooking(true);
    setError(null);
    try {
      if (isManageMode && existingBooking?.id) {
        const cancelRes = await cancelBooking(existingBooking.id);
        if (!cancelRes.success) {
          setError(cancelRes.error || 'No se pudo liberar la reserva anterior.');
          return;
        }
      }
      const result = await createBooking(
        creatorId,
        clientUserId,
        slot.startUtc,
        slot.endUtc,
        courseId
      );
      if (result.success) {
        onSuccess?.();
        handleCloseRequest();
      } else {
        setError(result.error || 'No se pudo reservar.');
      }
    } catch (e) {
      setError(e?.message || 'Error al reservar.');
    } finally {
      setBooking(false);
    }
  };

  const runCancelBooking = async () => {
    if (!existingBooking?.id || cancelling) return;
    setCancelling(true);
    setError(null);
    try {
      const res = await cancelBooking(existingBooking.id);
      if (res.success) {
        onSuccess?.();
        handleCloseRequest();
      } else {
        setError(res.error || 'No se pudo cancelar.');
      }
    } catch (e) {
      setError(e?.message || 'Error al cancelar.');
    } finally {
      setCancelling(false);
    }
  };

  const handleCancelReservation = () => {
    setShowCancelConfirm(true);
  };

  const handleConfirmCancel = () => {
    setShowCancelConfirm(false);
    runCancelBooking();
  };

  if (!visible && !isClosing) return null;

  const styles = createStyles(screenWidth, screenHeight);

  const toggleDate = (dateStr) => {
    setExpandedDate((prev) => (prev === dateStr ? null : dateStr));
  };

  return (
    <Modal
      visible={visible || isClosing}
      transparent
      animationType="none"
      onRequestClose={handleCloseRequest}
    >
      <TouchableWithoutFeedback onPress={handleCloseRequest} accessible={false}>
        <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()} accessible={false}>
            <Animated.View
              style={[
                styles.panel,
                { transform: [{ translateY: panelTranslateY }] },
              ]}
            >
              <View style={styles.header}>
                <Text style={styles.title} numberOfLines={2}>
                  {isManageMode ? (
                    'Manejar reserva'
                  ) : creatorName ? (
                    [
                      <Text key="prefix" style={styles.titlePrefix}>Agenda una llamada con </Text>,
                      <Text key="name" style={styles.titleName}>{creatorName}</Text>,
                    ]
                  ) : (
                    'Agendar llamada'
                  )}
                </Text>
                <TouchableOpacity onPress={handleCloseRequest} style={styles.closeBtn} hitSlop={12}>
                  <Text style={styles.closeText}>×</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.content}>
                {loading && !isManageMode ? (
                  <View style={styles.loadingWrap}>
                    <WakeLoader />
                  </View>
                ) : error ? (
                  <View style={styles.errorWrap}>
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : isManageMode && !rescheduleMode ? (
                  <View style={styles.manageSection}>
                    <Text style={styles.manageCurrentLabel}>
                      Tu llamada está agendada para{' '}
                      <Text style={styles.manageCurrentLabelBold}>
                        {existingBooking?.slotStartUtc ? formatDateLabel(existingBooking.slotStartUtc.slice(0, 10)) : ''}
                      </Text>
                      {' '}a las{' '}
                      <Text style={styles.manageCurrentLabelBold}>
                        {existingBooking?.slotStartUtc ? formatSlotTime(existingBooking.slotStartUtc) : ''}
                      </Text>
                      .
                    </Text>
                    <TouchableOpacity
                      style={[styles.manageButton, styles.manageButtonSecondary]}
                      onPress={handleCancelReservation}
                      disabled={cancelling}
                    >
                      {cancelling ? (
                        <ActivityIndicator size="small" color="#ffffff" />
                      ) : (
                        <Text style={styles.manageButtonTextSecondary}>Cancelar reserva</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.manageButton, styles.manageButtonPrimary]}
                      onPress={() => setRescheduleMode(true)}
                    >
                      <Text style={styles.manageButtonTextPrimary}>Cambiar horario</Text>
                    </TouchableOpacity>
                  </View>
                ) : isManageMode && rescheduleMode && loading ? (
                  <View style={styles.loadingWrap}>
                    <WakeLoader />
                  </View>
                ) : isManageMode && rescheduleMode && dates.length === 0 ? (
                  <Text style={styles.emptyText}>No hay horarios disponibles en las próximas dos semanas.</Text>
                ) : isManageMode && rescheduleMode ? (
                  <>
                    <TouchableOpacity style={styles.backToManage} onPress={() => setRescheduleMode(false)}>
                      <Text style={styles.backToManageText}>← Volver</Text>
                    </TouchableOpacity>
                    <Text style={styles.sectionLabel}>Elige una nueva fecha</Text>
                    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
                      {dates.map((dateStr) => {
                        const isExpanded = expandedDate === dateStr;
                        const slots = slotsByDate[dateStr] || [];
                        return (
                          <View key={dateStr} style={styles.dateCard}>
                            <TouchableOpacity
                              style={styles.dateCardRow}
                              onPress={() => toggleDate(dateStr)}
                              activeOpacity={0.7}
                            >
                              <View style={styles.dateCardContent}>
                                <Text style={styles.dateCardTitle}>{formatDateLabel(dateStr)}</Text>
                                <Text style={styles.dateCardSub}>{slots.length} horario(s)</Text>
                              </View>
                              <SvgChevronLeft
                                width={20}
                                height={20}
                                stroke="rgba(191, 168, 77, 1)"
                                style={[styles.dateCardChevron, !isExpanded && styles.chevronRight, isExpanded && styles.chevronDown]}
                              />
                            </TouchableOpacity>
                            {isExpanded && (
                              <View style={styles.slotsContainer}>
                                {slots.map((slot, index) => (
                                  <TouchableOpacity
                                    key={index}
                                    style={styles.slotItem}
                                    onPress={() => handleConfirmSlot(slot)}
                                    disabled={booking}
                                    activeOpacity={0.7}
                                  >
                                    <Text style={styles.slotItemText}>
                                      {formatSlotTime(slot.startUtc)} – {formatSlotTime(slot.endUtc)}
                                    </Text>
                                    {booking ? (
                                      <ActivityIndicator size="small" color="#ffffff" />
                                    ) : (
                                      <View style={styles.slotItemCtaWrap}>
                                        <Text style={styles.slotItemCta}>Reservar</Text>
                                      </View>
                                    )}
                                  </TouchableOpacity>
                                ))}
                              </View>
                            )}
                          </View>
                        );
                      })}
                    </ScrollView>
                  </>
                ) : !isManageMode && dates.length === 0 ? (
                  <Text style={styles.emptyText}>No hay horarios disponibles en las próximas dos semanas.</Text>
                ) : (
                  <>
                    <Text style={styles.sectionLabel}>Elige una fecha</Text>
                    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
                      {dates.map((dateStr) => {
                        const isExpanded = expandedDate === dateStr;
                        const slots = slotsByDate[dateStr] || [];
                        return (
                          <View key={dateStr} style={styles.dateCard}>
                            <TouchableOpacity
                              style={styles.dateCardRow}
                              onPress={() => toggleDate(dateStr)}
                              activeOpacity={0.7}
                            >
                              <View style={styles.dateCardContent}>
                                <Text style={styles.dateCardTitle}>{formatDateLabel(dateStr)}</Text>
                                <Text style={styles.dateCardSub}>
                                  {slots.length} horario(s)
                                </Text>
                              </View>
                              <SvgChevronLeft
                                width={20}
                                height={20}
                                stroke="rgba(191, 168, 77, 1)"
                                style={[styles.dateCardChevron, !isExpanded && styles.chevronRight, isExpanded && styles.chevronDown]}
                              />
                            </TouchableOpacity>
                            {isExpanded && (
                              <View style={styles.slotsContainer}>
                                {slots.map((slot, index) => (
                                  <TouchableOpacity
                                    key={index}
                                    style={styles.slotItem}
                                    onPress={() => handleConfirmSlot(slot)}
                                    disabled={booking}
                                    activeOpacity={0.7}
                                  >
                                    <Text style={styles.slotItemText}>
                                      {formatSlotTime(slot.startUtc)} – {formatSlotTime(slot.endUtc)}
                                    </Text>
                                    {booking ? (
                                      <ActivityIndicator size="small" color="#ffffff" />
                                    ) : (
                                      <View style={styles.slotItemCtaWrap}>
                                        <Text style={styles.slotItemCta}>Reservar</Text>
                                      </View>
                                    )}
                                  </TouchableOpacity>
                                ))}
                              </View>
                            )}
                          </View>
                        );
                      })}
                    </ScrollView>
                  </>
                )}
              </View>
            </Animated.View>
          </TouchableWithoutFeedback>

          {showCancelConfirm && (
            <View style={styles.cancelConfirmOverlay}>
              <TouchableWithoutFeedback onPress={() => setShowCancelConfirm(false)}>
                <View style={StyleSheet.absoluteFill} />
              </TouchableWithoutFeedback>
              <View style={styles.cancelConfirmCard}>
                <Text style={styles.cancelConfirmTitle}>Cancelar reserva</Text>
                <Text style={styles.cancelConfirmMessage}>
                  ¿Estás seguro de que quieres cancelar tu llamada agendada? Podrás agendar otra después.
                </Text>
                <View style={styles.cancelConfirmButtons}>
                  <TouchableOpacity
                    style={[styles.cancelConfirmBtn, styles.cancelConfirmBtnSecondary]}
                    onPress={() => setShowCancelConfirm(false)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.cancelConfirmBtnTextSecondary}>No</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.cancelConfirmBtn, styles.cancelConfirmBtnPrimary]}
                    onPress={handleConfirmCancel}
                    disabled={cancelling}
                    activeOpacity={0.7}
                  >
                    {cancelling ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Text style={styles.cancelConfirmBtnTextPrimary}>Sí, cancelar</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        </Animated.View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

function createStyles(screenWidth, screenHeight) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'flex-end',
    },
    panel: {
      width: '100%',
      minHeight: '55%',
      maxHeight: '95%',
      backgroundColor: '#2a2a2a',
      borderTopLeftRadius: Math.max(20, screenWidth * 0.05),
      borderTopRightRadius: Math.max(20, screenWidth * 0.05),
      overflow: 'hidden',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 24,
    },
    title: {
      fontSize: 22,
      color: '#ffffff',
      flex: 1,
    },
    titlePrefix: {
      fontSize: 22,
      fontWeight: '400',
      color: '#ffffff',
    },
    titleName: {
      fontSize: 22,
      fontWeight: '700',
      color: '#ffffff',
    },
    closeBtn: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    closeText: {
      fontSize: 28,
      color: '#ffffff',
      lineHeight: 32,
    },
    content: {
      padding: 24,
      minHeight: 200,
    },
    loadingWrap: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 40,
      minHeight: 160,
    },
    loadingText: {
      fontSize: 14,
      color: 'rgba(255,255,255,0.7)',
      marginTop: 12,
    },
    errorWrap: {
      paddingVertical: 20,
    },
    errorText: {
      fontSize: 14,
      color: '#f8a0a0',
    },
    emptyText: {
      fontSize: 14,
      color: 'rgba(255,255,255,0.7)',
      textAlign: 'center',
      paddingVertical: 20,
    },
    manageSection: {
      paddingVertical: 8,
    },
    manageCurrentLabel: {
      fontSize: 16,
      color: 'rgba(255,255,255,0.9)',
      marginBottom: 24,
      paddingLeft: 8,
      lineHeight: 24,
    },
    manageCurrentLabelBold: {
      fontWeight: '700',
      color: 'rgba(255,255,255,0.95)',
    },
    manageButton: {
      marginBottom: 12,
      paddingVertical: 14,
      paddingHorizontal: 20,
      borderRadius: Math.max(12, screenWidth * 0.04),
      alignItems: 'center',
    },
    manageButtonPrimary: {
      backgroundColor: 'rgba(191, 168, 77, 0.25)',
      borderWidth: 1,
      borderColor: 'rgba(191, 168, 77, 0.6)',
    },
    manageButtonSecondary: {
      backgroundColor: 'rgba(255, 255, 255, 0.05)',
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.2)',
    },
    manageButtonTextPrimary: {
      fontSize: 16,
      fontWeight: '600',
      color: '#ffffff',
    },
    manageButtonTextSecondary: {
      fontSize: 16,
      fontWeight: '600',
      color: 'rgba(255,255,255,0.9)',
    },
    cancelConfirmOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    cancelConfirmCard: {
      width: '100%',
      maxWidth: 340,
      backgroundColor: '#333333',
      borderRadius: Math.max(16, screenWidth * 0.04),
      padding: 24,
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    cancelConfirmTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: '#ffffff',
      marginBottom: 12,
    },
    cancelConfirmMessage: {
      fontSize: 15,
      color: 'rgba(255,255,255,0.85)',
      lineHeight: 22,
      marginBottom: 24,
    },
    cancelConfirmButtons: {
      flexDirection: 'row',
      gap: 12,
      justifyContent: 'center',
    },
    cancelConfirmBtn: {
      paddingVertical: 12,
      paddingHorizontal: 20,
      borderRadius: Math.max(10, screenWidth * 0.025),
      minWidth: 100,
      alignItems: 'center',
    },
    cancelConfirmBtnSecondary: {
      backgroundColor: 'rgba(255, 255, 255, 0.08)',
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.2)',
    },
    cancelConfirmBtnPrimary: {
      backgroundColor: 'rgba(200, 80, 80, 0.9)',
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.15)',
    },
    cancelConfirmBtnTextSecondary: {
      fontSize: 15,
      fontWeight: '600',
      color: 'rgba(255,255,255,0.9)',
    },
    cancelConfirmBtnTextPrimary: {
      fontSize: 15,
      fontWeight: '600',
      color: '#ffffff',
    },
    backToManage: {
      marginBottom: 12,
    },
    backToManageText: {
      fontSize: 14,
      color: 'rgba(191, 168, 77, 0.95)',
    },
    sectionLabel: {
      fontSize: 15,
      fontWeight: '600',
      color: 'rgba(255,255,255,0.95)',
      marginBottom: 4,
      paddingLeft: 8,
    },
    sectionHint: {
      fontSize: 13,
      color: 'rgba(255,255,255,0.65)',
      marginBottom: 12,
    },
    scroll: {
      maxHeight: 400,
    },
    scrollContent: {
      paddingVertical: 8,
    },
    dateCard: {
      backgroundColor: '#333333',
      borderRadius: Math.max(12, screenWidth * 0.04),
      marginBottom: Math.max(16, screenHeight * 0.02),
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.2)',
      shadowColor: 'rgba(255, 255, 255, 0.4)',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 1,
      shadowRadius: 2,
      elevation: 2,
      overflow: 'visible',
    },
    dateCardRow: {
      flexDirection: 'row',
      paddingHorizontal: Math.max(20, screenWidth * 0.05),
      alignItems: 'center',
      minHeight: Math.max(60, screenHeight * 0.075),
    },
    dateCardContent: {
      flex: 1,
    },
    dateCardTitle: {
      fontSize: Math.min(screenWidth * 0.04, 16),
      fontWeight: '600',
      color: '#ffffff',
    },
    dateCardSub: {
      fontSize: Math.min(screenWidth * 0.03, 12),
      fontWeight: '400',
      color: 'rgba(255,255,255,0.8)',
      marginTop: 2,
    },
    dateCardChevron: {},
    chevronRight: {
      transform: [{ rotate: '180deg' }],
    },
    chevronDown: {
      transform: [{ rotate: '270deg' }],
    },
    slotsContainer: {
      paddingHorizontal: Math.max(20, screenWidth * 0.05),
      paddingTop: 12,
      paddingBottom: Math.max(16, screenHeight * 0.02),
    },
    slotItem: {
      marginBottom: 8,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: 'rgba(255,255,255,0.05)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.1)',
      borderRadius: 8,
      padding: 16,
    },
    slotItemText: {
      fontSize: 15,
      color: '#ffffff',
    },
    slotItemCtaWrap: {
      backgroundColor: 'rgba(255, 255, 255, 0.05)',
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: Math.max(12, screenWidth * 0.04),
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.1)',
      shadowColor: 'rgba(255, 255, 255, 0.4)',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 1,
      shadowRadius: 2,
      elevation: 2,
      alignItems: 'center',
    },
    slotItemCta: {
      fontSize: 14,
      fontWeight: '600',
      color: '#ffffff',
    },
  });
}
