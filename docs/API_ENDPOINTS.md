# Wake API — Endpoint Design (Phase 3)

All decisions locked in `API_STRATEGY_PRE_INVESTIGATION.md` apply here without repetition.
This document is the single source of truth for every endpoint's method, path, auth, request, response, pagination, and errors.

---

## 1. Overview

### Base URL
```
/api/v1/
```
Served from a single Express app exported as one Cloud Function (Gen2):
```typescript
export const api = functions.https.onRequest(app);
```
Firebase Hosting rewrites `/api/**` → `api` function. Deployed URL: `https://wakelab.co/api/v1/...`

### Authentication
Every request must include:
```
Authorization: Bearer <token>
```
Token is either:
- Firebase ID token — first-party (PWA, creator dashboard)
- `wk_live_<64chars>` — third-party API key

Server detects type by prefix. API key validation: SHA-256 hash lookup in `api_keys` collection.

Public endpoints (no auth required) are marked **Auth: none**.

### Shared Middleware
Two functions applied to every request:
- `validateAuth(req)` — validates token/key, returns `{ userId, role, authType }`
- `validateBody(schema, req.body)` — throws `VALIDATION_ERROR` on failure

### Error Shape
```json
{ "error": { "code": "ERROR_CODE", "message": "...", "field": "fieldName" } }
```
Status codes and retryability defined in `API_STRATEGY_PRE_INVESTIGATION.md §1.12`.

### Pagination
Paginated endpoints return:
```json
{ "data": [...], "nextPageToken": "opaque_base64", "hasMore": true }
```
Pass `?pageToken={token}` to fetch next page. Page sizes defined per endpoint.

---

## 2. Auth + Infrastructure

### API Keys

Only users with `role: 'creator'` can manage API keys.

---

#### `GET /api/v1/api-keys`
List all API keys for the authenticated creator.

**Auth:** Firebase ID token, `role: creator`
**Request:** none
**Response:**
```json
{
  "data": [
    {
      "keyId": "string",
      "keyPrefix": "wk_live_",
      "name": "My Garmin Integration",
      "scopes": ["read", "write"],
      "createdAt": "ISO string",
      "lastUsedAt": "ISO string | null",
      "revoked": false
    }
  ]
}
```
**Errors:** `FORBIDDEN` (non-creator)

---

#### `POST /api/v1/api-keys`
Create a new API key. The full key is returned **once** and never again.

**Auth:** Firebase ID token, `role: creator`
**Request:**
```json
{
  "name": "string (required)",
  "scopes": ["read", "write", "creator"]
}
```
**Response:**
```json
{
  "data": {
    "keyId": "string",
    "key": "wk_live_<64chars>",
    "name": "string",
    "scopes": ["read", "write"],
    "createdAt": "ISO string"
  }
}
```
**Errors:** `FORBIDDEN`, `VALIDATION_ERROR`
**Notes:** Server generates key, stores only SHA-256 hash. Plaintext never persisted.

---

#### `DELETE /api/v1/api-keys/{keyId}`
Revoke a key. Sets `revoked: true` — does not delete the document.

**Auth:** Firebase ID token, `role: creator`, must own the key
**Request:** none
**Response:** `204 No Content`
**Errors:** `FORBIDDEN`, `NOT_FOUND`

---

## 3. Profile

---

#### `GET /api/v1/users/me`
Get the authenticated user's full profile.

**Auth:** required
**Request:** none
**Response:**
```json
{
  "data": {
    "userId": "string",
    "email": "string",
    "role": "user | creator | admin",
    "displayName": "string",
    "username": "string | null",
    "gender": "male | female | other | null",
    "city": "string | null",
    "country": "string (ISO2) | null",
    "height": "number (cm) | null",
    "weight": "number (kg) | null",
    "birthDate": "YYYY-MM-DD | null",
    "profilePictureUrl": "string | null",
    "phoneNumber": "string | null",
    "pinnedTrainingCourseId": "string | null",
    "pinnedNutritionAssignmentId": "string | null",
    "createdAt": "ISO string"
  }
}
```
**Notes:** `weight` is the canonical field name. `bodyweight` alias deprecated.

---

#### `PATCH /api/v1/users/me`
Update the authenticated user's editable profile fields.

**Auth:** required
**Request (all fields optional):**
```json
{
  "displayName": "string",
  "username": "string",
  "gender": "male | female | other",
  "city": "string",
  "country": "string (ISO2)",
  "height": "number",
  "weight": "number",
  "birthDate": "YYYY-MM-DD",
  "phoneNumber": "string",
  "pinnedTrainingCourseId": "string | null",
  "pinnedNutritionAssignmentId": "string | null"
}
```
**Response:**
```json
{ "data": { "userId": "string", "updatedAt": "ISO string" } }
```
**Errors:** `VALIDATION_ERROR`, `CONFLICT` (username already taken)
**Notes:**
- Username uniqueness validated server-side (replaces collection scan with indexed query).
- `profilePictureUrl` not updatable here — use the upload flow below.
- Creator `cards` field managed separately (`PATCH /api/v1/creator/profile`).

---

#### `POST /api/v1/users/me/profile-picture/upload-url`
Get a signed Firebase Storage URL to upload a new profile picture.

**Auth:** required
**Request:**
```json
{ "contentType": "image/jpeg | image/png | image/webp" }
```
**Response:**
```json
{
  "data": {
    "uploadUrl": "https://storage.googleapis.com/...",
    "storagePath": "profiles/{userId}/profile.jpg",
    "expiresAt": "ISO string"
  }
}
```
**Errors:** `VALIDATION_ERROR`
**Notes:** Client must compress to ≤200KB before uploading. Max size enforced by Storage rules.

---

#### `POST /api/v1/users/me/profile-picture/confirm`
After a successful upload, persist the new URL to the user profile.

**Auth:** required
**Request:**
```json
{ "storagePath": "profiles/{userId}/profile.jpg" }
```
**Response:**
```json
{ "data": { "profilePictureUrl": "string" } }
```
**Errors:** `VALIDATION_ERROR`, `NOT_FOUND` (storage path not found)

---

#### `GET /api/v1/users/{userId}/public-profile`
Get a creator's public-facing profile (used by `CreatorProfileScreen` in the PWA).

**Auth:** required
**Request:** none
**Response:**
```json
{
  "data": {
    "userId": "string",
    "displayName": "string",
    "username": "string | null",
    "profilePictureUrl": "string | null",
    "city": "string | null",
    "country": "string | null",
    "age": "number | null",
    "cards": {
      "Card Title": "https://url-or-text"
    },
    "programs": [
      {
        "courseId": "string",
        "title": "string",
        "imageUrl": "string | null",
        "discipline": "string"
      }
    ]
  }
}
```
**Errors:** `NOT_FOUND`, `FORBIDDEN` (target is not a creator)

---

#### `PATCH /api/v1/creator/profile`
Update creator-specific profile fields.

**Auth:** Firebase ID token, `role: creator`
**Request (all optional):**
```json
{
  "cards": {
    "Card Title": "https://url-or-text"
  }
}
```
**Response:**
```json
{ "data": { "updatedAt": "ISO string" } }
```
**Errors:** `FORBIDDEN`, `VALIDATION_ERROR`

---

## 4. Nutrition

### 4.1 Diary

---

#### `GET /api/v1/nutrition/diary`
Get diary entries. Use `date` for a single day (most common) or `startDate`+`endDate` for analytics range.

**Auth:** required
**Query params:**
- `date` — `YYYY-MM-DD` (mutually exclusive with range)
- `startDate` + `endDate` — `YYYY-MM-DD` each (range, max 90 days)
**Response:**
```json
{
  "data": [
    {
      "entryId": "string",
      "date": "YYYY-MM-DD",
      "meal": "breakfast | lunch | dinner | snack",
      "foodId": "string",
      "servingId": "string",
      "numberOfUnits": 1,
      "name": "string",
      "foodCategory": "string | null",
      "calories": "number | null",
      "protein": "number | null",
      "carbs": "number | null",
      "fat": "number | null",
      "servingUnit": "string | null",
      "gramsPerUnit": "number | null",
      "createdAt": "ISO string"
    }
  ]
}
```
**Errors:** `VALIDATION_ERROR`
**Notes:** No pagination — returns all entries for the requested period. Range capped at 90 days.

---

#### `POST /api/v1/nutrition/diary`
Log a food entry.

**Auth:** required
**Request:**
```json
{
  "date": "YYYY-MM-DD",
  "meal": "breakfast | lunch | dinner | snack",
  "foodId": "string",
  "servingId": "string",
  "numberOfUnits": 1,
  "name": "string",
  "foodCategory": "string | null",
  "calories": "number | null",
  "protein": "number | null",
  "carbs": "number | null",
  "fat": "number | null",
  "servingUnit": "string | null",
  "gramsPerUnit": "number | null",
  "servings": []
}
```
**Response:**
```json
{ "data": { "id": "string" } }
```
**Errors:** `VALIDATION_ERROR`
**Notes:** Response returns `id` (Firestore document ID), not `entryId`. Status code `201`.

---

#### `PATCH /api/v1/nutrition/diary/{entryId}`
Update an existing diary entry (typically to change `numberOfUnits` or `servingId`).

