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
  autoComplete, // For web autocomplete attribute
  textContentType, // For iOS autocomplete
  name, // For web form name attribute
  id, // For web form id attribute
  ...props
}) => {
  // Determine autocomplete value for web
  let webAutoComplete = autoComplete;
  if (isWeb && !webAutoComplete) {
    // Auto-detect based on keyboardType and secureTextEntry
    if (keyboardType === 'email-address') {
      webAutoComplete = 'email';
    } else if (secureTextEntry) {
      webAutoComplete = 'current-password';
    } else if (placeholder?.toLowerCase().includes('nombre') || placeholder?.toLowerCase().includes('name')) {
      webAutoComplete = 'name';
    }
  }

  // Determine name attribute for web (helps password managers)
  let webName = name;
  if (isWeb && !webName) {
    if (keyboardType === 'email-address') {
      webName = 'email';
    } else if (secureTextEntry) {
      webName = 'password';
    } else if (webAutoComplete === 'name') {
      webName = 'name';
    }
  }

  // Determine id attribute for web (required for proper autofill)
  let webId = id;
  if (isWeb && !webId && webName) {
    // Use name as id if id not provided
    webId = webName;
  }

  // CRITICAL FIX: For password fields on web, use native HTML input to prevent freeze
  // React Native Web's secureTextEntry can cause freeze when password manager triggers
  if (isWeb && secureTextEntry) {
    // Use native HTML input for password fields - completely bypasses React Native Web
    return (
      <View style={styles.container}>
        <input
          type="password"
          placeholder={placeholder}
          value={value || ''}
          onChange={(e) => {
            if (onChangeText) {
              onChangeText(e.target.value);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && onSubmitEditing) {
              onSubmitEditing();
            }
          }}
          style={{
            width: '100%',
            height: 56,
            backgroundColor: error ? '#3a2a2a' : '#2a2a2a',
            borderRadius: 12,
            paddingLeft: 20,
            paddingRight: 20,
            fontSize: 16,
            fontWeight: 400,
            color: '#ffffff',
            borderWidth: 1,
            borderStyle: 'solid',
            borderColor: error ? '#FF6B6B' : '#333',
            outline: 'none',
            boxSizing: 'border-box',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif',
          }}
          // Explicitly DO NOT set autocomplete, name, or id to prevent password manager freeze
        />
        {error && (
          <Text style={styles.errorText}>{error}</Text>
        )}
      </View>
    );
  }

  // For non-password fields, use normal React Native TextInput
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
        // Web autocomplete, name, and id (helps password managers work correctly)
        {...(isWeb && webAutoComplete ? { autoComplete: webAutoComplete } : {})}
        {...(isWeb && webName ? { name: webName } : {})}
        {...(isWeb && webId ? { id: webId } : {})}
        // iOS autocomplete
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
