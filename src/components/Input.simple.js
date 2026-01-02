// SIMPLE Input component - minimal password field (no autocomplete/name/id to prevent freeze)
import React from 'react';
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  Platform,
} from 'react-native';
import { isWeb } from '../utils/platform';

const Input = ({
  placeholder,
  value,
  onChangeText,
  keyboardType = 'default',
  autoCapitalize = 'sentences',
  autoCorrect = true,
  secureTextEntry = false,
  error = null,
  returnKeyType = 'done',
  onSubmitEditing,
  blurOnSubmit = true,
  autoComplete,
  textContentType,
  name,
  id,
  ...props
}) => {
  // For password fields on web, DON'T set autocomplete/name/id to prevent password manager freeze
  const isPasswordField = secureTextEntry;
  
  // Only set web attributes for non-password fields
  let webAutoComplete = null;
  let webName = null;
  let webId = null;
  
  if (isWeb && !isPasswordField) {
    webAutoComplete = autoComplete;
    if (!webAutoComplete) {
      if (keyboardType === 'email-address') {
        webAutoComplete = 'email';
      } else if (placeholder?.toLowerCase().includes('nombre') || placeholder?.toLowerCase().includes('name')) {
        webAutoComplete = 'name';
      }
    }
    
    webName = name;
    if (!webName) {
      if (keyboardType === 'email-address') {
        webName = 'email';
      } else if (webAutoComplete === 'name') {
        webName = 'name';
      }
    }
    
    webId = id;
    if (!webId && webName) {
      webId = webName;
    }
  }

  return (
    <View style={styles.container}>
      <TextInput
        style={[
          styles.input,
          error && styles.inputError
        ]}
        placeholder={placeholder}
        placeholderTextColor={error ? "#FF6B6B" : "#999"}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        secureTextEntry={secureTextEntry}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        blurOnSubmit={blurOnSubmit}
        // Only set web attributes for non-password fields
        {...(isWeb && !isPasswordField && webAutoComplete ? { autoComplete: webAutoComplete } : {})}
        {...(isWeb && !isPasswordField && webName ? { name: webName } : {})}
        {...(isWeb && !isPasswordField && webId ? { id: webId } : {})}
        // iOS autocomplete (works fine on iOS)
        {...(Platform.OS === 'ios' && textContentType ? { textContentType } : {})}
        {...props}
      />
      {error && (
        <Text style={styles.errorText}>{error}</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginBottom: 16,
  },
  input: {
    width: '100%',
    height: 56,
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    paddingHorizontal: 20,
    fontSize: 16,
    fontWeight: '400',
    color: '#ffffff',
    borderWidth: 1,
    borderColor: '#333',
  },
  inputError: {
    borderColor: '#FF6B6B',
    backgroundColor: '#3a2a2a',
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 14,
    fontWeight: '400',
    marginTop: 4,
    marginLeft: 4,
  },
});

export default Input;

