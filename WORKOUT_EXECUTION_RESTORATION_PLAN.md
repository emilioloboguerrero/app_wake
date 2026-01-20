# WorkoutExecutionScreen Complete Restoration Plan

## Overview
This document provides a detailed, step-by-step plan to restore the `WorkoutExecutionScreen` from its current minimal state to full functionality, identifying and fixing the freezing issue in the process.

## Current State Analysis

### What Works
- ✅ SimpleButtonTestScreen works (proves navigation/routing is fine)
- ✅ Basic React Native Web rendering works
- ✅ Button interactions work
- ✅ Component is wrapped in `React.memo` with proper comparison

### What's Disabled/Removed
- All main UI components (ScrollView structure, video cards, muscle SVG, etc.)
- All useEffect hooks (initialization, video loading, focus handling)
- Complex useMemo hooks (`horizontalCardsContent`, `filteredAvailableExercises`)
- `useSetData` initialization useEffect
- Video URI loading and preloading
- All modals (Swap, Set Input, Exercise Detail, etc.)

### Critical Functions That Must Work
1. `getCurrentExercise()` - Returns current exercise from workout
2. `getCurrentSet()` - Returns current set from current exercise
3. `muscleVolumesForCurrentExercise` useMemo - Calculates muscle volumes for SVG
4. All 4 `usePlatformVideoPlayer` hooks (already working based on logs)

---

## Phase 1: Basic Structure Foundation
**Goal:** Establish the basic screen layout with SafeAreaView, header, and scrollable content area.

### Step 1.1: Replace Minimal Return with Basic Structure
**File:** `src/screens/WorkoutExecutionScreen.js`  
**Location:** Around line 3635  
**Action:** Replace the minimal View return with SafeAreaView + FixedWakeHeader + ScrollView structure

**Code to implement:**
```jsx
return (
  <SafeAreaView style={styles.container}>
    <FixedWakeHeader 
      showBackButton={true}
      onBackPress={() => {
        console.log('[PHASE1] Back button pressed');
        navigation.goBack();
      }}
    />
    <ScrollView 
      style={styles.scrollView}
      contentContainerStyle={styles.content}
      ref={scrollViewRef}
    >
      <View style={styles.testSection}>
        <Text style={{ color: '#ffffff', fontSize: 20, marginBottom: 20 }}>
          Phase 1: Basic Structure
        </Text>
        <Text style={{ color: '#ffffff', fontSize: 16, marginBottom: 10 }}>
          Exercise: {currentExercise?.name || 'N/A'}
        </Text>
        <Text style={{ color: '#ffffff', fontSize: 16, marginBottom: 10 }}>
          Current Set Index: {currentSetIndex + 1}
        </Text>
        <Text style={{ color: '#ffffff', fontSize: 16, marginBottom: 20 }}>
          Loading: {loading ? 'Yes' : 'No'}
        </Text>
        <TouchableOpacity
          style={{
            backgroundColor: '#BFA84D',
            paddingHorizontal: 30,
            paddingVertical: 15,
            borderRadius: 8,
            marginTop: 20,
          }}
          onPress={() => {
            console.log('[PHASE1] 🟢 TEST BUTTON PRESSED - Screen is responsive!');
            alert('Phase 1: Button works! Screen is responsive.');
          }}
          onPressIn={() => {
            console.log('[PHASE1] 🟡 TEST BUTTON PRESS IN');
          }}
        >
          <Text style={{ color: '#1a1a1a', fontSize: 16, fontWeight: '600' }}>
            TEST BUTTON (Phase 1)
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  </SafeAreaView>
);
```

**Test Checklist:**
- [ ] Screen renders without freezing
- [ ] FixedWakeHeader appears at top
- [ ] Back button is visible and clickable
- [ ] ScrollView allows scrolling (even if empty)
- [ ] Test button is immediately responsive
- [ ] Exercise name displays correctly
- [ ] Console shows no errors

