import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { STALE_TIMES } from '../config/queryConfig';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  Linking,
  useWindowDimensions,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image as ExpoImage } from 'expo-image';
import Text from '../components/Text';
import { FixedWakeHeader, WakeHeaderSpacer, WakeHeaderContent } from '../components/WakeHeader';
import BottomSpacer from '../components/BottomSpacer';
import LoadingSpinner from '../components/LoadingSpinner';
import { getBookingById } from '../services/callBookingService';
import firestoreService from '../services/firestoreService';
import profilePictureService from '../services/profilePictureService';

const GOLD_ACCENT = 'rgba(255, 255, 255, 1)';
const GOLD_ACCENT_15 = 'rgba(255, 255, 255, 0.15)';
const GOLD_ACCENT_25 = 'rgba(255, 255, 255, 0.25)';
const CARD_BG = 'rgba(255, 255, 255, 0.06)';
const CARD_BORDER = 'rgba(255, 255, 255, 0.12)';
const LABEL_COLOR = 'rgba(255, 255, 255, 0.55)';
const TEXT_PRIMARY = 'rgba(255, 255, 255, 0.95)';

const copyToClipboard = async (text) => {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }
  if (typeof document !== 'undefined') {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
    } finally {
      document.body.removeChild(ta);
    }
    return Promise.resolve();
  }
  return Promise.reject(new Error('Clipboard not available'));
};