**Auth:** required, must own entry
**Request (all optional):**
```json
{
  "servingId": "string",
  "numberOfUnits": "number",
  "calories": "number | null",
  "protein": "number | null",
  "carbs": "number | null",
  "fat": "number | null"
}
```
**Response:**
```json
{ "data": { "updated": true } }
```
**Errors:** `NOT_FOUND`, `FORBIDDEN`

---

#### `DELETE /api/v1/nutrition/diary/{entryId}`
Delete a diary entry.

**Auth:** required, must own entry
**Response:** `204 No Content`
**Errors:** `NOT_FOUND`, `FORBIDDEN`

---

### 4.2 Food Search (FatSecret Proxy)

Replaces `nutritionFoodSearch`, `nutritionFoodGet`, `nutritionBarcodeLookup` Cloud Functions.

---

#### `GET /api/v1/nutrition/foods/search`
Search foods by name.

**Auth:** required
**Query params:**
- `q` — search string (required)
- `page` — integer ≥ 1, default 1
**Response:**
```json
{
  "data": {
    "foods": [
      {
        "foodId": "string",
        "name": "string",
        "brandName": "string | null",
        "foodType": "Generic | Brand",
        "servingDescription": "string",
        "calories": "number | null",
        "protein": "number | null",
        "carbs": "number | null",
        "fat": "number | null"
      }
    ],
    "totalResults": "number",
    "pageNumber": "number",
    "maxResults": 20
  }
}
```
**Errors:** `VALIDATION_ERROR`, `SERVICE_UNAVAILABLE` (FatSecret down)

---

#### `GET /api/v1/nutrition/foods/{foodId}`
Get full food detail including all serving options.

**Auth:** required
**Response:**
```json
{
  "data": {
    "foodId": "string",
    "name": "string",
    "brandName": "string | null",
    "servings": [
      {
        "servingId": "string",
        "description": "string",
        "calories": "number | null",
        "protein": "number | null",
        "carbs": "number | null",
        "fat": "number | null",
        "gramsPerUnit": "number | null",
        "metricServingAmount": "number | null",
        "metricServingUnit": "string | null"
      }
    ]
  }
}
```
**Errors:** `NOT_FOUND`, `SERVICE_UNAVAILABLE`

---

#### `GET /api/v1/nutrition/foods/barcode/{barcode}`
Barcode lookup.

**Auth:** required
**Response:** Same shape as food detail above.
**Errors:** `NOT_FOUND` (barcode not in FatSecret), `SERVICE_UNAVAILABLE`

---

### 4.3 Saved Foods

---

#### `GET /api/v1/nutrition/saved-foods`
List the user's saved foods.

**Auth:** required
**Response:**
```json
{
  "data": [
    {
      "savedFoodId": "string",
      "foodId": "string",
      "name": "string",
      "calories": "number | null",
      "protein": "number | null",
      "carbs": "number | null",
      "fat": "number | null",
      "servingUnit": "string | null",
      "savedAt": "ISO string"
    }
  ]
}
```

---

#### `POST /api/v1/nutrition/saved-foods`
Save a food for quick access.

**Auth:** required
**Request:** Full food object (same fields as diary entry minus `date`, `meal`, `numberOfUnits`)
**Response:**
```json
{ "data": { "savedFoodId": "string" } }
```
**Errors:** `VALIDATION_ERROR`, `CONFLICT` (food already saved)

---

#### `DELETE /api/v1/nutrition/saved-foods/{savedFoodId}`
Remove a saved food.

**Auth:** required, must own
**Response:** `204 No Content`
**Errors:** `NOT_FOUND`, `FORBIDDEN`

---

### 4.4 Nutrition Assignment (User)

---

#### `GET /api/v1/nutrition/assignment`
Get the user's active nutrition plan for a given date, including resolved plan content and daily macro targets.

**Auth:** required
**Query params:**
- `date` — `YYYY-MM-DD`, default today
**Response:**
```json
{
  "data": {
    "assignmentId": "string",
    "startDate": "YYYY-MM-DD | null",
    "endDate": "YYYY-MM-DD | null",
    "plan": {
      "name": "string",
      "dailyCalories": "number | null",
      "dailyProteinG": "number | null",
      "dailyCarbsG": "number | null",
      "dailyFatG": "number | null",
      "categories": [
        {
          "id": "string",
          "label": "string",
          "order": "number",
          "options": [
            {
              "id": "string",
              "label": "string",
              "items": [
                {
                  "foodId": "string",
                  "name": "string",
                  "numberOfUnits": "number",
                  "servingUnit": "string | null",
                  "calories": "number | null",
                  "protein": "number | null",
                  "carbs": "number | null",
                  "fat": "number | null"
                }
              ]
            }
          ]
        }
      ]
    }
  }
}
```
**Errors:** `NOT_FOUND` (no active assignment for that date)
**Notes:** Server resolves in priority: `client_nutrition_plan_content` copy → assignment snapshot → library plan. Client never has to know this chain exists.

---

### 4.5 Creator — Nutrition Meal Library

---

#### `GET /api/v1/creator/nutrition/meals`
List all meal templates in the creator's library.

**Auth:** `role: creator`
**Response:**
```json
{
  "data": [
    {
      "mealId": "string",
      "name": "string",
      "description": "string | null",
      "calories": "number | null",
      "protein": "number | null",
      "carbs": "number | null",
      "fat": "number | null",
      "videoUrl": "string | null",
      "items": [],
      "createdAt": "ISO string"
    }
  ]
}
```

---

#### `POST /api/v1/creator/nutrition/meals`
Create a meal template.

**Auth:** `role: creator`
**Request:**
```json
{
  "name": "string",
  "description": "string | null",
  "videoUrl": "string | null",
  "items": [
    {
      "foodId": "string",
      "servingId": "string",
      "numberOfUnits": "number",
      "name": "string",
      "calories": "number | null",
      "protein": "number | null",
      "carbs": "number | null",
      "fat": "number | null",
      "servingUnit": "string | null",
      "gramsPerUnit": "number | null"
    }
  ]
}
```
**Response:** `{ "data": { "mealId": "string", "createdAt": "ISO string" } }`
**Errors:** `VALIDATION_ERROR`

---

#### `PATCH /api/v1/creator/nutrition/meals/{mealId}`
Update a meal template. Replaces `items` if provided.

**Auth:** `role: creator`, must own
**Request:** Same shape as POST, all fields optional
**Response:** `{ "data": { "mealId": "string", "updatedAt": "ISO string" } }`
**Errors:** `NOT_FOUND`, `FORBIDDEN`, `VALIDATION_ERROR`

---

#### `DELETE /api/v1/creator/nutrition/meals/{mealId}`
Delete a meal template.

**Auth:** `role: creator`, must own
**Response:** `204 No Content`
**Errors:** `NOT_FOUND`, `FORBIDDEN`

---

### 4.6 Creator — Nutrition Plan Library

---

#### `GET /api/v1/creator/nutrition/plans`
List all nutrition plans.

**Auth:** `role: creator`
**Response:**
```json
{
  "data": [
    {
      "planId": "string",
      "name": "string",
      "description": "string | null",
      "dailyCalories": "number | null",
      "dailyProteinG": "number | null",
      "dailyCarbsG": "number | null",
      "dailyFatG": "number | null",
      "createdAt": "ISO string",
      "updatedAt": "ISO string"
    }
  ]
}
```
**Notes:** Categories not included in list — use `GET /plans/{planId}` for full content.

---

#### `POST /api/v1/creator/nutrition/plans`
Create a nutrition plan.

**Auth:** `role: creator`
**Request:**
```json
{
  "name": "string",
  "description": "string | null",
  "dailyCalories": "number | null",
  "dailyProteinG": "number | null",
  "dailyCarbsG": "number | null",
  "dailyFatG": "number | null",
  "categories": []
}
```
**Response:** `{ "data": { "planId": "string", "createdAt": "ISO string" } }`

---

#### `GET /api/v1/creator/nutrition/plans/{planId}`
Get a nutrition plan with full categories and items.

**Auth:** `role: creator`, must own
**Response:** Full plan object (same as assignment response `plan` field)
**Errors:** `NOT_FOUND`, `FORBIDDEN`

---

#### `PATCH /api/v1/creator/nutrition/plans/{planId}`
Update a nutrition plan. Replaces `categories` if provided.

**Auth:** `role: creator`, must own
**Request:** Same shape as POST, all fields optional
**Response:** `{ "data": { "planId": "string", "updatedAt": "ISO string" } }`
**Errors:** `NOT_FOUND`, `FORBIDDEN`, `VALIDATION_ERROR`

---

#### `DELETE /api/v1/creator/nutrition/plans/{planId}`
Delete a nutrition plan.

**Auth:** `role: creator`, must own
**Response:** `204 No Content`
**Errors:** `NOT_FOUND`, `FORBIDDEN`
**Notes:** Does not delete existing `nutrition_assignments`. Assigned clients retain their snapshot.

---

### 4.7 Creator — Client Nutrition

---

#### `GET /api/v1/creator/clients/{clientId}/nutrition/assignments`
List all nutrition assignments for a client.