**If this fails:**
- Check if `FixedWakeHeader` import exists (line 56)
- Check if `scrollViewRef` is declared (line 642)
- Check if `styles.container` exists (should be around line 3690)

---

## Phase 2: Essential State Variables
**Goal:** Ensure all critical state variables are properly initialized and accessible.

### Step 2.1: Verify Current State Variables
**Current state variables (already exist, verify they work):**
- `workout` - Workout object from route params
- `currentExerciseIndex` - Index of current exercise (default: 0)
- `currentSetIndex` - Index of current set (default: 0)
- `loading` - Loading state (default: false)
- `sessionData` - Session data (default: null)

**Action:** No code changes, just verify these are accessible in the render.

**Test:** Add console logs:
```jsx
console.log('[PHASE2] State check:', {
  hasWorkout: !!workout,
  exerciseCount: workout?.exercises?.length || 0,
  currentExerciseIndex,
  currentSetIndex,
  loading
});
```

### Step 2.2: Verify Helper Functions
**Functions to verify:**
- `getCurrentExercise()` - Should return exercise at `currentExerciseIndex`
- `getCurrentSet()` - Should return set at `currentSetIndex`

**Location:** Lines 3188-3197

**Code check:**
```jsx
const currentExercise = getCurrentExercise();
const currentSet = getCurrentSet();

console.log('[PHASE2] Helper functions:', {
  currentExerciseName: currentExercise?.name,
  hasCurrentSet: !!currentSet,
  currentSetId: currentSet?.id
});
```

**Test Checklist:**
- [ ] `getCurrentExercise()` returns correct exercise
- [ ] `getCurrentSet()` returns correct set
- [ ] Functions don't throw errors when exercise/set is null
- [ ] Console logs show expected values

---

## Phase 3: Simple useMemo Hooks
**Goal:** Add computed values safely without blocking renders.

### Step 3.1: Verify `muscleVolumesForCurrentExercise` useMemo
**Location:** Lines 3555-3569  
**Current Status:** Already exists and should be working

**Action:** Verify it's being used correctly. Add test display:
```jsx
const muscleVolumesForCurrentExercise = useMemo(() => {
  console.log('[PHASE3] muscleVolumesForCurrentExercise recalculating');
  if (!currentExercise?.muscle_activation) return {};
  
  const volumes = {};
  Object.entries(currentExercise.muscle_activation).forEach(([muscle, pct]) => {
    const numeric = typeof pct === 'number' ? pct : parseFloat(pct);
    if (!isNaN(numeric) && numeric > 0) {
      volumes[muscle] = numeric / 5;
    }
  });
  console.log('[PHASE3] muscleVolumes calculated:', Object.keys(volumes).length, 'muscles');
  return volumes;
}, [currentExercise]);

// Add to render for testing:
<Text style={{ color: '#ffffff', fontSize: 14, marginTop: 10 }}>
  Muscle Volumes: {Object.keys(muscleVolumesForCurrentExercise).length} muscles
</Text>
```

**Test Checklist:**
- [ ] useMemo only recalculates when `currentExercise` changes
- [ ] Console shows recalculation log (should only appear when exercise changes)
- [ ] No infinite loops (check console for rapid repeated logs)
- [ ] Muscle count displays correctly

**If infinite loop detected:**
- Check `currentExercise` dependency - it should be from `getCurrentExercise()`
- Ensure `getCurrentExercise()` is called outside useMemo, stored in variable
- Add guard: `if (!currentExercise) return {};` at start of useMemo

---

## Phase 4: Simple useEffect Hooks (One at a Time!)
**Goal:** Add side effects safely, preventing re-render loops.

### Step 4.1: Add Simple Logging useEffect
**Risk Level:** Very Low  
**Purpose:** Test that useEffect works without causing issues

