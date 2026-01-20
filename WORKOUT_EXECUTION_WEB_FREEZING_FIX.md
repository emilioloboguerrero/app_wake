# WorkoutExecutionScreen Web Freezing Issue - Resolution Documentation

## Executive Summary

The `WorkoutExecutionScreen` component was freezing and becoming unresponsive on the web platform. Through systematic debugging, we identified two critical issues:

1. **Blocking FileSystem Access**: The `programMediaService` was accessing `FileSystem.documentDirectory` synchronously in its constructor, causing the entire screen to freeze on web during module import.
2. **Navigation Hook Incompatibility**: `useFocusEffect` from React Navigation was being used unconditionally, but React Router (used on web) doesn't provide a NavigationContainer, causing runtime errors.

## Issue 1: Blocking FileSystem Access

### Problem

The `programMediaService` singleton was accessing `FileSystem.documentDirectory` directly in its constructor:

```javascript
// BEFORE (problematic code)
class ProgramMediaService {
  constructor() {
    this.BASE_DIR = FileSystem.documentDirectory
      ? `${FileSystem.documentDirectory}program_media`
      : null;
    // ... rest of initialization
  }
}
```

### Root Cause

- On web, `expo-file-system/legacy`'s `FileSystem.documentDirectory` can block when accessed synchronously during module import
- When `WorkoutExecutionScreen` imported `programMediaService`, the constructor executed immediately
- This synchronous FileSystem access caused the entire browser thread to freeze
- The screen would render but become completely unresponsive

### Solution

Modified `programMediaService` to use lazy initialization:

1. **Deferred FileSystem Access**: Changed `BASE_DIR` from a constructor assignment to a lazy getter that only accesses `FileSystem.documentDirectory` when actually needed

```javascript
// AFTER (fixed code)
class ProgramMediaService {
  constructor() {
    // FIX: Defer FileSystem access to prevent blocking on web
    this._baseDir = null;
    this._baseDirInitialized = false;
    // ... rest of initialization
  }

  // Lazy getter - only access FileSystem when actually needed
  get BASE_DIR() {
    if (!this._baseDirInitialized) {
      try {
        this._baseDir = FileSystem.documentDirectory
          ? `${FileSystem.documentDirectory}program_media`
          : null;
      } catch (error) {
        logger.error('❌ Error accessing FileSystem.documentDirectory:', error);
        this._baseDir = null;
      }
      this._baseDirInitialized = true;
    }
    return this._baseDir;
  }
}
```

2. **Deferred Manifest Loading**: Moved manifest loading to a delayed `setTimeout` to prevent blocking app startup

```javascript
constructor() {
  // ... initialization
  
  // Load manifests in background (delayed to not block startup)
  setTimeout(() => {
    this._loadAllManifests().catch(error => {
      logger.error('❌ Error loading manifests:', error);
    });
  }, 500); // Delay to not block app startup
}
```

### Impact

- ✅ Screen no longer freezes on web
- ✅ FileSystem access only happens when the service is actually used
- ✅ App startup is not blocked
- ✅ Graceful error handling if FileSystem is unavailable

### Files Modified

- `src/services/programMediaService.js`

---

## Issue 2: Navigation Hook Incompatibility

### Problem

The screen was using `useFocusEffect` from React Navigation unconditionally:

```javascript
// BEFORE (problematic code)
import { useFocusEffect } from '@react-navigation/native';

const WorkoutExecutionScreen = ({ navigation, route }) => {
  // ...
  
  useFocusEffect(
    useCallback(() => {
      // Screen focused logic
      return () => {
        // Screen unfocused logic
      };
    }, [dependencies])
  );
  
  // ...
}
```

### Root Cause

- React Navigation's `useFocusEffect` requires a `NavigationContainer` from `@react-navigation/native`
- On web, the app uses React Router instead of React Navigation's navigation container
- When `useFocusEffect` tried to access the navigation context, it threw: `"Couldn't find a navigation object. Is your component inside NavigationContainer?"`
- This error crashed the component tree and caused unresponsiveness

### Solution

Implemented conditional navigation hooks based on platform:

```javascript
// AFTER (fixed code)
import { useFocusEffect } from '@react-navigation/native';
import { isWeb } from '../utils/platform';

const WorkoutExecutionScreen = ({ navigation, route }) => {
  // ...
  
  // Handle screen focus changes - pause videos when screen loses focus
  // On web, use useEffect instead of useFocusEffect (React Router doesn't have NavigationContainer)
  if (isWeb) {
    useEffect(() => {
      // Screen is focused
      logger.log('🎬 WorkoutExecution screen focused (web)');
      
      return () => {
        // Screen loses focus - pause all videos
        logger.log('🛑 WorkoutExecution screen lost focus - pausing all videos (web)');
        // ... pause video logic
      };
    }, [videoPlayer, swapModalVideoPlayer, addExerciseModalVideoPlayer]);
  } else {
    // Native: use useFocusEffect
    useFocusEffect(
      useCallback(() => {
        // Screen is focused
        logger.log('🎬 WorkoutExecution screen focused');
        
        return () => {
          // Screen loses focus - pause all videos
          logger.log('🛑 WorkoutExecution screen lost focus - pausing all videos');
          // ... pause video logic
        };
      }, [videoPlayer, swapModalVideoPlayer, addExerciseModalVideoPlayer])
    );
  }
  
  // ...
}
```

### Impact

- ✅ Screen works correctly on both web and native platforms
- ✅ Video pause logic functions properly on both platforms
- ✅ No navigation-related runtime errors
- ✅ Proper separation of concerns between web and native navigation

