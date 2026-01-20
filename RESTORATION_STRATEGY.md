# WorkoutExecutionScreen Restoration Strategy

## Goal
Incrementally restore components from `WorkoutExecutionScreen` to identify what causes the freeze, fix it, and end up with a fully functional screen.

## Current State
- ✅ Simple test screen works (`SimpleButtonTestScreen`)
- ✅ Navigation/routing works
- ❌ Original `WorkoutExecutionScreen` freezes

## Strategy: Bottom-Up Incremental Restoration

### Phase 1: Basic Structure (Low Risk)
**Goal:** Get the skeleton layout working

1. **Replace return with basic structure:**
   ```jsx
   return (
     <SafeAreaView style={styles.container}>
       <FixedWakeHeader />
       <ScrollView style={styles.scrollView}>
         <View style={styles.content}>
           <Text>Exercise: {currentExercise?.name || 'N/A'}</Text>
           <TouchableOpacity onPress={() => alert('Test')}>
             <Text>TEST BUTTON</Text>
           </TouchableOpacity>
         </View>
       </ScrollView>
     </SafeAreaView>
   );
   ```
   **Test:** Button should work. If it doesn't, `FixedWakeHeader` or `ScrollView` is the issue.

2. **Add basic state variables** (one by one):
   - `loading` state
   - `currentExerciseIndex`
   - `currentSetIndex`
   - Basic workout state

   **Test:** After each addition, verify button still works.

### Phase 2: Simple Components (Low-Medium Risk)
**Goal:** Add visual components without complex logic

3. **Add `WorkoutTopCardSection`** (just the component, minimal props):
   ```jsx
   <WorkoutTopCardSection
     exercise={currentExercise}
     muscleVolumes={muscleVolumesForCurrentExercise}
     showMuscleSVG={true}
   />
   ```
   **Test:** Screen should render. If it freezes, the component has issues.

4. **Add basic exercise info display:**
   - Exercise name
   - Set info
   - Basic text displays

### Phase 3: useMemo Hooks (Medium Risk)
**Goal:** Add computed values, watching for infinite loops

5. **Add simple useMemo hooks** (one at a time):
   ```jsx
   const currentExercise = useMemo(() => {
     return workout?.exercises?.[currentExerciseIndex];
   }, [workout, currentExerciseIndex]);
   ```
   
   **⚠️ CRITICAL:** After each useMemo, check console for:
   - Multiple rapid logs (infinite loop)
   - Long execution times
   - Missing dependencies warnings

6. **Add `muscleVolumesForCurrentExercise` useMemo:**
   - This is already simple, test it

7. **⚠️ SKIP `horizontalCardsContent` useMemo for now** - This calls `getWeightSuggestion()` which might be blocking.

### Phase 4: useEffect Hooks (HIGH RISK - One at a time!)
**Goal:** Add side effects, but they can cause re-render loops

8. **Add simplest useEffect first** (no state updates):
   ```jsx
   useEffect(() => {
     console.log('[TEST] Current exercise changed:', currentExercise?.name);
   }, [currentExercise]);
   ```
   **Test:** Should log once per exercise change. Multiple logs = infinite loop.

9. **Re-enable `useSetData` useEffect** (WITH GUARDS):
   ```jsx
   useEffect(() => {
     if (!workout?.exercises || initializedRef.current) return;
     initializedRef.current = true;
     
     // Use setTimeout to defer state update on web
     if (isWeb) {
       setTimeout(() => {
         setSetData(initialSetData);
       }, 100);
     } else {
       setSetData(initialSetData);
     }
   }, [workout]); // Only depend on workout
   ```
   **Test:** Should only run once. If multiple times, add more guards.

10. **Add video URI effect** (WITH EARLY RETURNS):
    ```jsx
    useEffect(() => {
      if (!workout?.exercises?.[currentExerciseIndex]) return;
      
      const exercise = workout.exercises[currentExerciseIndex];
      const localPath = programMediaService.getExerciseVideoPath(...);
      setVideoUri(localPath || exercise.video_url || null);
    }, [currentExerciseIndex, workout]); // Minimal dependencies
    ```

11. **Add other useEffect hooks one by one:**
    - Main initialization (deferred)
    - Video mute sync
    - Video play/pause sync
    - Focus/blur handling

    **Test after EACH one:** Button must still work.

### Phase 5: Complex Components (Medium-High Risk)
**Goal:** Add components with internal logic

12. **Add `WorkoutHorizontalCards`** (disable weight suggestions initially):
    ```jsx
    <WorkoutHorizontalCards
      exercise={currentExercise}
      setData={setData}
      updateSetData={updateSetDataLocal}
      // ... other props
      // Pass getWeightSuggestion={null} to disable it
    />
    ```
    **Test:** If it freezes, check component's internal useMemo/useEffect.

