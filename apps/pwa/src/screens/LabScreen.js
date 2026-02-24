import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { FixedWakeHeader, WakeHeaderSpacer, WakeHeaderContent } from '../components/WakeHeader';
import BottomSpacer from '../components/BottomSpacer';
import SvgChartLine from '../components/icons/SvgChartLine';
import SvgListChecklist from '../components/icons/SvgListChecklist';
import SvgBodyPartMuscleStrokeRounded from '../components/icons/SvgBodyPartMuscleStrokeRounded';

const LabScreen = ({ navigation }) => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const styles = useMemo(() => createStyles(screenWidth, screenHeight), [screenWidth, screenHeight]);

  return (
    <SafeAreaView style={styles.container} edges={Platform.OS === 'web' ? ['left', 'right'] : ['bottom', 'left', 'right']}>
      <FixedWakeHeader />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContentContainer}
        showsVerticalScrollIndicator={false}
      >
        <WakeHeaderContent>
          <WakeHeaderSpacer />

          <View style={styles.titleSection}>
            <Text style={styles.screenTitle}>Lab</Text>
          </View>

          {/* Dashboard placeholder */}
          <View style={styles.dashboardPlaceholder} />

          {/* Navigation Cards */}
          <TouchableOpacity
            style={styles.navCard}
            onPress={() => navigation.navigate('Sessions')}
            activeOpacity={0.7}
          >
            <SvgListChecklist width={20} height={20} stroke="#ffffff" strokeWidth={2} style={styles.navCardIcon} />
            <View style={styles.navCardContent}>
              <Text style={styles.navCardTitle}>Sesiones</Text>
              <Text style={styles.navCardSubtitle}>Ver historial de sesiones completadas</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.navCard}
            onPress={() => navigation.navigate('ExercisePanel')}
            activeOpacity={0.7}
          >
            <SvgChartLine width={20} height={20} color="#ffffff" strokeWidth={2} style={styles.navCardIcon} />
            <View style={styles.navCardContent}>
              <Text style={styles.navCardTitle}>Ejercicios</Text>
              <Text style={styles.navCardSubtitle}>Ver progreso y estadísticas de ejercicios</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.navCard}
            onPress={() => navigation.navigate('WeeklyVolumeHistory')}
            activeOpacity={0.7}
          >
            <SvgBodyPartMuscleStrokeRounded width={20} height={20} stroke="#ffffff" strokeWidth={1.5} style={styles.navCardIcon} />
            <View style={styles.navCardContent}>
              <Text style={styles.navCardTitle}>Volumen</Text>
              <Text style={styles.navCardSubtitle}>Ver historial de volumen semanal</Text>
            </View>
          </TouchableOpacity>

          <BottomSpacer />
        </WakeHeaderContent>
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (screenWidth, screenHeight) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  scrollView: {
    flex: 1,
  },
  scrollContentContainer: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  titleSection: {
    paddingTop: Math.max(16, screenHeight * 0.02),
    marginTop: 0,
    marginBottom: Math.max(20, screenHeight * 0.03),
  },
  screenTitle: {
    fontSize: Math.min(screenWidth * 0.08, 32),
    fontWeight: '600',
    color: '#ffffff',
    textAlign: 'left',
    paddingLeft: screenWidth * 0.12,
    marginBottom: 20,
  },
  dashboardPlaceholder: {
    marginHorizontal: Math.max(24, screenWidth * 0.06),
    marginBottom: Math.max(24, screenHeight * 0.03),
    minHeight: Math.max(140, screenHeight * 0.18),
    backgroundColor: '#2a2a2a',
    borderRadius: Math.max(12, screenWidth * 0.04),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  navCard: {
    backgroundColor: '#2a2a2a',
    borderRadius: Math.max(12, screenWidth * 0.04),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
    paddingVertical: Math.max(16, screenHeight * 0.02),
    paddingHorizontal: Math.max(20, screenWidth * 0.05),
    marginBottom: Math.max(12, screenHeight * 0.015),
    marginHorizontal: Math.max(24, screenWidth * 0.06),
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: Math.max(60, screenHeight * 0.075),
  },
  navCardIcon: {
    marginRight: 16,
  },
  navCardContent: {
    flex: 1,
  },
  navCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 3,
  },
  navCardSubtitle: {
    fontSize: 13,
    fontWeight: '400',
    color: '#999999',
  },
});

export { LabScreen as LabScreenBase };
export default LabScreen;
