import React from 'react';
import { TextInput as RNTextInput, Platform } from 'react-native';

const TextInput = ({ style, ...props }) => {
  return (
    <RNTextInput 
      style={[
        {
          fontFamily: Platform.select({
            ios: 'Montserrat-SemiBold',
            android: 'Montserrat-SemiBold',
          }),
          fontWeight: '500',
        },
        style
      ]} 
      {...props}
    />
  );
};

export default TextInput;
