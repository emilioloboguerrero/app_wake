// Auto-login utility for web app
// Handles authentication when user comes from mobile app with token

import { auth } from '../config/firebase';
import { signInWithCustomToken } from 'firebase/auth';

/**
 * Handle auto-login from mobile app token
 * @param {string} token - Firebase ID token from mobile app
 * @returns {Promise<boolean>} True if login successful
 */
export const handleAutoLoginFromToken = async (token) => {
  if (!token) {
    console.log('🔍 Auto-login: No token provided');
    return false;
  }
  
  try {
    console.log('🔍 Auto-login: Attempting to verify token...');
    console.log('🔍 Auto-login: Token length:', token.length);
    console.log('🔍 Auto-login: Token first 50 chars:', token.substring(0, 50));
    
    const functionUrl = 'https://us-central1-wolf-20b8b.cloudfunctions.net/verifyToken';
    console.log('🔍 Auto-login: Calling function URL:', functionUrl);
    
    // Verify token and get custom token from backend
    // Using Firebase Cloud Function
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token }),
    });
    
    console.log('🔍 Auto-login: Fetch completed');
    console.log('🔍 Auto-login: Response type:', response.type);
    console.log('🔍 Auto-login: Response URL:', response.url);
    console.log('🔍 Auto-login: Response redirected:', response.redirected);

    console.log('🔍 Auto-login: Response status:', response.status);
    console.log('🔍 Auto-login: Response headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Token verification failed:', response.status, errorText);
      // If backend is not ready, log but don't throw
      if (response.status === 404) {
        console.warn('⚠️ Backend endpoint not found. Please implement /api/auth/verify-token endpoint.');
      }
      return false;
    }

    // Get response text first to check if it's valid JSON
    const responseText = await response.text();
    console.log('🔍 Auto-login: Response text (first 200 chars):', responseText.substring(0, 200));
    
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      console.error('❌ Failed to parse response as JSON:', parseError);
      console.error('❌ Response text:', responseText);
      return false;
    }
    
    console.log('🔍 Auto-login: Response received:', { success: result.success, hasCustomToken: !!result.customToken });
    
    if (!result.success || !result.customToken) {
      console.error('❌ No custom token received:', result);
      return false;
    }

    console.log('🔍 Auto-login: Signing in with custom token...');
    // Sign in with custom token
    await signInWithCustomToken(auth, result.customToken);
    
    console.log('✅ Auto-login successful');
    return true;
  } catch (error) {
    console.error('❌ Auto-login failed:', error);
    console.error('❌ Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    // If it's a network error (backend not available), log it but don't break
    if (error.message && (error.message.includes('Failed to fetch') || error.message.includes('NetworkError'))) {
      console.warn('⚠️ Backend endpoint not available. User will need to log in manually.');
    }
    return false;
  }
};

/**
 * Extract token from URL and attempt auto-login
 * @returns {Promise<boolean>} True if token found and login attempted
 */
export const handleAutoLoginFromURL = async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');
  
  if (!token) {
    return false;
  }

  // Check if user is already logged in
  if (auth.currentUser) {
    console.log('User already logged in, skipping auto-login');
    return true;
  }

  // Attempt auto-login
  const success = await handleAutoLoginFromToken(token);
  
  // Remove token from URL for security (optional)
  if (success) {
    const newUrl = window.location.pathname + window.location.search.replace(/[?&]token=[^&]*/, '').replace(/^&/, '?');
    window.history.replaceState({}, '', newUrl);
  }
  
  return success;
};

