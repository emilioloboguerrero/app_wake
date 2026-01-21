import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import tutorialManager from '../services/tutorialManager';
import TutorialOverlay from '../components/TutorialOverlay';
import { FixedWakeHeader, WakeHeaderSpacer } from '../components/WakeHeader';
import BottomSpacer from '../components/BottomSpacer';

import logger from '../utils/logger.js';

const CommunityScreen = () => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const styles = useMemo(() => createStyles(screenWidth, screenHeight), [screenWidth, screenHeight]);
  const { user } = useAuth();
  
  // Tutorial state
  const [tutorialVisible, setTutorialVisible] = useState(false);
  const [tutorialData, setTutorialData] = useState([]);
  const [currentTutorialIndex, setCurrentTutorialIndex] = useState(0);

  // Check for tutorials when screen mounts
  useEffect(() => {
    checkForTutorials();
  }, [user]);

  // Check for tutorials to show
  const checkForTutorials = async () => {
    if (!user?.uid) return;

    try {
      logger.log('🎬 Checking for community screen tutorials...');
      const tutorials = await tutorialManager.getTutorialsForScreen(user.uid, 'community');
      
      if (tutorials.length > 0) {
        logger.log('📚 Found tutorials to show:', tutorials.length);
        setTutorialData(tutorials);
        setCurrentTutorialIndex(0);
        setTutorialVisible(true);
      } else {
        logger.log('✅ No tutorials to show for community screen');
      }
    } catch (error) {
      logger.error('❌ Error checking for tutorials:', error);
    }
  };

  // Handle tutorial completion
  const handleTutorialComplete = async () => {
    if (!user?.uid || tutorialData.length === 0) return;

    try {
      const currentTutorial = tutorialData[currentTutorialIndex];
      if (currentTutorial) {
        await tutorialManager.markTutorialCompleted(
          user.uid, 
          'community', 
          currentTutorial.videoUrl
        );
        logger.log('✅ Tutorial marked as completed');
      }
    } catch (error) {
      logger.error('❌ Error marking tutorial as completed:', error);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Fixed Header */}
      <FixedWakeHeader />
      
      {/* Fixed Bottom Spacer - Prevents tab bar overlap */}
      <BottomSpacer />
      
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          {/* Spacer for fixed header */}
          <WakeHeaderSpacer />

          {/* Title Section */}
          <View style={styles.titleSection}>
            <Text style={styles.title}>Comunidad</Text>
          </View>

          {/* Community Content Area - Ready for your Figma designs */}
          <View style={styles.communityContent}>
            <View style={styles.centeredContent}>
              <Text style={styles.soonText}>Pronto...</Text>
            </View>
          </View>
        </View>
      </ScrollView>
      
      {/* Tutorial Overlay */}
      <TutorialOverlay
        visible={tutorialVisible}
        tutorialData={tutorialData}
        onClose={() => setTutorialVisible(false)}
        onComplete={handleTutorialComplete}
      />
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
  content: {
    paddingTop: 10,
    paddingBottom: 20, // Normal padding
  },
  titleSection: {
    paddingTop: 0,
    marginTop: 0,
    marginBottom: Math.max(20, screenHeight * 0.03), // Match ProfileScreen
  },
  title: {
    fontSize: Math.min(screenWidth * 0.08, 32), // Match ProfileScreen responsive sizing
    fontWeight: '600', // Match ProfileScreen weight
    color: '#ffffff',
    textAlign: 'left',
    paddingLeft: screenWidth * 0.12, // Match ProfileScreen padding
    marginBottom: 20,
  },
  communityContent: {
    flex: 1,
  },
  centeredContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 200,
  },
  soonText: {
    fontSize: 40,
    fontWeight: '600',
    color: '#ffffff',
    textAlign: 'center',
  },
  debugButton: {
    backgroundColor: '#ff4444',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 20,
  },
  debugButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default CommunityScreen;
