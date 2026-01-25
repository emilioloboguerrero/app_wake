import React from 'react';
import {
TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  Image,
  View,
  useWindowDimensions,
} from 'react-native';

const Button = ({
  title,
  onPress,
  disabled = false,
  loading = false,
  variant = 'primary', // 'primary', 'secondary', 'social'
  icon = null,
  active = false, // Active state for golden color
  ...props
}) => {
  // Use hook for reactive dimensions that update on orientation change
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const dynamicButtonStyle = {
    width: Math.max(280, screenWidth * 0.7),
    height: Math.max(50, screenHeight * 0.06),
    borderRadius: Math.max(12, screenWidth * 0.04),
  };

  const getButtonStyle = () => {
    if (active && !disabled) {
      return [styles.button, dynamicButtonStyle, styles.activeButton];
    }
    
    switch (variant) {
      case 'secondary':
        return [styles.button, dynamicButtonStyle, styles.secondaryButton, disabled && styles.disabledButton];
      case 'social':
        return [styles.button, dynamicButtonStyle, styles.socialButton, disabled && styles.disabledButton];
      default:
        return [styles.button, dynamicButtonStyle, styles.primaryButton, disabled && styles.disabledButton];
    }
  };

  const getTextStyle = () => {
    // Disabled state overrides all variants
    if (disabled) {
      return [styles.buttonText, styles.disabledText];
    }
    
    // Active state overrides all variants
    if (active && !disabled) {
      return [styles.buttonText, styles.activeText];
    }
    
    switch (variant) {
      case 'secondary':
        return [styles.buttonText, styles.secondaryText];
      case 'social':
        return [styles.buttonText, styles.socialText];
      default:
        return [styles.buttonText, styles.primaryText];
    }
  };

  const renderContent = () => {
    if (loading) {
      const indicatorColor = (active && !disabled) ? 'rgba(191, 168, 77, 1)' : '#ffffff';
      return <ActivityIndicator color={indicatorColor} size="small" />;
    }

    if (icon) {
      return (
        <View style={styles.buttonContent}>
          <Image source={icon} style={styles.buttonIcon} />
          <Text style={getTextStyle()}>{title}</Text>
        </View>
      );
    }

    return <Text style={getTextStyle()}>{title}</Text>;
  };

  return (
    <TouchableOpacity
      style={getButtonStyle()}
      onPress={onPress}
      disabled={disabled || loading}
      {...props}
    >
      {renderContent()}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    alignSelf: 'center',
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonIcon: {
    width: 20,
    height: 20,
    marginRight: 12,
  },
  primaryButton: {
    backgroundColor: 'rgba(191, 168, 77, 0.2)',
  },
  secondaryButton: {
    backgroundColor: '#007AFF',
  },
  socialButton: {
    backgroundColor: '#333333',
  },
  activeButton: {
    backgroundColor: 'rgba(191, 168, 77, 0.2)',
    borderWidth: 0,
  },
  disabledButton: {
    backgroundColor: '#666666',
    opacity: 0.7,
  },
  buttonText: {
    fontSize: 18,
    fontWeight: '700',
  },
  primaryText: {
    color: 'rgba(191, 168, 77, 1)',
  },
  secondaryText: {
    color: '#ffffff',
  },
  socialText: {
    color: '#ffffff',
  },
  activeText: {
    color: 'rgba(191, 168, 77, 1)',
    fontWeight: '700',
  },
  disabledText: {
    color: '#ffffff',
  },
});

export default Button;