**Auth:** `role: creator`, must have client access
**Response:**
```json
{
  "data": [
    {
      "assignmentId": "string",
      "planId": "string",
      "planName": "string",
      "startDate": "YYYY-MM-DD | null",
      "endDate": "YYYY-MM-DD | null",
      "createdAt": "ISO string"
    }
  ]
}
```
**Errors:** `FORBIDDEN`, `NOT_FOUND`

---

#### `POST /api/v1/creator/clients/{clientId}/nutrition/assignments`
Assign a nutrition plan to a client. Takes a snapshot of the library plan at this moment.

**Auth:** `role: creator`, must have client access and own the plan
**Request:**
```json
{
  "planId": "string",
  "startDate": "YYYY-MM-DD | null",
  "endDate": "YYYY-MM-DD | null"
}
```
**Response:**
```json
{ "data": { "assignmentId": "string", "createdAt": "ISO string" } }
```
**Errors:** `NOT_FOUND` (plan not found), `FORBIDDEN`, `VALIDATION_ERROR`
**Notes:** Server fetches library plan, expands recipe refs inline, stores full snapshot. Client never receives stale library data.

---

#### `DELETE /api/v1/creator/clients/{clientId}/nutrition/assignments/{assignmentId}`
Remove a nutrition assignment. Also deletes `client_nutrition_plan_content` copy atomically.

**Auth:** `role: creator`, must have client access
**Response:** `204 No Content`
**Errors:** `NOT_FOUND`, `FORBIDDEN`

---

#### `GET /api/v1/creator/clients/{clientId}/nutrition/diary`
Read a client's nutrition diary. Creator must have client access.

**Auth:** `role: creator`, must have client access
**Query params:** `date` or `startDate`+`endDate` (same as user diary endpoint)
**Response:** Same shape as `GET /nutrition/diary`
**Errors:** `FORBIDDEN`, `NOT_FOUND`

---

#### `POST /api/v1/creator/nutrition/plans/{planId}/propagate`
Propagate library plan changes to all assigned clients. Deletes client copies and refreshes assignment snapshots atomically per client.

**Auth:** `role: creator`, must own plan
**Request:** none
**Response:**
```json
{
  "data": {
    "clientsAffected": "number",
    "copiesDeleted": "number"
  }
}
```
**Errors:** `NOT_FOUND`, `FORBIDDEN`

---

## 5. Progress / Lab

### 5.1 Body Log

---

#### `GET /api/v1/progress/body-log`
List body log entries, newest first. Cursor-paginated, page 30.

**Auth:** required
**Query params:**
- `pageToken` — opaque cursor
- `limit` — integer 1–100, default 30
**Response:**
```json
{
  "data": [
    {
      "date": "YYYY-MM-DD",
      "weight": "number (kg)",
      "note": "string | null",
      "photos": [
        {
          "photoId": "string",
          "angle": "front | side | back",
          "storageUrl": "string",
          "storagePath": "string"
        }
      ],
      "updatedAt": "ISO string"
    }
  ],
  "nextPageToken": "string | null",
  "hasMore": false
}
```

---

#### `GET /api/v1/progress/body-log/{date}`
Get body log entry for a specific date.

**Auth:** required
**Response:** Single entry object (same shape as list item above)
**Errors:** `NOT_FOUND`

---

#### `PUT /api/v1/progress/body-log/{date}`
Create or update the body log entry for a date. Uses PUT (idempotent — one entry per date).

**Auth:** required
**Request:**
```json
{
  "weight": "number (kg)",
  "note": "string | null"
}
```
**Response:**
```json
{ "data": { "date": "YYYY-MM-DD", "updatedAt": "ISO string" } }
```
**Errors:** `VALIDATION_ERROR`
**Notes:** Photos managed separately via upload flow below.

---

#### `DELETE /api/v1/progress/body-log/{date}`
Delete a body log entry and all its photos from Storage.

**Auth:** required, must own
**Response:** `204 No Content`
**Errors:** `NOT_FOUND`
**Notes:** Server deletes all `photos[].storagePath` objects from Firebase Storage before deleting the Firestore doc.

---

#### `POST /api/v1/progress/body-log/{date}/photos/upload-url`
Get a signed URL to upload a progress photo.

**Auth:** required
**Request:**
```json
{
  "angle": "front | side | back",
  "contentType": "image/jpeg | image/png | image/webp"
}
```
**Response:**
```json
{
  "data": {
    "uploadUrl": "string",
    "storagePath": "progress_photos/{userId}/{date}/{angle}_{timestamp}.jpg",
    "photoId": "string",
    "expiresAt": "ISO string"
  }
}
```
**Notes:** Client must compress to ≤500KB before uploading.

---

#### `POST /api/v1/progress/body-log/{date}/photos/confirm`
After upload, append the photo to the body log entry. Creates the entry if it doesn't exist.

**Auth:** required
**Request:**
```json
{
  "photoId": "string",
  "storagePath": "string",
  "angle": "front | side | back"
}
```
**Response:**
```json
{ "data": { "date": "YYYY-MM-DD", "photoId": "string" } }
```
**Errors:** `NOT_FOUND` (storage path not found), `VALIDATION_ERROR`

---

#### `DELETE /api/v1/progress/body-log/{date}/photos/{photoId}`
Delete a single progress photo.

**Auth:** required, must own
**Response:** `204 No Content`
**Errors:** `NOT_FOUND`, `FORBIDDEN`
**Notes:** Deletes from Storage and removes from `photos[]` array atomically.

---

### 5.2 Readiness

---

#### `GET /api/v1/progress/readiness`
Get readiness entries for a date range.

**Auth:** required
**Query params:**
- `startDate` + `endDate` — `YYYY-MM-DD`, max 90 days
**Response:**
```json
{
  "data": [
    {
      "date": "YYYY-MM-DD",
      "energy": "number (1-10)",
      "soreness": "number (1-10, 1=very sore, 10=fresh)",
      "sleep": "number (1-10)",
      "completedAt": "ISO string"
    }
  ]
}
```
**Notes:** `soreness` is returned on the corrected scale (1=worst, 10=best). The legacy internal inversion is handled server-side — no client ever sees raw Firestore values.

---

#### `GET /api/v1/progress/readiness/{date}`
Get readiness entry for a specific date.

**Auth:** required
**Response:** Single entry object
**Errors:** `NOT_FOUND`

---

#### `PUT /api/v1/progress/readiness/{date}`
Create or update a readiness entry. One entry per date.

**Auth:** required
**Request:**
```json
{
  "energy": "number (1-10)",
  "soreness": "number (1-10, 1=very sore, 10=fresh)",
  "sleep": "number (1-10)"
}
```
**Response:**
```json
{ "data": { "date": "YYYY-MM-DD", "completedAt": "ISO string" } }
```
**Errors:** `VALIDATION_ERROR`
**Notes:** Server stores soreness as `(11 - value)` internally for legacy compatibility. This migration detail is invisible to the API consumer.

---

#### `DELETE /api/v1/progress/readiness/{date}`
Delete a readiness entry.

**Auth:** required
**Response:** `204 No Content`
**Errors:** `NOT_FOUND`

---

## 6. Workout

### 6.1 Daily Session

---

#### `GET /api/v1/workout/daily`
Resolve today's session for a course. Handles all delivery types internally — low-ticket (progress-based), one-on-one (calendar-based), weekly. Client receives a ready-to-render session with exercise targets and last performance data.

**Auth:** required
**Query params:**
- `courseId` — required
- `date` — `YYYY-MM-DD`, default today
**Response:**
```json
{
  "data": {
    "hasSession": true,
    "isRestDay": false,
    "emptyReason": "null | no_planning_this_week | all_sessions_completed | rest_day",
    "session": {
      "sessionId": "string",
      "title": "string",
      "order": "number",
      "deliveryType": "low_ticket | one_on_one",
      "exercises": [
        {
          "exerciseId": "string",
          "libraryId": "string",
          "name": "string",
          "order": "number",
          "primaryMuscles": ["string"],
          "sets": [
            {
              "setId": "string",
              "reps": "string (e.g. '8-10')",
              "weight": "number | null",
              "intensity": "string (e.g. '8/10') | null",
              "rir": "number | null"
            }
          ],
          "lastPerformance": {
            "sessionId": "string",
            "date": "YYYY-MM-DD",
            "sets": [
              { "reps": "number", "weight": "number" }
            ],
            "bestSet": { "weight": "number", "reps": "number" }
          }
        }
      ]
    },
    "progress": {
      "completed": "number",
      "total": "number | null"
    }
  }
}
```
**Errors:** `NOT_FOUND` (course not found or user not enrolled), `FORBIDDEN`
**Notes:**
- `lastPerformance` is null for first-time exercises. Server fetches from `exerciseLastPerformance` collection in a single batch.
- `hasSession: false` with `emptyReason` is a valid success response — not a 404.

---

#### `GET /api/v1/workout/courses`
List all courses the user is enrolled in with access status.

**Auth:** required
**Response:**
```json
{
  "data": [
    {
      "courseId": "string",
      "title": "string",
      "imageUrl": "string | null",
      "deliveryType": "low_ticket | one_on_one",
      "status": "active | expired | cancelled",
      "expiresAt": "ISO string | null",
      "purchasedAt": "ISO string | null"
    }
  ]
}
```

