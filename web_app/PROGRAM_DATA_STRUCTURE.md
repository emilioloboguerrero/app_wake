# Program Data Structure Documentation

## Overview
This document provides a comprehensive map of the Firestore data structure for programs in both the old version (everything in one document) and the new version (nested subcollections).

---

## OLD VERSION (Monolithic Document Structure)
*Note: This structure is no longer used but may exist in legacy data*

### Collection: `courses`
Document ID: `{programId}`

```javascript
{
  // Program metadata
  creator_id: string,
  creatorName: string,
  title: string,
  description: string,
  discipline: string,
  access_duration: 'yearly' | 'monthly',
  status: 'draft' | 'published' | 'archived',
  price: number | null,
  free_trial: {
    active: boolean,
    duration_days: number
  },
  duration: string | null, // "X semanas" or "Mensual"
  programSettings: {
    streakEnabled: boolean,
    minimumSessionsPerWeek: number
  },
  weight_suggestions: boolean,
  availableLibraries: string[], // Array of library IDs
  tutorials: object,
  version: string, // Format: "YYYY-01"
  image_url: string | null,
  
  // Timestamps
  created_at: Timestamp,
  last_update: Timestamp,
  updated_at: Timestamp,
  
  // OLD STRUCTURE: Everything nested in the program document
  modules: {
    [moduleId]: {
      id: string,
      name: string,
      order: number,
      sessions: {
        [sessionId]: {
          id: string,
          title: string,
          image_url: string | null,
          order: number,
          exercises: {
            [exerciseId]: {
              id: string,
              name: string,
              title: string,
              order: number,
              primary: {
                [libraryId]: string // exerciseName
              },
              alternatives: {
                [libraryId]: string[] // array of exerciseNames
              },
              measures: string[],
              objectives: string[],
              sets: {
                [setId]: {
                  id: string,
                  title: string,
                  order: number,
                  reps: string | null, // Format: "x-y" or number
                  intensity: string | null, // Format: "x/10" or number (1-10)
                }
              }
            }
          }
        }
      }
    }
  }
}
```

---

## NEW VERSION (Nested Subcollections Structure)

### Root Collection: `courses`
Document ID: `{programId}`

#### Program Document Structure
```javascript
{
  // Program metadata
  creator_id: string,
  creatorName: string,
  title: string,
  description: string,
  discipline: string,
  access_duration: 'yearly' | 'monthly',
  status: 'draft' | 'published' | 'archived',
  price: number | null,
  free_trial: {
    active: boolean,
    duration_days: number
  },
  duration: string | null, // "X semanas" or "Mensual"
  programSettings: {
    streakEnabled: boolean,
    minimumSessionsPerWeek: number
  },
  weight_suggestions: boolean,
  availableLibraries: string[], // Array of library IDs
  tutorials: object,
  version: string, // Format: "YYYY-01"
  image_url: string | null,
  
  // Timestamps
  created_at: Timestamp,
  last_update: Timestamp,
  updated_at: Timestamp
}
```

#### Storage Paths
- Program images: `courses/{programId}/{filename}`
- Program intro video: `courses/{programId}/intro_video.mp4`
- Program announcement video: `courses/{programId}/anuncio_video.mp4`

---

### Subcollection: `courses/{programId}/modules`
Document ID: `{moduleId}`

#### Module Document Structure
```javascript
{
  // Module data
  order: number, // For sorting (0-indexed)
  title: string, // Always "Semana {order + 1}" (e.g., "Semana 1", "Semana 2")
  description: string | null, // Original library module title or standalone module name
  
  // Library reference (if module is from library)
  libraryModuleRef: string | null, // ID of module in creator_libraries/{creatorId}/modules/{moduleId}
  
  // Timestamps
  created_at: Timestamp,
  updated_at: Timestamp
}
```

**Notes:**
- If `libraryModuleRef` is present, this is a library reference module
- The actual sessions come from `creator_libraries/{creatorId}/modules/{libraryModuleRef}/sessionRefs`
- If `libraryModuleRef` is null, this is a standalone module

---

### Subcollection: `courses/{programId}/modules/{moduleId}/sessions`
Document ID: `{sessionId}`

#### Session Document Structure
```javascript
{
  // Session data
  order: number, // For sorting (0-indexed)
  
  // Library reference (if session is from library)
  librarySessionRef: string | null, // ID of session in creator_libraries/{creatorId}/sessions/{sessionId}
  
  // Standalone session data (only if librarySessionRef is null)
  title: string | null, // Only set for standalone sessions
  image_url: string | null, // Only set for standalone sessions
  
  // Timestamps
  created_at: Timestamp,
  updated_at: Timestamp
}
```

**Notes:**
- If `librarySessionRef` is present, this is a library reference session
- The actual session data (title, image_url, exercises) comes from the library
- If `librarySessionRef` is null, this is a standalone session with its own data

