# Header Scroll Animation - Proposed Approaches

## Problem
The header needs to shrink from 320px to 120px when scrolling, but the current implementation has issues:
- Double triggers
- Oscillation loops when header height changes affect scroll position
- Weird behavior during slow scrolling

## Proposed Solutions

### Approach 1: Intersection Observer (Recommended)
**Pros:**
- Browser-native, optimized
- Not affected by layout shifts
- No scroll position calculations needed
- Handles slow/fast scrolling automatically

**How it works:**
- Place a sentinel element at the threshold position (e.g., 50px from top)
- Use IntersectionObserver to detect when it enters/leaves viewport
- Update header state based on observer callback

**Implementation:**
```jsx
useEffect(() => {
  const sentinel = document.createElement('div');
  sentinel.style.position = 'absolute';
  sentinel.style.top = '50px';
  sentinel.style.height = '1px';
  sentinel.style.width = '1px';
  sentinel.style.pointerEvents = 'none';
  sentinel.style.zIndex = '-1';
  document.body.appendChild(sentinel);

  const observer = new IntersectionObserver(
    ([entry]) => {
      const shouldBeScrolled = !entry.isIntersecting;
      if (shouldBeScrolled !== isScrolled) {
        setIsScrolled(shouldBeScrolled);
        // Update DOM classes
      }
    },
    { threshold: 0, rootMargin: '0px' }
  );

  observer.observe(sentinel);
  return () => {
    observer.disconnect();
    document.body.removeChild(sentinel);
  };
}, [isScrolled]);
```

---

### Approach 2: Fixed Reference Point with Scroll Lock
**Pros:**
- Simple logic
- Uses fixed reference that doesn't change with header height
- Clear threshold

**How it works:**
- Use a fixed reference point (e.g., first content element)
- Check scroll position relative to that element
- Lock updates during transition to prevent oscillation

**Implementation:**
```jsx
useEffect(() => {
  const THRESHOLD = 50;
  const TRANSITION_DURATION = 300;
  let isLocked = false;
  let rafId = null;

  const handleScroll = () => {
    if (isLocked) return;
    
    if (rafId) cancelAnimationFrame(rafId);
    
    rafId = requestAnimationFrame(() => {
      const scrollY = window.scrollY;
      const shouldBeScrolled = scrollY > THRESHOLD;
      
      if (shouldBeScrolled !== isScrolled) {
        isLocked = true;
        setIsScrolled(shouldBeScrolled);
        // Update DOM classes
        
        setTimeout(() => {
          isLocked = false;
        }, TRANSITION_DURATION);
      }
    });
  };

  window.addEventListener('scroll', handleScroll, { passive: true });
  return () => {
    window.removeEventListener('scroll', handleScroll);
    if (rafId) cancelAnimationFrame(rafId);
  };
}, [isScrolled]);
```

---

### Approach 3: CSS-Only with Scroll-Driven Animations (Modern Browsers)
**Pros:**
- No JavaScript needed
- Browser-optimized
- No layout shift issues

**Cons:**
- Requires modern browser support
- Less control over exact behavior

**Implementation:**
Uses CSS `@scroll-timeline` or `animation-timeline: scroll()` (experimental)

---

### Approach 4: Debounced Scroll with Hysteresis
**Pros:**
- Simple to understand
- Good for slow scrolling
- Predictable behavior

**How it works:**
- Use different thresholds for expand/collapse (hysteresis)
- Debounce scroll handler
- Simple state machine

**Implementation:**
```jsx
useEffect(() => {
  const COLLAPSE_THRESHOLD = 50;
  const EXPAND_THRESHOLD = 10; // Wider gap for hysteresis
  let timeoutId = null;
  let rafId = null;

  const handleScroll = () => {
    if (rafId) cancelAnimationFrame(rafId);
    
    rafId = requestAnimationFrame(() => {
      if (timeoutId) clearTimeout(timeoutId);
      
      timeoutId = setTimeout(() => {
        const scrollY = window.scrollY;
        let shouldBeScrolled;
        
        if (isScrolled) {
          shouldBeScrolled = scrollY > EXPAND_THRESHOLD;
        } else {
          shouldBeScrolled = scrollY > COLLAPSE_THRESHOLD;
        }
        
        if (shouldBeScrolled !== isScrolled) {
          setIsScrolled(shouldBeScrolled);
          // Update DOM classes
        }
      }, 50); // Debounce delay
    });
  };

  window.addEventListener('scroll', handleScroll, { passive: true });
  return () => {
    window.removeEventListener('scroll', handleScroll);
    if (rafId) cancelAnimationFrame(rafId);
    if (timeoutId) clearTimeout(timeoutId);
  };
}, [isScrolled]);
```

---

## Recommendation

**Approach 1 (Intersection Observer)** is recommended because:
1. It's not affected by layout shifts (header height changes)
2. Browser-optimized performance
3. Handles all scroll speeds naturally
4. No complex calculations needed
5. No oscillation issues

The sentinel element stays at a fixed position relative to the viewport, so when the header shrinks and content shifts, the sentinel position relative to viewport doesn't change, eliminating the oscillation problem.