---

#### `GET /api/v1/workout/courses/{courseId}`
Get full course metadata and structure (modules + sessions list, not full exercise content).

**Auth:** required, must be enrolled
**Response:**
```json
{
  "data": {
    "courseId": "string",
    "title": "string",
    "description": "string | null",
    "imageUrl": "string | null",
    "deliveryType": "low_ticket | one_on_one",
    "discipline": "string | null",
    "modules": [
      {
        "moduleId": "string",
        "title": "string",
        "order": "number",
        "sessions": [
          {
            "sessionId": "string",
            "title": "string",
            "order": "number",
            "exerciseCount": "number"
          }
        ]
      }
    ],
    "progress": {
      "lastSessionCompleted": "string | null",
      "totalSessionsCompleted": "number",
      "allSessionsCompleted": ["string"]
    }
  }
}
```
**Errors:** `NOT_FOUND`, `FORBIDDEN`

---

### 6.2 Session Completion

---

#### `POST /api/v1/workout/complete`
Complete a workout session. All writes are atomic (Firestore batch): session history, exercise history (per exercise), exercise last performance (per exercise), 1RM estimates (per exercise), streak, muscle volumes, course progress.

**Auth:** required
**Request:**
```json
{
  "courseId": "string",
  "sessionId": "string",
  "completedAt": "ISO string",
  "durationMs": "number",
  "userNotes": "string | null",
  "exercises": [
    {
      "exerciseId": "string",
      "libraryId": "string",
      "exerciseName": "string",
      "primaryMuscles": ["string"],
      "sets": [
        {
          "reps": "number",
          "weight": "number",
          "intensity": "string (e.g. '8/10') | null",
          "rir": "number | null"
        }
      ]
    }
  ],
  "plannedSnapshot": {
    "exercises": []
  }
}
```
**Response:**
```json
{
  "data": {
    "completionId": "string",
    "personalRecords": [
      {
        "exerciseKey": "string",
        "exerciseName": "string",
        "newEstimate1RM": "number",
        "achievedWith": { "weight": "number", "reps": "number", "intensity": "string | null" }
      }
    ],
    "streak": {
      "currentStreak": "number",
      "longestStreak": "number",
      "lastActivityDate": "YYYY-MM-DD",
      "flameLevel": "number (0-3)"
    },
    "muscleVolumes": {
      "push": "number",
      "pull": "number",
      "legs": "number",
      "shoulders": "number",
      "core": "number"
    }
  }
}
```
**Errors:** `VALIDATION_ERROR`, `NOT_FOUND` (course/session), `FORBIDDEN`, `CONFLICT` (already completed — idempotency)
**Notes:**
- Server computes 1RM using `weight × (1 + 0.0333 × reps) / (1 - 0.025 × (10 - intensity))`. If `intensity` is null, uses simplified `weight × (1 + 0.0333 × reps)`.
- Streak computed server-side from `activityStreak` field on user doc — no client calculation needed.
- `personalRecords` is empty array if no PRs set in this session.
- `completionId` is idempotency key: `{userId}_{sessionId}_{YYYY-MM-DD}`. Duplicate completion of same session on same day returns 409.

---

### 6.3 Session History

---

#### `GET /api/v1/workout/sessions`
Paginated session history, newest first. Page size 20.

**Auth:** required
**Query params:**
- `courseId` — filter by course (optional)
- `pageToken`
**Response:**
```json
{
  "data": [
    {
      "completionId": "string",
      "sessionId": "string",
      "courseId": "string",
      "sessionTitle": "string",
      "completedAt": "ISO string",
      "durationMs": "number",
      "exerciseCount": "number",
      "muscleVolumes": {}
    }
  ],
  "nextPageToken": "string | null",
  "hasMore": false
}
```

---

#### `GET /api/v1/workout/sessions/{completionId}`
Get a single completed session with full exercise and set data.

**Auth:** required, must own
**Response:**
```json
{
  "data": {
    "completionId": "string",
    "sessionId": "string",
    "courseId": "string",
    "sessionTitle": "string",
    "completedAt": "ISO string",
    "durationMs": "number",
    "userNotes": "string | null",
    "exercises": [
      {
        "exerciseName": "string",
        "sets": [
          { "reps": "number", "weight": "number", "intensity": "string | null" }
        ]
      }
    ],
    "plannedSnapshot": {}
  }
}
```
**Errors:** `NOT_FOUND`, `FORBIDDEN`

---

### 6.4 Exercise History

---

#### `GET /api/v1/workout/exercises/{exerciseKey}/history`
Paginated history for a single exercise, newest first. Page size 50.

**Auth:** required
**Query params:** `pageToken`
**Response:**
```json
{
  "data": [
    {
      "date": "YYYY-MM-DD",
      "sessionId": "string",
      "sets": [
        { "reps": "number", "weight": "number", "intensity": "string | null" }
      ]
    }
  ],
  "nextPageToken": "string | null",
  "hasMore": false
}
```
**Notes:** `exerciseKey` format is `{libraryId}_{exerciseName}` (URL-encoded).

---

### 6.5 Personal Records

---

#### `GET /api/v1/workout/prs`
Get current 1RM estimates for all exercises the user has ever logged.

**Auth:** required
**Response:**
```json
{
  "data": [
    {
      "exerciseKey": "string",
      "exerciseName": "string",
      "libraryId": "string",
      "estimate1RM": "number",
      "achievedWith": { "weight": "number", "reps": "number" },
      "lastUpdated": "ISO string"
    }
  ]
}
```

---

#### `GET /api/v1/workout/prs/{exerciseKey}/history`
Full 1RM estimate history for one exercise, newest first.

**Auth:** required
**Response:**
```json
{
  "data": [
    {
      "estimate1RM": "number",
      "date": "ISO string"
    }
  ]
}
```

---

### 6.6 Session Interruption Recovery

See `WORKOUT_INTERRUPTION_SPEC.md` for the full design rationale, checkpoint schema,
and recovery flow. These three endpoints are the server-side component of that system.
The primary persistence mechanism is `localStorage` — these endpoints enable
cross-device recovery as a secondary path.

---

#### `POST /api/v1/workout/session/checkpoint`
Save mid-session state to Firestore. Enables cross-device recovery.

**Auth:** Firebase ID token
**Request:**
```json
{
  "courseId": "string",
  "sessionId": "string",
  "sessionName": "string",
  "startedAt": "ISO string",
  "currentExerciseIndex": "number",
  "currentSetIndex": "number",
  "exercises": [
    {
      "exerciseId": "string",
      "exerciseName": "string",
      "sets": [{ "reps": "number | null", "weight": "number | null", "intensity": "string | null" }]
    }
  ],
  "completedSets": {
    "0_0": { "reps": 10, "weight": 80, "intensity": null }
  },
  "userNotes": "string",
  "elapsedSeconds": "number"
}
```
**Response:** `{ "data": { "saved": true } }`
**Errors:** `VALIDATION_ERROR`, `UNAUTHENTICATED`
**Notes:**
- Upserts `users/{userId}/activeSession/current`. One active session per user.
- Called at most once per 10 seconds (client-side debounce). Not called on `pagehide` — that path writes to `localStorage` only.

---

#### `GET /api/v1/workout/session/active`
Get the current active session checkpoint from Firestore.

**Auth:** Firebase ID token
**Request:** none
**Response (checkpoint exists):**
```json
{
  "data": {
    "checkpoint": {
      "courseId": "string",
      "sessionId": "string",
      "sessionName": "string",
      "startedAt": "ISO string",
      "savedAt": "ISO string",
      "currentExerciseIndex": "number",
      "currentSetIndex": "number",
      "exercises": [],
      "completedSets": {},
      "userNotes": "string",
      "elapsedSeconds": "number"
    }
  }
}
```
**Response (no checkpoint):**
```json
{ "data": { "checkpoint": null } }
```
**Notes:** Checkpoints older than 24 hours are returned as `null`. The server applies the same staleness policy as the client.

---

#### `DELETE /api/v1/workout/session/active`
Delete the active session checkpoint. Called on completion or when user discards recovery.

**Auth:** Firebase ID token
**Request:** none
**Response:** `{ "data": { "deleted": true } }` or `{ "data": { "deleted": false } }` (idempotent)
**Notes:** Returns 200 in both cases. Never 404.

---

### 6.7 Streak

---

#### `GET /api/v1/workout/streak`
Get the authenticated user's current activity streak. Streak is computed server-side
and stored on the user document — this is a direct read, not a computation.

**Auth:** required
**Request:** none
**Response:**
```json
{
  "data": {
    "currentStreak": "number",
    "longestStreak": "number",
    "lastActivityDate": "YYYY-MM-DD | null",
    "flameLevel": "number (0-3)"
  }
}
```
**Notes:**
- `flameLevel` thresholds: 0 = inactive, 1 = 3+ days, 2 = 7+ days, 3 = 14+ days.
- This endpoint reads the cached streak from `users/{userId}.activityStreak`. It does not recalculate.
- Streak is recalculated only in `POST /workout/complete`. If today's session is already completed, calling this endpoint reflects the updated streak immediately.

