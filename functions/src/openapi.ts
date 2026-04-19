import type {OpenAPIV3} from "openapi-types";

const bearerAuth: OpenAPIV3.SecurityRequirementObject = {BearerAuth: []};
const apiKeyAuth: OpenAPIV3.SecurityRequirementObject = {ApiKeyAuth: []};
const anyAuth = [bearerAuth, apiKeyAuth];
const creatorAuth = [bearerAuth];

function stub(
  summary: string,
  tags: string[],
  security: OpenAPIV3.SecurityRequirementObject[],
  responseDesc: string,
  params: OpenAPIV3.ParameterObject[] = []
): OpenAPIV3.OperationObject {
  return {
    summary,
    tags,
    security,
    parameters: params,
    responses: {
      "200": {description: responseDesc},
      "204": {description: "No content"},
      "400": {description: "Validation error"},
      "401": {description: "Unauthenticated"},
      "403": {description: "Forbidden"},
      "404": {description: "Not found"},
    },
  };
}

function pathParam(name: string): OpenAPIV3.ParameterObject {
  return {name, in: "path", required: true, schema: {type: "string"}};
}

function queryParam(name: string, required = false): OpenAPIV3.ParameterObject {
  return {name, in: "query", required, schema: {type: "string"}};
}

export function generateOpenApiSpec(): OpenAPIV3.Document {
  return {
    openapi: "3.0.3",
    info: {
      title: "Wake API",
      version: "1.0.0",
    },
    servers: [
      {url: "/api/v1", description: "Production"},
      {
        url: "http://localhost:5001/wolf-20b8b/us-central1/api/v1",
        description: "Local emulator",
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "Firebase ID token",
          description: "Firebase ID token for first-party clients (PWA, creator dashboard)",
        },
        ApiKeyAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "wk_live_... or wk_test_...",
          description: "Third-party API key sent as Bearer token in Authorization header",
        },
      },
    },
    paths: {
      // ── API Keys ─────────────────────────────────────────────────────────
      "/api-keys": {
        get: stub("List API keys", ["api-keys"], creatorAuth, "List of API keys for the creator"),
        post: stub("Create API key", ["api-keys"], creatorAuth, "New API key (returned once, never again)"),
      },
      "/api-keys/{keyId}": {
        delete: stub("Revoke API key", ["api-keys"], creatorAuth, "204 No Content", [pathParam("keyId")]),
      },

      // ── Users / Profile ───────────────────────────────────────────────────
      "/users/me": {
        get: stub("Get own profile", ["users"], anyAuth, "Full user profile"),
        patch: stub("Update own profile", ["users"], anyAuth, "Updated userId and timestamp"),
      },
      "/users/me/profile-picture/upload-url": {
        post: stub("Get profile picture upload URL", ["users"], anyAuth, "Signed upload URL"),
      },
      "/users/me/profile-picture/confirm": {
        post: stub("Confirm profile picture upload", ["users"], anyAuth, "New profilePictureUrl"),
      },
      "/users/me/subscriptions": {
        get: stub("List user subscriptions", ["users"], anyAuth, "List of MercadoPago subscriptions"),
      },
      "/users/{userId}/public-profile": {
        get: stub(
          "Get creator public profile",
          ["users"],
          anyAuth,
          "Public profile for a creator",
          [pathParam("userId")]
        ),
      },
      "/creator/profile": {
        patch: stub("Update creator profile fields", ["users"], creatorAuth, "Updated timestamp"),
      },

      // ── Nutrition — Diary ────────────────────────────────────────────────
      "/nutrition/diary": {
        get: stub(
          "Get nutrition diary entries",
          ["nutrition"],
          anyAuth,
          "Diary entries for a date or range",
          [queryParam("date"), queryParam("startDate"), queryParam("endDate")]
        ),
        post: stub("Log food entry", ["nutrition"], anyAuth, "New entryId and createdAt"),
      },
      "/nutrition/diary/{entryId}": {
        patch: stub("Update diary entry", ["nutrition"], anyAuth, "Updated entryId and timestamp", [pathParam("entryId")]),
        delete: stub("Delete diary entry", ["nutrition"], anyAuth, "204 No Content", [pathParam("entryId")]),
      },

      // ── Nutrition — Food search ──────────────────────────────────────────
      "/nutrition/foods/search": {
        get: stub(
          "Search foods (FatSecret proxy)",
          ["nutrition"],
          anyAuth,
          "Food search results",
          [queryParam("q", true), queryParam("page")]
        ),
      },
      "/nutrition/foods/{foodId}": {
        get: stub("Get food detail", ["nutrition"], anyAuth, "Full food with servings", [pathParam("foodId")]),
      },
      "/nutrition/foods/barcode/{barcode}": {
        get: stub("Barcode lookup", ["nutrition"], anyAuth, "Food detail for barcode", [pathParam("barcode")]),
      },

      // ── Nutrition — Saved foods ──────────────────────────────────────────
      "/nutrition/saved-foods": {
        get: stub("List saved foods", ["nutrition"], anyAuth, "User's saved food list"),
        post: stub("Save a food", ["nutrition"], anyAuth, "New savedFoodId"),
      },
      "/nutrition/saved-foods/{savedFoodId}": {
        delete: stub("Remove saved food", ["nutrition"], anyAuth, "204 No Content", [pathParam("savedFoodId")]),
      },

      // ── Nutrition — Assignment ───────────────────────────────────────────
      "/nutrition/assignment": {
        get: stub(
          "Get active nutrition plan",
          ["nutrition"],
          anyAuth,
          "Active nutrition assignment and resolved plan",
          [queryParam("date")]
        ),
      },

      // ── Nutrition — Creator meal library ─────────────────────────────────
      "/creator/nutrition/meals": {
        get: stub("List creator meal templates", ["nutrition", "creator"], creatorAuth, "List of meal templates"),
        post: stub("Create meal template", ["nutrition", "creator"], creatorAuth, "New mealId and createdAt"),
      },
      "/creator/nutrition/meals/{mealId}": {
        patch: stub("Update meal template", ["nutrition", "creator"], creatorAuth, "Updated mealId and timestamp", [pathParam("mealId")]),
        delete: stub("Delete meal template", ["nutrition", "creator"], creatorAuth, "204 No Content", [pathParam("mealId")]),
      },

      // ── Nutrition — Creator plan library ─────────────────────────────────
      "/creator/nutrition/plans": {
        get: stub("List creator nutrition plans", ["nutrition", "creator"], creatorAuth, "List of nutrition plans"),
        post: stub("Create nutrition plan", ["nutrition", "creator"], creatorAuth, "New planId and createdAt"),
      },
      "/creator/nutrition/plans/{planId}": {
        get: stub("Get nutrition plan detail", ["nutrition", "creator"], creatorAuth, "Full plan with categories", [pathParam("planId")]),
        patch: stub("Update nutrition plan", ["nutrition", "creator"], creatorAuth, "Updated planId and timestamp", [pathParam("planId")]),
        delete: stub("Delete nutrition plan", ["nutrition", "creator"], creatorAuth, "204 No Content", [pathParam("planId")]),
      },
      "/creator/nutrition/plans/{planId}/propagate": {
        post: stub("Propagate plan to clients", ["nutrition", "creator"], creatorAuth, "clientsAffected and copiesDeleted", [pathParam("planId")]),
      },

      // ── Nutrition — Creator client assignments ───────────────────────────
      "/creator/clients/{clientId}/nutrition/assignments": {
        get: stub("List client nutrition assignments", ["nutrition", "creator"], creatorAuth, "List of assignments", [pathParam("clientId")]),
        post: stub("Assign nutrition plan to client", ["nutrition", "creator"], creatorAuth, "New assignmentId and createdAt", [pathParam("clientId")]),
      },
      "/creator/clients/{clientId}/nutrition/assignments/{assignmentId}": {
        delete: stub("Remove nutrition assignment", ["nutrition", "creator"], creatorAuth, "204 No Content", [pathParam("clientId"), pathParam("assignmentId")]),
      },
      "/creator/clients/{clientId}/nutrition/diary": {
        get: stub(
          "Read client nutrition diary",
          ["nutrition", "creator"],
          creatorAuth,
          "Client diary entries",
          [pathParam("clientId"), queryParam("date"), queryParam("startDate"), queryParam("endDate")]
        ),
      },

      // ── Progress — Body log ───────────────────────────────────────────────
      "/progress/body-log": {
        get: stub(
          "List body log entries",
          ["progress"],
          anyAuth,
          "Paginated body log entries",
          [queryParam("pageToken"), queryParam("limit")]
        ),
      },
      "/progress/body-log/{date}": {
        get: stub("Get body log entry", ["progress"], anyAuth, "Single body log entry", [pathParam("date")]),
        put: stub("Create or update body log entry", ["progress"], anyAuth, "Date and updatedAt", [pathParam("date")]),
        delete: stub("Delete body log entry", ["progress"], anyAuth, "204 No Content", [pathParam("date")]),
      },
      "/progress/body-log/{date}/photos/upload-url": {
        post: stub("Get progress photo upload URL", ["progress"], anyAuth, "Signed upload URL with photoId", [pathParam("date")]),
      },
      "/progress/body-log/{date}/photos/confirm": {
        post: stub("Confirm progress photo upload", ["progress"], anyAuth, "Date and photoId", [pathParam("date")]),
      },
      "/progress/body-log/{date}/photos/{photoId}": {
        delete: stub("Delete progress photo", ["progress"], anyAuth, "204 No Content", [pathParam("date"), pathParam("photoId")]),
      },

      // ── Progress — Readiness ──────────────────────────────────────────────
      "/progress/readiness": {
        get: stub(
          "Get readiness entries",
          ["progress"],
          anyAuth,
          "Readiness entries for date range",
          [queryParam("startDate", true), queryParam("endDate", true)]
        ),
      },
      "/progress/readiness/{date}": {
        get: stub("Get readiness entry", ["progress"], anyAuth, "Single readiness entry", [pathParam("date")]),
        put: stub("Create or update readiness entry", ["progress"], anyAuth, "Date and completedAt", [pathParam("date")]),
        delete: stub("Delete readiness entry", ["progress"], anyAuth, "204 No Content", [pathParam("date")]),
      },

      // ── Workout — Daily session ───────────────────────────────────────────
      "/workout/daily": {
        get: stub(
          "Get today's session",
          ["workout"],
          anyAuth,
          "Resolved session with exercises and last performance",
          [queryParam("courseId", true), queryParam("date")]
        ),
      },

      // ── Workout — Courses ────────────────────────────────────────────────
      "/workout/courses": {
        get: stub("List enrolled courses", ["workout"], anyAuth, "List of courses with access status"),
      },
      "/workout/courses/{courseId}": {
        get: stub("Get course detail", ["workout"], anyAuth, "Course with modules and sessions", [pathParam("courseId")]),
      },

      // ── Workout — Session completion ──────────────────────────────────────
      "/workout/complete": {
        post: stub("Complete workout session", ["workout"], anyAuth, "PRs, streak, and muscle volumes"),
      },

      // ── Workout — Session history ─────────────────────────────────────────
      "/workout/sessions": {
        get: stub(
          "List session history",
          ["workout"],
          anyAuth,
          "Paginated session history",
          [queryParam("courseId"), queryParam("pageToken")]
        ),
      },
      "/workout/sessions/{completionId}": {
        get: stub("Get completed session detail", ["workout"], anyAuth, "Full session with exercises", [pathParam("completionId")]),
      },

      // ── Workout — Exercise history ────────────────────────────────────────
      "/workout/exercises/{exerciseKey}/history": {
        get: stub(
          "Get exercise history",
          ["workout"],
          anyAuth,
          "Paginated exercise history",
          [pathParam("exerciseKey"), queryParam("pageToken")]
        ),
      },

      // ── Workout — Personal records ────────────────────────────────────────
      "/workout/prs": {
        get: stub("Get all personal records", ["workout"], anyAuth, "Current 1RM estimates for all exercises"),
      },
      "/workout/prs/{exerciseKey}/history": {
        get: stub("Get PR history for exercise", ["workout"], anyAuth, "1RM estimate history", [pathParam("exerciseKey")]),
      },

      // ── Workout — Session interruption recovery ───────────────────────────
      "/workout/session/checkpoint": {
        post: stub("Save session checkpoint", ["workout"], anyAuth, "Confirmation of save"),
      },
      "/workout/session/active": {
        get: stub("Get active session checkpoint", ["workout"], anyAuth, "Active checkpoint or null"),
        delete: stub("Delete active session checkpoint", ["workout"], anyAuth, "Deleted flag (idempotent)"),
      },

      // ── Workout — Streak ─────────────────────────────────────────────────
      "/workout/streak": {
        get: stub("Get activity streak", ["workout"], anyAuth, "Current streak, longest streak, flame level"),
      },

      // ── Creator — Clients ─────────────────────────────────────────────────
      "/creator/clients": {
        get: stub("List clients", ["creator"], creatorAuth, "Paginated client list", [queryParam("pageToken")]),
        post: stub("Add client by email", ["creator"], creatorAuth, "New clientId and display info"),
      },
      "/creator/clients/{clientId}": {
        delete: stub("Remove client", ["creator"], creatorAuth, "204 No Content", [pathParam("clientId")]),
      },

      // ── Creator — Programs ────────────────────────────────────────────────
      "/creator/programs": {
        get: stub("List creator programs", ["creator"], creatorAuth, "All programs by this creator"),
        post: stub("Create program", ["creator"], creatorAuth, "New programId and createdAt"),
      },
      "/creator/programs/{programId}": {
        patch: stub("Update program metadata", ["creator"], creatorAuth, "Updated programId and timestamp", [pathParam("programId")]),
        delete: stub("Delete program", ["creator"], creatorAuth, "204 No Content", [pathParam("programId")]),
      },
      "/creator/programs/{programId}/status": {
        patch: stub("Publish or unpublish program", ["creator"], creatorAuth, "Updated status", [pathParam("programId")]),
      },
      "/creator/programs/{programId}/duplicate": {
        post: stub("Duplicate program", ["creator"], creatorAuth, "New programId, title, createdAt", [pathParam("programId")]),
      },
      "/creator/programs/{programId}/image/upload-url": {
        post: stub("Get program image upload URL", ["creator"], creatorAuth, "Signed upload URL", [pathParam("programId")]),
      },
      "/creator/programs/{programId}/image/confirm": {
        post: stub("Confirm program image upload", ["creator"], creatorAuth, "Updated imageUrl", [pathParam("programId")]),
      },

      // ── Creator — Plans ───────────────────────────────────────────────────
      "/creator/plans": {
        get: stub("List reusable plans", ["creator"], creatorAuth, "All plans for this creator"),
        post: stub("Create reusable plan", ["creator"], creatorAuth, "New planId, firstModuleId, createdAt"),
      },
      "/creator/plans/{planId}": {
        get: stub("Get plan detail", ["creator"], creatorAuth, "Plan with modules and sessions", [pathParam("planId")]),
        patch: stub("Update plan metadata", ["creator"], creatorAuth, "Updated planId and timestamp", [pathParam("planId")]),
        delete: stub("Delete plan", ["creator"], creatorAuth, "204 No Content", [pathParam("planId")]),
      },
      "/creator/plans/{planId}/modules": {
        post: stub("Add module to plan", ["creator"], creatorAuth, "New moduleId", [pathParam("planId")]),
      },
      "/creator/plans/{planId}/modules/{moduleId}": {
        patch: stub("Update module", ["creator"], creatorAuth, "Updated moduleId and timestamp", [pathParam("planId"), pathParam("moduleId")]),
        delete: stub("Delete module", ["creator"], creatorAuth, "204 No Content", [pathParam("planId"), pathParam("moduleId")]),
      },
      "/creator/plans/{planId}/modules/{moduleId}/sessions": {
        post: stub("Add session to module", ["creator"], creatorAuth, "New sessionId", [pathParam("planId"), pathParam("moduleId")]),
      },
      "/creator/plans/{planId}/modules/{moduleId}/sessions/{sessionId}": {
        get: stub("Get session with exercises", ["creator"], creatorAuth, "Session with all exercises and sets", [pathParam("planId"), pathParam("moduleId"), pathParam("sessionId")]),
        patch: stub("Update session", ["creator"], creatorAuth, "Updated sessionId and timestamp", [pathParam("planId"), pathParam("moduleId"), pathParam("sessionId")]),
        delete: stub("Delete session", ["creator"], creatorAuth, "204 No Content", [pathParam("planId"), pathParam("moduleId"), pathParam("sessionId")]),
      },
      "/creator/plans/{planId}/modules/{moduleId}/sessions/{sessionId}/exercises": {
        post: stub("Add exercise to session", ["creator"], creatorAuth, "New exerciseId", [pathParam("planId"), pathParam("moduleId"), pathParam("sessionId")]),
      },
      "/creator/plans/{planId}/modules/{moduleId}/sessions/{sessionId}/exercises/{exerciseId}": {
        patch: stub("Update exercise", ["creator"], creatorAuth, "Updated exerciseId and timestamp", [pathParam("planId"), pathParam("moduleId"), pathParam("sessionId"), pathParam("exerciseId")]),
        delete: stub("Delete exercise", ["creator"], creatorAuth, "204 No Content", [pathParam("planId"), pathParam("moduleId"), pathParam("sessionId"), pathParam("exerciseId")]),
      },
      "/creator/plans/{planId}/modules/{moduleId}/sessions/{sessionId}/exercises/{exerciseId}/sets": {
        post: stub("Add set", ["creator"], creatorAuth, "New setId", [pathParam("planId"), pathParam("moduleId"), pathParam("sessionId"), pathParam("exerciseId")]),
      },
      "/creator/plans/{planId}/modules/{moduleId}/sessions/{sessionId}/exercises/{exerciseId}/sets/{setId}": {
        patch: stub("Update set", ["creator"], creatorAuth, "Updated setId and timestamp", [pathParam("planId"), pathParam("moduleId"), pathParam("sessionId"), pathParam("exerciseId"), pathParam("setId")]),
        delete: stub("Delete set", ["creator"], creatorAuth, "204 No Content", [pathParam("planId"), pathParam("moduleId"), pathParam("sessionId"), pathParam("exerciseId"), pathParam("setId")]),
      },

      // ── Creator — Library sessions ────────────────────────────────────────
      "/creator/library/sessions": {
        get: stub("List library sessions", ["creator"], creatorAuth, "All library sessions"),
        post: stub("Create library session", ["creator"], creatorAuth, "New sessionId and createdAt"),
      },
      "/creator/library/sessions/{sessionId}": {
        get: stub("Get library session", ["creator"], creatorAuth, "Session with exercises and sets", [pathParam("sessionId")]),
        patch: stub("Update library session title", ["creator"], creatorAuth, "Updated timestamp", [pathParam("sessionId")]),
        delete: stub("Delete library session", ["creator"], creatorAuth, "204 No Content", [pathParam("sessionId")]),
      },
      "/creator/library/sessions/{sessionId}/propagate": {
        post: stub("Propagate library session to plans", ["creator"], creatorAuth, "plansAffected and copiesDeleted", [pathParam("sessionId")]),
      },
      "/creator/library/sessions/{sessionId}/exercises": {
        post: stub("Add exercise to library session", ["creator"], creatorAuth, "New exerciseId", [pathParam("sessionId")]),
      },
      "/creator/library/sessions/{sessionId}/exercises/{exerciseId}": {
        patch: stub("Update library exercise", ["creator"], creatorAuth, "Updated exerciseId and timestamp", [pathParam("sessionId"), pathParam("exerciseId")]),
        delete: stub("Delete library exercise", ["creator"], creatorAuth, "204 No Content", [pathParam("sessionId"), pathParam("exerciseId")]),
      },
      "/creator/library/sessions/{sessionId}/exercises/{exerciseId}/sets": {
        post: stub("Add set to library exercise", ["creator"], creatorAuth, "New setId", [pathParam("sessionId"), pathParam("exerciseId")]),
      },
      "/creator/library/sessions/{sessionId}/exercises/{exerciseId}/sets/{setId}": {
        patch: stub("Update library set", ["creator"], creatorAuth, "Updated setId and timestamp", [pathParam("sessionId"), pathParam("exerciseId"), pathParam("setId")]),
        delete: stub("Delete library set", ["creator"], creatorAuth, "204 No Content", [pathParam("sessionId"), pathParam("exerciseId"), pathParam("setId")]),
      },

      // ── Creator — Library modules ─────────────────────────────────────────
      "/creator/library/modules": {
        get: stub("List library modules", ["creator"], creatorAuth, "All library modules"),
        post: stub("Create library module", ["creator"], creatorAuth, "New moduleId and createdAt"),
      },
      "/creator/library/modules/{moduleId}": {
        get: stub("Get library module", ["creator"], creatorAuth, "Module with sessions", [pathParam("moduleId")]),
        patch: stub("Update library module", ["creator"], creatorAuth, "Updated timestamp", [pathParam("moduleId")]),
        delete: stub("Delete library module", ["creator"], creatorAuth, "204 No Content", [pathParam("moduleId")]),
      },
      "/creator/library/modules/{moduleId}/propagate": {
        post: stub("Propagate library module to plans", ["creator"], creatorAuth, "plansAffected and copiesDeleted", [pathParam("moduleId")]),
      },

      // ── Creator — Client programs ─────────────────────────────────────────
      "/creator/clients/{clientId}/programs": {
        get: stub("List client programs", ["creator"], creatorAuth, "Programs assigned to client", [pathParam("clientId")]),
      },
      "/creator/clients/{clientId}/programs/{programId}": {
        post: stub("Assign program to client", ["creator"], creatorAuth, "assignedAt", [pathParam("clientId"), pathParam("programId")]),
        delete: stub("Unassign program from client", ["creator"], creatorAuth, "204 No Content", [pathParam("clientId"), pathParam("programId")]),
      },
      "/creator/clients/{clientId}/programs/{programId}/schedule/{weekKey}": {
        put: stub("Assign plan to week", ["creator"], creatorAuth, "weekKey and assignedAt", [pathParam("clientId"), pathParam("programId"), pathParam("weekKey")]),
        delete: stub("Remove week plan assignment", ["creator"], creatorAuth, "204 No Content", [pathParam("clientId"), pathParam("programId"), pathParam("weekKey")]),
      },
      "/creator/clients/{clientId}/sessions": {
        get: stub(
          "Get client session history",
          ["creator"],
          creatorAuth,
          "Paginated session history for client",
          [pathParam("clientId"), queryParam("courseId"), queryParam("pageToken")]
        ),
      },
      "/creator/clients/{clientId}/activity": {
        get: stub("Get client activity summary", ["creator"], creatorAuth, "Recent activity and assigned courses", [pathParam("clientId")]),
      },

      // ── Creator — Events ──────────────────────────────────────────────────
      "/creator/events": {
        get: stub("List creator events", ["creator", "events"], creatorAuth, "All events by this creator"),
        post: stub("Create event", ["creator", "events"], creatorAuth, "New eventId and createdAt"),
      },
      "/creator/events/{eventId}": {
        patch: stub("Update event", ["creator", "events"], creatorAuth, "Updated eventId and timestamp", [pathParam("eventId")]),
        delete: stub("Delete event", ["creator", "events"], creatorAuth, "204 No Content", [pathParam("eventId")]),
      },
      "/creator/events/{eventId}/status": {
        patch: stub("Change event status", ["creator", "events"], creatorAuth, "Updated status", [pathParam("eventId")]),
      },
      "/creator/events/{eventId}/image/upload-url": {
        post: stub("Get event image upload URL", ["creator", "events"], creatorAuth, "Signed upload URL", [pathParam("eventId")]),
      },
      "/creator/events/{eventId}/image/confirm": {
        post: stub("Confirm event image upload", ["creator", "events"], creatorAuth, "Updated imageUrl", [pathParam("eventId")]),
      },
      "/creator/events/{eventId}/registrations": {
        get: stub(
          "List event registrations",
          ["creator", "events"],
          creatorAuth,
          "Paginated registrations",
          [pathParam("eventId"), queryParam("pageToken"), queryParam("checkedIn")]
        ),
      },
      "/creator/events/{eventId}/registrations/{registrationId}/check-in": {
        post: stub("Check in attendee", ["creator", "events"], creatorAuth, "registrationId and checkedInAt", [pathParam("eventId"), pathParam("registrationId")]),
      },
      "/creator/events/{eventId}/registrations/{registrationId}": {
        delete: stub("Remove registration", ["creator", "events"], creatorAuth, "204 No Content", [pathParam("eventId"), pathParam("registrationId")]),
      },
      "/creator/events/{eventId}/waitlist": {
        get: stub("List waitlist", ["creator", "events"], creatorAuth, "Waitlist entries", [pathParam("eventId")]),
      },
      "/creator/events/{eventId}/waitlist/{waitlistId}/admit": {
        post: stub("Admit from waitlist", ["creator", "events"], creatorAuth, "New registrationId", [pathParam("eventId"), pathParam("waitlistId")]),
      },

      // ── Creator — Availability & Bookings ─────────────────────────────────
      "/creator/availability": {
        get: stub("Get creator availability", ["creator"], creatorAuth, "Full availability document with slots"),
      },
      "/creator/availability/slots": {
        post: stub("Add availability slots", ["creator"], creatorAuth, "Date and slotsCreated count"),
        delete: stub("Remove availability slots", ["creator"], creatorAuth, "204 No Content"),
      },
      "/creator/bookings": {
        get: stub(
          "List creator bookings",
          ["creator"],
          creatorAuth,
          "Paginated upcoming bookings",
          [queryParam("date"), queryParam("pageToken")]
        ),
      },
      "/creator/bookings/{bookingId}": {
        patch: stub("Update booking call link", ["creator"], creatorAuth, "Updated bookingId and timestamp", [pathParam("bookingId")]),
      },

      // ── Events (public / PWA) ─────────────────────────────────────────────
      "/events/{eventId}": {
        get: {
          summary: "Get public event details",
          tags: ["events"],
          security: [],
          parameters: [pathParam("eventId")],
          responses: {
            "200": {description: "Public event details"},
            "404": {description: "Not found (or draft)"},
          },
        },
      },
      "/events/{eventId}/register": {
        post: {
          summary: "Register for event",
          tags: ["events"],
          security: [],
          parameters: [pathParam("eventId")],
          responses: {
            "200": {description: "Registration or waitlist status"},
            "400": {description: "Validation error"},
            "403": {description: "Event closed"},
            "404": {description: "Not found"},
            "409": {description: "Already registered"},
          },
        },
      },

      // ── Bookings (PWA — client side) ──────────────────────────────────────
      "/creator/{creatorId}/availability": {
        get: stub(
          "Get creator available slots (client view)",
          ["auth"],
          anyAuth,
          "Available slots for date range",
          [pathParam("creatorId"), queryParam("startDate", true), queryParam("endDate", true)]
        ),
      },
      "/bookings": {
        post: stub("Book a slot", ["auth"], anyAuth, "New bookingId and status"),
      },
      "/bookings/{bookingId}": {
        get: stub("Get booking detail", ["auth"], anyAuth, "Booking with creator info and call link", [pathParam("bookingId")]),
        delete: stub("Cancel booking", ["auth"], anyAuth, "204 No Content", [pathParam("bookingId")]),
      },

      // ── Payments ──────────────────────────────────────────────────────────
      "/payments/preference": {
        post: stub("Create payment preference", ["auth"], [bearerAuth], "preferenceId and initPoint"),
      },
      "/payments/subscription": {
        post: stub("Create subscription checkout", ["auth"], [bearerAuth], "subscriptionId and initPoint"),
      },
      "/payments/webhook": {
        post: {
          summary: "MercadoPago webhook",
          tags: ["auth"],
          security: [],
          responses: {
            "200": {description: "Processed or non-retryable error"},
            "500": {description: "Retryable error"},
          },
        },
      },
      "/payments/subscriptions/{subscriptionId}/cancel": {
        post: stub("Cancel/pause/resume subscription", ["auth"], [bearerAuth], "Updated subscriptionId and status", [pathParam("subscriptionId")]),
      },

      // ── Analytics ─────────────────────────────────────────────────────────
      "/analytics/weekly-volume": {
        get: stub(
          "Get weekly training volume",
          ["workout"],
          anyAuth,
          "Weekly muscle volume breakdown",
          [queryParam("startDate", true), queryParam("endDate", true)]
        ),
      },
      "/analytics/muscle-breakdown": {
        get: stub(
          "Get muscle breakdown for period",
          ["workout"],
          anyAuth,
          "Total sets per muscle group",
          [queryParam("startDate", true), queryParam("endDate", true)]
        ),
      },

      // ── App Resources ─────────────────────────────────────────────────────
      "/app-resources": {
        get: {
          summary: "Get landing page assets",
          tags: ["auth"],
          security: [],
          responses: {
            "200": {description: "Hero content and program cards"},
          },
        },
      },
    },
  };
}