const UpcomingCallDetailScreen = ({ navigation, route }) => {
  const { width: screenWidth } = useWindowDimensions();
  const { booking: paramBooking, creatorName: paramCreatorName, course: paramCourse, bookingId } = route.params || {};

  const screenAnim = useRef(new Animated.Value(0)).current;
  const card1Anim = useRef(new Animated.Value(0)).current;
  const card2Anim = useRef(new Animated.Value(0)).current;
  const card3Anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.stagger(80, [
      Animated.timing(screenAnim, { toValue: 1, duration: 420, useNativeDriver: true }),
      Animated.timing(card1Anim, { toValue: 1, duration: 380, useNativeDriver: true }),
      Animated.timing(card2Anim, { toValue: 1, duration: 380, useNativeDriver: true }),
      Animated.timing(card3Anim, { toValue: 1, duration: 380, useNativeDriver: true }),
    ]).start();
  }, []);

  const [copied, setCopied] = useState(false);

  const { data, isLoading: loading, isError, error: fetchError } = useQuery({
    queryKey: ['booking', bookingId ?? 'from-params', paramBooking?.id],
    queryFn: async () => {
      if (paramBooking) {
        let creatorProfileUrl = null;
        if (paramBooking.creatorId) {
          creatorProfileUrl = await profilePictureService.getProfilePictureUrl(paramBooking.creatorId).catch(() => null);
        }
        return {
          booking: paramBooking,
          creatorName: paramCreatorName || null,
          courseName: paramCourse?.name || paramCourse?.title || null,
          courseImageUrl: paramCourse?.image_url || paramCourse?.imageUrl || null,
          creatorProfileUrl,
        };
      }
      if (!bookingId) throw new Error('No hay datos de la reserva.');
      const b = await getBookingById(bookingId);
      if (!b) throw new Error('No se encontró la reserva o ya ha pasado.');
      let cn = null, cName = null, cImg = null, creatorProfileUrl = null;
      if (b.courseId) {
        const course = await firestoreService.getCourse(b.courseId).catch(() => null);
        cn = course?.creatorName || course?.creator_name || null;
        cName = course?.name || course?.title || null;
        cImg = course?.image_url || course?.imageUrl || null;
      }
      if (b.creatorId) {
        creatorProfileUrl = await profilePictureService.getProfilePictureUrl(b.creatorId).catch(() => null);
      }
      return { booking: b, creatorName: cn, courseName: cName, courseImageUrl: cImg, creatorProfileUrl };
    },
    enabled: !!paramBooking || !!bookingId,
    staleTime: STALE_TIMES.userProfile,
  });

  const booking = data?.booking ?? null;
  const creatorName = data?.creatorName ?? null;
  const creatorProfileUrl = data?.creatorProfileUrl ?? null;
  const courseName = data?.courseName ?? null;
  const courseImageUrl = data?.courseImageUrl ?? null;
  const error = isError ? (fetchError?.message || 'Error al cargar la reserva.') : null;

  const callLink = booking?.callLink && String(booking.callLink).trim() ? String(booking.callLink).trim() : null;

  const handleCopyLink = useCallback(async () => {
    if (!callLink) return;
    try {
      await copyToClipboard(callLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }, [callLink]);

  const handleOpenCallLink = useCallback(() => {
    if (callLink) {
      Linking.openURL(callLink).catch(() => {});
    }
  }, [callLink]);

  const displayCreator = creatorName || 'Tu entrenador';
  const displayDate = booking?.slotStartUtc
    ? new Date(booking.slotStartUtc).toLocaleDateString('es-CO', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '';
  const displayTime =
    booking?.slotStartUtc && booking?.slotEndUtc
      ? `${new Date(booking.slotStartUtc).toLocaleTimeString('es-CO', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })}–${new Date(booking.slotEndUtc).toLocaleTimeString('es-CO', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })}`
      : booking?.slotStartUtc
        ? new Date(booking.slotStartUtc).toLocaleTimeString('es-CO', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          })
        : '';
  const daysLeftText = (() => {
    if (!booking?.slotStartUtc) return null;
    const start = new Date(booking.slotStartUtc);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    start.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((start - today) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return null;
    if (diffDays === 0) return 'Hoy';
    if (diffDays === 1) return 'Mañana';
    return `En ${diffDays} días`;
  })();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: '#1a1a1a',
        },
        scrollView: {
          flex: 1,
        },
        content: {
          paddingHorizontal: Math.max(20, screenWidth * 0.05),
          paddingBottom: 24,
          gap: 16,
        },
        errorText: {
          fontSize: 15,
          color: 'rgba(255, 100, 100, 0.95)',
          textAlign: 'center',
          marginTop: 24,
        },
        card: {
          backgroundColor: CARD_BG,
          borderWidth: 1,
          borderColor: CARD_BORDER,
          borderRadius: 16,
          padding: 20,
          overflow: 'hidden',
        },
        creatorCard: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 16,
        },
        creatorAvatar: {
          width: 64,
          height: 64,
          borderRadius: 32,
          backgroundColor: 'rgba(255, 255, 255, 0.08)',
          overflow: 'hidden',
        },
        creatorAvatarImg: {
          width: '100%',
          height: '100%',
        },
        creatorInfo: {
          flex: 1,
          minWidth: 0,
        },
        creatorLabel: {
          fontSize: 11,
          fontWeight: '600',
          color: LABEL_COLOR,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          marginBottom: 4,
        },
        creatorName: {
          fontSize: 22,
          fontWeight: '700',
          color: TEXT_PRIMARY,
        },
        courseName: {
          fontSize: 14,
          color: LABEL_COLOR,
          marginTop: 4,
        },
        dateTimeCard: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
        },
        dateTimeLeft: {
          flex: 1,
          minWidth: 0,
        },
        dateTimeLabel: {
          fontSize: 11,
          fontWeight: '600',
          color: LABEL_COLOR,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          marginBottom: 6,
        },
        dateTimeText: {
          fontSize: 18,
          fontWeight: '600',
          color: TEXT_PRIMARY,
          lineHeight: 26,
        },
        daysLeftBadge: {
          alignSelf: 'center',
          paddingHorizontal: 12,
          paddingVertical: 8,
          backgroundColor: GOLD_ACCENT_15,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: 'rgba(255, 255, 255, 0.35)',
        },
        daysLeftText: {
          fontSize: 14,
          fontWeight: '600',
          color: GOLD_ACCENT,
        },
        linkCard: {
          alignItems: 'stretch',
        },
        linkCardLabel: {
          fontSize: 11,
          fontWeight: '600',
          color: LABEL_COLOR,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          marginBottom: 12,
        },
        joinButton: {
          backgroundColor: GOLD_ACCENT_25,
          paddingVertical: 16,
          paddingHorizontal: 24,
          borderRadius: 14,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: 'rgba(255, 255, 255, 0.45)',
        },
        joinButtonText: {
          color: '#ffffff',
          fontSize: 17,
          fontWeight: '600',
        },
        linkRow: {
          flexDirection: 'row',
          alignItems: 'center',
          marginTop: 12,
          gap: 12,
        },
        linkDisplay: {
          flex: 1,
          minWidth: 0,
          paddingVertical: 12,
          paddingHorizontal: 14,
          backgroundColor: 'rgba(0, 0, 0, 0.25)',
          borderRadius: 10,
          borderWidth: 1,
          borderColor: 'rgba(255, 255, 255, 0.08)',
        },
        linkDisplayText: {
          fontSize: 13,
          color: 'rgba(255, 255, 255, 0.75)',
          numberOfLines: 2,
        },
        copyButton: {
          paddingVertical: 12,
          paddingHorizontal: 16,
          backgroundColor: 'rgba(255, 255, 255, 0.08)',
          borderRadius: 10,
          borderWidth: 1,
          borderColor: 'rgba(255, 255, 255, 0.15)',
        },
        copyButtonText: {
          fontSize: 14,
          fontWeight: '600',
          color: TEXT_PRIMARY,
        },
        copyButtonTextSuccess: {
          color: 'rgba(34, 197, 94, 1)',
        },
        noLinkCard: {
          paddingVertical: 24,
          paddingHorizontal: 20,
          backgroundColor: 'rgba(255, 255, 255, 0.04)',
          borderRadius: 14,
          borderWidth: 1,
          borderColor: 'rgba(255, 255, 255, 0.08)',
          borderStyle: 'dashed',
        },
        noLinkText: {
          fontSize: 15,
          color: LABEL_COLOR,
          textAlign: 'center',
          lineHeight: 24,
        },
        heroImage: {
          height: 140,
          marginHorizontal: -20,
          marginTop: -20,
          marginBottom: 16,
          backgroundColor: 'rgba(255, 255, 255, 0.04)',
        },
      }),
    [screenWidth]
  );

  if (loading) {
    return (
      <SafeAreaView
        style={styles.container}
        edges={Platform.OS === 'web' ? ['left', 'right'] : ['bottom', 'left', 'right']}
      >
        <FixedWakeHeader showBackButton onBackPress={() => navigation.goBack()} />
        <LoadingSpinner text="Cargando reserva..." containerStyle={{ flex: 1, justifyContent: 'center' }} />
      </SafeAreaView>
    );
  }

  if (error || !booking) {
    return (
      <SafeAreaView
        style={styles.container}
        edges={Platform.OS === 'web' ? ['left', 'right'] : ['bottom', 'left', 'right']}
      >
        <FixedWakeHeader showBackButton onBackPress={() => navigation.goBack()} />
        <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24 }}>
          <Text style={styles.errorText}>{error || 'No se pudo cargar la reserva.'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <Animated.View style={{ flex: 1, opacity: screenAnim }}>
    <SafeAreaView
      style={styles.container}
      edges={Platform.OS === 'web' ? ['left', 'right'] : ['bottom', 'left', 'right']}
    >
      <FixedWakeHeader showBackButton onBackPress={() => navigation.goBack()} />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
      >
        <WakeHeaderContent style={styles.content}>
          <WakeHeaderSpacer />

          {/* Creator Card */}
          <Animated.View style={{ opacity: card1Anim, transform: [{ translateY: card1Anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }}>
          <View style={styles.card}>
            {courseImageUrl ? (
              <ExpoImage
                source={{ uri: courseImageUrl }}
                style={styles.heroImage}
                contentFit="cover"
              />
            ) : null}
            <View style={styles.creatorCard}>
              <View style={styles.creatorAvatar}>
                {creatorProfileUrl ? (
                  <ExpoImage source={{ uri: creatorProfileUrl }} style={styles.creatorAvatarImg} contentFit="cover" />
                ) : (
                  <View
                    style={[
                      styles.creatorAvatarImg,
                      {
                        backgroundColor: GOLD_ACCENT_15,
                        alignItems: 'center',
                        justifyContent: 'center',
                      },
                    ]}
                  >
                    <Text style={{ fontSize: 24, fontWeight: '700', color: GOLD_ACCENT }}>
                      {displayCreator.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
              </View>
              <View style={styles.creatorInfo}>
                <Text style={styles.creatorLabel}>Llamada con</Text>
                <Text style={styles.creatorName}>{displayCreator}</Text>
                {courseName ? <Text style={styles.courseName}>{courseName}</Text> : null}
              </View>
            </View>
          </View>
          </Animated.View>

          {/* Date & Time Card */}
          <Animated.View style={{ opacity: card2Anim, transform: [{ translateY: card2Anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }}>
          <View style={[styles.card, styles.dateTimeCard]}>
            <View style={styles.dateTimeLeft}>
              <Text style={styles.dateTimeLabel}>Fecha y hora</Text>
              <Text style={styles.dateTimeText}>{displayDate || '—'}</Text>
              {displayTime ? <Text style={styles.dateTimeText}>{displayTime}</Text> : null}
            </View>
            {daysLeftText ? (
              <View style={styles.daysLeftBadge}>
                <Text style={styles.daysLeftText}>{daysLeftText}</Text>
              </View>
            ) : null}
          </View>
          </Animated.View>

          {/* Meeting Link Card */}
          <Animated.View style={{ opacity: card3Anim, transform: [{ translateY: card3Anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }}>
          <View style={[styles.card, styles.linkCard]}>
            <Text style={styles.linkCardLabel}>Enlace de la reunión</Text>
            {callLink ? (
              <>
                <TouchableOpacity
                  className={Platform.OS === 'web' ? 'w-cta-pulse' : undefined}
                  style={[styles.joinButton, Platform.OS === 'web' && { '--accent': 'rgb(74, 222, 128)', '--accent-text': '#111' }]}
                  onPress={handleOpenCallLink}
                  activeOpacity={0.85}
                >
                  <Text style={styles.joinButtonText}>Unirse a la llamada</Text>
                </TouchableOpacity>
                <View style={styles.linkRow}>
                  <View style={styles.linkDisplay}>
                    <Text style={styles.linkDisplayText} numberOfLines={2}>
                      {callLink}
                    </Text>
                  </View>
                  <TouchableOpacity style={styles.copyButton} onPress={handleCopyLink} activeOpacity={0.8}>
                    <Text style={[styles.copyButtonText, copied && styles.copyButtonTextSuccess]}>
                      {copied ? '✓ Copiado' : 'Copiar'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <View style={styles.noLinkCard}>
                <Text style={styles.noLinkText}>
                  Tu entrenador aún no ha añadido el enlace. Cuando esté listo, aparecerá aquí.
                </Text>
              </View>
            )}
          </View>
          </Animated.View>

          <BottomSpacer />
        </WakeHeaderContent>
      </ScrollView>
    </SafeAreaView>
    </Animated.View>
  );
};

export default UpcomingCallDetailScreen;
