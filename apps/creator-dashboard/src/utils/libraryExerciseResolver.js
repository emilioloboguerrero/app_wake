/**
 * Resolves a primary[libId] value to its library exercise entry and displayName.
 *
 * Post-migration, primary[libId] is a stable exerciseId — the entry lives at
 * libraryDoc.exercises[id] with a `displayName` field.
 *
 * Legacy (pre-migration), primary[libId] is the displayName itself — the entry
 * lives at libraryDoc[displayName] (top-level field) and the key IS the name.
 *
 * These helpers handle both shapes transparently.
 */

export function getEntryFromLib(libraryDoc, idOrName) {
  if (!libraryDoc || typeof libraryDoc !== 'object' || !idOrName) return null;
  // Prefer new map (post-migration ID lookup).
  const fromMap = libraryDoc.exercises?.[idOrName];
  if (fromMap && typeof fromMap === 'object') return fromMap;
  // Legacy top-level (name-keyed).
  const fromTop = libraryDoc[idOrName];
  if (fromTop && typeof fromTop === 'object' && !Array.isArray(fromTop)) return fromTop;
  return null;
}

export function getDisplayNameFromLib(libraryDoc, idOrName) {
  const entry = getEntryFromLib(libraryDoc, idOrName);
  if (!entry) return idOrName;
  // New shape: explicit displayName field.
  if (entry.displayName) return entry.displayName;
  // Legacy shape: the key IS the displayName.
  return idOrName;
}

/**
 * Build a reverse-lookup map from a libraries collection: { [libId]: { [id]: displayName } }.
 * Used by components that render multiple exercises and want a fast lookup.
 */
export function buildLibraryNamesMap(libraries) {
  const map = {};
  const list = Array.isArray(libraries) ? libraries : Object.values(libraries || {});
  for (const lib of list) {
    if (!lib?.id) continue;
    if (!map[lib.id]) map[lib.id] = {};
    const exMap = lib.exercises;
    if (exMap && typeof exMap === 'object' && !Array.isArray(exMap)) {
      for (const [id, entry] of Object.entries(exMap)) {
        if (entry && typeof entry === 'object' && entry.displayName) {
          map[lib.id][id] = entry.displayName;
        }
      }
    }
  }
  return map;
}

/**
 * Resolve a primary[libId] value through a libraryNamesMap (built once per render).
 * Falls back to the raw value when the map doesn't have the entry.
 */
export function resolveDisplayName(libId, value, libraryNamesMap) {
  if (typeof value !== 'string') {
    if (value && typeof value === 'object') {
      return value.displayName || value.name || value.title || value.id || '';
    }
    return '';
  }
  return libraryNamesMap?.[libId]?.[value] || value;
}
