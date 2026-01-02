// FIXED Input component - prevents password manager freeze
import React, { useRef, useEffect } from 'react';
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
  const inputRef = useRef(null);
  
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

  // CRITICAL FIX: Delay setting password attributes to prevent freeze
  // This prevents the password manager from triggering during initial render
  useEffect(() => {
    if (isWeb && secureTextEntry && inputRef.current) {
      // Set attributes after a small delay to prevent password manager from freezing
      const timer = setTimeout(() => {
        try {
          const element = inputRef.current;
          if (element && element.setNativeProps) {
            // Use setNativeProps to set attributes without triggering re-render
            if (webId) {
              element.setAttribute?.('id', webId);
            }
            if (webName) {
              element.setAttribute?.('name', webName);
            }
            if (webAutoComplete) {
              element.setAttribute?.('autocomplete', webAutoComplete);
            }
          }
        } catch (e) {
          console.warn('Failed to set password field attributes:', e);
        }
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [isWeb, secureTextEntry, webId, webName, webAutoComplete]);

  // For password fields on web, use a more defensive approach
  const webProps = isWeb ? {
    // Only set autocomplete for non-password fields immediately
    ...(secureTextEntry ? {} : (webAutoComplete ? { autoComplete: webAutoComplete } : {})),
    // Only set name/id for non-password fields immediately
    ...(secureTextEntry ? {} : (webName ? { name: webName } : {})),
    ...(secureTextEntry ? {} : (webId ? { id: webId } : {})),
  } : {};

  return (
    <View style={styles.container}>
      <TextInput
        ref={inputRef}
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
        // For password fields, set these after render to prevent freeze
        {...webProps}
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

