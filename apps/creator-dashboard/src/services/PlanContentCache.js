const DEFAULT_DEBOUNCE_MS = 1500;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 3000;

class PlanContentCache {
  constructor({ flushFn, debounceMs = DEFAULT_DEBOUNCE_MS, onError = null }) {
    this.flushFn = flushFn;
    this.debounceMs = debounceMs;
    this.onError = onError;
    this.entries = new Map();
  }

  _getOrCreate(key) {
    if (!this.entries.has(key)) {
      this.entries.set(key, {
        content: null,
        programId: null,
        dirty: false,
        generation: 0,
        deletions: [],
        flushTimer: null,
        retryTimer: null,
        flushPromise: null,
        retryCount: 0,
      });
    }
    return this.entries.get(key);
  }

  seed(key, content, programId) {
    const entry = this._getOrCreate(key);
    if (entry.dirty) return;
    entry.content = content;
    entry.programId = programId;
  }

  get(key) {
    const entry = this.entries.get(key);
    return entry?.content ?? null;
  }

  getProgramId(key) {
    const entry = this.entries.get(key);
    return entry?.programId ?? null;
  }

  getDeletions(key) {
    const entry = this.entries.get(key);
    return entry?.deletions ?? [];
  }

  queueDeletion(key, path) {
    const entry = this._getOrCreate(key);
    entry.deletions.push(path);
  }

  modify(key, mutatorFn) {
    const entry = this._getOrCreate(key);
    if (!entry.content) return;
    entry.content = mutatorFn(entry.content);
    entry.dirty = true;
    entry.generation++;
    entry.retryCount = 0;
    this._scheduleFlush(key);
  }

  _scheduleFlush(key) {
    const entry = this.entries.get(key);
    if (!entry) return;
    if (entry.flushTimer) clearTimeout(entry.flushTimer);
    entry.flushTimer = setTimeout(() => {
      entry.flushTimer = null;
      this.flush(key);
    }, this.debounceMs);
  }

  async flush(key) {
    const entry = this.entries.get(key);
    if (!entry || !entry.dirty) return;

    if (entry.flushTimer) {
      clearTimeout(entry.flushTimer);
      entry.flushTimer = null;
    }
    if (entry.retryTimer) {
      clearTimeout(entry.retryTimer);
      entry.retryTimer = null;
    }

    // Wait for any in-flight flush to finish before starting a new one
    if (entry.flushPromise) {
      try { await entry.flushPromise; } catch {}
    }

    // Re-check dirty after waiting — previous flush may have cleared it
    if (!entry.dirty) return;

    const genAtFlushStart = entry.generation;
    const deletionsToSend = [...entry.deletions];
    entry.deletions = [];
    const doFlush = async () => {
      try {
        await this.flushFn(key, entry.content, entry.programId, deletionsToSend);
        if (entry.generation === genAtFlushStart) {
          entry.dirty = false;
        }
        entry.retryCount = 0;
      } catch (err) {
        entry.retryCount++;
        if (entry.retryCount < MAX_RETRIES) {
          entry.retryTimer = setTimeout(() => {
            entry.retryTimer = null;
            this.flush(key);
          }, RETRY_DELAY_MS);
        } else {
          this.onError?.(key, err);
        }
        throw err;
      }
    };

    entry.flushPromise = doFlush();
    try {
      await entry.flushPromise;
    } catch {
      // Error already handled inside doFlush
    } finally {
      entry.flushPromise = null;
    }
  }

  async flushAll() {
    const keys = Array.from(this.entries.keys());
    await Promise.all(keys.map(k => this.flush(k)));
  }

  invalidate(key) {
    const entry = this.entries.get(key);
    if (entry) {
      if (entry.flushTimer) clearTimeout(entry.flushTimer);
      if (entry.retryTimer) clearTimeout(entry.retryTimer);
      this.entries.delete(key);
    }
  }

  invalidateAll() {
    for (const [key] of this.entries) {
      this.invalidate(key);
    }
  }

  isDirty(key) {
    const entry = this.entries.get(key);
    return entry?.dirty ?? false;
  }

  hasDirtyEntries() {
    for (const entry of this.entries.values()) {
      if (entry.dirty) return true;
    }
    return false;
  }
}

export default PlanContentCache;
