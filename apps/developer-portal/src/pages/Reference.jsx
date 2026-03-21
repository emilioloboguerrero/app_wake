import { useState } from 'react';

const ENDPOINTS = [
  {
    domain: 'Auth & Infraestructura',
    endpoints: [
      {
        method: 'GET', path: '/api-keys', auth: 'Firebase ID token, role: creator',
        description: 'Listar todas las claves API del creador autenticado',
        response: `{
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
}`,
      },
      {
        method: 'POST', path: '/api-keys', auth: 'Firebase ID token, role: creator',
        description: 'Crear una nueva clave API. La clave completa se muestra solo una vez.',
        request: `{
  "name": "string (requerido)",
  "scopes": ["read", "write", "creator"]
}`,
        response: `{
  "data": {
    "keyId": "string",
    "key": "wk_live_<64chars>",
    "name": "string",
    "scopes": ["read", "write"],
    "createdAt": "ISO string"
  }
}`,
        notes: 'El servidor genera la clave y almacena solo el hash SHA-256. El texto plano nunca se persiste.',
      },
      {
        method: 'DELETE', path: '/api-keys/{keyId}', auth: 'Firebase ID token, role: creator',
        description: 'Revocar una clave. Marca revoked: true — no elimina el documento.',
        response: '204 No Content',
      },
    ],
  },
  {
    domain: 'Perfil',
    endpoints: [
      {
        method: 'GET', path: '/users/me', auth: 'Requerido',
        description: 'Obtener perfil completo del usuario autenticado',
        response: `{
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
    "createdAt": "ISO string"
  }
}`,
      },
      {
        method: 'PATCH', path: '/users/me', auth: 'Requerido',
        description: 'Actualizar campos editables del perfil del usuario',
        request: `{
  "displayName": "string",
  "username": "string",
  "gender": "male | female | other",
  "city": "string",
  "country": "string (ISO2)",
  "height": "number",
  "weight": "number",
  "birthDate": "YYYY-MM-DD",
  "phoneNumber": "string"
}`,
        response: `{ "data": { "userId": "string", "updatedAt": "ISO string" } }`,
        notes: 'Todos los campos son opcionales. Username se valida por unicidad en el servidor.',
      },
      {
        method: 'POST', path: '/users/me/profile-picture/upload-url', auth: 'Requerido',
        description: 'Obtener URL firmada para subir foto de perfil',
        request: `{ "contentType": "image/jpeg | image/png | image/webp" }`,
        response: `{
  "data": {
    "uploadUrl": "https://storage.googleapis.com/...",
    "storagePath": "profiles/{userId}/profile.jpg",
    "expiresAt": "ISO string"
  }
}`,
        notes: 'Comprimir a \u2264200KB antes de subir.',
      },
      {
        method: 'POST', path: '/users/me/profile-picture/confirm', auth: 'Requerido',
        description: 'Confirmar subida de foto de perfil',
        request: `{ "storagePath": "profiles/{userId}/profile.jpg" }`,
        response: `{ "data": { "profilePictureUrl": "string" } }`,
      },
      {
        method: 'GET', path: '/users/{userId}/public-profile', auth: 'Requerido',
        description: 'Obtener perfil p\u00FAblico de un creador',
        response: `{
  "data": {
    "userId": "string",
    "displayName": "string",
    "username": "string | null",
    "profilePictureUrl": "string | null",
    "programs": [
      {
        "courseId": "string",
        "title": "string",
        "imageUrl": "string | null",
        "discipline": "string"
      }
    ]
  }
}`,
      },
      {
        method: 'PATCH', path: '/creator/profile', auth: 'role: creator',
        description: 'Actualizar campos espec\u00EDficos del perfil de creador (cards)',
        request: `{ "cards": { "Card Title": "https://url-or-text" } }`,
        response: `{ "data": { "updatedAt": "ISO string" } }`,
      },
    ],
  },
  {
    domain: 'Nutrici\u00F3n',
    endpoints: [
      {
        method: 'GET', path: '/nutrition/diary', auth: 'Requerido',
        description: 'Obtener entradas del diario de nutrici\u00F3n',
        request: 'Query: date=YYYY-MM-DD o startDate+endDate (m\u00E1x 90 d\u00EDas)',
        response: `{
  "data": [
    {
      "entryId": "string",
      "date": "YYYY-MM-DD",
      "meal": "breakfast | lunch | dinner | snack",
      "foodId": "string",
      "name": "string",
      "calories": "number | null",
      "protein": "number | null",
      "carbs": "number | null",
      "fat": "number | null"
    }
  ]
}`,
      },
      {
        method: 'POST', path: '/nutrition/diary', auth: 'Requerido',
        description: 'Registrar una entrada de alimento',
        request: `{
  "date": "YYYY-MM-DD",
  "meal": "breakfast | lunch | dinner | snack",
  "foodId": "string",
  "servingId": "string",
  "numberOfUnits": 1,
  "name": "string",
  "calories": "number | null",
  "protein": "number | null",
  "carbs": "number | null",
  "fat": "number | null"
}`,
        response: `{ "data": { "id": "string" } }`,
        notes: 'Status code 201.',
      },
      {
        method: 'PATCH', path: '/nutrition/diary/{entryId}', auth: 'Requerido, debe ser due\u00F1o',
        description: 'Actualizar una entrada del diario',
        request: `{ "servingId": "string", "numberOfUnits": "number", ... }`,
        response: `{ "data": { "updated": true } }`,
      },
      {
        method: 'DELETE', path: '/nutrition/diary/{entryId}', auth: 'Requerido, debe ser due\u00F1o',
        description: 'Eliminar una entrada del diario',
        response: '204 No Content',
      },
      {
        method: 'GET', path: '/nutrition/foods/search', auth: 'Requerido',
        description: 'Buscar alimentos por nombre (proxy FatSecret)',
        request: 'Query: q=string (requerido), page=number',
        response: `{
  "data": {
    "foods": [
      {
        "foodId": "string",
        "name": "string",
        "brandName": "string | null",
        "calories": "number | null",
        "protein": "number | null"
      }
    ],
    "totalResults": "number",
    "pageNumber": "number"
  }
}`,
      },
      {
        method: 'GET', path: '/nutrition/foods/{foodId}', auth: 'Requerido',
        description: 'Obtener detalle de un alimento con todas las porciones',
        response: `{
  "data": {
    "foodId": "string",
    "name": "string",
    "servings": [
      {
        "servingId": "string",
        "description": "string",
        "calories": "number | null",
        "protein": "number | null"
      }
    ]
  }
}`,
      },
      {
        method: 'GET', path: '/nutrition/foods/barcode/{barcode}', auth: 'Requerido',
        description: 'B\u00FAsqueda por c\u00F3digo de barras',
        response: 'Mismo formato que detalle de alimento',
      },
      {
        method: 'GET', path: '/nutrition/saved-foods', auth: 'Requerido',
        description: 'Listar alimentos guardados del usuario',
        response: `{
  "data": [
    {
      "savedFoodId": "string",
      "foodId": "string",
      "name": "string",
      "calories": "number | null"
    }
  ]
}`,
      },
      {
        method: 'POST', path: '/nutrition/saved-foods', auth: 'Requerido',
        description: 'Guardar un alimento para acceso r\u00E1pido',
        response: `{ "data": { "savedFoodId": "string" } }`,
      },
      {
        method: 'DELETE', path: '/nutrition/saved-foods/{savedFoodId}', auth: 'Requerido',
        description: 'Eliminar un alimento guardado',
        response: '204 No Content',
      },
      {
        method: 'GET', path: '/nutrition/assignment', auth: 'Requerido',
        description: 'Obtener plan de nutrici\u00F3n activo del usuario para una fecha',
        request: 'Query: date=YYYY-MM-DD (default hoy)',
        response: `{
  "data": {
    "assignmentId": "string",
    "plan": {
      "name": "string",
      "dailyCalories": "number | null",
      "dailyProteinG": "number | null",
      "categories": [...]
    }
  }
}`,
      },
    ],
  },
  {
    domain: 'Progreso / Lab',
    endpoints: [
      {
        method: 'GET', path: '/progress/body-log', auth: 'Requerido',
        description: 'Listar registros corporales (paginado, p\u00E1gina 30)',
        request: 'Query: pageToken, limit (1-100, default 30)',
        response: `{
  "data": [
    {
      "date": "YYYY-MM-DD",
      "weight": "number (kg)",
      "note": "string | null",
      "photos": [{ "photoId": "string", "angle": "front | side | back", "storageUrl": "string" }]
    }
  ],
  "nextPageToken": "string | null",
  "hasMore": false
}`,
      },
      {
        method: 'GET', path: '/progress/body-log/{date}', auth: 'Requerido',
        description: 'Obtener registro corporal de una fecha espec\u00EDfica',
        response: 'Mismo formato que item de la lista',
      },
      {
        method: 'PUT', path: '/progress/body-log/{date}', auth: 'Requerido',
        description: 'Crear o actualizar registro corporal (idempotente)',
        request: `{ "weight": "number (kg)", "note": "string | null" }`,
        response: `{ "data": { "date": "YYYY-MM-DD", "updatedAt": "ISO string" } }`,
        notes: 'Fotos se manejan por separado v\u00EDa endpoints de upload.',
      },
      {
        method: 'DELETE', path: '/progress/body-log/{date}', auth: 'Requerido',
        description: 'Eliminar registro corporal y sus fotos de Storage',
        response: '204 No Content',
      },
      {
        method: 'POST', path: '/progress/body-log/{date}/photos/upload-url', auth: 'Requerido',
        description: 'Obtener URL firmada para subir foto de progreso',
        request: `{ "angle": "front | side | back", "contentType": "image/jpeg | image/png | image/webp" }`,
        response: `{
  "data": {
    "uploadUrl": "string",
    "storagePath": "string",
    "photoId": "string",
    "expiresAt": "ISO string"
  }
}`,
        notes: 'Comprimir a \u2264500KB antes de subir.',
      },
      {
        method: 'POST', path: '/progress/body-log/{date}/photos/confirm', auth: 'Requerido',
        description: 'Confirmar subida de foto de progreso',
        request: `{ "photoId": "string", "storagePath": "string", "angle": "front | side | back" }`,
        response: `{ "data": { "date": "YYYY-MM-DD", "photoId": "string" } }`,
      },
      {
        method: 'DELETE', path: '/progress/body-log/{date}/photos/{photoId}', auth: 'Requerido',
        description: 'Eliminar una foto de progreso',
        response: '204 No Content',
      },
      {
        method: 'GET', path: '/progress/readiness', auth: 'Requerido',
        description: 'Obtener entradas de bienestar para un rango de fechas',
        request: 'Query: startDate + endDate (YYYY-MM-DD, m\u00E1x 90 d\u00EDas)',
        response: `{
  "data": [
    {
      "date": "YYYY-MM-DD",
      "energy": "number (1-10)",
      "soreness": "number (1-10, 1=muy adolorido, 10=fresco)",
      "sleep": "number (1-10)",
      "completedAt": "ISO string"
    }
  ]
}`,
      },
      {
        method: 'GET', path: '/progress/readiness/{date}', auth: 'Requerido',
        description: 'Obtener entrada de bienestar de una fecha espec\u00EDfica',
        response: 'Objeto individual (mismo formato)',
      },
      {
        method: 'PUT', path: '/progress/readiness/{date}', auth: 'Requerido',
        description: 'Crear o actualizar entrada de bienestar (una por d\u00EDa)',
        request: `{
  "energy": "number (1-10)",
  "soreness": "number (1-10, 1=muy adolorido, 10=fresco)",
  "sleep": "number (1-10)"
}`,
        response: `{ "data": { "date": "YYYY-MM-DD", "completedAt": "ISO string" } }`,
      },
      {
        method: 'DELETE', path: '/progress/readiness/{date}', auth: 'Requerido',
        description: 'Eliminar entrada de bienestar',
        response: '204 No Content',
      },
    ],
  },
  {
    domain: 'Entrenamientos',
    endpoints: [
      {
        method: 'GET', path: '/workout/daily', auth: 'Requerido',
        description: 'Obtener sesi\u00F3n de entrenamiento del d\u00EDa para un curso',
        request: 'Query: courseId (requerido), date=YYYY-MM-DD (default hoy)',
        response: `{
  "data": {
    "hasSession": true,
    "isRestDay": false,
    "session": {
      "sessionId": "string",
      "title": "string",
      "exercises": [
        {
          "exerciseId": "string",
          "name": "string",
          "sets": [
            { "setId": "string", "reps": "8-10", "weight": "number | null" }
          ],
          "lastPerformance": { ... }
        }
      ]
    },
    "progress": { "completed": "number", "total": "number | null" }
  }
}`,
        notes: 'hasSession: false con emptyReason es respuesta v\u00E1lida, no 404.',
      },
      {
        method: 'GET', path: '/workout/courses', auth: 'Requerido',
        description: 'Listar todos los cursos en los que el usuario est\u00E1 inscrito',
        response: `{
  "data": [
    {
      "courseId": "string",
      "title": "string",
      "deliveryType": "low_ticket | one_on_one",
      "status": "active | expired | cancelled",
      "expiresAt": "ISO string | null"
    }
  ]
}`,
      },
      {
        method: 'GET', path: '/workout/courses/{courseId}', auth: 'Requerido, debe estar inscrito',
        description: 'Obtener metadata y estructura completa del curso',
        response: `{
  "data": {
    "courseId": "string",
    "title": "string",
    "modules": [
      {
        "moduleId": "string",
        "title": "string",
        "sessions": [{ "sessionId": "string", "title": "string", "exerciseCount": "number" }]
      }
    ],
    "progress": { "totalSessionsCompleted": "number" }
  }
}`,
      },
      {
        method: 'POST', path: '/workout/complete', auth: 'Requerido',
        description: 'Completar una sesi\u00F3n de entrenamiento (escritura at\u00F3mica)',
        request: `{
  "courseId": "string",
  "sessionId": "string",
  "completedAt": "ISO string",
  "durationMs": "number",
  "userNotes": "string | null",
  "exercises": [
    {
      "exerciseId": "string",
      "exerciseName": "string",
      "sets": [{ "reps": "number", "weight": "number" }]
    }
  ]
}`,
        response: `{
  "data": {
    "completionId": "string",
    "personalRecords": [...],
    "streak": { "currentStreak": "number", "flameLevel": "number (0-3)" },
    "muscleVolumes": { "push": "number", "pull": "number", ... }
  }
}`,
        notes: 'Idempotencia por completionId: {userId}_{sessionId}_{YYYY-MM-DD}. Duplicado retorna 409.',
      },
      {
        method: 'GET', path: '/workout/sessions', auth: 'Requerido',
        description: 'Historial de sesiones paginado (p\u00E1gina 20)',
        request: 'Query: courseId (opcional), pageToken',
        response: `{
  "data": [
    {
      "completionId": "string",
      "sessionTitle": "string",
      "completedAt": "ISO string",
      "durationMs": "number",
      "exerciseCount": "number"
    }
  ],
  "nextPageToken": "string | null",
  "hasMore": false
}`,
      },
      {
        method: 'GET', path: '/workout/sessions/{completionId}', auth: 'Requerido',
        description: 'Detalle de sesi\u00F3n completada con ejercicios y sets',
        response: `{
  "data": {
    "completionId": "string",
    "sessionTitle": "string",
    "exercises": [
      { "exerciseName": "string", "sets": [{ "reps": "number", "weight": "number" }] }
    ]
  }
}`,
      },
      {
        method: 'GET', path: '/workout/exercises/{exerciseKey}/history', auth: 'Requerido',
        description: 'Historial de un ejercicio espec\u00EDfico (p\u00E1gina 50)',
        request: 'Query: pageToken',
        response: `{
  "data": [
    { "date": "YYYY-MM-DD", "sets": [{ "reps": "number", "weight": "number" }] }
  ],
  "nextPageToken": "string | null"
}`,
        notes: 'exerciseKey formato: {libraryId}_{exerciseName} (URL-encoded).',
      },
      {
        method: 'GET', path: '/workout/prs', auth: 'Requerido',
        description: 'Obtener estimaciones 1RM actuales de todos los ejercicios',
        response: `{
  "data": [
    {
      "exerciseKey": "string",
      "exerciseName": "string",
      "estimate1RM": "number",
      "achievedWith": { "weight": "number", "reps": "number" }
    }
  ]
}`,
      },
      {
        method: 'GET', path: '/workout/prs/{exerciseKey}/history', auth: 'Requerido',
        description: 'Historial completo de 1RM para un ejercicio',
        response: `{ "data": [{ "estimate1RM": "number", "date": "ISO string" }] }`,
      },
      {
        method: 'GET', path: '/workout/streak', auth: 'Requerido',
        description: 'Obtener racha de actividad actual del usuario',
        response: `{
  "data": {
    "currentStreak": "number",
    "longestStreak": "number",
    "lastActivityDate": "YYYY-MM-DD | null",
    "flameLevel": "number (0-3)"
  }
}`,
        notes: 'flameLevel: 0=inactivo, 1=3+ d\u00EDas, 2=7+ d\u00EDas, 3=14+ d\u00EDas.',
      },
      {
        method: 'POST', path: '/workout/session/checkpoint', auth: 'Firebase ID token',
        description: 'Guardar estado mid-sesi\u00F3n para recuperaci\u00F3n cross-device',
        request: `{
  "courseId": "string",
  "sessionId": "string",
  "sessionName": "string",
  "startedAt": "ISO string",
  "currentExerciseIndex": "number",
  "exercises": [...],
  "completedSets": { "0_0": { "reps": 10, "weight": 80 } }
}`,
        response: `{ "data": { "saved": true } }`,
      },
      {
        method: 'GET', path: '/workout/session/active', auth: 'Firebase ID token',
        description: 'Obtener checkpoint de sesi\u00F3n activa',
        response: `{ "data": { "checkpoint": { ... } | null } }`,
        notes: 'Checkpoints mayores a 24 horas se retornan como null.',
      },
      {
        method: 'DELETE', path: '/workout/session/active', auth: 'Firebase ID token',
        description: 'Eliminar checkpoint de sesi\u00F3n activa',
        response: `{ "data": { "deleted": true } }`,
        notes: 'Idempotente. Nunca retorna 404.',
      },
    ],
  },
  {
    domain: 'Creador',
    endpoints: [
      {
        method: 'GET', path: '/creator/clients', auth: 'role: creator',
        description: 'Listar clientes one-on-one (paginado, p\u00E1gina 50)',
        request: 'Query: pageToken',
        response: `{
  "data": [
    {
      "clientId": "string",
      "displayName": "string",
      "email": "string",
      "enrolledPrograms": [{ "courseId": "string", "title": "string" }]
    }
  ],
  "nextPageToken": "string | null"
}`,
      },
      {
        method: 'POST', path: '/creator/clients', auth: 'role: creator',
        description: 'Agregar un cliente por email',
        request: `{ "email": "string" }`,
        response: `{ "data": { "clientId": "string", "displayName": "string", "email": "string" } }`,
      },
      {
        method: 'DELETE', path: '/creator/clients/{clientId}', auth: 'role: creator',
        description: 'Remover un cliente',
        response: '204 No Content',
      },
      {
        method: 'GET', path: '/creator/programs', auth: 'role: creator',
        description: 'Listar todos los programas del creador',
        response: `{
  "data": [
    {
      "programId": "string",
      "title": "string",
      "deliveryType": "low_ticket | one_on_one",
      "status": "draft | published",
      "createdAt": "ISO string"
    }
  ]
}`,
      },
      {
        method: 'POST', path: '/creator/programs', auth: 'role: creator',
        description: 'Crear un nuevo programa',
        request: `{
  "title": "string",
  "description": "string | null",
  "deliveryType": "low_ticket | one_on_one"
}`,
        response: `{ "data": { "programId": "string", "createdAt": "ISO string" } }`,
      },
      {
        method: 'PATCH', path: '/creator/programs/{programId}', auth: 'role: creator, due\u00F1o',
        description: 'Actualizar metadata del programa',
        response: `{ "data": { "programId": "string", "updatedAt": "ISO string" } }`,
      },
      {
        method: 'PATCH', path: '/creator/programs/{programId}/status', auth: 'role: creator, due\u00F1o',
        description: 'Publicar o despublicar un programa',
        request: `{ "status": "draft | published" }`,
        response: `{ "data": { "programId": "string", "status": "string" } }`,
      },
      {
        method: 'DELETE', path: '/creator/programs/{programId}', auth: 'role: creator, due\u00F1o',
        description: 'Eliminar programa y todo su contenido (cascada)',
        response: '204 No Content',
      },
      {
        method: 'POST', path: '/creator/programs/{programId}/duplicate', auth: 'role: creator, due\u00F1o',
        description: 'Copia profunda de un programa completo',
        request: `{ "title": "string | null" }`,
        response: `{ "data": { "programId": "string", "title": "string" } }`,
      },
      {
        method: 'GET', path: '/creator/plans', auth: 'role: creator',
        description: 'Listar todos los planes reutilizables',
        response: `{
  "data": [
    { "planId": "string", "title": "string", "moduleCount": "number" }
  ]
}`,
      },
      {
        method: 'POST', path: '/creator/plans', auth: 'role: creator',
        description: 'Crear un plan reutilizable (auto-crea primer m\u00F3dulo)',
        request: `{ "title": "string", "description": "string | null" }`,
        response: `{ "data": { "planId": "string", "firstModuleId": "string" } }`,
      },
      {
        method: 'GET', path: '/creator/plans/{planId}', auth: 'role: creator, due\u00F1o',
        description: 'Obtener plan con todos los m\u00F3dulos y sesiones',
        response: `{
  "data": {
    "planId": "string",
    "title": "string",
    "modules": [
      {
        "moduleId": "string",
        "title": "string",
        "sessions": [{ "sessionId": "string", "title": "string" }]
      }
    ]
  }
}`,
      },
      {
        method: 'GET', path: '/creator/library/sessions', auth: 'role: creator',
        description: 'Listar sesiones de la librer\u00EDa',
        response: `{
  "data": [
    { "sessionId": "string", "title": "string", "exerciseCount": "number" }
  ]
}`,
      },
      {
        method: 'POST', path: '/creator/library/sessions', auth: 'role: creator',
        description: 'Crear sesi\u00F3n de librer\u00EDa',
        request: `{ "title": "string" }`,
        response: `{ "data": { "sessionId": "string" } }`,
      },
      {
        method: 'GET', path: '/creator/library/sessions/{sessionId}', auth: 'role: creator, due\u00F1o',
        description: 'Obtener sesi\u00F3n de librer\u00EDa con ejercicios y sets',
        response: 'Mismo formato que sesi\u00F3n de plan.',
      },
      {
        method: 'GET', path: '/creator/nutrition/meals', auth: 'role: creator',
        description: 'Listar templates de comidas de la librer\u00EDa',
        response: `{
  "data": [
    {
      "mealId": "string",
      "name": "string",
      "calories": "number | null",
      "items": [...]
    }
  ]
}`,
      },
      {
        method: 'POST', path: '/creator/nutrition/meals', auth: 'role: creator',
        description: 'Crear template de comida',
        request: `{
  "name": "string",
  "items": [{ "foodId": "string", "name": "string", "calories": "number" }]
}`,
        response: `{ "data": { "mealId": "string" } }`,
      },
      {
        method: 'GET', path: '/creator/nutrition/plans', auth: 'role: creator',
        description: 'Listar planes de nutrici\u00F3n',
        response: `{
  "data": [
    {
      "planId": "string",
      "name": "string",
      "dailyCalories": "number | null"
    }
  ]
}`,
      },
      {
        method: 'POST', path: '/creator/nutrition/plans', auth: 'role: creator',
        description: 'Crear plan de nutrici\u00F3n',
        response: `{ "data": { "planId": "string" } }`,
      },
      {
        method: 'POST', path: '/creator/clients/{clientId}/nutrition/assignments', auth: 'role: creator',
        description: 'Asignar plan de nutrici\u00F3n a un cliente',
        request: `{ "planId": "string", "startDate": "YYYY-MM-DD | null", "endDate": "YYYY-MM-DD | null" }`,
        response: `{ "data": { "assignmentId": "string" } }`,
      },
    ],
  },
  {
    domain: 'Pagos',
    endpoints: [
      {
        method: 'POST', path: '/payments/preference', auth: 'Requerido',
        description: 'Crear preferencia de pago MercadoPago',
        notes: 'Usa funciones Gen1 internamente. Solo COP (Colombia).',
      },
      {
        method: 'POST', path: '/payments/subscription', auth: 'Requerido',
        description: 'Crear suscripci\u00F3n recurrente MercadoPago',
      },
    ],
  },
  {
    domain: 'Anal\u00EDticas',
    endpoints: [
      {
        method: 'GET', path: '/analytics/weekly-volume', auth: 'Requerido',
        description: 'Volumen semanal de entrenamiento por grupo muscular',
        request: 'Query: weeks=number (default 4)',
        response: `{
  "data": {
    "weeks": [
      {
        "weekStart": "YYYY-MM-DD",
        "volumes": { "push": "number", "pull": "number", "legs": "number" }
      }
    ]
  }
}`,
      },
    ],
  },
  {
    domain: 'Eventos',
    endpoints: [
      {
        method: 'GET', path: '/events', auth: 'Ninguna (p\u00FAblico)',
        description: 'Listar eventos p\u00FAblicos',
        response: `{
  "data": [
    {
      "eventId": "string",
      "title": "string",
      "status": "draft | published | closed",
      "capacity": "number | null"
    }
  ]
}`,
      },
    ],
  },
  {
    domain: 'App Resources',
    endpoints: [
      {
        method: 'GET', path: '/app-resources', auth: 'Ninguna (p\u00FAblico)',
        description: 'Obtener recursos p\u00FAblicos de la app (hero images, cards)',
        response: `{ "data": [...] }`,
      },
    ],
  },
];

