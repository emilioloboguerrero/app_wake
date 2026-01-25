import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { withErrorBoundary } from '../utils/withErrorBoundary';
import LoginScreen from '../screens/LoginScreen';

const Stack = createStackNavigator();

const AuthNavigator = () => {
  return (
    <Stack.Navigator
      initialRouteName="Login"
      screenOptions={{
        headerShown: false,
        gestureEnabled: true,
        cardStyle: { backgroundColor: '#1a1a1a' },
      }}
    >
      <Stack.Screen name="Login" component={withErrorBoundary(LoginScreen, 'Login')} />
    </Stack.Navigator>
  );
};

export default AuthNavigator;