---

## 7. Creator

### 7.1 Clients

---

#### `GET /api/v1/creator/clients`
List all one-on-one clients. Cursor-paginated, page 50.

**Auth:** `role: creator`
**Query params:** `pageToken`
**Response:**
```json
{
  "data": [
    {
      "clientId": "string",
      "displayName": "string",
      "profilePictureUrl": "string | null",
      "email": "string",
      "enrolledPrograms": [
        {
          "courseId": "string",
          "title": "string",
          "assignedAt": "ISO string"
        }
      ],
      "addedAt": "ISO string"
    }
  ],
  "nextPageToken": "string | null",
  "hasMore": false
}
```

---

#### `POST /api/v1/creator/clients`
Add a client by email. Reuses `lookupUserForCreatorInvite` logic. Creates `one_on_one_clients` and `creator_client_access` docs.

**Auth:** `role: creator`
**Request:**
```json
{ "email": "string" }
```
**Response:**
```json
{
  "data": {
    "clientId": "string",
    "displayName": "string",
    "email": "string"
  }
}
```
**Errors:** `NOT_FOUND` (no user with that email), `CONFLICT` (already your client), `VALIDATION_ERROR`

---

#### `DELETE /api/v1/creator/clients/{clientId}`
Remove a client. Deletes `one_on_one_clients` and `creator_client_access` docs.

**Auth:** `role: creator`, must have this client
**Response:** `204 No Content`
**Errors:** `NOT_FOUND`, `FORBIDDEN`
**Notes:** Does not unassign courses from the client's `users.courses` map — access revocation is a separate decision (course can remain accessible).

---

### 7.2 Programs (Low-Ticket & One-on-One Containers)

---

#### `GET /api/v1/creator/programs`
List all programs created by the authenticated creator.

**Auth:** `role: creator`
**Response:**
```json
{
  "data": [
    {
      "programId": "string",
      "title": "string",
      "description": "string | null",
      "imageUrl": "string | null",
      "discipline": "string | null",
      "deliveryType": "low_ticket | one_on_one",
      "status": "draft | published",
      "createdAt": "ISO string",
      "updatedAt": "ISO string"
    }
  ]
}
```

---

#### `POST /api/v1/creator/programs`
Create a new program.

**Auth:** `role: creator`
**Request:**
```json
{
  "title": "string",
  "description": "string | null",
  "imageUrl": "string | null",
  "discipline": "string | null",
  "deliveryType": "low_ticket | one_on_one"
}
```
**Response:** `{ "data": { "programId": "string", "createdAt": "ISO string" } }`
**Errors:** `VALIDATION_ERROR`

---

#### `PATCH /api/v1/creator/programs/{programId}`
Update program metadata.

**Auth:** `role: creator`, must own
**Request:** Same shape as POST, all fields optional
**Response:** `{ "data": { "programId": "string", "updatedAt": "ISO string" } }`
**Errors:** `NOT_FOUND`, `FORBIDDEN`, `VALIDATION_ERROR`

---

#### `PATCH /api/v1/creator/programs/{programId}/status`
Publish or unpublish a program.

**Auth:** `role: creator`, must own
**Request:** `{ "status": "draft | published" }`
**Response:** `{ "data": { "programId": "string", "status": "string" } }`
**Errors:** `NOT_FOUND`, `FORBIDDEN`, `VALIDATION_ERROR`

---

#### `DELETE /api/v1/creator/programs/{programId}`
Delete a program and all its content (modules → sessions → exercises → sets) using batched writes.

**Auth:** `role: creator`, must own
**Response:** `204 No Content`
**Errors:** `NOT_FOUND`, `FORBIDDEN`
**Notes:** Server performs cascading delete in batches. Does not affect existing client enrollments (`users.courses` entries).

---

#### `POST /api/v1/creator/programs/{programId}/duplicate`
Create a full deep copy of a program (all modules → sessions → exercises → sets). The copy
is created in `draft` status with title "Copia de {original title}".

**Auth:** `role: creator`, must own
**Request:** `{ "title": "string | null" }` — optional override for the copy's title
**Response:**
```json
{ "data": { "programId": "string", "title": "string", "createdAt": "ISO string" } }
```
**Errors:** `NOT_FOUND`, `FORBIDDEN`
**Notes:** Deep copy is batched. Does not duplicate enrollments or client assignments — the new program starts with no clients.

---

#### `POST /api/v1/creator/programs/{programId}/image/upload-url`
Get signed URL to upload a program cover image.

**Auth:** `role: creator`, must own
**Request:** `{ "contentType": "image/jpeg | image/png | image/webp" }`
**Response:** `{ "data": { "uploadUrl": "string", "storagePath": "string", "expiresAt": "ISO string" } }`

---

#### `POST /api/v1/creator/programs/{programId}/image/confirm`
Confirm program image upload.

**Auth:** `role: creator`, must own
**Request:** `{ "storagePath": "string" }`
**Response:** `{ "data": { "programId": "string", "imageUrl": "string" } }`

---

### 7.3 Plans (Reusable Content)

---

#### `GET /api/v1/creator/plans`
List all reusable plans.

**Auth:** `role: creator`
**Response:**
```json
{
  "data": [
    {
      "planId": "string",
      "title": "string",
      "description": "string | null",
      "discipline": "string | null",
      "moduleCount": "number",
      "createdAt": "ISO string"
    }
  ]
}
```

---

#### `POST /api/v1/creator/plans`
Create a reusable plan. Server auto-creates first module ("Semana 1").

**Auth:** `role: creator`
**Request:**
```json
{
  "title": "string",
  "description": "string | null",
  "discipline": "string | null"
}
```
**Response:** `{ "data": { "planId": "string", "firstModuleId": "string", "createdAt": "ISO string" } }`

---

#### `GET /api/v1/creator/plans/{planId}`
Get plan with all modules (sessions listed but exercises not included — use session endpoint for content).

**Auth:** `role: creator`, must own
**Response:**
```json
{
  "data": {
    "planId": "string",
    "title": "string",
    "modules": [
      {
        "moduleId": "string",
        "title": "string",
        "order": "number",
        "sessions": [
          {
            "sessionId": "string",
            "title": "string",
            "order": "number",
            "librarySessionRef": "string | null",
            "exerciseCount": "number"
          }
        ]
      }
    ]
  }
}
```

---

#### `PATCH /api/v1/creator/plans/{planId}`
Update plan metadata.

**Auth:** `role: creator`, must own
**Request:** `{ "title": "string", "description": "string | null", "discipline": "string | null" }`
**Response:** `{ "data": { "planId": "string", "updatedAt": "ISO string" } }`
**Errors:** `NOT_FOUND`, `FORBIDDEN`

---

#### `DELETE /api/v1/creator/plans/{planId}`
Delete plan and all content via batched cascading delete.

**Auth:** `role: creator`, must own
**Response:** `204 No Content`
**Errors:** `NOT_FOUND`, `FORBIDDEN`

---

#### `POST /api/v1/creator/plans/{planId}/modules`
Add a module (week) to a plan.

**Auth:** `role: creator`, must own plan
**Request:** `{ "title": "string", "order": "number" }`
**Response:** `{ "data": { "moduleId": "string" } }`

---

#### `PATCH /api/v1/creator/plans/{planId}/modules/{moduleId}`
Update module title or order.

**Auth:** `role: creator`, must own plan
**Request:** `{ "title": "string | optional", "order": "number | optional" }`
**Response:** `{ "data": { "moduleId": "string", "updatedAt": "ISO string" } }`
**Errors:** `NOT_FOUND`, `FORBIDDEN`

---

#### `DELETE /api/v1/creator/plans/{planId}/modules/{moduleId}`
Delete module and all its sessions (batched).

**Auth:** `role: creator`, must own plan
**Response:** `204 No Content`

---

#### `POST /api/v1/creator/plans/{planId}/modules/{moduleId}/sessions`
Add a session to a module. Can reference a library session or be standalone.

**Auth:** `role: creator`, must own plan
**Request:**
```json
{
  "title": "string",
  "order": "number",
  "librarySessionRef": "string | null"
}
```
**Response:** `{ "data": { "sessionId": "string" } }`

---

#### `GET /api/v1/creator/plans/{planId}/modules/{moduleId}/sessions/{sessionId}`
Get a session with all exercises and sets. If `librarySessionRef` is set, resolves from library.

**Auth:** `role: creator`, must own plan
**Response:**
```json
{
  "data": {
    "sessionId": "string",
    "title": "string",
    "librarySessionRef": "string | null",
    "exercises": [
      {
        "exerciseId": "string",
        "name": "string",
        "libraryId": "string | null",
        "primaryMuscles": ["string"],
        "order": "number",
        "sets": [
          {
            "setId": "string",
            "reps": "string",
            "weight": "number | null",
            "intensity": "string | null",
            "rir": "number | null",
            "order": "number"
          }
        ]
      }
    ]
  }
}
```

---

#### `PATCH /api/v1/creator/plans/{planId}/modules/{moduleId}/sessions/{sessionId}`
Update session metadata (title, order) or detach from library (`librarySessionRef: null`).