13. **Add `WorkoutExerciseList`**:
    - Start with minimal props
    - Test before adding full functionality

14. **Add video player component:**
    ```jsx
    <PlatformVideoView
      player={videoPlayer}
      videoUrl={videoUri}
      // minimal props first
    />
    ```
    **Test:** Video should load but not auto-play initially.

### Phase 6: Complex useMemo (HIGH RISK)
**Goal:** Add expensive computations

15. **Enable `horizontalCardsContent` useMemo** (WITH GUARDS):
    ```jsx
    const horizontalCardsContent = useMemo(() => {
      // Add early returns
      if (!currentExercise || !currentSet) return null;
      
      // Wrap getWeightSuggestion in try-catch
      let weightSuggestion = null;
      try {
        weightSuggestion = getWeightSuggestion(...);
      } catch (error) {
        console.error('[ERROR] getWeightSuggestion failed:', error);
      }
      
      // Rest of logic...
    }, [/* minimal dependencies */]);
    ```
    **Test:** Monitor console for:
    - Execution time
    - Errors
    - Infinite loops

16. **Enable `filteredAvailableExercises` useMemo** (if needed):
    - Test with empty arrays first
    - Then add filtering logic incrementally

### Phase 7: Modals (Low Risk, but test interactions)
**Goal:** Add modal UIs

17. **Add modals one by one:**
    - Start with `ExerciseDetailModal`
    - Then `SetInputModal`
    - Then `SwapModal`
    - etc.

    **Test:** Each modal should open/close without freezing screen.

### Phase 8: Advanced Features
**Goal:** Restore full functionality

18. **Add gesture handlers** (swipe, drag-drop)
19. **Add tutorial system**
20. **Add edit mode**
21. **Add all remaining features**

## Critical Testing Checklist (After Each Step)

- [ ] Button still works (immediate response)
- [ ] Screen renders without freezing
- [ ] Console shows no infinite loops
- [ ] No console errors
- [ ] Performance is acceptable (no lag)
- [ ] State updates work correctly

## Common Pitfalls to Watch For

1. **Infinite Re-render Loops:**
   - **Symptom:** Console logs repeating rapidly
   - **Cause:** useEffect/useMemo with wrong dependencies
   - **Fix:** Add guards, fix dependencies, use refs for flags

2. **Synchronous Blocking Operations:**
   - **Symptom:** Screen freezes during render
   - **Cause:** Expensive operations in render/useMemo
   - **Fix:** Defer with setTimeout/requestAnimationFrame, use web workers

3. **Heavy Computations During Render:**
   - **Symptom:** UI becomes unresponsive
   - **Cause:** `getWeightSuggestion()` or similar in render
   - **Fix:** Move to useEffect, debounce, or lazy load

4. **State Updates Causing Cascades:**
   - **Symptom:** Multiple state updates in rapid succession
   - **Cause:** useEffect triggering other useEffect hooks
   - **Fix:** Batch updates, use refs to prevent cascades

5. **Memory Leaks:**
   - **Symptom:** Performance degrades over time
   - **Cause:** Missing cleanup in useEffect
   - **Fix:** Always return cleanup functions

## Debugging Tools

1. **Console Logging:**
   ```jsx
   console.log('[PHASE_X] Component rendered');
   console.log('[PHASE_X] useEffect triggered', dependencies);
   ```

2. **React DevTools Profiler:**
   - Check render times
   - Identify expensive components

3. **Performance Monitor:**
   - Check for dropped frames
   - Monitor memory usage

## Recommended Order (Safest First)

1. Basic structure (SafeAreaView, ScrollView, Text)
2. Basic state (useState for simple values)
3. Simple components (FixedWakeHeader)
4. Simple useMemo (currentExercise)
5. Simple useEffect (logging only)
6. Component components (WorkoutTopCardSection)
7. More complex useMemo (with try-catch)
8. State-updating useEffect (with guards)
9. Complex components (WorkoutHorizontalCards)
10. Video players
11. Modals
12. Advanced features

## When You Find a Blocker

1. **Isolate it:** Comment out everything except the blocker
2. **Simplify it:** Remove unnecessary logic
3. **Defer it:** Move to useEffect or setTimeout
4. **Fix it:** Add guards, fix dependencies, optimize
5. **Test it:** Verify it works before moving on

## Success Criteria

- ✅ Screen loads without freezing
- ✅ Button is immediately responsive
- ✅ All original UI components render
- ✅ All original functionality works
- ✅ Performance is acceptable
- ✅ No console errors or warnings

Good luck! Take it step by step, test thoroughly, and don't rush.
