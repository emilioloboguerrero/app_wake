# PWA Conversion Developer Guide - Complete Documentation

## Table of Contents
1. [Project Overview](#project-overview)
2. [Original Requirements and Investigation](#original-requirements-and-investigation)
3. [PWA Conversion Architecture](#pwa-conversion-architecture)
4. [Implementation Requirements](#implementation-requirements)
5. [Technical Implementation Details](#technical-implementation-details)
6. [Known Issues and Fixes](#known-issues-and-fixes)
7. [Current State and Isolation Strategy](#current-state-and-isolation-strategy)
8. [Developer Workflow](#developer-workflow)
9. [Testing Guidelines](#testing-guidelines)

---

## Project Overview

### Business Context
This project involves converting a React Native mobile app (built with Expo) into a Progressive Web App (PWA) to:
- **Bypass App Store requirements** and distribution restrictions
- **Reduce payment processing costs** by using MercadoPago instead of In-App Purchases (IAP)
- **Maintain native-like UX/performance** on web platforms
- **Enable direct distribution** to users without app store approval processes

### Technology Stack
- **Framework**: Expo (React Native with web support via `react-native-web`)
- **Navigation**: React Navigation (native) / React Router (web)
- **Backend**: Firebase (Auth, Firestore, Storage, Cloud Functions)
- **Payments**: MercadoPago integration
- **State Management**: React Context API
- **Storage**: AsyncStorage (native) / IndexedDB via `webStorageService` (web)

---

## Original Requirements and Investigation

### Phase 1: Investigation Phase (No Implementation)

The initial requirements were to **investigate and design only**, with no code changes:

#### 1.1 Deep App Structure Investigation
**Requirement**: Investigate the entire app structure comprehensively:
- All files in `src/` directory
- All `assets/` and static files
- All service files (`services/`)
- All configuration files (`app.config.js`, `package.json`, `metro.config.js`, etc.)
- All data management files
- All navigation files
- All screen components

**Purpose**: Understand the complete codebase to identify:
- Native module dependencies
- Platform-specific code paths
- Storage mechanisms
- Navigation patterns
- Authentication flows
- Payment integrations

#### 1.2 PWA vs Native App Analysis
**Requirement**: Provide detailed comparison covering:

**For Users:**
- Installation differences (home screen vs app store)
- Performance expectations
- Feature availability
- Offline capabilities
- Update mechanisms
- Storage limitations
- Browser compatibility

**For UI/UX:**
- Responsive design requirements
- Touch interaction differences
- Animation performance
- Loading states
- Navigation patterns
- Platform-specific UI conventions

**For Development:**
- Code sharing strategies
- Platform-specific implementations
- Testing approaches
- Deployment processes
- Debugging tools

#### 1.3 Payment System Requirements
**Primary Concern**: IAP commission costs are too high for the business model.

**Requirements:**
- Use existing MercadoPago payment system instead of IAP
- Explain limitations of PWA for payment processing
- Evaluate Web Payments API compatibility
- Assess PCI compliance requirements
- Consider payment flow UX differences

#### 1.4 UX/Performance Requirements
**Critical Requirement**: Maintain best possible UX and performance.

**Constraints:**
- Must keep current UI functionality
- Willing to rebuild components if necessary for optimal web performance
- Deep file-by-file investigation required
- Design complete system architecture
- Ensure maximum functionality preservation

**No Implementation Allowed**: This phase was investigation and design documentation only.

---

## PWA Conversion Architecture

### Architecture Overview

The PWA conversion follows a **hybrid approach**:

1. **Shared Core**: React components and business logic shared between platforms
2. **Platform-Specific Implementations**: `.web.js` files for web-specific code
3. **Platform Detection**: `src/utils/platform.js` for conditional logic
4. **Unified Storage Layer**: `webStorageService` abstracts IndexedDB for web

### File Structure Strategy

```
src/
├── screens/
│   ├── LoginScreen.js          # Native implementation
│   ├── LoginScreen.web.js      # Web-specific implementation
│   └── MainScreen.js            # Shared (with platform checks)
├── services/
│   ├── webStorageService.js    # IndexedDB wrapper for web
│   ├── googleAuthService.js    # Platform-specific auth (popup vs native)
│   └── profilePictureService.js # Platform-specific image handling
├── navigation/
│   ├── AppNavigator.js         # React Navigation (native)
│   └── WebAppNavigator.jsx     # React Router (web)
├── config/
│   └── firebase.js             # Platform-specific auth persistence
└── utils/
    └── platform.js             # Platform detection utilities
```

### Key Architectural Decisions

#### 1. Dual Entry Points
- `index.js`: Native app entry (Expo)
- `index.web.js`: Web app entry (React Router setup)
- `App.js`: Native app component
- `App.web.js`: Web app component (isolated login route handling)

#### 2. Storage Abstraction
**Problem**: Native uses AsyncStorage, web needs IndexedDB

**Solution**: `webStorageService.js` provides AsyncStorage-compatible API:
```javascript
// Same API on both platforms
await storage.setItem('key', 'value');
const value = await storage.getItem('key');
```

**Implementation**: 
- Web: IndexedDB with object stores
- Native: AsyncStorage (existing)

#### 3. Authentication Strategy
**Problem**: Different persistence mechanisms needed

**Solution**: Platform-specific Firebase Auth initialization:
```javascript
// Web: Browser persistence (IndexedDB)
if (isWeb) {
  auth = getAuth(app);
}

// Native: AsyncStorage persistence
else {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage)
  });
}
```

#### 4. Navigation Strategy
**Problem**: React Navigation doesn't work on web

**Solution**: Dual navigation systems:
- Native: React Navigation (`@react-navigation/native`)
- Web: React Router (`react-router-dom`)

**Shared Route Logic**: Both use same route definitions, different implementations.

#### 5. Payment Integration
**Solution**: MercadoPago Web Checkout
- Uses `EpaycoWebView` component (react-native-webview works on web)
- Opens MercadoPago checkout URL in modal
- Handles success/error callbacks
- Updates Firestore with purchase status

---

## Implementation Requirements

### Feature Restoration Requirements

After the design phase, implementation was requested for:

#### 1. LibraryScreen Restoration
**Requirement**: Restore previous functionality showing all published programs.

**Changes Required:**
- Modify `ProgramLibraryScreen.js` to fetch all published courses (not just purchased)
- Display all courses from Firestore `courses` collection with `published: true`
- Add purchase button that opens payment modal
- Update info modal text to reflect library functionality

**Implementation Notes:**
- Use `firestoreService.getAllPublishedCourses()` method
- Display courses with purchase buttons (not "View Course" buttons)
- Handle purchase flow via `purchaseService.preparePurchase()`

#### 2. Account Creation on LoginScreen
**Requirement**: Add account creation functionality to login screen.

**Changes Required:**
- Add toggle between "Login" and "Create Account" modes
- Add display name input field (visible only in registration mode)
- Implement `authService.registerUser()` call for new accounts
- Create Firestore user document on registration
- Handle registration-specific validation and errors

**UI Changes:**
- Toggle text: "¿No tienes una cuenta? Crear cuenta" / "¿Ya tienes una cuenta? Inicia sesión"
- Display name input appears when in registration mode
- Button text changes: "Iniciar Sesión" / "Crear Cuenta"
- Form validation includes name validation (min 2 characters)

#### 3. Subscription Page Restoration
**Requirement**: Restore subscription management page.

**Verification Needed:**
- Check `SubscriptionsScreen.js` functionality
- Verify subscription display logic
- Ensure MercadoPago subscription data is correctly shown
- Test subscription cancellation/management features

#### 4. Remove Apple Sign-In
**Requirement**: Remove all Apple Sign-In functionality, keep only email/Google.

**Files to Modify:**
- `src/screens/LoginScreen.js`: Remove Apple button and handlers
- `src/screens/ProfileScreen.js`: Remove Apple reauthentication logic
- `src/services/appleAuthService.js`: Can be removed or left unused
- `app.config.js`: Remove `expo-apple-authentication` plugin reference

**Implementation Details:**
- Remove all `appleAuthService` imports
- Remove Apple Sign-In UI components
- Remove Apple authentication state management
- Keep email/password and Google Sign-In only

#### 5. Comprehensive File Investigation
**Requirement**: Review all files to identify needed adjustments.

**Areas to Check:**
- All screen components for native module usage
- All services for AsyncStorage dependencies
- All navigation files for React Navigation hooks
- All data management files for platform-specific APIs
- Configuration files for web compatibility

---

## Technical Implementation Details

### 1. Platform Detection Utility

**File**: `src/utils/platform.js`

```javascript
export const isWeb = typeof window !== 'undefined' && typeof document !== 'undefined';
export const isNative = !isWeb;
```

**Usage Pattern**:
```javascript
import { isWeb } from '../utils/platform';

if (isWeb) {
  // Web-specific code
  const input = document.createElement('input');
} else {
  // Native-specific code
  const result = await ImagePicker.launchImageLibraryAsync();
}
```

### 2. Web Storage Service

**File**: `src/services/webStorageService.js`

**Purpose**: Provides AsyncStorage-compatible API using IndexedDB on web.

**Key Methods**:
- `init()`: Initialize IndexedDB database (non-blocking)
- `getItem(key)`: Retrieve value from storage
- `setItem(key, value)`: Store value in storage
- `removeItem(key)`: Delete value from storage
- `clear()`: Clear all stored data

**Implementation Notes**:
- Uses IndexedDB with object store named 'keyvalue'
- All values stored as strings (JSON.stringify for objects)
- Handles database upgrades and errors gracefully
- Non-blocking initialization to prevent app freeze

### 3. Firebase Auth Configuration

**File**: `src/config/firebase.js`

**Critical Implementation**:
```javascript
let auth;
try {
  if (isWeb) {
    // Web: Use default browser persistence (IndexedDB)
    auth = getAuth(app);
  } else {
    // Native: Use AsyncStorage persistence
    const { getReactNativePersistence } = require('firebase/auth');
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    auth = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage)
    });
  }
} catch (error) {
  if (error.code === 'auth/already-initialized') {
    auth = getAuth(app);
  } else {
    throw error;
  }
}
```

**Why This Matters**: `getReactNativePersistence` doesn't exist on web, causing crashes without platform detection.

### 4. Google Authentication

**File**: `src/services/googleAuthService.js`

**Web Implementation**:
```javascript
if (isWeb) {
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  // Handle result...
}
```

**Native Implementation**:
```javascript
else {
  await GoogleSignin.hasPlayServices();
  const userInfo = await GoogleSignin.signIn();
  const credential = GoogleAuthProvider.credential(userInfo.idToken);
  await signInWithCredential(auth, credential);
}
```

### 5. Profile Picture Service

**File**: `src/services/profilePictureService.js`

**Web Implementation**: HTML5 file input + Canvas compression
```javascript
if (isWeb) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  // Handle file selection, compress with canvas, upload to Firebase
}
```

**Native Implementation**: Expo ImagePicker + ImageManipulator
```javascript
else {
  const result = await ImagePicker.launchImageLibraryAsync();
  const manipulated = await manipulateAsync(uri, [{ resize: { width: 400 } }]);
  // Upload manipulated image
}
```

### 6. Web Navigation Setup

**File**: `src/navigation/WebAppNavigator.jsx`

**Structure**:
```javascript
<BrowserRouter>
  <Routes>
    <Route path="/login" element={<LoginScreen />} />
    <Route path="/" element={
      <AuthenticatedLayout>
        <MainScreen />
      </AuthenticatedLayout>
    } />
    {/* Other routes... */}
  </Routes>
</BrowserRouter>
```

**AuthenticatedLayout Component**:
- Checks authentication status
- Fetches user profile from Firestore
- Handles onboarding redirects
- Prevents infinite loops with ref-based tracking

### 7. Payment Flow Integration

**Purchase Flow**:
1. User clicks purchase button on course
2. `purchaseService.preparePurchase()` called
3. For subscriptions: Fetches user email from Firestore
4. Calls Firebase Cloud Function `createPaymentPreference`
5. Receives MercadoPago checkout URL
6. Opens `EpaycoWebView` modal with checkout URL
7. User completes payment on MercadoPago
8. WebView navigates to success/error callback URLs
9. Firestore listener detects purchase completion
10. Course access granted to user

**Key Files**:
- `src/services/purchaseService.js`: Orchestrates purchase flow
- `src/components/EpaycoWebView.js`: Handles MercadoPago checkout
- `src/screens/CourseDetailScreen.js`: Initiates purchase flow

---

## Known Issues and Fixes

### Issue 1: Web Bundling Errors

**Error**: `Unable to resolve "../styles/global.css" from "src/App.web.js"`

**Root Cause**: Incorrect import path (one directory level too high)

**Fix**: Changed from `../styles/global.css` to `./styles/global.css`

**Files Modified**: `src/App.web.js`

---

### Issue 2: Firebase Auth Persistence Error

**Error**: `TypeError: (0 , _firebaseAuth.getReactNativePersistence) is not a function`

**Root Cause**: `getReactNativePersistence` is React Native-only, not available on web

**Fix**: Added platform detection in `src/config/firebase.js`:
```javascript
if (isWeb) {
  auth = getAuth(app); // Uses browser persistence
} else {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage)
  });
}
```

**Files Modified**: `src/config/firebase.js`

---

### Issue 3: App Freezing on Startup

**Symptoms**: Page becomes unresponsive immediately on load

**Root Causes Identified**:
1. Blocking initialization operations
2. Native-only services being called on web
3. Environment variable issues (`__DEV__` not available on web)
4. Font loading blocking render
5. Infinite loops in navigation

**Fixes Applied**:

**3.1 Non-Blocking Initialization**
- Made `webStorageService.init()` non-blocking
- Skipped native-only services (session manager, workout progress, monitoring)
- Added timeout protection for async operations

**3.2 Environment Variable Fix**
**File**: `src/config/environment.js`
```javascript
const getEnvironment = () => {
  if (typeof window !== 'undefined') {
    if (window.location.hostname === 'localhost') {
      return ENV.DEVELOPMENT;
    }
    return process.env.NODE_ENV === 'production' ? ENV.PRODUCTION : ENV.DEVELOPMENT;
  } else if (typeof __DEV__ !== 'undefined' && __DEV__) {
    return ENV.DEVELOPMENT;
  }
  return ENV.PRODUCTION;
};
```

**3.3 Font Loading Fix**
**File**: `src/config/fonts.js`
- Added `web` and `default` fallbacks to `Platform.select()`

**3.4 ErrorBoundary Web Compatibility**
**File**: `src/components/ErrorBoundary.js`
- Conditionally import `monitoringService` only on native
- Skip crash reporting on web

**Files Modified**: 
- `src/App.web.js`
- `src/config/environment.js`
- `src/config/fonts.js`
- `src/components/ErrorBoundary.js`
- `src/services/webStorageService.js`

---

### Issue 4: React Hooks Violation

**Error**: `React has detected a change in the order of Hooks called by App`

**Root Cause**: `useEffect` hook placed after conditional return statement

**Fix**: Moved all hooks before any conditional returns in `App.web.js`

**Rule**: Hooks must always be called in the same order on every render.

**Files Modified**: `src/App.web.js`

---

### Issue 5: Infinite Loop in Navigation

**Symptoms**: App freezes, component renders hundreds of times

**Root Cause**: `AuthenticatedLayout` component causing infinite re-renders:
- `useEffect` dependencies causing re-triggers
- State updates triggering effect again
- Navigation redirects causing re-renders

**Fix**: Used `useRef` to track checked user ID, preventing duplicate checks:
```javascript
const checkedUserIdRef = React.useRef(null);

React.useEffect(() => {
  if (user && checkedUserIdRef.current === user.uid) {
    return; // Already checked this user
  }
  // ... check profile ...
  checkedUserIdRef.current = user.uid;
}, [user?.uid, loading]);
```

**Additional Safeguards**:
- Added 10-second timeout for profile checks
- Added 5-second timeout for Firestore calls
- Used `mounted` flag to prevent state updates after unmount

**Files Modified**: `src/navigation/WebAppNavigator.jsx`

---

### Issue 6: Chrome Extension Errors

**Error**: `GET chrome-extension://... net::ERR_FILE_NOT_FOUND`

**Root Cause**: Browser extension (password manager) trying to load missing files

**Impact**: None - these errors are external to the app

**Fix**: Added error suppression in `web/index.html`:
```javascript
console.error = function(...args) {
  const message = String(args.join(' '));
  if (message.includes('chrome-extension://') || 
      message.includes('ERR_FILE_NOT_FOUND')) {
    return; // Suppress extension errors
  }
  originalError.apply(console, args);
};
```

**Files Modified**: `web/index.html`, `src/App.web.js`

---

### Issue 7: UI Layout Issues

**Symptoms**: Login screen not displaying correctly, logo too large, layout broken

**Root Causes**:
- Conflicting CSS rules for desktop centering
- Logo size incorrect (200x200 instead of 120x60)
- Body positioning conflicts with flex centering

**Fixes**:
- Separated mobile and desktop CSS with media queries
- Fixed logo size in `LoginScreen.js`
- Removed duplicate media queries
- Proper flex centering for desktop view

**Files Modified**: 
- `src/styles/global.css`
- `src/screens/LoginScreen.js`

---

## Current State and Isolation Strategy

### Current Approach: Login Route Isolation

Due to persistent freezing issues, the current strategy isolates the login route completely:

#### 1. Separate Login Screen Component
**File**: `src/screens/LoginScreen.web.js`

- Web-specific implementation
- No dependencies on complex app initialization
- Minimal imports and logic
- Direct Firebase auth integration

#### 2. Early Route Detection in App.web.js
```javascript
const isLoginPath = typeof window !== 'undefined' && window.location.pathname === '/login';

if (isLoginPath) {
  // Bypass fonts, initialization, ErrorBoundary, providers, routing
  return <LoginScreen />;
}
```

#### 3. Simplified WebAppNavigator
- Login route handled separately before auth checks
- Authenticated routes only processed if not on login route
- Prevents auth context initialization issues on login

#### 4. Service Worker Bypass for Login
```javascript
const isLoginPath = window.location.pathname === '/login';
if (!isLoginPath) {
  // Register service worker
} else {
  // Unregister service worker for login route
}
```

### Why This Approach?

**Benefits**:
- Login screen loads immediately without complex initialization
- No risk of infinite loops from navigation/auth logic
- Faster initial load time
- Easier to debug and maintain

**Trade-offs**:
- Duplicate login screen code (web vs native)
- Login route doesn't benefit from app-wide providers
- Need to handle auth state after login separately

### Migration Path

Once login is stable, gradually reintroduce:
1. AuthProvider (but with guards)
2. ErrorBoundary
3. Service Worker (with careful registration)
4. Font loading (non-blocking)

---

## Developer Workflow

### Setting Up Development Environment

#### Prerequisites
- Node.js >= 18.0.0
- npm >= 11.7.0
- Firebase project configured
- MercadoPago account and credentials

#### Initial Setup
```bash
# Install dependencies
npm install

# Start development server
npm run web

# App will be available at http://localhost:8081
```

### Development Commands

```bash
# Web development
npm run web

# Native iOS (requires macOS)
npm run ios

# Native Android
npm run android

# Build for production
npm run build:web
```

### Debug Mode

Enable detailed logging:
```javascript
// In browser console
localStorage.setItem('WAKE_DEBUG', 'true');
location.reload();
```

This enables:
- Detailed component render logs
- Performance timing information
- Error stack traces
- Network request logging

### File Modification Guidelines

#### When Adding Platform-Specific Code

1. **Check if platform-specific implementation needed**
   ```javascript
   import { isWeb } from '../utils/platform';
   
   if (isWeb) {
     // Web implementation
   } else {
     // Native implementation
   }
   ```

2. **Create .web.js file if completely different**
   - Example: `LoginScreen.web.js` for web-specific login
   - Use `.web.js` extension for automatic platform resolution

3. **Use platform detection for small differences**
   - Keep shared file, use `isWeb` checks for differences
   - Example: Different image picker APIs

#### When Modifying Shared Code

1. **Test on both platforms** after changes
2. **Check for native module usage** (won't work on web)
3. **Verify AsyncStorage usage** (use `webStorageService` on web)
4. **Test navigation** (React Navigation vs React Router)

### Code Review Checklist

Before submitting changes, verify:

- [ ] Code works on both web and native (or platform-specific files created)
- [ ] No blocking operations in initialization
- [ ] All hooks called before conditional returns
- [ ] No infinite loops in useEffect dependencies
- [ ] Error handling for async operations
- [ ] Timeout protection for network calls
- [ ] Platform detection used correctly
- [ ] Storage operations use `webStorageService` on web
- [ ] Navigation uses React Router on web
- [ ] Firebase Auth uses correct persistence method

---

## Testing Guidelines

### Web Testing

#### Local Testing
1. Start dev server: `npm run web`
2. Open `http://localhost:8081` in browser
3. Test all major user flows:
   - Login/Registration
   - Course browsing
   - Purchase flow
   - Video playback
   - Profile management

#### PWA Testing
1. Build for production: `npm run build:web`
2. Serve production build locally
3. Test "Add to Home Screen" functionality
4. Test offline capabilities
5. Test service worker updates

#### Browser Compatibility
Test on:
- Chrome/Edge (Chromium)
- Safari (iOS and macOS)
- Firefox
- Mobile browsers (iOS Safari, Chrome Mobile)

### Native Testing

#### iOS Testing
```bash
npm run ios
```

#### Android Testing
```bash
npm run android
```

### Critical Test Scenarios

#### 1. Authentication Flow
- [ ] Email/password login works
- [ ] Google Sign-In works (web and native)
- [ ] Account creation works
- [ ] Password reset works
- [ ] Session persistence works after page refresh

#### 2. Purchase Flow
- [ ] Can browse all published courses
- [ ] Purchase button opens payment modal
- [ ] MercadoPago checkout completes
- [ ] Course access granted after payment
- [ ] Subscription purchases work
- [ ] Payment errors handled gracefully

#### 3. Navigation
- [ ] All routes accessible
- [ ] Redirects work correctly (login, onboarding)
- [ ] Back button works
- [ ] Deep linking works
- [ ] No infinite redirect loops

#### 4. Performance
- [ ] App loads within 3 seconds
- [ ] No freezing or hanging
- [ ] Smooth scrolling and animations
- [ ] Images load efficiently
- [ ] Video playback works smoothly

#### 5. Offline Functionality
- [ ] App works with poor connection
- [ ] Cached data displays correctly
- [ ] Offline indicators shown when needed
- [ ] Data syncs when connection restored

### Debugging Tools

#### Browser DevTools
- Console: Check for errors and warnings
- Network: Monitor API calls and resource loading
- Application: Check storage, service workers, cache
- Performance: Profile rendering and script execution
- React DevTools: Inspect component tree and state

#### React Native Debugger
- For native platform debugging
- Network inspector
- Redux DevTools integration
- Element inspector

---

## Next Steps and Recommendations

### Immediate Priorities

1. **Stabilize Login Route**
   - Ensure login screen works reliably
   - Test all authentication methods
   - Verify no freezing or errors

2. **Gradually Reintroduce Features**
   - Add AuthProvider back (with proper guards)
   - Re-enable service worker (carefully)
   - Restore full navigation after login

3. **Performance Optimization**
   - Code splitting for routes
   - Lazy loading of heavy components
   - Image optimization and lazy loading
   - Video preloading strategies

4. **Error Handling**
   - Comprehensive error boundaries
   - User-friendly error messages
   - Error reporting and logging
   - Retry mechanisms for failed operations

### Long-Term Improvements

1. **Progressive Enhancement**
   - Service worker for offline support
   - Background sync for data updates
   - Push notifications (when supported)
   - App-like install experience

2. **Performance Monitoring**
   - Real User Monitoring (RUM)
   - Performance metrics tracking
   - Error tracking and alerting
   - User behavior analytics

3. **Testing Infrastructure**
   - Automated E2E tests
   - Visual regression testing
   - Performance benchmarking
   - Cross-browser testing automation

4. **Documentation**
   - API documentation
   - Component documentation
   - Architecture diagrams
   - Deployment guides

---

## Appendix: Key Files Reference

### Entry Points
- `index.js`: Native app entry
- `index.web.js`: Web app entry
- `App.js`: Native app component
- `App.web.js`: Web app component

### Configuration
- `app.config.js`: Expo configuration
- `package.json`: Dependencies and scripts
- `metro.config.js`: Metro bundler config
- `webpack.config.js`: Webpack config (if used)
- `firebase.json`: Firebase project config

### Core Services
- `src/config/firebase.js`: Firebase initialization
- `src/services/webStorageService.js`: Web storage abstraction
- `src/services/googleAuthService.js`: Google authentication
- `src/services/purchaseService.js`: Purchase flow orchestration
- `src/services/firestoreService.js`: Firestore operations

### Navigation
- `src/navigation/AppNavigator.js`: Native navigation
- `src/navigation/WebAppNavigator.jsx`: Web navigation

### Utilities
- `src/utils/platform.js`: Platform detection
- `src/utils/logger.js`: Logging utility

### Styling
- `src/styles/global.css`: Global web styles
- Component-level StyleSheet for React Native

---

## Support and Resources

### Documentation
- [Expo Web Documentation](https://docs.expo.dev/workflow/web/)
- [React Native Web](https://necolas.github.io/react-native-web/)
- [React Router Documentation](https://reactrouter.com/)
- [Firebase Web SDK](https://firebase.google.com/docs/web/setup)
- [PWA Best Practices](https://web.dev/progressive-web-apps/)

### Common Issues
- Check console for detailed error messages
- Verify Firebase configuration is correct
- Ensure all environment variables are set
- Check network tab for failed requests
- Review service worker registration status

---

**Last Updated**: [Current Date]
**Version**: 1.0.0
**Maintained By**: Development Team