**Auth:** `role: creator`, must own plan
**Request:** `{ "title": "string | optional", "order": "number | optional", "librarySessionRef": "string | null | optional" }`
**Response:** `{ "data": { "sessionId": "string", "updatedAt": "ISO string" } }`

---

#### `DELETE /api/v1/creator/plans/{planId}/modules/{moduleId}/sessions/{sessionId}`
Delete session and all its exercises (batched).

**Auth:** `role: creator`, must own plan
**Response:** `204 No Content`

---

#### `POST /api/v1/creator/plans/{planId}/modules/{moduleId}/sessions/{sessionId}/exercises`
Add an exercise to a session.

**Auth:** `role: creator`, must own plan
**Request:**
```json
{
  "name": "string",
  "libraryId": "string | null",
  "primaryMuscles": ["string"],
  "order": "number"
}
```
**Response:** `{ "data": { "exerciseId": "string" } }`

---

#### `PATCH /api/v1/creator/plans/{planId}/modules/{moduleId}/sessions/{sessionId}/exercises/{exerciseId}`
Update exercise name, order, or muscle tags.

**Auth:** `role: creator`, must own plan
**Request:** all fields optional
**Response:** `{ "data": { "exerciseId": "string", "updatedAt": "ISO string" } }`

---

#### `DELETE /api/v1/creator/plans/{planId}/modules/{moduleId}/sessions/{sessionId}/exercises/{exerciseId}`
Delete exercise and all its sets (batched).

**Auth:** `role: creator`, must own plan
**Response:** `204 No Content`

---

#### `POST /api/v1/creator/plans/{planId}/modules/{moduleId}/sessions/{sessionId}/exercises/{exerciseId}/sets`
Add a set.

**Auth:** `role: creator`, must own plan
**Request:** `{ "reps": "string", "weight": "number | null", "intensity": "string | null", "rir": "number | null", "order": "number" }`
**Response:** `{ "data": { "setId": "string" } }`

---

#### `PATCH /api/v1/creator/plans/{planId}/modules/{moduleId}/sessions/{sessionId}/exercises/{exerciseId}/sets/{setId}`
Update a set.

**Auth:** `role: creator`, must own plan
**Request:** all fields optional (same as POST)
**Response:** `{ "data": { "setId": "string", "updatedAt": "ISO string" } }`

---

#### `DELETE /api/v1/creator/plans/{planId}/modules/{moduleId}/sessions/{sessionId}/exercises/{exerciseId}/sets/{setId}`
Delete a set.

**Auth:** `role: creator`, must own plan
**Response:** `204 No Content`

---

### 7.4 Library

---

#### `GET /api/v1/creator/library/sessions`
List all library sessions.

**Auth:** `role: creator`
**Response:**
```json
{
  "data": [
    {
      "sessionId": "string",
      "title": "string",
      "exerciseCount": "number",
      "primaryMuscles": ["string"],
      "createdAt": "ISO string",
      "updatedAt": "ISO string"
    }
  ]
}
```

---

#### `POST /api/v1/creator/library/sessions`
Create a library session.

**Auth:** `role: creator`
**Request:** `{ "title": "string" }`
**Response:** `{ "data": { "sessionId": "string", "createdAt": "ISO string" } }`

---

#### `GET /api/v1/creator/library/sessions/{sessionId}`
Get a library session with all exercises and sets.

**Auth:** `role: creator`, must own
**Response:** Same shape as plan session GET above.

---

#### `PATCH /api/v1/creator/library/sessions/{sessionId}`
Update session title.

**Auth:** `role: creator`, must own
**Request:** `{ "title": "string" }`
**Response:** `{ "data": { "updatedAt": "ISO string" } }`

---

#### `DELETE /api/v1/creator/library/sessions/{sessionId}`
Delete library session.

**Auth:** `role: creator`, must own
**Response:** `204 No Content`
**Notes:** Does not cascade to plans using this session — those refs become dangling. A future cleanup job can detect orphaned refs.

---

#### `POST /api/v1/creator/library/sessions/{sessionId}/propagate`
Push library session changes to all plans referencing it. Deletes `client_session_content` copies.

**Auth:** `role: creator`, must own
**Response:** `{ "data": { "plansAffected": "number", "copiesDeleted": "number" } }`

The library also exposes the same exercise + set CRUD sub-endpoints as plan sessions:
- `POST /creator/library/sessions/{sessionId}/exercises`
- `PATCH /creator/library/sessions/{sessionId}/exercises/{exerciseId}`
- `DELETE /creator/library/sessions/{sessionId}/exercises/{exerciseId}`
- `POST /creator/library/sessions/{sessionId}/exercises/{exerciseId}/sets`
- `PATCH /creator/library/sessions/{sessionId}/exercises/{exerciseId}/sets/{setId}`
- `DELETE /creator/library/sessions/{sessionId}/exercises/{exerciseId}/sets/{setId}`

Same request/response shapes as plan session equivalents.

---

#### `GET /api/v1/creator/library/modules`
List all library modules.

**Auth:** `role: creator`
**Response:** Same shape as plans list but for modules.

---

#### Module CRUD: same pattern as library sessions.
- `POST /creator/library/modules`
- `GET /creator/library/modules/{moduleId}`
- `PATCH /creator/library/modules/{moduleId}`
- `DELETE /creator/library/modules/{moduleId}`
- `POST /creator/library/modules/{moduleId}/propagate`

---

### 7.5 Client Programs (One-on-One Scheduling)

---

#### `GET /api/v1/creator/clients/{clientId}/programs`
List programs assigned to a client.

**Auth:** `role: creator`, must have client access
**Response:**
```json
{
  "data": [
    {
      "courseId": "string",
      "title": "string",
      "assignedAt": "ISO string",
      "planAssignments": {
        "2026-W12": {
          "planId": "string",
          "planTitle": "string",
          "moduleId": "string",
          "moduleTitle": "string",
          "assignedAt": "ISO string"
        }
      }
    }
  ]
}
```

---

#### `POST /api/v1/creator/clients/{clientId}/programs/{programId}`
Assign a one-on-one program to a client. Creates `client_programs` doc and updates `users.courses`.

**Auth:** `role: creator`, must own program and have client access
**Request:**
```json
{ "expiresAt": "ISO string | null" }
```
**Response:** `{ "data": { "assignedAt": "ISO string" } }`
**Errors:** `CONFLICT` (already assigned), `NOT_FOUND`, `FORBIDDEN`

---

#### `DELETE /api/v1/creator/clients/{clientId}/programs/{programId}`
Unassign a program. Removes `client_programs` doc. Does not remove `users.courses` entry (access revocation is a separate business decision).

**Auth:** `role: creator`, must have client access
**Response:** `204 No Content`

---

#### `PUT /api/v1/creator/clients/{clientId}/programs/{programId}/schedule/{weekKey}`
Assign a plan + module to a specific week for the client. Overwrites existing assignment for that week.

**Auth:** `role: creator`, must own plan and have client access
**Request:**
```json
{
  "planId": "string",
  "moduleId": "string",
  "moduleIndex": "number"
}
```
**Response:** `{ "data": { "weekKey": "string", "assignedAt": "ISO string" } }`
**Errors:** `NOT_FOUND`, `FORBIDDEN`, `VALIDATION_ERROR`

---

#### `DELETE /api/v1/creator/clients/{clientId}/programs/{programId}/schedule/{weekKey}`
Remove a week's plan assignment.

**Auth:** `role: creator`
**Response:** `204 No Content`

---

#### `GET /api/v1/creator/clients/{clientId}/sessions`
Get a client's session completion history (for creator visibility into client progress).

**Auth:** `role: creator`, must have client access
**Query params:** `courseId` (optional), `pageToken`
**Response:** Same shape as `GET /workout/sessions`, page 20.
**Errors:** `FORBIDDEN`

---

#### `GET /api/v1/creator/clients/{clientId}/activity`
Get a summary of a client's recent activity. Used by the creator dashboard client card and
client detail header — designed to be cheap (reads denormalized fields only, no aggregation queries).

**Auth:** `role: creator`, must have client access
**Request:** none
**Response:**
```json
{
  "data": {
    "clientId": "string",
    "lastSessionCompletedAt": "ISO string | null",
    "lastSessionTitle": "string | null",
    "totalSessionsAllTime": "number",
    "currentStreak": "number",
    "lastActivityDate": "YYYY-MM-DD | null",
    "assignedCourses": [
      {
        "courseId": "string",
        "title": "string",
        "status": "active | expired",
        "expiresAt": "ISO string | null"
      }
    ]
  }
}
```
**Errors:** `NOT_FOUND`, `FORBIDDEN`
**Notes:** `totalSessionsAllTime` is read from `users/{clientId}.sessionCount` (a denormalized counter incremented on each completion). No collection scan.

---

### 7.6 Events

---

#### `GET /api/v1/creator/events`
List all events created by the creator.

**Auth:** `role: creator`
**Response:**
```json
{
  "data": [
    {
      "eventId": "string",
      "title": "string",
      "description": "string | null",
      "imageUrl": "string | null",
      "date": "ISO string",
      "location": "string | null",
      "status": "draft | active | closed",
      "maxRegistrations": "number | null",
      "registrationCount": "number",
      "fields": [
        { "fieldId": "string", "fieldName": "string", "fieldType": "string", "required": true }
      ],
      "createdAt": "ISO string"
    }
  ]
}
```

