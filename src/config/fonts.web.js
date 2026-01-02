// Web-specific fonts configuration
// This file is used on web to avoid importing expo-font hooks

import { useState } from 'react';

// On web, fonts are loaded via CSS (Google Fonts in global.css)
// So we just return true immediately
export const useMontserratFonts = () => {
  // Always call useState to maintain hook order
  const [fontsLoaded] = useState(true);
  return fontsLoaded;
};

// Default font configuration for the app - cross-platform compatible
export const DEFAULT_FONT = 'Montserrat-SemiBold';
export const DEFAULT_FONT_WEIGHT = '600';
