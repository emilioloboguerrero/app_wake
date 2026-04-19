import React from 'react';
import { TextInput as RNTextInput, Platform } from 'react-native';

const TextInput = ({ style, ...props }) => {
  return (
    <RNTextInput 
      style={[
        {
          fontFamily: Platform.select({
            ios: 'Inter-SemiBold',
            android: 'Inter-SemiBold',
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