#### Storage Paths
- Session images: `courses/{programId}/modules/{moduleId}/sessions/{timestamp}.{ext}`

---

### Subcollection: `courses/{programId}/modules/{moduleId}/sessions/{sessionId}/overrides`
Document ID: `data` (always "data")

#### Override Document Structure (for library sessions)
```javascript
{
  // Override fields (only override what's different from library)
  title: string | null, // Override library session title
  image_url: string | null, // Override library session image
  
  // Timestamps
  created_at: Timestamp,
  updated_at: Timestamp
}
```

**Notes:**
- Only exists for library-referenced sessions when user has customized them
- Override values are merged with library data when displaying

---

### Subcollection: `courses/{programId}/modules/{moduleId}/sessions/{sessionId}/exercises`
Document ID: `{exerciseId}`

#### Exercise Document Structure
```javascript
{
  // Exercise data
  order: number, // For sorting (0-indexed)
  
  // Exercise references (library-based)
  primary: {
    [libraryId]: string // exerciseName from library
  },
  alternatives: {
    [libraryId]: string[] // array of exerciseNames from libraries
  },
  
  // Exercise configuration
  measures: string[], // Array of measure types
  objectives: string[], // Array of objective types
  
  // Legacy fields (may be removed via deleteField())
  name: string | null, // Deprecated - use primary instead
  title: string | null, // Deprecated - use primary instead
  
  // Timestamps
  created_at: Timestamp,
  updated_at: Timestamp
}
```

**Notes:**
- Exercises reference library exercises via `primary` and `alternatives`
- If session is a library reference, exercises might be loaded from library directly (no program document exists)
- `measures` and `objectives` are arrays of string identifiers

---

### Subcollection: `courses/{programId}/modules/{moduleId}/sessions/{sessionId}/exercises/{exerciseId}/sets`
Document ID: `{setId}`

#### Set Document Structure
```javascript
{
  // Set data
  order: number, // For sorting (0-indexed)
  title: string, // Usually "Serie {order + 1}"
  reps: string | null, // Format: "x-y" (e.g., "8-12") or number as string
  intensity: string | null, // Format: "x/10" (e.g., "7/10") or number as string (1-10)
  
  // Timestamps
  created_at: Timestamp,
  updated_at: Timestamp
}
```

**Notes:**
- `reps` can be a range ("8-12") or a single number
- `intensity` is typically in "x/10" format or a number between 1-10
- Sets are ordered by `order` field

---

## LIBRARY STRUCTURE (Referenced by Programs)

### Collection: `creator_libraries`
Document ID: `{creatorId}`

#### Creator Library Document
```javascript
{
  // Library metadata
  creator_id: string,
  // ... other creator library data
}
```

### Subcollection: `creator_libraries/{creatorId}/modules`
Document ID: `{moduleId}`

#### Library Module Document Structure
```javascript
{
  // Module data
  title: string, // Original module name (e.g., "Fuerza Base")
  description: string | null,
  creator_id: string,
  order: number,
  
  // Session references (array of session IDs)
  sessionRefs: string[], // Array of session IDs from creator_libraries/{creatorId}/sessions
  
  // Version tracking
  version: number,
  
  // Timestamps
  created_at: Timestamp,
  updated_at: Timestamp
}
```

**Notes:**
- `sessionRefs` is an array of session IDs (strings)
- When a program module references this library module, it uses `sessionRefs` to find sessions

---

### Subcollection: `creator_libraries/{creatorId}/sessions`
Document ID: `{sessionId}`

#### Library Session Document Structure
```javascript
{
  // Session data
  title: string,
  image_url: string | null,
  creator_id: string,
  
  // Version tracking
  version: number,
  
  // Timestamps
  created_at: Timestamp,
  updated_at: Timestamp
}
```

**Notes:**
- Library sessions are reusable across programs
- When updated, all programs using them get the update (unless overridden)

---

### Subcollection: `creator_libraries/{creatorId}/sessions/{sessionId}/exercises`
Document ID: `{exerciseId}`

#### Library Session Exercise Document Structure
```javascript
{
  // Exercise data
  order: number,
  
  // Exercise references
  primary: {
    [libraryId]: string // exerciseName
  },
  alternatives: {
    [libraryId]: string[] // array of exerciseNames
  },
  
  // Exercise configuration
  measures: string[],
  objectives: string[],
  
  // Timestamps
  created_at: Timestamp,
  updated_at: Timestamp
}
```

---

### Subcollection: `creator_libraries/{creatorId}/sessions/{sessionId}/exercises/{exerciseId}/sets`
Document ID: `{setId}`