---

#### `POST /api/v1/creator/events`
Create an event.

**Auth:** `role: creator`
**Request:**
```json
{
  "title": "string",
  "description": "string | null",
  "date": "ISO string",
  "location": "string | null",
  "maxRegistrations": "number | null",
  "fields": [
    { "fieldName": "string", "fieldType": "text | select | checkbox", "required": true }
  ]
}
```
**Response:** `{ "data": { "eventId": "string", "createdAt": "ISO string" } }`

---

#### `PATCH /api/v1/creator/events/{eventId}`
Update event details (only allowed in `draft` or `active` status).

**Auth:** `role: creator`, must own
**Request:** Same shape as POST, all fields optional
**Response:** `{ "data": { "eventId": "string", "updatedAt": "ISO string" } }`
**Errors:** `NOT_FOUND`, `FORBIDDEN`

---

#### `PATCH /api/v1/creator/events/{eventId}/status`
Change event status.

**Auth:** `role: creator`, must own
**Request:** `{ "status": "draft | active | closed" }`
**Response:** `{ "data": { "eventId": "string", "status": "string" } }`
**Errors:** `NOT_FOUND`, `FORBIDDEN`, `VALIDATION_ERROR`

---

#### `DELETE /api/v1/creator/events/{eventId}`
Delete an event. Only allowed if `status: 'draft'` or no registrations exist.

**Auth:** `role: creator`, must own
**Response:** `204 No Content`
**Errors:** `NOT_FOUND`, `FORBIDDEN`, `CONFLICT` (registrations exist)

---

#### `POST /api/v1/creator/events/{eventId}/image/upload-url`
Signed URL for event cover image upload.

**Auth:** `role: creator`, must own
**Request:** `{ "contentType": "image/jpeg | image/png | image/webp" }`
**Response:** `{ "data": { "uploadUrl": "string", "storagePath": "string" } }`

---

#### `POST /api/v1/creator/events/{eventId}/image/confirm`
Confirm event image upload.

**Auth:** `role: creator`, must own
**Request:** `{ "storagePath": "string" }`
**Response:** `{ "data": { "imageUrl": "string" } }`

---

#### `GET /api/v1/creator/events/{eventId}/registrations`
List registrations for an event. Page 50.

**Auth:** `role: creator`, must own event
**Query params:** `pageToken`, `checkedIn` (filter: `true | false | all`, default `all`)
**Response:**
```json
{
  "data": [
    {
      "registrationId": "string",
      "clientUserId": "string | null",
      "email": "string",
      "displayName": "string | null",
      "checkedIn": false,
      "checkedInAt": "ISO string | null",
      "fieldValues": { "fieldId": "value" },
      "createdAt": "ISO string"
    }
  ],
  "nextPageToken": "string | null",
  "hasMore": false
}
```

---

#### `POST /api/v1/creator/events/{eventId}/registrations/{registrationId}/check-in`
Mark an attendee as checked in.

**Auth:** `role: creator`, must own event
**Request:** none
**Response:** `{ "data": { "registrationId": "string", "checkedInAt": "ISO string" } }`
**Errors:** `NOT_FOUND`, `FORBIDDEN`, `CONFLICT` (already checked in)

---

#### `DELETE /api/v1/creator/events/{eventId}/registrations/{registrationId}`
Remove a registration.

**Auth:** `role: creator`, must own event
**Response:** `204 No Content`
**Errors:** `NOT_FOUND`, `FORBIDDEN`

---

#### `GET /api/v1/creator/events/{eventId}/waitlist`
List waitlist entries.

**Auth:** `role: creator`, must own event
**Response:** Same shape as registrations list.

---

#### `POST /api/v1/creator/events/{eventId}/waitlist/{waitlistId}/admit`
Admit a waitlist entry. Creates a registration doc, removes the waitlist doc.

**Auth:** `role: creator`, must own event
**Response:** `{ "data": { "registrationId": "string" } }`
**Errors:** `NOT_FOUND`, `FORBIDDEN`

---

### 7.7 Availability & Bookings

---

#### `GET /api/v1/creator/availability`
Get full availability document (all days with slots).

**Auth:** `role: creator`
**Response:**
```json
{
  "data": {
    "timezone": "America/Bogota",
    "days": {
      "2026-03-20": {
        "slots": [
          {
            "startUtc": "ISO string",
            "endUtc": "ISO string",
            "durationMinutes": 30,
            "booked": false
          }
        ]
      }
    }
  }
}
```

---

#### `POST /api/v1/creator/availability/slots`
Add time slots for a day. Server generates all slots between start and end at given duration.

**Auth:** `role: creator`
**Request:**
```json
{
  "date": "YYYY-MM-DD",
  "startTime": "HH:MM",
  "endTime": "HH:MM",
  "durationMinutes": 15,
  "timezone": "America/Bogota"
}
```
**Response:**
```json
{ "data": { "date": "YYYY-MM-DD", "slotsCreated": "number" } }
```
**Errors:** `VALIDATION_ERROR`

---

#### `DELETE /api/v1/creator/availability/slots`
Remove all slots for a day (or specific slot).

**Auth:** `role: creator`
**Request:** `{ "date": "YYYY-MM-DD", "startUtc": "ISO string | null (null = delete all for day)" }`
**Response:** `204 No Content`

---

#### `GET /api/v1/creator/bookings`
List upcoming bookings.

**Auth:** `role: creator`
**Query params:**
- `date` — `YYYY-MM-DD` (filter to specific day)
- `pageToken`
**Response:**
```json
{
  "data": [
    {
      "bookingId": "string",
      "clientUserId": "string",
      "clientDisplayName": "string",
      "slotStartUtc": "ISO string",
      "slotEndUtc": "ISO string",
      "status": "scheduled | cancelled",
      "callLink": "string | null",
      "courseId": "string | null",
      "createdAt": "ISO string"
    }
  ],
  "nextPageToken": "string | null",
  "hasMore": false
}
```

---

#### `PATCH /api/v1/creator/bookings/{bookingId}`
Add or update a call link for a booking.

**Auth:** `role: creator`, must own booking
**Request:** `{ "callLink": "string | null" }`
**Response:** `{ "data": { "bookingId": "string", "updatedAt": "ISO string" } }`
**Errors:** `NOT_FOUND`, `FORBIDDEN`

---

## 8. Events (Public / PWA)

---

#### `GET /api/v1/events/{eventId}`
Get public event details (no auth required — for sharing link `wakelab.co/e/{eventId}`).

**Auth:** none
**Response:**
```json
{
  "data": {
    "eventId": "string",
    "title": "string",
    "description": "string | null",
    "imageUrl": "string | null",
    "date": "ISO string",
    "location": "string | null",
    "status": "active | closed",
    "spotsRemaining": "number | null",
    "fields": [
      { "fieldId": "string", "fieldName": "string", "fieldType": "string", "required": true }
    ]
  }
}
```
**Errors:** `NOT_FOUND`
**Notes:** Draft events return `NOT_FOUND` to public.

---

#### `POST /api/v1/events/{eventId}/register`
Register for an event. If at capacity, auto-adds to waitlist.

**Auth:** optional (supports unauthenticated registrations via `email` field)
**Request:**
```json
{
  "email": "string",
  "displayName": "string | null",
  "fieldValues": { "fieldId": "value" }
}
```
**Response:**
```json
{
  "data": {
    "registrationId": "string",
    "status": "registered | waitlisted",
    "waitlistPosition": "number | null"
  }
}
```
**Errors:** `NOT_FOUND`, `CONFLICT` (already registered with this email), `VALIDATION_ERROR` (required fields missing), `FORBIDDEN` (event closed)
**Notes:** `sendEventConfirmationEmail` Firestore trigger fires automatically on doc creation — no API action needed.

---

## 9. Bookings (PWA — Client Side)

---

#### `GET /api/v1/creator/{creatorId}/availability`
Get a creator's available (unbooked) slots for a date range. Used by the PWA to show the booking calendar.

**Auth:** required
**Query params:**
- `startDate` + `endDate` — `YYYY-MM-DD`, max 60 days
**Response:**
```json
{
  "data": {
    "timezone": "America/Bogota",
    "days": {
      "2026-03-20": {
        "availableSlots": [
          { "startUtc": "ISO string", "endUtc": "ISO string", "durationMinutes": 30 }
        ]
      }
    }
  }
}
```
**Errors:** `NOT_FOUND` (creator not found), `FORBIDDEN`
**Notes:** Only returns slots that are not already booked.

---

#### `POST /api/v1/bookings`
Book a slot. Instantly confirmed — no creator approval.

**Auth:** required
**Request:**
```json
{
  "creatorId": "string",
  "courseId": "string | null",
  "slotStartUtc": "ISO string",
  "slotEndUtc": "ISO string"
}
```
**Response:**
```json
{ "data": { "bookingId": "string", "status": "scheduled", "createdAt": "ISO string" } }
```
**Errors:** `CONFLICT` (slot already taken), `NOT_FOUND` (creator or slot not found), `VALIDATION_ERROR`

---

