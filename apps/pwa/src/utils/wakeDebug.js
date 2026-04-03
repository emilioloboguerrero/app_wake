/**
 * Wake Creator Dashboard — Debug Instrumentation
 *
 * Activate: localStorage.WAKE_DEBUG = '1'  (then reload)
 * Deactivate: localStorage.removeItem('WAKE_DEBUG')  (then reload)
 *
 * Console commands once active:
 *   wakeDebug.report()        — full summary of all recorded operations
 *   wakeDebug.screenReport()  — summary for current screen only
 *   wakeDebug.reset()         — clear all recorded data
 *   wakeDebug.export()        — download JSON of all data
 */

const IS_ENABLED = typeof window !== 'undefined' && localStorage.getItem('WAKE_DEBUG') === '1';

// ─── Styles ──────────────────────────────────────────────────────────
const S = {
  screen:   'color:#a78bfa;font-weight:bold;font-size:13px',
  api:      'color:#60a5fa;font-weight:bold',
  apiSlow:  'color:#f87171;font-weight:bold',
  query:    'color:#34d399;font-weight:bold',
  mutation: 'color:#fbbf24;font-weight:bold',
  render:   'color:#f472b6;font-weight:bold',
  warn:     'color:#f97316;font-weight:bold',
  dim:      'color:#6b7280',
  error:    'color:#ef4444;font-weight:bold',
  header:   'color:#e2e8f0;font-weight:bold;font-size:14px;background:#1e293b;padding:2px 8px;border-radius:3px',
  subhead:  'color:#94a3b8;font-weight:bold;font-size:12px',
};

// ─── Thresholds ──────────────────────────────────────────────────────
const SLOW_API_MS = 1000;
const SLOW_RENDER_MS = 16; // one frame
const DUPLICATE_WINDOW_MS = 2000; // flag same API call within this window

// ─── Data Store ──────────────────────────────────────────────────────
let currentScreen = '(unknown)';
let screenEnteredAt = performance.now();
const data = {
  apiCalls: [],         // { screen, method, path, status, duration, size, timestamp, duplicate }
  queryEvents: [],      // { screen, key, event, duration, timestamp }
  mutations: [],        // { screen, key, status, duration, timestamp }
  renders: [],          // { screen, component, duration, phase, timestamp }
  screenTransitions: [], // { from, to, timestamp }
  errors: [],           // { screen, source, message, timestamp }
  timers: [],           // { screen, label, duration, timestamp }
};

// ─── Helpers ─────────────────────────────────────────────────────────
function ts() { return performance.now(); }

function shortPath(path) {
  return path.replace(/^\/api\/v1/, '');
}

function checkDuplicate(method, path) {
  const now = ts();
  return data.apiCalls.some(
    c => c.method === method && c.path === path && (now - c.timestamp) < DUPLICATE_WINDOW_MS
  );
}