**Code:**
```jsx
// Add AFTER all useState declarations, BEFORE return statement
useEffect(() => {
  console.log('[PHASE4.1] Simple useEffect triggered');
  console.log('[PHASE4.1] Current exercise:', currentExercise?.name);
  console.log('[PHASE4.1] Current set index:', currentSetIndex);
}, [currentExercise, currentSetIndex]);
```

**Test Checklist:**
- [ ] useEffect runs on mount
- [ ] useEffect runs when dependencies change (but not infinitely)
- [ ] Console shows logs as expected
- [ ] Button still works immediately

**Expected Behavior:**
- Should log once on mount
- Should log again when exercise or set index changes
- Should NOT log continuously (if it does, you have an infinite loop)

### Step 4.2: Re-enable useSetData Initialization (WITH GUARDS)
**Risk Level:** High (was causing re-renders)  
**Location:** Lines 219-287 (inside `useSetData` hook)

**Current Status:** Completely disabled with early return

**Action:** Re-enable with aggressive guards and deferred state update:

```jsx
// Inside useSetData hook, replace the disabled useEffect:
useEffect(() => {
  console.log('[PHASE4.2] useSetData useEffect triggered');
  
  // Guard 1: Check if workout exists
  if (!workout?.exercises) {
    console.log('[PHASE4.2] No workout exercises, skipping');
    return;
  }
  
  // Guard 2: Check if already initialized
  if (initializedRef.current) {
    console.log('[PHASE4.2] Already initialized, skipping');
    return;
  }
  
  // Guard 3: Prevent multiple initializations
  initializedRef.current = true;
  console.log('[PHASE4.2] Initializing setData structure');
  
  const initialSetData = {};
  workout.exercises.forEach((exercise, exerciseIndex) => {
    if (exercise.sets) {
      exercise.sets.forEach((set, setIndex) => {
        const key = `${exerciseIndex}_${setIndex}`;
        const setFields = {};
        
        if (exercise.measures && exercise.measures.length > 0) {
          exercise.measures.forEach(field => {
            setFields[field] = '';
          });
        } else {
          Object.keys(set).forEach(field => {
            const skipFields = [
              'id', 'order', 'notes', 'description', 'title', 'name',
              'created_at', 'updated_at', 'createdAt', 'updatedAt',
              'type', 'status', 'category', 'tags', 'metadata'
            ];
            
            if (!skipFields.includes(field)) {
              setFields[field] = '';
            }
          });
        }
        
        initialSetData[key] = setFields;
      });
    }
  });
  
  console.log('[PHASE4.2] Initial setData built:', Object.keys(initialSetData).length, 'sets');
  
  // CRITICAL: Defer state update on web to prevent blocking render
  if (isWeb) {
    // Use setTimeout with multiple delays to ensure it's after paint
    setTimeout(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          console.log('[PHASE4.2] Setting setData (deferred on web)');
          setSetData(initialSetData);
        });
      });
    }, 100);
  } else {
    setSetData(initialSetData);
  }
}, [workout]); // Only depend on workout, not setSetData
```

**Test Checklist:**
- [ ] useEffect runs only once (check console)
- [ ] `initializedRef.current` prevents re-runs
- [ ] State update happens after render (check timing of logs)
- [ ] Button still works immediately
- [ ] No infinite re-renders

**If issues occur:**
- Increase setTimeout delay to 200ms or 500ms
- Add additional guard: `if (Object.keys(setData).length > 0) return;`
- Move `initializedRef.current = true` to BEFORE building initialSetData

---

## Phase 5: Add UI Components (One by One)
**Goal:** Add visual components, testing each for freezing issues.

### Step 5.1: Add Exercise Title Section
**Risk Level:** Low  
**Purpose:** Display basic exercise information

**Code to add (inside ScrollView content):**
```jsx
{/* Exercise Title Section */}
<View style={styles.exerciseTitleSection}>
  <Text style={styles.exerciseTitle}>
    {currentExercise?.name || 'No exercise selected'}
  </Text>
  {currentExercise?.description && (
    <Text style={styles.exerciseDescription}>
      {currentExercise.description}
    </Text>
  )}
</View>
```

