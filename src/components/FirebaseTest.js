import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import authService from '../services/authService';
import firestoreService from '../services/firestoreService';

const FirebaseTest = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [testResult, setTestResult] = useState('');

  // Test Firebase Auth - Register User
  const testRegisterUser = async () => {
    try {
      if (!email || !password || !displayName) {
        Alert.alert('Error', 'Please fill in all fields');
        return;
      }

      setTestResult('Creating user...');
      const user = await authService.registerUser(email, password, displayName);
      
      // Create user document in Firestore
      await firestoreService.createUser(user.uid, {
        email: user.email,
        display_name: displayName,
        role: 'user',
        created_at: new Date().toISOString(),
        generalTutorials: {
          mainScreen: false,
          library: false,
          profile: false,
          community: false
        }
      });

      setTestResult(`✅ User created successfully!\nUID: ${user.uid}\nEmail: ${user.email}`);
      Alert.alert('Success', 'User created and saved to Firestore!');
    } catch (error) {
      setTestResult(`❌ Error: ${error.message}`);
      Alert.alert('Error', error.message);
    }
  };

  // Test Firebase Auth - Sign In
  const testSignIn = async () => {
    try {
      if (!email || !password) {
        Alert.alert('Error', 'Please enter email and password');
        return;
      }

      setTestResult('Signing in...');
      const user = await authService.signInUser(email, password);
      
      setTestResult(`✅ Signed in successfully!\nUID: ${user.uid}\nEmail: ${user.email}`);
      Alert.alert('Success', 'Signed in successfully!');
    } catch (error) {
      setTestResult(`❌ Error: ${error.message}`);
      Alert.alert('Error', error.message);
    }
  };

  // Test Firestore - Read Data
  const testFirestoreRead = async () => {
    try {
      setTestResult('Reading from Firestore...');
      const courses = await firestoreService.getCourses();
      
      setTestResult(`✅ Firestore connection successful!\nFound ${courses.length} courses`);
      Alert.alert('Success', `Firestore working! Found ${courses.length} courses.`);
    } catch (error) {
      setTestResult(`❌ Error: ${error.message}`);
      Alert.alert('Error', error.message);
    }
  };

  // Test Current User
  const testCurrentUser = () => {
    const user = authService.getCurrentUser();
    if (user) {
      setTestResult(`✅ Current user:\nUID: ${user.uid}\nEmail: ${user.email}`);
    } else {
      setTestResult('❌ No user signed in');
    }
  };

  // Sign Out
  const testSignOut = async () => {
    try {
      await authService.signOutUser();
      setTestResult('✅ Signed out successfully');
      Alert.alert('Success', 'Signed out successfully!');
    } catch (error) {
      setTestResult(`❌ Error: ${error.message}`);
      Alert.alert('Error', error.message);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🔥 Firebase Connection Test</Text>
      
      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      
      <TextInput
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      
      <TextInput
        style={styles.input}
        placeholder="Display Name"
        value={displayName}
        onChangeText={setDisplayName}
      />

      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.button} onPress={testRegisterUser}>
          <Text style={styles.buttonText}>Register User</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.button} onPress={testSignIn}>
          <Text style={styles.buttonText}>Sign In</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.button} onPress={testFirestoreRead}>
          <Text style={styles.buttonText}>Test Firestore</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.button} onPress={testCurrentUser}>
          <Text style={styles.buttonText}>Current User</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.button} onPress={testSignOut}>
          <Text style={styles.buttonText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      {testResult ? (
        <View style={styles.resultContainer}>
          <Text style={styles.resultText}>{testResult}</Text>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#1a1a1a',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 30,
  },
  input: {
    backgroundColor: '#333333',
    color: '#ffffff',
    padding: 15,
    borderRadius: 8,
    marginBottom: 15,
    fontSize: 16,
  },
  buttonContainer: {
    gap: 10,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  resultContainer: {
    marginTop: 20,
    padding: 15,
    backgroundColor: '#333333',
    borderRadius: 8,
  },
  resultText: {
    color: '#ffffff',
    fontSize: 14,
    fontFamily: 'monospace',
  },
});

export default FirebaseTest;