#### Library Session Exercise Set Document Structure
```javascript
{
  // Set data
  order: number,
  title: string,
  reps: string | null,
  intensity: string | null,
  
  // Timestamps
  created_at: Timestamp,
  updated_at: Timestamp
}
```

**Storage Paths:**
- Library session images: `cards/{creatorId}/library_sessions/{sessionId}/{timestamp}.{ext}`

---

## DATA RESOLUTION FLOW

### Loading a Program Module

1. **Check if module has `libraryModuleRef`**
   - If yes: Fetch module from `creator_libraries/{creatorId}/modules/{libraryModuleRef}`
   - Get `sessionRefs` array from library module
   - For each `sessionRef`:
     - Fetch session from `creator_libraries/{creatorId}/sessions/{sessionRef}`
     - Check if program has a session document at `courses/{programId}/modules/{moduleId}/sessions/{sessionId}`
     - If program session exists:
       - Check for overrides at `courses/{programId}/modules/{moduleId}/sessions/{sessionId}/overrides/data`
       - Merge library session data with overrides
     - If program session doesn't exist:
       - Use library session data directly (or create program session document for override support)
   - Title is always "Semana {order + 1}", description holds original library title
   
2. **If no `libraryModuleRef`** (standalone module):
   - Load sessions from `courses/{programId}/modules/{moduleId}/sessions`
   - Title is "Semana {order + 1}", description holds original module name

### Loading a Session's Exercises

1. **Check if session has `librarySessionRef`**
   - If yes: Fetch exercises from `creator_libraries/{creatorId}/sessions/{librarySessionRef}/exercises`
   - Exercises include sets (loaded from subcollections)
   
2. **If no `librarySessionRef`** (standalone session):
   - Load exercises from `courses/{programId}/modules/{moduleId}/sessions/{sessionId}/exercises`
   - For each exercise, load sets from `courses/{programId}/modules/{moduleId}/sessions/{sessionId}/exercises/{exerciseId}/sets`

---

## KEY DIFFERENCES: OLD vs NEW

### Old Version
- ✅ Single document with all data nested
- ❌ Large document size limits
- ❌ Difficult to query nested data
- ❌ No sharing/reusability between programs
- ❌ Updates require rewriting entire document

### New Version
- ✅ Modular subcollection structure
- ✅ No document size limits
- ✅ Efficient querying and indexing
- ✅ Library system for reusability
- ✅ Override system for customization
- ✅ Better scalability
- ✅ Real-time updates on nested data

---

## REFERENCE FIELDS

### Module Reference
- `libraryModuleRef`: Points to `creator_libraries/{creatorId}/modules/{libraryModuleRef}`
- When present, module data comes from library, but order/title are program-specific

### Session Reference
- `librarySessionRef`: Points to `creator_libraries/{creatorId}/sessions/{librarySessionRef}`
- When present, session data comes from library
- Program can override via `overrides/data` document

### Exercise References
- `primary`: Object mapping `{libraryId: exerciseName}`
- `alternatives`: Object mapping `{libraryId: [exerciseName, ...]}`
- References exercises from `exercises_library/{libraryId}` collection

---

## VERSION TRACKING

Library modules and sessions have `version` fields that increment when:
- Sessions are added/removed from a module
- Exercises are added/removed/updated in a session
- Sets are added/removed/updated in an exercise

This allows programs to detect when library content has changed.

---

## EXAMPLE STRUCTURE

### Program with Library Module Reference

```
courses/{programId}
  ├── modules/{moduleId1}
  │   ├── libraryModuleRef: "libModuleId123"
  │   ├── order: 0
  │   ├── title: "Semana 1"
  │   └── description: "Fuerza Base"
  │   └── sessions/{sessionId1}
  │       ├── librarySessionRef: "libSessionId456"
  │       ├── order: 0
  │       └── overrides/data
  │           └── title: "Sesión Personalizada"
  │       └── exercises/{exerciseId1}
  │           └── (loaded from library)
```

### Standalone Program Module

```
courses/{programId}
  ├── modules/{moduleId2}
  │   ├── order: 1
  │   ├── title: "Semana 2"
  │   └── description: "Mi módulo personalizado"
  │   └── sessions/{sessionId2}
  │       ├── order: 0
  │       ├── title: "Sesión 1"
  │       ├── image_url: "https://..."
  │       └── exercises/{exerciseId2}
  │           ├── primary: {lib1: "Push Up"}
  │           ├── measures: ["time", "weight"]
  │           └── sets/{setId1}
  │               ├── reps: "8-12"
  │               └── intensity: "7/10"
```

---

## MIGRATION NOTES

Programs using the old structure should be migrated to the new structure by:
1. Extracting `modules` from program document
2. Creating module subcollections
3. Creating session subcollections under each module
4. Creating exercise subcollections under each session
5. Creating set subcollections under each exercise

This migration should preserve all data and relationships.

