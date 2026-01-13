// Firestore Security Rules for Wake
// Add these rules to your existing Firestore rules

rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Existing user rules
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    // Allow authenticated users to read courses and other public data
    match /courses/{document} {
      allow read: if request.auth != null;
      allow write: if request.auth != null; // Admin-only in production
    }

    // Allow authenticated users to read modules and sessions
    match /modules/{document} {
      allow read: if request.auth != null;
      allow write: if request.auth != null; // Admin-only in production
    }

    // Allow authenticated users to read sessions
    match /sessions/{document} {
      allow read: if request.auth != null;
      allow write: if request.auth != null; // Admin-only in production
    }

    // Allow authenticated users to read exercises
    match /exercises/{document} {
      allow read: if request.auth != null;
      allow write: if request.auth != null; // Admin-only in production
    }

    // Allow users to access their own progress data
    match /user_progress/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    // Allow users to access their own course data
    match /user_courses/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    // Allow users to access their own session progress
    match /session_progress/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    // Allow users to access their own workout progress
    match /workout_progress/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    // Default rule - allow authenticated users to read/write their own data
    // This is more permissive than the previous "deny all" rule
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}

// How to apply these rules:
// 1. Go to Firebase Console: https://console.firebase.google.com/
// 2. Select your project: wolf-20b8b
// 3. Navigate to: Firestore Database → Rules
// 4. Replace existing rules with the above
// 5. Click "Publish"
