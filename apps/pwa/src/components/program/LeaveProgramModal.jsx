import React, { useState, useCallback, useMemo } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
  ScrollView,
} from 'react-native';
import Text from '../Text';
import logger from '../../utils/logger';

const REASON_OPTIONS = [
  { id: 'no_time', label: 'No tengo tiempo' },
  { id: 'too_expensive', label: 'Es muy caro' },
  { id: 'not_working', label: 'No estoy viendo resultados' },
  { id: 'creator_mismatch', label: 'No conecto con el creador' },
  { id: 'goals_changed', label: 'Cambiaron mis objetivos' },
  { id: 'other', label: 'Otra razón' },
];

const COLORS = {
  bg: '#1a1a1a',
  card: '#2a2a2a',
  border: 'rgba(255,255,255,0.12)',
  borderActive: 'rgba(255,255,255,0.4)',
  text: '#ffffff',
  textDim: 'rgba(255,255,255,0.7)',
  textFaint: 'rgba(255,255,255,0.5)',
  destructive: '#e05454',
};

/**
 * Two-step destructive modal for leaving a one-on-one program.
 * Step 1: Warning + consequences.
 * Step 2: Reason + optional satisfaction + optional free text.
 */
const LeaveProgramModal = ({
  visible,
  onClose,
  onConfirm,
  creatorName,
  hasActiveSubscription,
  isSubmitting = false,
}) => {
  const [step, setStep] = useState(1);
  const [reason, setReason] = useState(null);
  const [satisfaction, setSatisfaction] = useState(null);
  const [freeText, setFreeText] = useState('');
  const [error, setError] = useState(null);

  const reset = useCallback(() => {
    setStep(1);
    setReason(null);
    setSatisfaction(null);
    setFreeText('');
    setError(null);
  }, []);

  const handleClose = useCallback(() => {
    if (isSubmitting) return;
    reset();
    onClose();
  }, [isSubmitting, reset, onClose]);

  const handleSubmit = useCallback(async () => {
    if (!reason) {
      setError('Selecciona una razón');
      return;
    }
    setError(null);
    try {
      await onConfirm({
        reason,
        satisfaction: satisfaction ?? undefined,
        freeText: freeText.trim() ? freeText.trim().slice(0, 1000) : undefined,
      });
      reset();
    } catch (err) {
      logger.error('LeaveProgramModal submit failed', err);
      setError(
        err?.response?.data?.error?.message ||
        'No pudimos terminar el programa. Inténtalo de nuevo.'
      );
    }
  }, [reason, satisfaction, freeText, onConfirm, reset]);

  const creatorLabel = creatorName || 'tu creador';

  const subscriptionLine = hasActiveSubscription
    ? 'Tu suscripción se cancelará automáticamente.'
    : null;

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            {step === 1 ? (
              <View>
                <Text style={styles.title}>¿Terminar tu programa con {creatorLabel}?</Text>
                <Text style={styles.body}>
                  Perderás acceso al programa, a tu plan nutricional y a tus llamadas futuras. Esta acción no se puede deshacer.
                </Text>
                {subscriptionLine && (
                  <Text style={[styles.body, styles.bodyEmphasis]}>{subscriptionLine}</Text>
                )}
                <View style={styles.actionsCol}>
                  <TouchableOpacity
                    style={[styles.btn, styles.btnPrimary]}
                    onPress={() => setStep(2)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.btnPrimaryText}>Continuar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btn, styles.btnGhost]}
                    onPress={handleClose}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.btnGhostText}>Cancelar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View>
                <Text style={styles.title}>Cuéntanos por qué</Text>
                <Text style={styles.bodyDim}>Tu respuesta nos ayuda a mejorar.</Text>

                <Text style={styles.sectionLabel}>Razón principal</Text>
                <View style={styles.reasonsList}>
                  {REASON_OPTIONS.map((opt) => {
                    const active = reason === opt.id;
                    return (
                      <TouchableOpacity
                        key={opt.id}
                        style={[styles.reasonRow, active && styles.reasonRowActive]}
                        onPress={() => setReason(opt.id)}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.radio, active && styles.radioActive]}>
                          {active && <View style={styles.radioDot} />}
                        </View>
                        <Text style={[styles.reasonLabel, active && styles.reasonLabelActive]}>
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={styles.sectionLabel}>¿Cómo fue tu experiencia? (opcional)</Text>
                <View style={styles.satisfactionRow}>
                  {[1, 2, 3, 4, 5].map((n) => {
                    const active = satisfaction === n;
                    return (
                      <TouchableOpacity
                        key={n}
                        style={[styles.satBubble, active && styles.satBubbleActive]}
                        onPress={() => setSatisfaction(active ? null : n)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.satBubbleText, active && styles.satBubbleTextActive]}>
                          {n}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={styles.sectionLabel}>Algo más que quieras compartir (opcional)</Text>
                <TextInput
                  style={styles.textArea}
                  multiline
                  numberOfLines={3}
                  maxLength={1000}
                  value={freeText}
                  onChangeText={setFreeText}
                  placeholder="Escribe aquí…"
                  placeholderTextColor={COLORS.textFaint}
                />

                {error && <Text style={styles.errorText}>{error}</Text>}

                <View style={styles.actionsCol}>
                  <TouchableOpacity
                    style={[styles.btn, styles.btnDestructive, isSubmitting && styles.btnDisabled]}
                    onPress={handleSubmit}
                    disabled={isSubmitting}
                    activeOpacity={0.8}
                  >
                    {isSubmitting
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={styles.btnDestructiveText}>Terminar programa</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btn, styles.btnGhost]}
                    onPress={handleClose}
                    disabled={isSubmitting}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.btnGhostText}>Cancelar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  sheet: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '90%',
    backgroundColor: COLORS.bg,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  scroll: {
    padding: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 14,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.textDim,
    marginBottom: 10,
  },
  bodyEmphasis: {
    color: COLORS.text,
    marginTop: 4,
  },
  bodyDim: {
    fontSize: 14,
    color: COLORS.textFaint,
    marginBottom: 18,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textDim,
    marginTop: 16,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  reasonsList: {
    gap: 8,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  reasonRowActive: {
    borderColor: COLORS.borderActive,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: COLORS.textFaint,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: {
    borderColor: COLORS.text,
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.text,
  },
  reasonLabel: {
    fontSize: 15,
    color: COLORS.textDim,
    flex: 1,
  },
  reasonLabelActive: {
    color: COLORS.text,
  },
  satisfactionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  satBubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.card,
  },
  satBubbleActive: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderColor: COLORS.borderActive,
  },
  satBubbleText: {
    fontSize: 15,
    color: COLORS.textDim,
    fontWeight: '600',
  },
  satBubbleTextActive: {
    color: COLORS.text,
  },
  textArea: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    color: COLORS.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    minHeight: 80,
    textAlignVertical: 'top',
    ...Platform.select({ web: { outlineStyle: 'none' } }),
  },
  errorText: {
    color: COLORS.destructive,
    fontSize: 14,
    marginTop: 12,
  },
  actionsCol: {
    marginTop: 24,
    gap: 10,
  },
  btn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimary: {
    backgroundColor: 'rgba(255,255,255,0.95)',
  },
  btnPrimaryText: {
    color: '#1a1a1a',
    fontSize: 15,
    fontWeight: '600',
  },
  btnDestructive: {
    backgroundColor: COLORS.destructive,
  },
  btnDestructiveText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  btnGhost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  btnGhostText: {
    color: COLORS.textDim,
    fontSize: 15,
    fontWeight: '500',
  },
  btnDisabled: {
    opacity: 0.6,
  },
});

export default LeaveProgramModal;
