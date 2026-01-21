# Lazy Loading Implementation - WorkoutExecutionScreen

## Overview
All imports have been converted to lazy loading to prevent blocking operations during module initialization on web. This follows the recommendations from `WORKOUT_EXECUTION_WEB_FREEZING_FIX.md`.

## Changes Made

### 1. Services - All Converted to Lazy Loading
All service imports are now lazy-loaded using `require()`:

- ✅ `sessionManager`
- ✅ `sessionService`
- ✅ `tutorialManager`
- ✅ `programMediaService`
- ✅ `videoCacheService`
- ✅ `objectivesInfoService`
- ✅ `exerciseLibraryService`
- ✅ `exerciseHistoryService`
- ✅ `oneRepMaxService`
- ✅ `appResourcesService`
- ✅ `assetBundleService`
- ✅ `monitoringService` (trackScreenView, trackWorkoutStarted, trackWorkoutCompleted)

**Implementation:**
```javascript
const getSessionManager = () => {
  console.log('[LAZY] Loading sessionManager...');
  return require('../services/sessionManager').default;
};
```

### 2. Components - All Converted to Lazy Loading
All component imports are now lazy-loaded:

- ✅ `TutorialOverlay`
- ✅ `ExerciseDetailModal`
- ✅ `WakeHeader` (FixedWakeHeader, WakeHeaderSpacer)
- ✅ `MuscleSilhouetteSVG`

**Implementation:**
```javascript
const getTutorialOverlay = () => {
  console.log('[LAZY] Loading TutorialOverlay...');
  return require('../components/TutorialOverlay').default;
};
```

### 3. Icons - All Converted to Lazy Loading
All icon imports are now lazy-loaded:

- ✅ `SvgPlay`
- ✅ `SvgVolumeMax`
- ✅ `SvgVolumeOff`
- ✅ `SvgArrowReload`
- ✅ `SvgListChecklist`
- ✅ `SvgArrowLeftRight`
- ✅ `SvgPlus`
- ✅ `SvgMinus`
- ✅ `SvgInfo`
- ✅ `SvgChartLine`
- ✅ `SvgDragVertical`
- ✅ `SvgSearchMagnifyingGlass`
- ✅ `SvgChevronLeft`
- ✅ `SvgFileRemove`
- ✅ `SvgFileUpload`

**Implementation:**
```javascript
const getSvgPlay = () => {
  return require('../components/icons/SvgPlay').default;
};
```

### 4. Constants - Converted to Lazy Loading
- ✅ `getMuscleDisplayName` from `../constants/muscles`

**Implementation:**
```javascript
const getMuscleConstants = () => {
  console.log('[LAZY] Loading muscle constants...');
  return require('../constants/muscles');
};
```

### 5. Module-Level Code Moved Inside Component
- ✅ `Dimensions.get('window')` moved inside component to prevent blocking

**Before:**
```javascript
const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
```

**After:**
```javascript
const WorkoutExecutionScreen = ({ navigation, route }) => {
  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
  // ...
};
```

### 6. Component Definitions
- ✅ `ExerciseItem` - Moved inside component using `useMemo` to access lazy-loaded icons
- ✅ `SetInputField` - Kept at module level (doesn't use lazy-loaded dependencies)
- ✅ `useSetData` - Kept at module level (hook, doesn't use lazy-loaded dependencies)

## Direct Imports (Not Lazy Loaded)
These remain as direct imports because they are:
- Lightweight and non-blocking
- Required for hooks/utilities that must be available immediately
- Part of React/React Native core

**React/React Native:**
- `React`, `useState`, `useEffect`, `useRef`, `useCallback`, `useMemo`, `memo`
- All React Native components (View, Text, etc.)
- `Dimensions`, `Animated`, `Modal`, etc.

**Hooks & Contexts:**
- `useAuth` from `../contexts/AuthContext`
- `useVideo` from `../contexts/VideoContext`
- `useFocusEffect` from `@react-navigation/native`

**Utilities:**
- `isWeb` from `../utils/platform`
- `logger` from `../utils/logger.js`

**Third-Party:**
- `PanGestureHandler`, `State` from `react-native-gesture-handler`
- `VideoView`, `useVideoPlayer` from `expo-video`
- Firebase imports (`firestore`, `doc`, `getDoc`)

## Usage Pattern

All lazy-loaded items are loaded at the start of the component:

```javascript
const WorkoutExecutionScreen = ({ navigation, route }) => {
  // Get dimensions
  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
  
  // Lazy load services
  const sessionManager = getSessionManager();
  const sessionService = getSessionService();
  // ... etc
  
  // Lazy load components
  const TutorialOverlay = getTutorialOverlay();
  // ... etc
  
  // Lazy load icons
  const SvgPlay = getSvgPlay();
  // ... etc
  
  // Rest of component...
};
```

## Benefits

1. **No Blocking on Module Load**: Services/components are only loaded when the component renders
2. **Faster Initial Load**: Module initialization is much faster
3. **Better Error Isolation**: If a service fails to load, it's isolated to that specific require
4. **Debugging**: Console logs show exactly which items are being loaded

## Testing

When testing, check the console for:
- `[LAZY] Loading [service/component]...` messages
- These should appear when the component renders, not when the module loads
- If you see a freeze, the last `[LAZY]` message shows what was blocking

## Future Optimizations

1. **Conditional Loading**: Load services only when actually needed (e.g., load `tutorialManager` only when checking for tutorials)
2. **Code Splitting**: Use React.lazy() for components that are conditionally rendered
3. **Service Caching**: Cache loaded services to avoid re-requiring

## Notes

- All lazy loaders use `require()` which is synchronous but non-blocking for module initialization
- Icons are loaded eagerly at component start (they're lightweight)
- Services are loaded eagerly at component start (they're needed for component functionality)
- Components are loaded eagerly at component start (they're needed for rendering)

This approach balances performance (no blocking on module load) with simplicity (services available immediately in component).