**Test Checklist:**
- [ ] Exercise name displays
- [ ] Description displays if available
- [ ] No layout issues
- [ ] Button still works

### Step 5.2: Add WorkoutTopCardSection Component
**Risk Level:** Medium (contains MuscleSilhouetteSVG which can be heavy)  
**Location:** Already imported (line 30)

**Code to add:**
```jsx
{/* Top Card Section - Muscle SVG and Implements */}
{currentExercise && (
  <WorkoutTopCardSection
    exercise={currentExercise}
    muscleVolumes={muscleVolumesForCurrentExercise}
    showMuscleSVG={showMuscleSVG}
  />
)}
```

**Important:** The `showMuscleSVG` state should already exist (line 630), and it defaults to `!isWeb` (false on web initially).

**Test Checklist:**
- [ ] Component renders without freezing
- [ ] Implements display correctly
- [ ] Muscle SVG appears (after `showMuscleSVG` becomes true)
- [ ] Button still works immediately

**If it freezes:**
- Check WorkoutTopCardSection component for heavy computations
- Verify `muscleVolumesForCurrentExercise` is not recalculating infinitely
- Try setting `showMuscleSVG={false}` to isolate SVG as issue

### Step 5.3: Add Basic Set Information Display
**Risk Level:** Low

**Code:**
```jsx
{/* Current Set Info */}
{currentSet && (
  <View style={styles.setInfoSection}>
    <Text style={styles.setInfoTitle}>
      Set {currentSetIndex + 1} de {currentExercise?.sets?.length || 0}
    </Text>
    {currentExercise?.measures?.map((measure, idx) => (
      <View key={idx} style={styles.measureRow}>
        <Text style={styles.measureLabel}>
          {translateMetric(measure)}:
        </Text>
        <Text style={styles.measureValue}>
          {setData[`${currentExerciseIndex}_${currentSetIndex}`]?.[measure] || '-'}
        </Text>
      </View>
    ))}
  </View>
)}
```

**Test Checklist:**
- [ ] Set information displays
- [ ] Measures display correctly
- [ ] setData is accessible
- [ ] Button still works

---

## Phase 6: Complex Components (High Risk)
**Goal:** Add components with internal logic and state.

### Step 6.1: Add WorkoutHorizontalCards (WITH WEIGHT SUGGESTIONS DISABLED)
**Risk Level:** Very High (calls `getWeightSuggestion()` which was blocking)  
**Location:** Already imported (line 29)

**Strategy:** Add component but pass a stub function for weight suggestions initially.

**Code to add:**
```jsx
{/* Horizontal Cards - Objectives and Buttons */}
{currentExercise && currentSet && (
  <WorkoutHorizontalCards
    exercise={currentExercise}
    currentSet={currentSet}
    currentExerciseIndex={currentExerciseIndex}
    currentSetIndex={currentSetIndex}
    setData={setData}
    updateSetData={updateSetDataLocal}
    setValidationErrors={setValidationErrors}
    hasValidationErrors={hasValidationErrors}
    onNextSet={() => {
      console.log('[PHASE6] Next set pressed');
      // Will implement navigation later
    }}
    onPreviousSet={() => {
      console.log('[PHASE6] Previous set pressed');
      // Will implement navigation later
    }}
    // DISABLE weight suggestions initially
    getWeightSuggestion={() => {
      console.log('[PHASE6] getWeightSuggestion called (stub)');
      return null; // Return null to disable
    }}
  />
)}
```

**Test Checklist:**
- [ ] Component renders
- [ ] No freezing
- [ ] Buttons in component work
- [ ] Main test button still works

**If it freezes:**
- Check WorkoutHorizontalCards component for useMemo/useEffect that might be blocking
- Verify component isn't calling `getWeightSuggestion` during render
- Check component's internal state management

