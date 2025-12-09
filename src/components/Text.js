import React from 'react';
import { Text as RNText, Platform } from 'react-native';

const Text = ({ style, children, ...props }) => {
  const getFontFamily = (fontWeight) => {
    switch (fontWeight) {
      case '100':
        return Platform.select({
          ios: 'Montserrat-Thin',
          android: 'Montserrat-Thin',
        });
      case '200':
        return Platform.select({
          ios: 'Montserrat-ExtraLight',
          android: 'Montserrat-ExtraLight',
        });
      case '300':
        return Platform.select({
          ios: 'Montserrat-Light',
          android: 'Montserrat-Light',
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
        return Platform.select({
          ios: 'Montserrat-ExtraBold',
          android: 'Montserrat-ExtraBold',
        });
      case '900':
        return Platform.select({
          ios: 'Montserrat-Black',
          android: 'Montserrat-Black',
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
