import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { useActivityStreakContext } from '../contexts/ActivityStreakContext';
import SvgFire from './icons/vectors_fig/Environment/Fire';

const MODAL_ROOT_ID = 'wake-streak-modal-root';
const MODAL_Z_INDEX = 99999;

function getOrCreateModalRoot() {
  if (typeof document === 'undefined') return null;
  let root = document.getElementById(MODAL_ROOT_ID);
  if (!root) {
    root = document.createElement('div');
    root.id = MODAL_ROOT_ID;
    root.style.cssText =
      'position:fixed;inset:0;z-index:' +
      MODAL_Z_INDEX +
      ';pointer-events:none;';
    document.body.appendChild(root);
  }
  return root;
}

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
  const [anchorRect, setAnchorRect] = useState(null);
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

  useEffect(() => {
    if (!visible || typeof document === 'undefined') {
      return;
    }
    const anchorEl = document.querySelector('[aria-label="Racha"]');
    if (anchorEl) {
      const rect = anchorEl.getBoundingClientRect();
      setAnchorRect(rect);
    } else {
      setAnchorRect(null);
    }
  }, [visible, hasUser]);

  if (!visible || typeof document === 'undefined') {
    return null;
  }

  const isDead = flameLevel === 0;
  const displayStreak = isDead ? 0 : streakNumber || 0;
  const displayLongest = longestStreak || 0;
  const showLoadingState = !hasUser || isLoading;
  const isCurrentLongest =
    displayStreak > 0 &&
    displayLongest > 0 &&
    displayStreak === displayLongest &&
    streakStartDate &&
    longestStreakStartDate &&
    streakStartDate === longestStreakStartDate;

  const CARD_WIDTH = 260;
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 0;

  const top = anchorRect ? anchorRect.bottom + 8 : 80;
  let left = anchorRect ? anchorRect.left : 16;
  if (viewportWidth) {
    left = Math.max(8, Math.min(left, viewportWidth - CARD_WIDTH - 8));
  }

  const modalRoot = getOrCreateModalRoot();
  const overlay = (
    <div style={{ pointerEvents: 'auto', position: 'fixed', inset: 0 }}>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.62)',
          zIndex: 1,
        }}
        onClick={onClose}
      />
      <div
        style={{
          position: 'fixed',
          top,
          left,
          zIndex: 2,
          width: CARD_WIDTH,
          maxWidth: 'calc(100vw - 32px)',
        }}
      >
        <View style={styles.card}>
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

          <View style={styles.topRow}>
            <View style={styles.fireIconContainer}>
              {!showLoadingState && (!isDead && flameLevel >= 3) && (
                <SvgFire
                  width={88}
                  height={88}
                  stroke="#000000"
                  strokeWidth={0.3}
                  fill="#E64A11"
                  style={styles.fireBase}
                />
              )}
              {!showLoadingState && (!isDead && flameLevel >= 2) && (
                <SvgFire
                  width={32}
                  height={32}
                  stroke="#D5C672"
                  strokeWidth={0.5}
                  fill="#D5C672"
                  style={[styles.fireMiddle, { transform: [{ scaleX: -1 }] }]}
                />
              )}
              {!showLoadingState && (!isDead && flameLevel >= 1) && (
                <SvgFire
                  width={16}
                  height={16}
                  stroke="#FFFFFF"
                  strokeWidth={0.5}
                  fill="#FFFFFF"
                  style={styles.fireInner}
                />
              )}
              {!showLoadingState && isDead && (
                <SvgFire
                  width={88}
                  height={88}
                  stroke="#000000"
                  strokeWidth={0.3}
                  fill="#E64A11"
                  style={[styles.fireBase, { opacity: 0.3 }]}
                />
              )}
            </View>
            <View style={styles.currentBlock}>
              <Text style={styles.currentLabel}>Racha actual</Text>
              {showLoadingState ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.currentNumber}>
                  {displayStreak} día{displayStreak === 1 ? '' : 's'}
                </Text>
              )}
            </View>
          </View>

          <View style={styles.bottomSection}>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Racha más larga</Text>
              <Text style={styles.statValue}>
                {showLoadingState ? '—' : `${displayLongest} día${displayLongest === 1 ? '' : 's'}`}
              </Text>
            </View>

            {!showLoadingState && !isCurrentLongest && (
              <>
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
              </>
            )}
          </View>
        </View>
      </div>
    </div>
  );

  return modalRoot ? createPortal(overlay, modalRoot) : null;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    boxShadow: '0 8px 24px rgba(0,0,0,0.48)',
    elevation: 4,
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 0,
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
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    marginBottom: 6,
  },
  fireIconContainer: {
    position: 'relative',
    width: 76,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  fireBase: {
    position: 'absolute',
    bottom: 0,
  },
  fireMiddle: {
    position: 'absolute',
    bottom: 6,
  },
  fireInner: {
    position: 'absolute',
    bottom: 8,
  },
  currentBlock: {
    flex: 1,
    justifyContent: 'center',
  },
  currentLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 2,
  },
  currentNumber: {
    fontSize: 22,
    fontWeight: '700',
    color: '#ffffff',
  },
  bottomSection: {
    marginTop: 2,
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

