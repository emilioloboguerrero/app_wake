import { Platform } from 'react-native';
import { 
  useFonts, 
  Montserrat_400Regular, 
  Montserrat_500Medium,
  Montserrat_600SemiBold, 
  Montserrat_700Bold
} from '@expo-google-fonts/montserrat';

// Load Montserrat fonts - Only loading used weights to reduce app size
// Removed: 100Thin, 200ExtraLight, 300Light, 800ExtraBold, 900Black (not used in app)
export const useMontserratFonts = () => {
  const [fontsLoaded] = useFonts({
    Montserrat_400Regular,
    Montserrat_500Medium,
    Montserrat_600SemiBold,
    Montserrat_700Bold,
  });
  return fontsLoaded;
};

// Default font configuration for the app - cross-platform compatible
export const DEFAULT_FONT = Platform.select({
  ios: 'Montserrat-SemiBold',
  android: 'Montserrat-SemiBold',
});
export const DEFAULT_FONT_WEIGHT = '600';