### Files Modified

- `src/screens/WorkoutExecutionScreen.js`

---

## Debugging Process

### Methodology

We used an **incremental restoration** approach to isolate the issues:

1. **Minimal Working Version**: Started with an absolutely minimal component (just a View with Text and a TouchableOpacity)
2. **Incremental Import Testing**: Added imports back in groups to identify blocking imports
3. **Component Isolation**: Identified that `programMediaService` was the blocking import
4. **Service Analysis**: Found the FileSystem access in constructor
5. **Hook Analysis**: Identified `useFocusEffect` incompatibility on web
6. **UI Component Restoration**: After fixing blockers, restored UI components incrementally

### Key Debugging Steps

1. **Stripped to minimal render** - Confirmed screen can render basic elements
2. **Added imports incrementally** - Identified `programMediaService` as blocker
3. **Analyzed service initialization** - Found synchronous FileSystem access
4. **Implemented lazy loading fix** - Screen no longer froze on import
5. **Encountered navigation error** - `useFocusEffect` failed on web
6. **Implemented conditional hooks** - Platform-specific navigation handling
7. **Restored UI components** - Incrementally added back original UI elements

### Logs and Indicators

Key indicators during debugging:

- **Freezing without errors**: Screen rendered but became completely unresponsive
- **Console logs stopping**: Logs would appear up to a certain point then freeze
- **Navigation error**: `"Couldn't find a navigation object. Is your component inside NavigationContainer?"`
- **FileSystem blocking**: Import of `programMediaService` caused immediate freeze

---

## Best Practices Established

### 1. Lazy Initialization for Platform-Specific APIs

**Pattern**: Defer access to platform-specific APIs (like FileSystem) until actually needed.

```javascript
// ❌ BAD: Access in constructor
constructor() {
  this.BASE_DIR = FileSystem.documentDirectory + 'path';
}

// ✅ GOOD: Lazy getter
constructor() {
  this._baseDir = null;
  this._baseDirInitialized = false;
}

get BASE_DIR() {
  if (!this._baseDirInitialized) {
    try {
      this._baseDir = FileSystem.documentDirectory
        ? `${FileSystem.documentDirectory}path`
        : null;
    } catch (error) {
      this._baseDir = null;
    }
    this._baseDirInitialized = true;
  }
  return this._baseDir;
}
```

### 2. Platform-Conditional Navigation Hooks

**Pattern**: Use platform checks to select appropriate navigation hooks.

```javascript
import { isWeb } from '../utils/platform';
import { useFocusEffect } from '@react-navigation/native';
import { useEffect } from 'react';

// Web: use useEffect
if (isWeb) {
  useEffect(() => {
    // Focus logic
    return () => {
      // Unfocus logic
    };
  }, [dependencies]);
} else {
  // Native: use useFocusEffect
  useFocusEffect(
    useCallback(() => {
      // Focus logic
      return () => {
        // Unfocus logic
      };
    }, [dependencies])
  );
}
```

### 3. Deferred Heavy Operations

**Pattern**: Use `setTimeout` or similar to defer non-critical initialization.

```javascript
constructor() {
  // Critical initialization
  this._criticalData = {};
  
  // Defer non-critical operations
  setTimeout(() => {
    this._loadNonCriticalData().catch(handleError);
  }, 500);
}
```

---

## Testing Checklist

After applying fixes, verify:

- [x] Screen renders without freezing on web
- [x] Screen remains responsive after rendering
- [x] No navigation-related errors in console
- [x] FileSystem-dependent features work when accessed (not at import time)
- [x] Video pause logic works on both web and native
- [x] Component handles focus/blur events correctly on both platforms

---

## Future Considerations

### 1. Other Services

Check other services that might have similar issues:
- `assetBundleService.js` - Also accesses `FileSystem.documentDirectory` in constructor
- Any service that imports `expo-file-system` synchronously

### 2. Import Strategy

Consider implementing a lazy import pattern for services that are only needed conditionally:

```javascript
// Instead of direct import
// import programMediaService from '../services/programMediaService';

// Use lazy loader function
const getProgramMediaService = () => {
  return require('../services/programMediaService').default;
};
```

### 3. Platform Detection

Ensure all platform-specific code uses the `isWeb` utility consistently:
- FileSystem access
- Navigation hooks
- Video players
- Storage APIs

---

## Related Files

- `src/screens/WorkoutExecutionScreen.js` - Main component fixed
- `src/services/programMediaService.js` - Service with lazy initialization fix
- `src/utils/platform.js` - Platform detection utility
- `src/contexts/AuthContext.js` - Auth context used by screen
- `src/contexts/VideoContext.js` - Video context used by screen

---

## Timeline

1. **Initial Report**: Screen freezing on web
2. **Debugging Phase**: Incremental component stripping and import testing
3. **Issue 1 Identified**: `programMediaService` blocking FileSystem access
4. **Issue 1 Fixed**: Lazy initialization implemented
5. **Issue 2 Identified**: `useFocusEffect` incompatibility on web
6. **Issue 2 Fixed**: Platform-conditional navigation hooks
7. **UI Restoration**: Incremental component restoration (ongoing)
8. **Documentation**: This document created

---

## Conclusion

The web freezing issues were caused by:
1. **Synchronous blocking operations** in service constructors (FileSystem access)
2. **Platform-incompatible navigation hooks** (useFocusEffect on React Router)

Both issues have been resolved with:
- **Lazy initialization patterns** for platform-specific APIs
- **Platform-conditional code** for navigation hooks

The screen now works correctly on both web and native platforms, with proper error handling and graceful degradation when platform features are unavailable.
