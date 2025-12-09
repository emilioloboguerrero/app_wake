// Backend endpoint example for token verification
// This should be implemented on your backend server (wakelab.co/api/auth/verify-token)
// You can use Firebase Admin SDK, Node.js, Python, or any backend framework

// Example using Node.js with Express and Firebase Admin SDK

const admin = require('firebase-admin');
const express = require('express');

// Initialize Firebase Admin SDK
// You need to download your service account key from Firebase Console
// https://console.firebase.google.com/project/wolf-20b8b/settings/serviceaccounts/adminsdk

const serviceAccount = require('./path/to/serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const app = express();
app.use(express.json());

// Endpoint: POST /api/auth/verify-token
app.post('/api/auth/verify-token', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    // Verify the ID token from mobile app
    const decodedToken = await admin.auth().verifyIdToken(token);
    const uid = decodedToken.uid;

    // Create a custom token for web app
    const customToken = await admin.auth().createCustomToken(uid);

    res.json({ 
      success: true,
      customToken 
    });
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(401).json({ 
      success: false,
      error: 'Invalid or expired token' 
    });
  }
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// ============================================
// Alternative: Using Firebase Cloud Functions
// ============================================

// If you're using Firebase Cloud Functions, create this function:

/*
const functions = require('firebase-functions');
const admin = require('firebase-admin');

exports.verifyToken = functions.https.onRequest(async (req, res) => {
  // Enable CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    // Verify the ID token
    const decodedToken = await admin.auth().verifyIdToken(token);
    const uid = decodedToken.uid;

    // Create custom token
    const customToken = await admin.auth().createCustomToken(uid);

    res.json({ 
      success: true,
      customToken 
    });
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(401).json({ 
      success: false,
      error: 'Invalid or expired token' 
    });
  }
});
*/

// ============================================
// Deployment Instructions:
// ============================================
// 
// Option 1: Deploy as Cloud Function
// - Create function in Firebase Console
// - Deploy: firebase deploy --only functions
// - URL will be: https://us-central1-wolf-20b8b.cloudfunctions.net/verifyToken
//
// Option 2: Deploy on your own server
// - Deploy Node.js app to your server
// - Set up reverse proxy (nginx) to route /api/auth/verify-token
// - Ensure HTTPS is enabled
//
// Option 3: Use existing backend infrastructure
// - Add endpoint to your existing backend
// - Update URL in autoLogin.js to match your backend















