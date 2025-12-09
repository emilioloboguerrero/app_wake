import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth } from '../config/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { getUser } from '../services/firestoreService';

const AuthContext = createContext({});

export const useAuth = () => {
  return useContext(AuthContext);
};

export { AuthContext };

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [webOnboardingCompleted, setWebOnboardingCompleted] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchUserData = async (firebaseUser) => {
      if (firebaseUser) {
      // Fetch user role and onboarding status from Firestore
        try {
          const userData = await getUser(firebaseUser.uid);
          setUserRole(userData?.role || 'user');
        // If field doesn't exist, treat as not completed (false)
        // This ensures all users go through onboarding at least once
        setWebOnboardingCompleted(userData?.webOnboardingCompleted ?? false);
        } catch (error) {
        console.error('Error fetching user data:', error);
          setUserRole('user'); // Default to 'user' if error
        // On error, default to false to ensure onboarding is shown
        setWebOnboardingCompleted(false);
        }
      } else {
        setUserRole(null);
      setWebOnboardingCompleted(null);
      }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      await fetchUserData(firebaseUser);
      setUser(firebaseUser);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const refreshUserData = async () => {
    if (user) {
      await fetchUserData(user);
    }
  };

  const isCreatorValue = userRole === 'creator' || userRole === 'admin';
  const isAdminValue = userRole === 'admin';

  const value = {
    user,
    userRole,
    loading,
    webOnboardingCompleted,
    isCreator: isCreatorValue,
    isAdmin: isAdminValue,
    refreshUserData
  };

  console.log('🔍 AuthContext: Rendering', { 
    loading, 
    hasUser: !!user, 
    userRole, 
    isCreator: isCreatorValue,
    isAdmin: isAdminValue,
    webOnboardingCompleted 
  });
  
  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