### Step 6.2: Enable Real Weight Suggestions (CAREFULLY)
**Risk Level:** Extremely High

**First, find where `getWeightSuggestion` is defined and understand what it does:**
```jsx
// Search for: const getWeightSuggestion = 
// It likely uses oneRepMaxEstimates and exercise history
```

**Strategy:** 
1. Wrap `getWeightSuggestion` calls in try-catch
2. Add debouncing/throttling
3. Defer calculation to useEffect if possible
4. Add extensive logging

**Code modification:**
```jsx
// Create a safe wrapper function
const safeGetWeightSuggestion = useCallback((exercise, set, setIndex) => {
  try {
    console.log('[PHASE6.2] getWeightSuggestion called for:', exercise?.name);
    const startTime = performance.now();
    
    const suggestion = getWeightSuggestion(
      exercise,
      set,
      setIndex,
      oneRepMaxEstimates,
      // ... other params
    );
    
    const endTime = performance.now();
    console.log('[PHASE6.2] getWeightSuggestion completed in', endTime - startTime, 'ms');
    
    return suggestion;
  } catch (error) {
    console.error('[PHASE6.2] getWeightSuggestion error:', error);
    return null;
  }
}, [oneRepMaxEstimates, /* other deps */]);

// Then pass safeGetWeightSuggestion to WorkoutHorizontalCards
```

**Test Checklist:**
- [ ] Function executes without blocking
- [ ] Execution time is reasonable (<100ms ideally)
- [ ] No infinite loops
- [ ] Errors are caught and logged
- [ ] Button still works

---

## Phase 7: Video Player Integration
**Goal:** Add video playback functionality without blocking.

### Step 7.1: Add Video URI Loading (WITH DEFERRAL)
**Risk Level:** Medium

**Location:** Lines 915-937 (currently disabled)

**Code to re-enable:**
```jsx
useEffect(() => {
  console.log('[PHASE7.1] Video URI effect triggered');
  
  const currentExercise = workout?.exercises?.[currentExerciseIndex];
  if (!currentExercise) {
    console.log('[PHASE7.1] No current exercise, clearing video URI');
    setVideoUri(null);
    return;
  }

  // Defer video path resolution on web
  const loadVideoUri = () => {
    try {
      const localPath = programMediaService.getExerciseVideoPath(
        course?.courseId,
        currentExercise.primary,
        currentExercise.video_url
      );
      const uri = localPath || currentExercise.video_url || null;
      console.log('[PHASE7.1] Video URI resolved:', uri ? 'has URI' : 'no URI');
      setVideoUri(uri);
    } catch (error) {
      console.error('[PHASE7.1] Error resolving video URI:', error);
      setVideoUri(currentExercise.video_url || null);
    }
  };
  
  if (isWeb) {
    // Defer on web to prevent blocking
    setTimeout(loadVideoUri, 50);
  } else {
    loadVideoUri();
  }
}, [currentExerciseIndex, workout?.exercises, course?.courseId]);
```

**Test Checklist:**
- [ ] Video URI updates when exercise changes
- [ ] No blocking during URI resolution
- [ ] Button still works
- [ ] Console shows URI resolution logs

### Step 7.2: Add PlatformVideoView Component
**Risk Level:** Medium-High (video players can be heavy)

**Code:**
```jsx
{/* Video Player Section */}
{videoUri && (
  <View style={styles.videoContainer}>
    <PlatformVideoView
      player={videoPlayer}
      videoUrl={videoUri}
      style={styles.videoPlayer}
      contentFit="cover"
      nativeControls={true}
      allowsPictureInPicture={false}
    />
  </View>
)}
```

**Test Checklist:**
- [ ] Video player renders
- [ ] Video loads (may take time)
- [ ] Controls work
- [ ] No freezing during video load
- [ ] Button still works

### Step 7.3: Add Video Sync Effects (ONE AT A TIME)
**Risk Level:** High (can cause re-render loops)

