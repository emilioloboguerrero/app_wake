// Pending one-on-one invite banner (audit C-10 acceptance UI).
// Renders above the main feed when one or more pending creator-relationships
// exist for the current user. The user can accept (creator gains access) or
// decline (relationship marked inactive). Backend gate enforces consent —
// this UI just surfaces the choice.
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import {
  useClientRelationships,
  useAcceptRelationship,
  useDeclineRelationship,
} from '../hooks/relationships/useClientRelationships';

export default function PendingInviteBanner({ userId }) {
  const { data: invites = [], isLoading } = useClientRelationships(userId, { status: 'pending' });
  const accept = useAcceptRelationship(userId);
  const decline = useDeclineRelationship(userId);
  const [actionId, setActionId] = useState(null);

  if (isLoading || invites.length === 0) return null;

  const handleAccept = (id) => {
    setActionId(id);
    accept.mutate(id, { onSettled: () => setActionId(null) });
  };
  const handleDecline = (id) => {
    setActionId(id);
    decline.mutate(id, { onSettled: () => setActionId(null) });
  };

  return (
    <View style={styles.wrap}>
      {invites.map((inv) => {
        const isActing = actionId === inv.id;
        const coachLabel = inv.creatorName || 'tu coach';
        return (
          <View key={inv.id} style={styles.card}>
            <View style={styles.header}>
              <Text style={styles.eyebrow}>Invitación 1:1</Text>
              <Text style={styles.title}>
                {coachLabel} te invitó como cliente
              </Text>
              <Text style={styles.subtitle}>
                Al aceptar, podrá asignarte programas, planes y revisar tu progreso.
              </Text>
            </View>
            <View style={styles.row}>
              <TouchableOpacity
                style={[styles.btn, styles.btnPrimary, isActing && styles.btnDisabled]}
                onPress={() => handleAccept(inv.id)}
                disabled={isActing}
                accessibilityRole="button"
              >
                {isActing && actionId === inv.id && accept.isPending ? (
                  <ActivityIndicator size="small" color="#1a1a1a" />
                ) : (
                  <Text style={styles.btnPrimaryText}>Aceptar</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.btnSecondary, isActing && styles.btnDisabled]}
                onPress={() => handleDecline(inv.id)}
                disabled={isActing}
                accessibilityRole="button"
              >
                {isActing && actionId === inv.id && decline.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.btnSecondaryText}>Rechazar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    gap: 12,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderColor: 'rgba(255,255,255,0.09)',
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
    gap: 14,
  },
  header: { gap: 6 },
  eyebrow: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  title: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 22,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    lineHeight: 19,
  },
  row: { flexDirection: 'row', gap: 10 },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  btnPrimary: {
    backgroundColor: '#fff',
  },
  btnPrimaryText: {
    color: '#1a1a1a',
    fontSize: 15,
    fontWeight: '700',
  },
  btnSecondary: {
    backgroundColor: 'transparent',
    borderColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
  },
  btnSecondaryText: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 15,
    fontWeight: '600',
  },
  btnDisabled: {
    opacity: 0.6,
  },
});
