import React from 'react';
import { Text as RNText, Platform } from 'react-native';

const Text = ({ style, children, ...props }) => {
  const getFontFamily = (fontWeight) => {
    switch (fontWeight) {
      // Removed unused weights (100, 200, 300, 800, 900) to reduce app size
      // Fallback to closest available weight if removed weight is requested
      case '100':
      case '200':
      case '300':
        // Fallback to Regular (400) for thin/light weights
        return Platform.select({
          ios: 'Montserrat-Regular',
          android: 'Montserrat-Regular',
        });
      case '400':
        return Platform.select({
          ios: 'Montserrat-Regular',
          android: 'Montserrat-Regular',
        });
      case '500':
        return Platform.select({
          ios: 'Montserrat-Medium',
          android: 'Montserrat-Medium',
        });
      case '600':
        return Platform.select({
          ios: 'Montserrat-SemiBold',
          android: 'Montserrat-SemiBold',
        });
      case '700':
        return Platform.select({
          ios: 'Montserrat-Bold',
          android: 'Montserrat-Bold',
        });
      case '800':
      case '900':
        // Fallback to Bold (700) for extra bold/black weights
        return Platform.select({
          ios: 'Montserrat-Bold',
          android: 'Montserrat-Bold',
        });
      default:
        return Platform.select({
          ios: 'Montserrat-SemiBold',
          android: 'Montserrat-SemiBold',
        });
    }
  };

  const fontWeight = style?.fontWeight || '600';
  const fontFamily = getFontFamily(fontWeight);

  return (
    <RNText 
      style={[
        {
          fontFamily,
          fontWeight: 'normal', // Use normal to let fontFamily handle the weight
        },
        style
      ]} 
      {...props}
    >
      {children}
    </RNText>
  );
};

export default Text;