**Mute sync (lines 941-949):**
```jsx
useEffect(() => {
  console.log('[PHASE7.3] Mute sync effect triggered, isMuted:', isMuted);
  if (videoPlayer) {
    try {
      videoPlayer.muted = isMuted;
      console.log('[PHASE7.3] Video muted state updated');
    } catch (error) {
      console.error('[PHASE7.3] Error updating mute state:', error);
    }
  }
}, [isMuted, videoPlayer]);
```

**Play/pause sync (lines 950-970):**
```jsx
useEffect(() => {
  console.log('[PHASE7.3] Video sync effect triggered:', {
    hasVideoPlayer: !!videoPlayer,
    canStartVideo,
    isVideoPaused,
    hasVideoUri: !!videoUri
  });
  
  if (!videoPlayer || !videoUri) {
    console.log('[PHASE7.3] No video player or URI, skipping sync');
    return;
  }
  
  if (canStartVideo && !isVideoPaused) {
    try {
      console.log('[PHASE7.3] Playing video');
      videoPlayer.play();
    } catch (error) {
      console.error('[PHASE7.3] Error playing video:', error);
    }
  } else {
    try {
      console.log('[PHASE7.3] Pausing video');
      videoPlayer.pause();
    } catch (error) {
      console.error('[PHASE7.3] Error pausing video:', error);
    }
  }
}, [videoPlayer, canStartVideo, isVideoPaused, videoUri]);
```

**Test Checklist:**
- [ ] Each effect runs independently
- [ ] No infinite loops (check console)
- [ ] Video responds to state changes
- [ ] Button still works

---

## Phase 8: Exercise List View
**Goal:** Add the exercise list/swipe functionality.

### Step 8.1: Add View Toggle Button
**Risk Level:** Low

**Code:**
```jsx
{/* View Toggle */}
<TouchableOpacity
  style={styles.viewToggleButton}
  onPress={() => {
    console.log('[PHASE8] Toggling view, current:', currentView);
    setCurrentView(currentView === 0 ? 1 : 0);
  }}
>
  <Text style={styles.viewToggleText}>
    {currentView === 0 ? 'Ver Lista' : 'Ver Ejercicio'}
  </Text>
</TouchableOpacity>
```

### Step 8.2: Add Conditional Rendering for Views
**Risk Level:** Low

**Code:**
```jsx
{currentView === 0 ? (
  // Exercise Detail View (current content)
  <>
    {/* All existing exercise detail content */}
  </>
) : (
  // Exercise List View
  <WorkoutExerciseList
    workout={workout}
    currentExerciseIndex={currentExerciseIndex}
    onExerciseSelect={(index) => {
      console.log('[PHASE8] Exercise selected:', index);
      setCurrentExerciseIndex(index);
      setCurrentSetIndex(0);
      setCurrentView(0); // Switch back to detail view
    }}
  />
)}
```

**Test Checklist:**
- [ ] Toggle button works
- [ ] Views switch correctly
- [ ] Exercise selection works
- [ ] Button still works

---

## Phase 9: Modals
**Goal:** Add modal components one by one.

### Step 9.1: Add Exercise Detail Modal
**Risk Level:** Low-Medium

**Code:**
```jsx
<ExerciseDetailModal
  visible={isExerciseDetailModalVisible}
  exercise={modalExerciseData}
  onClose={() => {
    setIsExerciseDetailModalVisible(false);
    setModalExerciseData(null);
  }}
/>
```

### Step 9.2: Add Set Input Modal
**Risk Level:** Medium (has form logic)

### Step 9.3: Add Swap Modal
**Risk Level:** Medium-High (has video player)

### Step 9.4: Add Remaining Modals
- Objective Info Modal
- Add Exercise Modal
- Filter Modal

**Test Checklist for Each:**
- [ ] Modal opens without freezing
- [ ] Modal closes properly
- [ ] Interactions work
- [ ] Backdrop/touch outside works
- [ ] Main screen button still works

