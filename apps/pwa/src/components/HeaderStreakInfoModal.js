import React from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  TouchableWithoutFeedback,
  useWindowDimensions,
} from 'react-native';
import { useActivityStreakContext } from '../contexts/ActivityStreakContext';
import SvgFire from './icons/vectors_fig/Environment/Fire';

const ICON_BASE = 64;
const ICON_MIDDLE = ICON_BASE * 0.6;
const ICON_INNER = ICON_BASE * 0.32;

function formatDateHuman(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso + 'T12:00:00');
    return d.toLocaleDateString('es-CO', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch (e) {
    return iso;
  }
}

export function HeaderStreakInfoModal({ visible, onClose }) {
  const { width: screenWidth } = useWindowDimensions();
  const {
    streakNumber,
    flameLevel,
    longestStreak,
    longestStreakStartDate,
    longestStreakEndDate,
    streakStartDate,
    isLoading,
    hasUser,
  } = useActivityStreakContext();

  if (!hasUser) {
    return null;
  }

  const isDead = flameLevel === 0;
  const useDimmed = isLoading || isDead;
  const displayStreak = isDead ? 0 : streakNumber || 0;
  const displayLongest = longestStreak || 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>
        <View
          style={[
            styles.card,
            { maxWidth: Math.min(360, screenWidth - 32) },
          ]}
        >
          <View style={styles.cardHeaderRow}>
            <Text style={styles.title}>Tu racha</Text>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.closeText}>×</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.iconWrap}>
            <View style={styles.iconStack}>
              <SvgFire
                width={ICON_BASE}
                height={ICON_BASE}
                stroke="#000000"
                strokeWidth={0.4}
                fill="#E64A11"
                style={[
                  styles.iconBase,
                  { opacity: useDimmed ? 0.4 : 0.9 },
                ]}
              />
              <SvgFire
                width={ICON_MIDDLE}
                height={ICON_MIDDLE}
                stroke="#D5C672"
                strokeWidth={0.6}
                fill="#D5C672"
                style={[
                  styles.iconMiddle,
                  { opacity: useDimmed ? 0.4 : 0.9 },
                ]}
              />
              <SvgFire
                width={ICON_INNER}
                height={ICON_INNER}
                stroke="#FFFFFF"
                strokeWidth={0.6}
                fill="#FFFFFF"
                style={[
                  styles.iconInner,
                  { opacity: useDimmed ? 0.4 : 0.9 },
                ]}
              />
            </View>
            <View style={styles.mainNumbers}>
              <Text style={styles.currentStreakLabel}>Racha actual</Text>
              <View style={styles.currentStreakRow}>
                {isLoading ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.currentStreakNumber}>
                    {displayStreak} día{displayStreak === 1 ? '' : 's'}
                  </Text>
                )}
              </View>
            </View>
          </View>

          <View style={styles.separator} />

          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Racha más larga</Text>
            <Text style={styles.statValue}>
              {displayLongest} día{displayLongest === 1 ? '' : 's'}
            </Text>
          </View>

          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Inicio racha actual</Text>
            <Text style={styles.statValue}>
              {streakStartDate ? formatDateHuman(streakStartDate) : '—'}
            </Text>
          </View>

          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Inicio racha más larga</Text>
            <Text style={styles.statValue}>
              {longestStreakStartDate
                ? formatDateHuman(longestStreakStartDate)
                : '—'}
            </Text>
          </View>

          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Fin racha más larga</Text>
            <Text style={styles.statValue}>
              {longestStreakEndDate
                ? formatDateHuman(longestStreakEndDate)
                : '—'}
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.62)',
  },
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
  },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    fontSize: 20,
    color: '#ffffff',
    lineHeight: 20,
  },
  iconWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 4,
  },
  iconStack: {
    width: ICON_BASE,
    height: ICON_BASE,
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginRight: 16,
  },
  iconBase: {
    position: 'absolute',
    bottom: 0,
  },
  iconMiddle: {
    position: 'absolute',
    bottom: 4,
  },
  iconInner: {
    position: 'absolute',
    bottom: 7,
  },
  mainNumbers: {
    flex: 1,
    justifyContent: 'center',
  },
  currentStreakLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 2,
  },
  currentStreakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  currentStreakNumber: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
  },
  separator: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginVertical: 10,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 3,
  },
  statLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    marginRight: 8,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.95)',
    textAlign: 'right',
  },
});

export default HeaderStreakInfoModal;

