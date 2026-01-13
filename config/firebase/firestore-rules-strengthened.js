// Strengthened Firestore Security Rules for Wake
// Enhanced with role-based access control and better security

rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // ============================================
    // HELPER FUNCTIONS
    // ============================================
    
    // Check if user is authenticated
    function isSignedIn() {
      return request.auth != null;
    }
    
    // Check if user is the owner of a resource
    function isOwner(userId) {
      return isSignedIn() && request.auth.uid == userId;
    }
    
    // Check user role
    function hasRole(role) {
      return isSignedIn() && 
             get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == role;
    }
    
    // Check if user is admin
    function isAdmin() {
      return hasRole('admin');
    }
    
    // Check if user is creator
    function isCreator() {
      return hasRole('creator');
    }
    
    // Check if user is creator of specific resource
    function isResourceCreator(creatorId) {
      return isSignedIn() && request.auth.uid == creatorId;
    }
    
    // ============================================
    // USER DATA
    // ============================================
    
    // Users collection - only owner or admin can access
    match /users/{userId} {
      allow read: if isOwner(userId) || isAdmin();
      allow create: if isSignedIn() && request.auth.uid == userId;
      allow update: if isOwner(userId);
      allow delete: if isOwner(userId) || isAdmin();
    }
    
    // ============================================
    // COURSE CONTENT (Read for all, Write for creators only)
    // ============================================
    
    // Courses - All authenticated users can read, only creators can write their own
    match /courses/{courseId} {
      allow read: if isSignedIn();
      
      // Only creator of the course or admin can write
      allow create: if isCreator() || isAdmin();
      allow update: if isAdmin() || 
                     (isCreator() && isResourceCreator(resource.data.creator_id));
      allow delete: if isAdmin() || 
                     (isCreator() && isResourceCreator(resource.data.creator_id));
    }
    
    // Modules subcollection - nested under courses
    match /courses/{courseId}/modules/{moduleId} {
      allow read: if isSignedIn();
      allow create: if isCreator() || isAdmin();
      allow update: if isAdmin() || isCreator();
      allow delete: if isAdmin();
      
      // Sessions subcollection - nested under modules
      match /sessions/{sessionId} {
        allow read: if isSignedIn();
        allow create: if isCreator() || isAdmin();
        allow update: if isAdmin() || isCreator();
        allow delete: if isAdmin();
        
        // Exercises subcollection - nested under sessions
        match /exercises/{exerciseId} {
          allow read: if isSignedIn();
          allow create: if isCreator() || isAdmin();
          allow update: if isAdmin() || isCreator();
          allow delete: if isAdmin();
          
          // Sets subcollection - nested under exercises
          match /sets/{setId} {
            allow read: if isSignedIn();
            allow create: if isCreator() || isAdmin();
            allow update: if isAdmin() || isCreator();
            allow delete: if isAdmin();
          }
        }
      }
    }
    
    // ============================================
    // USER PROGRESS & DATA
    // ============================================
    
    // User progress - only owner can access
    match /user_progress/{userId} {
      allow read, write: if isOwner(userId);
    }
    
    // User courses - only owner can access
    match /user_courses/{userId} {
      allow read, write: if isOwner(userId);
    }
    
    // Session progress - only owner can access
    match /session_progress/{userId} {
      allow read, write: if isOwner(userId);
    }
    
    // Workout progress - only owner can access
    match /workout_progress/{userId} {
      allow read, write: if isOwner(userId);
    }
    
    // Completed sessions - only owner can access
    match /completed_sessions/{sessionId} {
      allow read: if isSignedIn() && resource.data.userId == request.auth.uid;
      allow create: if isSignedIn() && request.resource.data.userId == request.auth.uid;
      allow update, delete: if isSignedIn() && resource.data.userId == request.auth.uid;
    }
    
    // ============================================
    // PURCHASES
    // ============================================
    
    // Purchases - users can create, admins can read all, users can read their own
    match /purchases/{purchaseId} {
      allow read: if isAdmin() || 
                   (isSignedIn() && resource.data.user_id == request.auth.uid);
      allow create: if isSignedIn() && request.resource.data.user_id == request.auth.uid;
      allow update, delete: if isAdmin();
    }
    
    // ============================================
    // DEFAULT DENY
    // ============================================
    
    // Deny all other access by default (secure by default)
    match /{document=**} {
      allow read, write: if false;
    }
  }
}

// ============================================
// HOW TO APPLY THESE RULES
// ============================================
// 
// 1. Go to Firebase Console: https://console.firebase.google.com/
// 2. Select your project: wolf-20b8b
// 3. Navigate to: Firestore Database → Rules
// 4. Copy everything EXCEPT the comments at the bottom
// 5. Paste into Firebase Console
// 6. Click "Publish"
//
// ============================================
// WHAT CHANGED
// ============================================
//
// ✅ Added role-based access control (admin, creator, user)
// ✅ Only creators can edit their own courses (not all authenticated users)
// ✅ Changed default rule from "allow all authenticated" to "deny all"
// ✅ Added helper functions for cleaner rules
// ✅ Added purchases collection rules
// ✅ More granular control over who can create/update/delete
//
// ============================================
// SECURITY IMPROVEMENTS
// ============================================
//
// Before: Any authenticated user could edit courses, modules, sessions
// After: Only creators and admins can edit content
//
// Before: Default rule allowed any authenticated user to read/write anything
// After: Default rule denies everything (secure by default)
//
// Before: No role checks
// After: Proper role-based access control
//