#### `GET /api/v1/bookings/{bookingId}`
Get a single booking (client or creator can fetch their own).

**Auth:** required, must be the client or the creator
**Response:**
```json
{
  "data": {
    "bookingId": "string",
    "creatorId": "string",
    "creatorDisplayName": "string",
    "slotStartUtc": "ISO string",
    "slotEndUtc": "ISO string",
    "status": "scheduled | cancelled",
    "callLink": "string | null",
    "courseId": "string | null"
  }
}
```

---

#### `DELETE /api/v1/bookings/{bookingId}`
Cancel a booking (client cancels their own).

**Auth:** required, must be the booking owner
**Response:** `204 No Content`
**Errors:** `NOT_FOUND`, `FORBIDDEN`

---

## 10. Payments (Migrated from Cloud Functions)

These replace the existing `createPaymentPreference`, `createSubscriptionCheckout`, `processPaymentWebhook`, and `updateSubscriptionStatus` Cloud Functions. Logic is identical — only the URL and auth mechanism change.

---

#### `POST /api/v1/payments/preference`
Create a MercadoPago one-time payment preference.

**Auth:** Firebase ID token
**Request:**
```json
{
  "courseId": "string",
  "accessDuration": "monthly | 3-month | 6-month | yearly"
}
```
**Response:**
```json
{
  "data": {
    "preferenceId": "string",
    "initPoint": "https://www.mercadopago.com.co/checkout/v1/redirect?pref_id=..."
  }
}
```
**Errors:** `VALIDATION_ERROR`, `NOT_FOUND` (course), `SERVICE_UNAVAILABLE` (MercadoPago down)

---

#### `POST /api/v1/payments/subscription`
Create a MercadoPago recurring subscription (PreApproval).

**Auth:** Firebase ID token
**Request:**
```json
{
  "courseId": "string",
  "accessDuration": "monthly | 3-month | 6-month | yearly"
}
```
**Response:**
```json
{
  "data": {
    "subscriptionId": "string",
    "initPoint": "https://..."
  }
}
```
**Errors:** `VALIDATION_ERROR`, `NOT_FOUND`, `SERVICE_UNAVAILABLE`

---

#### `POST /api/v1/payments/webhook`
MercadoPago webhook endpoint. HMAC-SHA256 validated.

**Auth:** none (HMAC signature in `x-signature` header)
**Notes:**
- Returns HTTP 500 for retryable errors (triggers MP retry)
- Returns HTTP 200 for non-retryable errors (stops retry)
- Idempotency: checks `processed_payments/{paymentId}` before processing

---

#### `POST /api/v1/payments/subscriptions/{subscriptionId}/cancel`
Cancel, pause, or resume a MercadoPago subscription.

**Auth:** Firebase ID token, must own subscription
**Request:** `{ "action": "cancel | pause | resume" }`
**Response:** `{ "data": { "subscriptionId": "string", "status": "string" } }`
**Errors:** `NOT_FOUND`, `FORBIDDEN`, `SERVICE_UNAVAILABLE`

---

#### `GET /api/v1/users/me/subscriptions`
List the authenticated user's subscriptions.

**Auth:** required
**Response:**
```json
{
  "data": [
    {
      "subscriptionId": "string",
      "courseId": "string",
      "courseTitle": "string",
      "status": "authorized | paused | cancelled",
      "nextPaymentDate": "ISO string | null",
      "amount": "number",
      "currency": "COP",
      "createdAt": "ISO string"
    }
  ]
}
```

---

## 11. Analytics

Server-side aggregation endpoints. These replace `consolidatedDataService.js`
client-side aggregations. All data is computed from `sessionHistory` on read
(no pre-aggregated analytics documents). Queries are bounded by date range to keep
read cost predictable.

---

#### `GET /api/v1/analytics/weekly-volume`
Get weekly training volume (sets per muscle group) for a date range.

**Auth:** required
**Query params:**
- `startDate` — `YYYY-MM-DD` (Monday of start week)
- `endDate` — `YYYY-MM-DD` (Sunday of end week)
- Max range: 12 weeks
**Response:**
```json
{
  "data": [
    {
      "weekKey": "2026-W11",
      "weekStartDate": "2026-03-09",
      "weekEndDate": "2026-03-15",
      "totalSessions": "number",
      "muscleVolumes": {
        "push": "number",
        "pull": "number",
        "legs": "number",
        "shoulders": "number",
        "core": "number"
      },
      "totalSets": "number"
    }
  ]
}
```
**Errors:** `VALIDATION_ERROR` (range > 12 weeks or invalid dates)

---

#### `GET /api/v1/analytics/muscle-breakdown`
Get total sets per muscle group for a date range. Used by the Lab screen muscle distribution chart.

**Auth:** required
**Query params:**
- `startDate` + `endDate` — `YYYY-MM-DD`, max 90 days
**Response:**
```json
{
  "data": {
    "period": { "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD" },
    "muscles": {
      "push": "number",
      "pull": "number",
      "legs": "number",
      "shoulders": "number",
      "core": "number"
    },
    "totalSessions": "number",
    "totalSets": "number"
  }
}
```

---

## 12. App Resources

Public read-only endpoint for the landing page. Replaces the direct Firestore read
from `app_resources` collection in `apps/landing`.

---

#### `GET /api/v1/app-resources`
Get landing page content assets (hero images, program cards, marketing copy).

**Auth:** none
**Request:** none
**Response:**
```json
{
  "data": {
    "hero": {
      "imageUrl": "string | null",
      "headline": "string | null",
      "subheadline": "string | null"
    },
    "programCards": [
      {
        "resourceId": "string",
        "title": "string",
        "imageUrl": "string | null",
        "discipline": "string | null",
        "order": "number"
      }
    ]
  }
}
```
**Notes:**
- Response is cached by Firebase Hosting CDN with `Cache-Control: public, max-age=300` (5 minutes).
- The API sets this header explicitly. Content changes are reflected within 5 minutes.
- This is the only endpoint where the server sets a public cache header. All other endpoints are `Cache-Control: private, no-store`.

---

## Appendix A — Domain-Specific Error Codes

| Code | Status | Domain | Meaning |
|---|---|---|---|
| `TRIAL_ALREADY_CONSUMED` | 409 | Payments | User already used their trial for this course |
| `ENROLLMENT_EXPIRED` | 403 | Workout | User's access to this course has expired |
| `NOT_ENROLLED` | 403 | Workout | User is not enrolled in this course |
| `SESSION_ALREADY_COMPLETED` | 409 | Workout | Same session completed on same day (idempotency) |
| `USERNAME_TAKEN` | 409 | Profile | Username already in use |
| `CLIENT_ALREADY_ADDED` | 409 | Creator | User is already in creator's client list |
| `NOT_YOUR_CLIENT` | 403 | Creator | Target user is not in this creator's client list |
| `PROGRAM_ALREADY_ASSIGNED` | 409 | Creator | Program already assigned to this client |
| `EVENT_CLOSED` | 403 | Events | Event is not accepting registrations |
| `ALREADY_REGISTERED` | 409 | Events | Same email already registered for this event |
| `SLOT_ALREADY_BOOKED` | 409 | Bookings | Slot taken between availability check and booking |
| `PLAN_NOT_FOUND` | 404 | Nutrition/Plans | Plan does not exist or creator does not own it |
| `SESSION_INTERRUPTED` | — | Workout | Not an error code — informational: active checkpoint exists |

---

## Appendix B — Known Bugs to Fix at Migration

These bugs exist in the current client-side code. The Phase 3 API corrects them server-side.

| # | Bug | Fix in API |
|---|---|---|
| 1 | Session completion non-atomic (5+ separate writes) | Single Firestore `writeBatch()` in `POST /workout/complete` |
| 2 | 1RM computed 2–3× per completion | Computed once in `POST /workout/complete` handler |
| 3 | Streak via `onSnapshot` on entire user doc | Computed server-side, returned in completion response |
| 4 | `weight` vs `bodyweight` field name inconsistency | `PATCH /users/me` normalizes to `weight` |
| 5 | Nutrition propagation snapshot refresh silently fails | Server throws hard error if plan fetch fails during propagation |
| 6 | Creator editing client's plan doesn't create a copy | `PATCH .../nutrition/assignment` explicitly creates `client_nutrition_plan_content` |
| 7 | Cascading plan deletion: 1000+ sequential writes | Server uses `writeBatch()` in pages of 500 |
| 8 | Readiness soreness stored inverted | `PUT /progress/readiness/{date}` stores corrected value; inversion is dead |
| 9 | Missing Firestore indexes on propagation queries | Server enforces indexed queries; full-scan fallback removed |
| 10 | `profilePictureUpdatedAt` written but never read | Field dropped — not written or returned |
| 11 | `free_trial_history` duplicates `courses[id].trial_consumed` | `free_trial_history` writes removed — read from `courses` only |
| 12 | Session state 100% in-memory — any interruption loses all progress | `POST /workout/session/checkpoint` + `localStorage` persistence per `WORKOUT_INTERRUPTION_SPEC.md` |
| 13 | `consolidatedDataService` does client-side aggregation with unbounded reads | Server-side aggregation in `GET /analytics/weekly-volume` and `GET /analytics/muscle-breakdown` |
