import { Platform } from 'react-native';
import { 
  useFonts, 
  Montserrat_100Thin,
  Montserrat_200ExtraLight,
  Montserrat_300Light, 
  Montserrat_400Regular, 
  Montserrat_500Medium,
  Montserrat_600SemiBold, 
  Montserrat_700Bold,
  Montserrat_800ExtraBold,
  Montserrat_900Black
} from '@expo-google-fonts/montserrat';

// Load Montserrat fonts
export const useMontserratFonts = () => {
  const [fontsLoaded] = useFonts({
    Montserrat_100Thin,
    Montserrat_200ExtraLight,
    Montserrat_300Light,
    Montserrat_400Regular,
    Montserrat_500Medium,
    Montserrat_600SemiBold,
    Montserrat_700Bold,
    Montserrat_800ExtraBold,
    Montserrat_900Black,
  });
  return fontsLoaded;
};

// Default font configuration for the app - cross-platform compatible
export const DEFAULT_FONT = Platform.select({
  ios: 'Montserrat-SemiBold',
  android: 'Montserrat-SemiBold',
});
export const DEFAULT_FONT_WEIGHT = '600';