function formatDuration(ms) {
  if (ms < 1) return '<1ms';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatSize(bytes) {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

// ─── Layer 1: API Interceptor ────────────────────────────────────────
function truncatePayload(obj, maxDepth = 3, maxArrayItems = 3, maxStringLen = 120) {
  if (obj === null || obj === undefined) return obj;
  if (maxDepth <= 0) return typeof obj === 'object' ? (Array.isArray(obj) ? `[Array(${obj.length})]` : '{...}') : obj;
  if (typeof obj === 'string') return obj.length > maxStringLen ? obj.slice(0, maxStringLen) + '...' : obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    const preview = obj.slice(0, maxArrayItems).map(item => truncatePayload(item, maxDepth - 1, maxArrayItems, maxStringLen));
    if (obj.length > maxArrayItems) preview.push(`... +${obj.length - maxArrayItems} more`);
    return preview;
  }
  const result = {};
  const keys = Object.keys(obj);
  keys.forEach(key => {
    result[key] = truncatePayload(obj[key], maxDepth - 1, maxArrayItems, maxStringLen);
  });
  return result;
}

function logApiCall(method, path, duration, status, responseSize, error, responseData) {
  if (!IS_ENABLED) return;

  const isDuplicate = checkDuplicate(method, path);
  const entry = {
    screen: currentScreen,
    method,
    path: shortPath(path),
    status,
    duration,
    size: responseSize,
    timestamp: ts(),
    duplicate: isDuplicate,
    error: error || null,
  };
  data.apiCalls.push(entry);

  const isSlow = duration > SLOW_API_MS;
  const style = isSlow ? S.apiSlow : S.api;
  const flags = [];
  if (isSlow) flags.push(`SLOW`);
  if (isDuplicate) flags.push(`DUPLICATE`);
  if (error) flags.push(`ERROR`);
  const flagStr = flags.length ? ` [${flags.join(', ')}]` : '';

  const sizeStr = responseSize ? ` | ${formatSize(responseSize)}` : '';
  console.log(
    `%c[API] %c${method} ${shortPath(path)}  %c${formatDuration(duration)} | ${status}${sizeStr}${flagStr}`,
    style, 'color:inherit', S.dim
  );

  // Log response payload shape
  if (responseData !== undefined) {
    try {
      const preview = truncatePayload(responseData);
      console.groupCollapsed(`%c[API] Response payload: ${method} ${shortPath(path)}`, S.dim);
      console.log(preview);
      console.groupEnd();
    } catch { /* ignore */ }
  }

  if (isDuplicate) {
    console.warn(
      `%c[API] Possible duplicate: ${method} ${shortPath(path)} called again within ${DUPLICATE_WINDOW_MS}ms`,
      S.warn
    );
  }
}

/**
 * Wraps the apiClient fetch to capture timing and metadata.
 * Call this once at startup, passing the apiClient instance.
 */
function patchApiClient(apiClient) {
  if (!IS_ENABLED) return;

  const methods = ['get', 'post', 'patch', 'put', 'delete'];

  methods.forEach(method => {
    const original = apiClient[method].bind(apiClient);

    apiClient[method] = async function(...args) {
      const path = args[0];
      const start = performance.now();

      try {
        const result = await original(...args);
        const duration = performance.now() - start;

        // Estimate response size
        let size = null;
        try {
          size = JSON.stringify(result).length;
        } catch { /* ignore */ }

        logApiCall(method.toUpperCase(), path, duration, 200, size, null, result);
        return result;
      } catch (err) {
        const duration = performance.now() - start;
        logApiCall(method.toUpperCase(), path, duration, err.status || 0, null, err.message, null);
        throw err;
      }
    };
  });

  console.log('%c[WAKE DEBUG] API interceptor active', S.dim);
}


// ─── Layer 2: React Query Observer ───────────────────────────────────
function patchQueryClient(qc) {
  if (!IS_ENABLED) return;

  const cache = qc.getQueryCache();
  const mutationCache = qc.getMutationCache();

  // Subscribe to all query cache events
  cache.subscribe((event) => {
    if (!event?.query) return;

    const key = JSON.stringify(event.query.queryKey);
    const type = event.type;

    // Track meaningful events only
    if (type === 'updated') {
      const state = event.query.state;
      const action = event.action?.type;

      if (action === 'success') {
        const duration = state.dataUpdatedAt - (state.fetchMeta?._startTime || state.dataUpdatedAt);
        const entry = {
          screen: currentScreen,
          key,
          event: 'fetch-success',
          duration: state.fetchMeta?._duration || 0,
          fromCache: false,
          timestamp: ts(),
        };
        data.queryEvents.push(entry);

        console.log(
          `%c[QUERY] %cfetch-success %c${key}`,
          S.query, 'color:#22c55e', S.dim
        );

        // Log query data shape
        try {
          const queryData = event.query.state.data;
          const preview = truncatePayload(queryData);
          console.groupCollapsed(`%c[QUERY] Data shape: ${key}`, S.dim);
          console.log(preview);
          console.groupEnd();
        } catch { /* ignore */ }
      }

      if (action === 'error') {
        const entry = {
          screen: currentScreen,
          key,
          event: 'fetch-error',
          error: state.error?.message || 'unknown',
          timestamp: ts(),
        };
        data.queryEvents.push(entry);
        data.errors.push({
          screen: currentScreen,
          source: 'react-query',
          message: `Query ${key} failed: ${state.error?.message}`,
          timestamp: ts(),
        });

        console.log(
          `%c[QUERY] %cerror %c${key} — ${state.error?.message}`,
          S.query, S.error, S.dim
        );
      }
    }

    if (type === 'observerAdded') {
      console.log(
        `%c[QUERY] %cobserver-added %c${key} %c(observers: ${event.query.getObserversCount()})`,
        S.query, 'color:#a78bfa', S.dim, S.dim
      );
    }

    if (type === 'observerRemoved' && event.query.getObserversCount() === 0) {
      console.log(
        `%c[QUERY] %cno-observers %c${key} — will GC after gcTime`,
        S.query, 'color:#6b7280', S.dim
      );
    }
  });

  // Subscribe to mutation cache
  mutationCache.subscribe((event) => {
    if (!event?.mutation) return;
    const type = event.type;
    const key = event.mutation.options.mutationKey
      ? JSON.stringify(event.mutation.options.mutationKey)
      : '(anonymous)';

    if (type === 'updated') {
      const state = event.mutation.state;

      if (state.status === 'success') {
        const entry = {
          screen: currentScreen,
          key,
          status: 'success',
          duration: state.submittedAt ? (Date.now() - state.submittedAt) : 0,
          timestamp: ts(),
        };
        data.mutations.push(entry);

        console.log(
          `%c[MUTATION] %csuccess %c${key}`,
          S.mutation, 'color:#22c55e', S.dim
        );
      }

      if (state.status === 'error') {
        const entry = {
          screen: currentScreen,
          key,
          status: 'error',
          error: state.error?.message,
          timestamp: ts(),
        };
        data.mutations.push(entry);
        data.errors.push({
          screen: currentScreen,
          source: 'mutation',
          message: `Mutation ${key} failed: ${state.error?.message}`,
          timestamp: ts(),
        });

        console.log(
          `%c[MUTATION] %cerror %c${key} — ${state.error?.message}`,
          S.mutation, S.error, S.dim
        );
      }

      if (state.status === 'pending') {
        console.log(
          `%c[MUTATION] %cpending %c${key}`,
          S.mutation, 'color:#fbbf24', S.dim
        );
      }
    }
  });

  console.log('%c[WAKE DEBUG] React Query observer active', S.dim);
}


// ─── Layer 3: React Profiler Callback ────────────────────────────────
/**
 * Use as the `onRender` callback for React.Profiler wrapping each screen.
 *
 * <Profiler id="DashboardScreen" onRender={wakeDebug.onRender}>
 */
function onRender(id, phase, actualDuration, baseDuration, startTime, commitTime) {
  if (!IS_ENABLED) return;

  const entry = {
    screen: currentScreen,
    component: id,
    phase,    // "mount" | "update" | "nested-update"
    duration: actualDuration,
    baseDuration,
    timestamp: ts(),
  };
  data.renders.push(entry);

  const isSlow = actualDuration > SLOW_RENDER_MS;
  const style = isSlow ? S.apiSlow : S.render;
  const flag = isSlow ? ' [SLOW]' : '';

  console.log(
    `%c[RENDER] %c${id} %c${phase} ${formatDuration(actualDuration)}${flag} %c(base: ${formatDuration(baseDuration)})`,
    style, 'color:inherit', S.dim, S.dim
  );
}


// ─── Layer 4: Screen Tracker ─────────────────────────────────────────
function setScreen(name) {
  if (!IS_ENABLED) return;

  const now = ts();
  if (currentScreen !== '(unknown)') {
    // Log screen exit summary
    const timeOnScreen = now - screenEnteredAt;
    const screenApiCalls = data.apiCalls.filter(c => c.screen === currentScreen && c.timestamp >= screenEnteredAt);
    const screenRenders = data.renders.filter(r => r.screen === currentScreen && r.timestamp >= screenEnteredAt);

    if (screenApiCalls.length > 0 || screenRenders.length > 0) {
      console.log(
        `%c[SCREEN] Leaving ${currentScreen} — %c${formatDuration(timeOnScreen)} | ${screenApiCalls.length} API calls | ${screenRenders.length} renders`,
        S.dim, S.dim
      );
    }
  }

  data.screenTransitions.push({
    from: currentScreen,
    to: name,
    timestamp: now,
  });

  currentScreen = name;
  screenEnteredAt = now;

  console.log(
    `\n%c─── Screen: ${name} ───`,
    S.screen
  );
}


// ─── Layer 5: Custom Timers ──────────────────────────────────────────
const _pendingTimers = {};

function startTimer(label) {
  if (!IS_ENABLED) return;
  _pendingTimers[label] = performance.now();
}

function endTimer(label) {
  if (!IS_ENABLED) return;
  const start = _pendingTimers[label];
  if (start == null) return;
  delete _pendingTimers[label];

  const duration = performance.now() - start;
  data.timers.push({
    screen: currentScreen,
    label,
    duration,
    timestamp: ts(),
  });

  console.log(
    `%c[TIMER] %c${label} %c${formatDuration(duration)}`,
    S.dim, 'color:inherit', S.dim
  );
  return duration;
}


// ─── Layer 6: Error Tracker ──────────────────────────────────────────
function logError(source, message) {
  if (!IS_ENABLED) return;
  data.errors.push({
    screen: currentScreen,
    source,
    message,
    timestamp: ts(),
  });
  console.log(`%c[ERROR] %c[${source}] ${message}`, S.error, S.dim);
}

// Global error catching
if (IS_ENABLED) {
  window.addEventListener('error', (e) => {
    logError('window', `${e.message} at ${e.filename}:${e.lineno}`);
  });
  window.addEventListener('unhandledrejection', (e) => {
    logError('promise', `Unhandled: ${e.reason?.message || e.reason}`);
  });
}


// ─── Layer 7: Firestore SDK Interceptor ─────────────────────────────
/**
 * Patches Firestore getDoc/getDocs/setDoc/updateDoc/deleteDoc/addDoc/onSnapshot
 * to log direct SDK calls that bypass apiClient.
 */
function patchFirestore(firestoreModule) {
  if (!IS_ENABLED) return;
  if (!firestoreModule) return;

  const functionsToWrap = ['getDoc', 'getDocs', 'setDoc', 'updateDoc', 'deleteDoc', 'addDoc'];
  let patched = 0;

  functionsToWrap.forEach(fnName => {
    const original = firestoreModule[fnName];
    if (typeof original !== 'function') return;

    firestoreModule[fnName] = async function(...args) {
      const ref = args[0];
      const path = ref?.path || ref?._query?.path?.toString() || '(unknown)';
      const start = performance.now();

      console.warn(
        `%c[FIRESTORE] %c${fnName} %c${path} — direct SDK call (not via API)`,
        S.warn, 'color:inherit', S.dim
      );

      try {
        const result = await original.apply(this, args);
        const duration = performance.now() - start;

        const entry = {
          screen: currentScreen,
          method: fnName,
          path,
          status: 200,
          duration,
          size: null,
          timestamp: ts(),
          duplicate: false,
          error: null,
        };
        data.apiCalls.push(entry);

        logApiCall(fnName, path, duration, 200, null, null, undefined);
        return result;
      } catch (err) {
        const duration = performance.now() - start;
        logApiCall(fnName, path, duration, err.code || 0, null, err.message, undefined);
        throw err;
      }
    };
    patched++;
  });

  // Patch onSnapshot to warn about listeners
  if (typeof firestoreModule.onSnapshot === 'function') {
    const originalOnSnapshot = firestoreModule.onSnapshot;
    firestoreModule.onSnapshot = function(...args) {
      const ref = args[0];
      const path = ref?.path || ref?._query?.path?.toString() || '(unknown)';
      console.warn(
        `%c[FIRESTORE] %conSnapshot %c${path} — live listener created (should use React Query instead)`,
        S.warn, 'color:inherit', S.dim
      );
      return originalOnSnapshot.apply(this, args);
    };
    patched++;
  }

  if (patched > 0) {
    console.log(`%c[WAKE DEBUG] Firestore SDK interceptor active (${patched} functions patched)`, S.dim);
  }
}


// ─── Reports ─────────────────────────────────────────────────────────
function report() {
  if (!IS_ENABLED) { console.log('Wake Debug not enabled. Set localStorage.WAKE_DEBUG = "1" and reload.'); return; }

  console.log('\n%c╔══════════════════════════════════════╗', S.header);
  console.log('%c║     WAKE DEBUG — FULL REPORT         ║', S.header);
  console.log('%c╚══════════════════════════════════════╝', S.header);

  // ── API Summary ──
  console.log('\n%c── API Calls ──', S.subhead);
  const apiByScreen = groupBy(data.apiCalls, 'screen');
  for (const [screen, calls] of Object.entries(apiByScreen)) {
    const gets = calls.filter(c => c.method === 'GET');
    const writes = calls.filter(c => c.method !== 'GET');
    const duplicates = calls.filter(c => c.duplicate);
    const errors = calls.filter(c => c.error);
    const totalDuration = calls.reduce((s, c) => s + c.duration, 0);
    const totalSize = calls.reduce((s, c) => s + (c.size || 0), 0);
    const slowCalls = calls.filter(c => c.duration > SLOW_API_MS);

    console.groupCollapsed(
      `%c${screen}: %c${calls.length} calls (${gets.length} GET, ${writes.length} write) | ${formatDuration(totalDuration)} | ${formatSize(totalSize)}` +
      (duplicates.length ? ` | ${duplicates.length} duplicates` : '') +
      (errors.length ? ` | ${errors.length} errors` : '') +
      (slowCalls.length ? ` | ${slowCalls.length} slow` : ''),
      S.api, 'color:inherit'
    );

    // Show endpoint frequency
    const byEndpoint = {};
    calls.forEach(c => {
      const k = `${c.method} ${c.path}`;
      if (!byEndpoint[k]) byEndpoint[k] = { count: 0, totalMs: 0, sizes: [] };
      byEndpoint[k].count++;
      byEndpoint[k].totalMs += c.duration;
      if (c.size) byEndpoint[k].sizes.push(c.size);
    });

    console.table(
      Object.entries(byEndpoint)
        .sort((a, b) => b[1].count - a[1].count)
        .map(([endpoint, info]) => ({
          endpoint,
          count: info.count,
          avgMs: Math.round(info.totalMs / info.count),
          totalMs: Math.round(info.totalMs),
          avgSize: info.sizes.length ? formatSize(info.sizes.reduce((a, b) => a + b, 0) / info.sizes.length) : '-',
        }))
    );
    console.groupEnd();
  }

  // ── Render Summary ──
  console.log('\n%c── Renders ──', S.subhead);
  const rendersByScreen = groupBy(data.renders, 'screen');
  for (const [screen, renders] of Object.entries(rendersByScreen)) {
    const mounts = renders.filter(r => r.phase === 'mount');
    const updates = renders.filter(r => r.phase !== 'mount');
    const totalRenderTime = renders.reduce((s, r) => s + r.duration, 0);
    const slowRenders = renders.filter(r => r.duration > SLOW_RENDER_MS);

    console.groupCollapsed(
      `%c${screen}: %c${renders.length} renders (${mounts.length} mount, ${updates.length} update) | ${formatDuration(totalRenderTime)}` +
      (slowRenders.length ? ` | ${slowRenders.length} slow (>${SLOW_RENDER_MS}ms)` : ''),
      S.render, 'color:inherit'
    );

    // Group by component
    const byComponent = {};
    renders.forEach(r => {
      if (!byComponent[r.component]) byComponent[r.component] = { mounts: 0, updates: 0, totalMs: 0 };
      if (r.phase === 'mount') byComponent[r.component].mounts++;
      else byComponent[r.component].updates++;
      byComponent[r.component].totalMs += r.duration;
    });

    console.table(
      Object.entries(byComponent)
        .sort((a, b) => b[1].totalMs - a[1].totalMs)
        .map(([comp, info]) => ({
          component: comp,
          mounts: info.mounts,
          updates: info.updates,
          totalMs: Math.round(info.totalMs * 100) / 100,
        }))
    );
    console.groupEnd();
  }

  // ── Query Events ──
  console.log('\n%c── React Query ──', S.subhead);
  const queryByScreen = groupBy(data.queryEvents, 'screen');
  for (const [screen, events] of Object.entries(queryByScreen)) {
    const fetches = events.filter(e => e.event === 'fetch-success');
    const errors = events.filter(e => e.event === 'fetch-error');

    console.groupCollapsed(
      `%c${screen}: %c${fetches.length} fetches, ${errors.length} errors`,
      S.query, 'color:inherit'
    );

    const byKey = {};
    events.forEach(e => {
      if (!byKey[e.key]) byKey[e.key] = { fetches: 0, errors: 0 };
      if (e.event === 'fetch-success') byKey[e.key].fetches++;
      if (e.event === 'fetch-error') byKey[e.key].errors++;
    });

    console.table(
      Object.entries(byKey).map(([key, info]) => ({
        queryKey: key,
        fetches: info.fetches,
        errors: info.errors,
      }))
    );
    console.groupEnd();
  }

  // ── Mutations ──
  if (data.mutations.length > 0) {
    console.log('\n%c── Mutations ──', S.subhead);
    console.table(data.mutations.map(m => ({
      screen: m.screen,
      key: m.key,
      status: m.status,
      duration: m.duration ? formatDuration(m.duration) : '-',
    })));
  }

  // ── Errors ──
  if (data.errors.length > 0) {
    console.log('\n%c── Errors ──', S.subhead);
    console.table(data.errors.map(e => ({
      screen: e.screen,
      source: e.source,
      message: e.message,
    })));
  }

  // ── Screen Transitions ──
  console.log('\n%c── Screen Flow ──', S.subhead);
  const transitions = data.screenTransitions.filter(t => t.from !== '(unknown)');
  if (transitions.length > 0) {
    let prevTs = data.screenTransitions[0]?.timestamp || 0;
    data.screenTransitions.forEach((t, i) => {
      const gap = i > 0 ? formatDuration(t.timestamp - prevTs) : '-';
      console.log(`  ${t.to} ${gap !== '-' ? `(after ${gap} on ${t.from})` : ''}`);
      prevTs = t.timestamp;
    });
  }

  // ── Totals ──
  console.log('\n%c── Totals ──', S.subhead);
  const totalApiCalls = data.apiCalls.length;
  const totalGets = data.apiCalls.filter(c => c.method === 'GET').length;
  const totalWrites = data.apiCalls.filter(c => c.method !== 'GET').length;
  const totalDuplicates = data.apiCalls.filter(c => c.duplicate).length;
  const totalApiTime = data.apiCalls.reduce((s, c) => s + c.duration, 0);
  const totalDataTransferred = data.apiCalls.reduce((s, c) => s + (c.size || 0), 0);
  const totalRenders = data.renders.length;
  const totalRenderTime = data.renders.reduce((s, r) => s + r.duration, 0);
  const screensVisited = new Set(data.screenTransitions.map(t => t.to)).size;

  console.table([{
    'Screens visited': screensVisited,
    'API calls (total)': totalApiCalls,
    'API reads (GET)': totalGets,
    'API writes (POST/PATCH/PUT/DELETE)': totalWrites,
    'Duplicate API calls': totalDuplicates,
    'API time (total)': formatDuration(totalApiTime),
    'Data transferred': formatSize(totalDataTransferred),
    'Renders (total)': totalRenders,
    'Render time (total)': formatDuration(totalRenderTime),
    'Errors': data.errors.length,
  }]);
}

function screenReport() {
  if (!IS_ENABLED) return;

  const screen = currentScreen;
  const apiCalls = data.apiCalls.filter(c => c.screen === screen);
  const renders = data.renders.filter(r => r.screen === screen);
  const queries = data.queryEvents.filter(q => q.screen === screen);
  const muts = data.mutations.filter(m => m.screen === screen);
  const errs = data.errors.filter(e => e.screen === screen);
  const timeOnScreen = ts() - screenEnteredAt;

  console.log(`\n%c── ${screen} Report ── (${formatDuration(timeOnScreen)} on screen)`, S.screen);
  console.log(`  API calls: ${apiCalls.length} (${apiCalls.filter(c => c.method === 'GET').length} GET, ${apiCalls.filter(c => c.method !== 'GET').length} write)`);
  console.log(`  Duplicates: ${apiCalls.filter(c => c.duplicate).length}`);
  console.log(`  Renders: ${renders.length} (${renders.filter(r => r.phase === 'mount').length} mount, ${renders.filter(r => r.phase !== 'mount').length} update)`);
  console.log(`  Query events: ${queries.length}`);
  console.log(`  Mutations: ${muts.length}`);
  console.log(`  Errors: ${errs.length}`);

  if (apiCalls.length > 0) {
    console.table(apiCalls.map(c => ({
      method: c.method,
      path: c.path,
      ms: Math.round(c.duration),
      size: c.size ? formatSize(c.size) : '-',
      duplicate: c.duplicate ? 'YES' : '',
      error: c.error || '',
    })));
  }
}

function reset() {
  data.apiCalls.length = 0;
  data.queryEvents.length = 0;
  data.mutations.length = 0;
  data.renders.length = 0;
  data.screenTransitions.length = 0;
  data.errors.length = 0;
  data.timers.length = 0;
  currentScreen = '(unknown)';
  console.log('%c[WAKE DEBUG] Data cleared', S.dim);
}

function exportData() {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `wake-debug-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
  a.click();
  URL.revokeObjectURL(url);
  console.log('%c[WAKE DEBUG] Data exported', S.dim);
}

// ─── Memory & DOM Tracker ────────────────────────────────────────────
let _memoryInterval = null;

function startMemoryTracking() {
  if (!IS_ENABLED) return;
  if (!performance.memory) {
    console.log('%c[WAKE DEBUG] performance.memory not available (Chrome only)', S.dim);
    return;
  }

  const snapshots = [];
  _memoryInterval = setInterval(() => {
    snapshots.push({
      screen: currentScreen,
      usedJSHeapSize: performance.memory.usedJSHeapSize,
      totalJSHeapSize: performance.memory.totalJSHeapSize,
      domNodes: document.querySelectorAll('*').length,
      timestamp: ts(),
    });

    // Check for memory growth
    if (snapshots.length >= 3) {
      const recent = snapshots.slice(-3);
      const growing = recent.every((s, i) => i === 0 || s.usedJSHeapSize > recent[i - 1].usedJSHeapSize);
      if (growing) {
        const growth = recent[2].usedJSHeapSize - recent[0].usedJSHeapSize;
        if (growth > 5 * 1024 * 1024) { // 5MB growth
          console.warn(
            `%c[MEMORY] Heap growing: +${formatSize(growth)} over last 3 checks on ${currentScreen}`,
            S.warn
          );
        }
      }
    }
  }, 10000); // every 10s

  console.log('%c[WAKE DEBUG] Memory tracking active (10s interval, Chrome only)', S.dim);
}

function stopMemoryTracking() {
  if (_memoryInterval) {
    clearInterval(_memoryInterval);
    _memoryInterval = null;
  }
}


// ─── useEffect Leak Detection ────────────────────────────────────────
let _effectCounter = 0;
const _activeEffects = new Map();

function trackEffect(label) {
  if (!IS_ENABLED) return () => {};

  const id = ++_effectCounter;
  _activeEffects.set(id, { label, screen: currentScreen, timestamp: ts() });

  return () => {
    _activeEffects.delete(id);
  };
}

function reportLeakedEffects() {
  if (!IS_ENABLED) return;
  if (_activeEffects.size === 0) {
    console.log('%c[EFFECTS] No leaked effects detected', S.dim);
    return;
  }
  console.warn(`%c[EFFECTS] ${_activeEffects.size} effects still active:`, S.warn);
  _activeEffects.forEach((info, id) => {
    console.warn(`  #${id}: ${info.label} (from ${info.screen})`);
  });
}


// ─── Utils ───────────────────────────────────────────────────────────
function groupBy(arr, key) {
  return arr.reduce((acc, item) => {
    const k = item[key];
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {});
}


// ─── Public API ──────────────────────────────────────────────────────
const wakeDebug = {
  IS_ENABLED,

  // Setup
  patchApiClient,
  patchQueryClient,
  patchFirestore,
  startMemoryTracking,
  stopMemoryTracking,

  // Runtime
  setScreen,
  onRender,
  logApiCall,
  logError,
  startTimer,
  endTimer,
  trackEffect,

  // Reports
  report,
  screenReport,
  reportLeakedEffects,
  reset,
  export: exportData,

  // Raw data (for console inspection)
  data,
};

// Expose on window for console access
if (IS_ENABLED) {
  window.wakeDebug = wakeDebug;
  console.log(
    '%c[WAKE DEBUG] Instrumentation active. Commands: wakeDebug.report() | wakeDebug.screenReport() | wakeDebug.reset() | wakeDebug.export()',
    'color:#a78bfa;font-weight:bold;font-size:12px'
  );
}

export default wakeDebug;