export default function Reference() {
  const [openDomain, setOpenDomain] = useState(null);
  const [openEndpoint, setOpenEndpoint] = useState(null);

  const toggleDomain = (domain) => {
    setOpenDomain(openDomain === domain ? null : domain);
    setOpenEndpoint(null);
  };

  const toggleEndpoint = (key) => {
    setOpenEndpoint(openEndpoint === key ? null : key);
  };

  return (
    <div>
      <h1 style={styles.title}>Referencia API</h1>
      <p style={styles.subtitle}>
        Todos los endpoints disponibles en <code style={styles.code}>/api/v1/</code>.
        Haz clic en un dominio para expandir, luego en un endpoint para ver detalles.
      </p>

      <section style={{ marginTop: 32 }}>
        <h2 style={styles.sectionTitle}>Autenticaci\u00F3n</h2>
        <p style={styles.text}>
          Todas las peticiones (excepto las marcadas como p\u00FAblicas) requieren un header:
        </p>
        <pre style={styles.pre}>Authorization: Bearer &lt;token&gt;</pre>
        <p style={styles.text}>
          El token puede ser un <strong style={{ color: '#fff' }}>Firebase ID token</strong> (apps first-party)
          o una <strong style={{ color: '#fff' }}>clave API</strong> (<code style={styles.code}>wk_live_...</code>).
          El servidor detecta el tipo autom\u00E1ticamente por prefijo.
        </p>
      </section>

      {ENDPOINTS.map(({ domain, endpoints }) => {
        const isOpen = openDomain === domain;
        return (
          <section key={domain} style={{ marginTop: 16 }}>
            <button onClick={() => toggleDomain(domain)} style={styles.domainBtn}>
              <span style={styles.domainArrow}>{isOpen ? '\u25BC' : '\u25B6'}</span>
              <span style={styles.domainTitle}>{domain}</span>
              <span style={styles.domainCount}>{endpoints.length} endpoints</span>
            </button>
            {isOpen && (
              <div style={styles.endpointList}>
                {endpoints.map((ep, i) => {
                  const key = `${domain}-${i}`;
                  const isEpOpen = openEndpoint === key;
                  return (
                    <div key={key}>
                      <button onClick={() => toggleEndpoint(key)} style={styles.endpointRow}>
                        <MethodBadge method={ep.method} />
                        <code style={styles.epPath}>{ep.path}</code>
                        <span style={styles.epDesc}>{ep.description}</span>
                      </button>
                      {isEpOpen && (
                        <div style={styles.epDetail}>
                          <DetailRow label="Auth" value={ep.auth} />
                          {ep.request && <DetailBlock label="Request" content={ep.request} />}
                          {ep.response && <DetailBlock label="Response" content={ep.response} />}
                          {ep.notes && <DetailRow label="Notas" value={ep.notes} />}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}

      <section style={{ marginTop: 48 }}>
        <h2 style={styles.sectionTitle}>Paginaci\u00F3n</h2>
        <p style={styles.text}>
          Los endpoints paginados retornan <code style={styles.code}>nextPageToken</code> y{' '}
          <code style={styles.code}>hasMore</code>. Pasa <code style={styles.code}>?pageToken=&#123;token&#125;</code>{' '}
          para obtener la siguiente p\u00E1gina.
        </p>
        <pre style={styles.pre}>{`{
  "data": [...],
  "nextPageToken": "opaque_base64",
  "hasMore": true
}`}</pre>
      </section>

      <section style={{ marginTop: 32 }}>
        <h2 style={styles.sectionTitle}>Errores</h2>
        <pre style={styles.pre}>{`{
  "error": {
    "code": "ERROR_CODE",
    "message": "Descripci\u00F3n del error",
    "field": "campo_afectado"
  }
}`}</pre>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Status</th>
              <th style={styles.th}>C\u00F3digo</th>
              <th style={styles.th}>Reintentar</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['400', 'VALIDATION_ERROR', 'No'],
              ['401', 'UNAUTHENTICATED', 'No'],
              ['403', 'FORBIDDEN', 'No'],
              ['404', 'NOT_FOUND', 'No'],
              ['409', 'CONFLICT', 'S\u00ED (backoff)'],
              ['429', 'RATE_LIMITED', 'S\u00ED (Retry-After)'],
              ['500', 'INTERNAL_ERROR', 'S\u00ED'],
              ['503', 'SERVICE_UNAVAILABLE', 'S\u00ED'],
            ].map(([status, code, retry]) => (
              <tr key={code}>
                <td style={styles.td}>{status}</td>
                <td style={styles.td}><code style={styles.code}>{code}</code></td>
                <td style={styles.td}>{retry}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function MethodBadge({ method }) {
  const colors = {
    GET: '#4caf50', POST: '#2196f3', PATCH: '#ff9800', PUT: '#ff9800', DELETE: '#e53935',
  };
  return (
    <span style={{
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 11,
      fontWeight: 700,
      color: colors[method] || '#fff',
      width: 52,
      flexShrink: 0,
    }}>
      {method}
    </span>
  );
}

function DetailRow({ label, value }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <span style={styles.detailLabel}>{label}: </span>
      <span style={styles.detailValue}>{value}</span>
    </div>
  );
}

function DetailBlock({ label, content }) {
  const isJson = content.trim().startsWith('{') || content.trim().startsWith('[');
  return (
    <div style={{ marginBottom: 12 }}>
      <span style={styles.detailLabel}>{label}</span>
      <pre style={styles.detailPre}>{content}</pre>
    </div>
  );
}

const styles = {
  title: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 700,
    margin: 0,
    letterSpacing: '-0.03em',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    marginTop: 8,
    lineHeight: 1.6,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 600,
    margin: '0 0 12px',
  },
  text: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    lineHeight: 1.6,
    margin: '0 0 12px',
  },
  code: {
    background: 'rgba(255,255,255,0.08)',
    padding: '2px 6px',
    borderRadius: 4,
    fontSize: 12,
    fontFamily: "'JetBrains Mono', monospace",
  },
  pre: {
    background: '#111',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 8,
    padding: '12px 16px',
    fontSize: 12,
    fontFamily: "'JetBrains Mono', monospace",
    color: 'rgba(255,255,255,0.8)',
    overflowX: 'auto',
    marginTop: 8,
    lineHeight: 1.6,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    marginTop: 16,
  },
  th: {
    textAlign: 'left',
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    padding: '8px 12px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
  },
  td: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    padding: '8px 12px',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
  },
  domainBtn: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '12px 16px',
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 8,
    cursor: 'pointer',
    textAlign: 'left',
  },
  domainArrow: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
    width: 14,
    flexShrink: 0,
  },
  domainTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 600,
    flex: 1,
  },
  domainCount: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 12,
  },
  endpointList: {
    marginTop: 4,
    marginLeft: 14,
    borderLeft: '1px solid rgba(255,255,255,0.06)',
    paddingLeft: 12,
  },
  endpointRow: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '8px 10px',
    background: 'none',
    border: 'none',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
    cursor: 'pointer',
    textAlign: 'left',
  },
  epPath: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    minWidth: 260,
    flexShrink: 0,
  },
  epDesc: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    flex: 1,
  },
  epDetail: {
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.05)',
    borderRadius: 6,
    padding: '16px',
    margin: '4px 0 8px 62px',
  },
  detailLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  detailValue: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
  },
  detailPre: {
    background: '#111',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 6,
    padding: '10px 14px',
    fontSize: 11,
    fontFamily: "'JetBrains Mono', monospace",
    color: 'rgba(255,255,255,0.75)',
    overflowX: 'auto',
    marginTop: 6,
    lineHeight: 1.5,
  },
};
