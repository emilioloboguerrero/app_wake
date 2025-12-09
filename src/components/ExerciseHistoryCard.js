import React from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions, ActivityIndicator } from 'react-native';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const ExerciseHistoryCard = ({ sessions, loading, maxSessions = 5, onViewAll }) => {
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'short'
    });
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Historial de Series</Text>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="rgba(191, 168, 77, 1)" />
          <Text style={styles.loadingText}>Cargando historial...</Text>
        </View>
      </View>
    );
  }

  // Filter sessions to only show those with at least one valid set
  const hasSetData = (set) => {
    // Check for actual numeric reps (not ranges like "8-10" or template values)
    const hasReps = set.reps && 
                    set.reps !== '' && 
                    !isNaN(parseFloat(set.reps)) && 
                    !set.reps.includes('-') && 
                    !set.reps.includes('FALLO');
    
    // Check for actual numeric weight (not empty or template values)
    const hasWeight = set.weight && 
                      set.weight !== '' && 
                      !isNaN(parseFloat(set.weight)) && 
                      parseFloat(set.weight) > 0;
    
    // Check for actual numeric intensity (not ranges like "10/10/10" or template values)
    const hasIntensity = set.intensity && 
                         set.intensity !== '' && 
                         !isNaN(parseFloat(set.intensity)) && 
                         !set.intensity.includes('/') && 
                         parseFloat(set.intensity) > 0;
    
    return hasReps || hasWeight || hasIntensity;
  };

  const validSessions = sessions.filter(session => 
    session.sets && session.sets.some(hasSetData)
  );

  const recentSessions = validSessions.slice(0, maxSessions);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Historial de Series</Text>
      </View>
      
      {recentSessions.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            No hay historial de series aún.{'\n'}
            Completa entrenamientos para ver tu progreso.
          </Text>
        </View>
        ) : (
          <View style={styles.scrollContainer}>
            <ScrollView 
              style={styles.sessionsList}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
            >
              {recentSessions.map((session, index) => (
                <SessionCard key={`${session.sessionId}-${index}`} session={session} index={index} />
              ))}
            </ScrollView>
            {recentSessions.length > 2 && (
              <View style={styles.scrollIndicator}>
                <Text style={styles.scrollIndicatorText}>Desliza para ver más</Text>
              </View>
            )}
          </View>
        )}
    </View>
  );
};

const SessionCard = ({ session, index }) => {
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'short'
    });
  };

  // Filter sets to only show those with at least one field with actual user data
  const hasSetData = (set) => {
    // Check for actual numeric reps (not ranges like "8-10" or template values)
    const hasReps = set.reps && 
                    set.reps !== '' && 
                    !isNaN(parseFloat(set.reps)) && 
                    !set.reps.includes('-') && 
                    !set.reps.includes('FALLO');
    
    // Check for actual numeric weight (not empty or template values)
    const hasWeight = set.weight && 
                      set.weight !== '' && 
                      !isNaN(parseFloat(set.weight)) && 
                      parseFloat(set.weight) > 0;
    
    // Check for actual numeric intensity (not ranges like "10/10/10" or template values)
    const hasIntensity = set.intensity && 
                         set.intensity !== '' && 
                         !isNaN(parseFloat(set.intensity)) && 
                         !set.intensity.includes('/') && 
                         parseFloat(set.intensity) > 0;
    
    return hasReps || hasWeight || hasIntensity;
  };

  const validSets = session.sets.filter(hasSetData);

  // Don't render the session card if no valid sets
  if (validSets.length === 0) {
    return null;
  }

  return (
    <View style={styles.sessionCard}>
      <View style={styles.sessionHeader}>
        <Text style={styles.sessionDate}>{formatDate(session.date)}</Text>
      </View>
      
      <View style={styles.setsContainer}>
        {/* Column Headers */}
        <View style={styles.headerRow}>
          <Text style={styles.headerText}>Serie</Text>
          <Text style={styles.headerText}>Reps</Text>
          <Text style={styles.headerText}>Weight</Text>
        </View>
        
        {/* Set Data */}
        {validSets.map((set, setIndex) => (
          <View key={setIndex} style={styles.setRow}>
            <Text style={styles.setNumber}>{setIndex + 1}</Text>
            <Text style={styles.setData}>{set.reps || '-'}</Text>
            <Text style={styles.setData}>{set.weight || '-'}kg</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#2a2a2a',
    borderRadius: Math.max(12, screenWidth * 0.04),
    padding: Math.max(20, screenWidth * 0.05),
    marginBottom: Math.max(20, screenHeight * 0.025),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
    flex: 1,
  },
  header: {
    alignItems: 'flex-start',
    marginBottom: Math.max(16, screenHeight * 0.02),
  },
  title: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.05, 20),
    fontWeight: '600',
  },
  sessionsList: {
    flex: 1, // Use all available height
  },
  scrollContainer: {
    position: 'relative',
    flex: 1, // Use all available height
  },
  scrollContent: {
    paddingBottom: Math.max(30, screenHeight * 0.035), // Extra padding for indicator overlay
  },
  scrollIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(42, 42, 42, 0.9)',
    paddingVertical: Math.max(6, screenHeight * 0.007),
    alignItems: 'center',
    pointerEvents: 'none', // Allow touch events to pass through
  },
  scrollIndicatorText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: Math.min(screenWidth * 0.035, 14),
    fontWeight: '500',
  },
  sessionCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: Math.max(8, screenWidth * 0.02),
    padding: Math.max(12, screenWidth * 0.03),
    marginBottom: Math.max(8, screenHeight * 0.01),
  },
  sessionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Math.max(8, screenHeight * 0.01),
  },
  sessionDate: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.04, 16),
    fontWeight: '500',
  },
  setsContainer: {
    gap: Math.max(4, screenHeight * 0.005),
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    paddingVertical: Math.max(4, screenHeight * 0.005),
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    marginBottom: Math.max(4, screenHeight * 0.005),
  },
  headerText: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.035, 14),
    fontWeight: '600',
    textAlign: 'center',
    flex: 1,
  },
  setRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    paddingVertical: Math.max(2, screenHeight * 0.002),
  },
  setNumber: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.035, 14),
    fontWeight: '500',
    textAlign: 'center',
    flex: 1,
  },
  setData: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.035, 14),
    fontWeight: '500',
    textAlign: 'center',
    flex: 1,
  },
  loadingText: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.04, 16),
    marginTop: Math.max(12, screenHeight * 0.015),
    opacity: 0.7,
  },
  emptyContainer: {
    paddingVertical: Math.max(40, screenHeight * 0.05),
    alignItems: 'center',
  },
  emptyText: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.04, 16),
    opacity: 0.6,
    textAlign: 'center',
    lineHeight: Math.max(22, screenHeight * 0.027),
  },
});

export default ExerciseHistoryCard;
