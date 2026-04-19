import { Platform } from 'react-native';
import { useState } from 'react';

// Check if we're on web - do this at module level so it's constant
const isWeb = typeof window !== 'undefined' && typeof document !== 'undefined';

// Load Inter fonts - Only loading used weights to reduce app size
// Removed: 100Thin, 200ExtraLight, 300Light, 800ExtraBold, 900Black (not used in app)
export const useInterFonts = () => {
  // CRITICAL: Always call useState first to maintain hook order
  // This ensures consistent hook order regardless of platform
  const [webFontsState] = useState(null);
  
  // CRITICAL: On web, this should NEVER execute
  // If it does, Metro resolution failed and fonts.web.js should be used instead
  if (isWeb) {
    logger.error('[FONTS] ❌ CRITICAL ERROR: fonts.js useInterFonts called on web!');
    logger.error('[FONTS] Metro should have resolved to fonts.web.js instead.');
    logger.error('[FONTS] This indicates a Metro configuration issue.');
    // Return early to avoid calling useFonts
    return true; // Return true as fallback
  }
  
  // On native, use expo-font hook
  // CRITICAL: useFonts MUST be called unconditionally (after the isWeb check)
  // Since isWeb is constant at module level and we're on native, this is safe
  // But React still sees this as conditional because of the if statement above
  // The solution is to ensure fonts.js is NEVER imported on web (Metro should use fonts.web.js)
  const { 
    useFonts, 
    Inter_400Regular, 
    Inter_500Medium,
    Inter_600SemiBold, 
    Inter_700Bold
  } = require('@expo-google-fonts/inter');
  
  // CRITICAL: useFonts MUST be called unconditionally
  // Since we're on native (isWeb is false), this will always execute
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  return fontsLoaded;
};

// Default font configuration for the app - cross-platform compatible
export const DEFAULT_FONT = Platform.select({
  ios: 'Inter-SemiBold',
  android: 'Inter-SemiBold',
  web: 'Inter-SemiBold', // Add web fallback
  default: 'Inter-SemiBold', // Default fallback
});
export const DEFAULT_FONT_WEIGHT = '600';