---

## Phase 10: Advanced Features
**Goal:** Restore all remaining functionality.

### Step 10.1: Re-enable Main Initialization Effect
**Location:** Lines 692-736

**Key considerations:**
- Defers MuscleSilhouetteSVG rendering on web
- Tracks screen views
- Initializes workout state

### Step 10.2: Add Tutorial System
**Location:** Lines 843-911

### Step 10.3: Add Edit Mode
**Location:** Various (search for `isEditMode`)

### Step 10.4: Add Gesture Handlers
- Swipe between exercises
- Drag and drop for reordering

### Step 10.5: Add All Remaining Features
- Workout completion
- Progress tracking
- Analytics
- etc.

---

## Critical Testing After Each Phase

### Immediate Checks:
1. **Button Responsiveness Test:**
   ```jsx
   <TouchableOpacity onPress={() => alert('Works!')}>
     <Text>TEST BUTTON</Text>
   </TouchableOpacity>
   ```
   - This button MUST work immediately after every change
   - If it doesn't, you've introduced a blocker

2. **Console Monitoring:**
   - Watch for infinite loops (rapid repeated logs)
   - Watch for errors
   - Watch for performance warnings
   - Monitor render counts

3. **Performance Check:**
   - Screen should render within 1 second
   - Interactions should be instant (<100ms)
   - No dropped frames during scrolling

### Red Flags to Watch For:

1. **Infinite Re-render Loop:**
   - **Symptom:** Console logs repeating rapidly, screen frozen
   - **Common Causes:**
     - useEffect with missing/wrong dependencies
     - State update in render causing state update
     - useMemo dependency changing on every render
   - **Fix:** Add guards, fix dependencies, use refs

2. **Blocking Synchronous Operation:**
   - **Symptom:** Screen freezes during render, then recovers
   - **Common Causes:**
     - Heavy computation in render/useMemo
     - Synchronous file I/O
     - Large object cloning/transformation
   - **Fix:** Defer with setTimeout, use web workers, optimize computation

3. **Memory Leak:**
   - **Symptom:** Performance degrades over time
   - **Common Causes:**
     - Missing cleanup in useEffect
     - Event listeners not removed
     - Timers not cleared
   - **Fix:** Always return cleanup functions

4. **Cascading State Updates:**
   - **Symptom:** Multiple state updates in rapid succession
   - **Common Causes:**
     - useEffect triggering other useEffect
     - State update causing dependency change
   - **Fix:** Batch updates, use refs to prevent cascades

---

## Rollback Strategy

If a step causes issues:

1. **Immediate Rollback:**
   - Comment out the new code
   - Revert to previous working state
   - Test that button still works

2. **Investigation:**
   - Add extensive logging around the problematic code
   - Check console for errors/warnings
   - Use React DevTools Profiler to identify bottlenecks

3. **Fix:**
   - Isolate the issue to specific line/function
   - Apply fixes (guards, deferral, optimization)
   - Test in isolation before re-integrating

4. **Alternative Approach:**
   - If direct fix doesn't work, try alternative implementation
   - Break down into smaller pieces
   - Defer to later phase if necessary

---

## Success Criteria

The restoration is complete when:

✅ Screen loads without freezing  
✅ All UI components render correctly  
✅ All interactions work (buttons, scrolling, modals)  
✅ Video playback works  
✅ Exercise navigation works  
✅ Set input and validation work  
✅ Exercise swapping works  
✅ Edit mode works  
✅ All modals open/close correctly  
✅ Performance is acceptable (no lag)  
✅ No console errors or warnings  
✅ Test button remains responsive throughout  

---

## Notes

- **Take it slow:** Don't rush through phases
- **Test thoroughly:** Test after every single change
- **Document issues:** Keep track of what works and what doesn't
- **Ask for help:** If stuck on a step for too long, document the issue clearly
- **Be patient:** This is a complex screen with many interdependent parts

Good luck! 🚀
