# Firestore Production Database Reference
# Exported: 2026-03-22T20:07:59.731Z
# Project: wolf-20b8b

## Collection Summary

| Collection | Docs | Top Fields | Subcollections |
|---|---|---|---|
| api_keys | 2 | 10 | - |
| app_resources | 4 | 14 | - |
| call_bookings | 11 | 12 | - |
| checkout_intents | 4 | 11 | - |
| client_nutrition_plan_content | 1 | 11 | - |
| client_plan_content | 5 | 6 | sessions, sessions/*/exercises, sessions/*/exercises/*/sets |
| client_programs | 7 | 7 | - |
| client_sessions | 120 | 12 | - |
| courses | 8 | 25 | modules, modules/*/sessions, modules/*/sessions/*/exercises, modules/*/sessions/*/exercises/*/sets |
| creator_availability | 1 | 3 | - |
| creator_client_access | 7 | 3 | - |
| creator_feedback | 1 | 7 | - |
| creator_libraries | 0 | 0 | - |
| creator_media | 0 | 0 | - |
| creator_nutrition_library | 0 | 0 | - |
| event_signups | 0 | 0 | - |
| events | 7 | 18 | - |
| exercises_library | 12 | 189 | - |
| nutrition_assignments | 3 | 10 | - |
| one_on_one_clients | 8 | 7 | - |
| plans | 4 | 7 | modules, modules/*/sessions, modules/*/sessions/*/exercises, modules/*/sessions/*/exercises/*/sets |
| rate_limit_first_party | 68 | 2 | - |
| rate_limit_windows | 1 | 2 | - |
| users | 41 | 40 | bodyLog, diary, exerciseHistory, exerciseLastPerformance, oneRepMaxHistory, readiness, sessionHistory, meals, saved_foods, subscriptions |
| processed_payments | 0 | — | - |
| subscription_cancellation_feedback | 0 | — | - |

> **Note:** This export appears truncated for some user subcollections. The JSON dump has lower document counts than the full database for `exerciseHistory` (80 vs 246), `exerciseLastPerformance` (38 vs 72), `readiness` (22 vs 84), `sessionHistory` (83 vs 110), and `client_plan_content` exercises/sets. Field inventories above represent the union of all fields found in the exported subset and may not capture fields that only exist in non-exported documents.

---

## api_keys
**2 documents**

### Schema
```
key_prefix: string = "wk_live_b613b2ac" | "wk_live_cd765a99"
key_hash: string = "b6170a07f69c48a9539c6d354e5489faf42e51bb8b4071095f089d8ad12f..." | "c2f5771bd2b599ae0be73ca35cb81e140327998cec6a53087a176eeee498..."
owner_id: string = "bUCvwdPYolPe6i8JuCaY5w2PcB53"
scopes: array
  [array of string]
  samples: ["read","write","creator"]
name: string = "prueba"
last_used_at: null|Timestamp
rate_limit_rpm: number = 60
created_at: Timestamp
revoked_at: Timestamp|null
revoked: boolean = true | false
```

### Example (doc: 3aas0DEaICepzOYDqSlR)
```json
{
  "key_prefix": "wk_live_b613b2ac",
  "key_hash": "b6170a07f69c48a9539c6d354e5489faf42e51bb8b4071095f089d8ad12f6516",
  "owner_id": "bUCvwdPYolPe6i8JuCaY5w2PcB53",
  "scopes": [
    "read",
    "...(3 total)"
  ],
  "name": "prueba",
  "last_used_at": null,
  "rate_limit_rpm": 60,
  "created_at": {
    "__type": "Timestamp",
    "value": "2026-03-17T13:31:29.579Z",
    "_seconds": 1773754289
  },
  "revoked_at": {
    "__type": "Timestamp",
    "value": "2026-03-17T13:39:13.070Z",
    "_seconds": 1773754753
  },
  "revoked": true
}
```

---

## app_resources
**4 documents**

### Schema
```
title: string (2/4) = "discipline_img" | "assets"
running: string (1/4) = "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.fireb..."
hyrox: string (1/4) = "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.fireb..."
híbrido: string (1/4) = "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.fireb..."
fuerza: string (1/4) = "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.fireb..."
version: string (1/4) = "0001"
library: string (1/4) = "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.fireb..."
intensity: object (1/4)
  {
    7/10: string = "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.fireb..."
    8/10: string = "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.fireb..."
    9/10: string = "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.fireb..."
    10/10: string = "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.fireb..."
  }
warmup: object (1/4)
  {
    cardio: string = "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.fireb..."
    circulos_adelante: string = "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.fireb..."
    circulos_atras: string = "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.fireb..."
    balanceo_derecha: string = "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.fireb..."
    balanceo_izquierda: string = "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.fireb..."
    zancadas: string = "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.fireb..."
  }
main_hero_landing: array (1/4)
  [array of string]
  samples: ["https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.firebasestorage.app/o/web_resources%2Fmain_hero_landing%2FScreenshot%202026-02-01%20at%203.00.05%E2%80%AFPM.png?alt=media&token=00f00d5c-f365-4800-a85e-f7ec80daa3cb"]
cards: array (1/4)
  [array of string]
  samples: ["https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.firebasestorage.app/o/web_resources%2Fc7dbeff395fe2999f91589fe45ca5aea.jpg?alt=media&token=4ca15284-cd3f-4cbe-b45f-24fac835174d","https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.firebasestorage.app/o/web_resources%2Fd35390ed6d1cf996870bff3d43b668a5.jpg?alt=media&token=d7f8a8ec-a0c0-4097-bf33-647d6a1aab02","https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.firebasestorage.app/o/web_resources%2F11d6d343527f9edb7c2d44d09fe0f81f.jpg?alt=media&token=7f562a10-e376-478b-982d-7f76fae68269"]
dos_formas: string (1/4) = "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.fireb..."
hero_app_page: array (1/4)
  [array of string]
  samples: ["https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.firebasestorage.app/o/web_resources%2FScreenshot%202026-02-02%20at%202.51.57%E2%80%AFPM.png?alt=media&token=0651818a-a495-4d44-8cbb-83628c21e2fb"]
general: object (1/4)
  {
    profile: array
    library: array
    mainScreen: array
    community: array
  }
```

### Example (doc: 1GCTnxO1XCNbxOQGQj57)
```json
{
  "title": "discipline_img",
  "running": "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.firebasestorage.app/o/app_resources%2Fdisciplines%2Frunning.jpg?a...",
  "hyrox": "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.firebasestorage.app/o/app_resources%2Fdisciplines%2Fhyrox.jpg?alt...",
  "híbrido": "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.firebasestorage.app/o/app_resources%2Fdisciplines%2Fhi%CC%81brido...",
  "fuerza": "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.firebasestorage.app/o/app_resources%2Fdisciplines%2Ffuerza%20-%20..."
}
```

### Alternate shape (doc: THHsNFk9vkd6L3qPmFoO) — extra fields: version, library, intensity, warmup
```json
{
  "title": "assets",
  "version": "0001",
  "library": "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.firebasestorage.app/o/app_resources%2Fdisciplines%2Fhyrox.jpg?alt...",
  "intensity": {
    "7/10": "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.firebasestorage.app/o/app_resources%2Fintensity%2F7%20de%2010.mov...",
    "8/10": "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.firebasestorage.app/o/app_resources%2Fintensity%2F8%20de%2010.mov...",
    "9/10": "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.firebasestorage.app/o/app_resources%2Fintensity%2F9%20de%2010.mov...",
    "10/10": "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.firebasestorage.app/o/app_resources%2Fintensity%2F10%20de%2010.mo..."
  },
  "warmup": {
    "cardio": "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.firebasestorage.app/o/app_resources%2Fwarmup%2Fbici.mov?alt=media...",
    "circulos_adelante": "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.firebasestorage.app/o/app_resources%2Fwarmup%2Fc_adelante.mov?alt...",
    "circulos_atras": "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.firebasestorage.app/o/app_resources%2Fwarmup%2Fc_atras.mov?alt=me...",
    "balanceo_derecha": "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.firebasestorage.app/o/app_resources%2Fwarmup%2Fp_derecha.mov?alt=...",
    "balanceo_izquierda": "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.firebasestorage.app/o/app_resources%2Fwarmup%2Fp_izq.mov?alt=medi...",
    "zancadas": "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.firebasestorage.app/o/app_resources%2Fwarmup%2Fzanca.mov?alt=medi..."
  }
}
```

---

## call_bookings
**11 documents**

### Schema
```
creatorId: string = "bUCvwdPYolPe6i8JuCaY5w2PcB53"
clientUserId: string = "wX7RQWnhj8hIBZwuVn5WrBw0z7J3" | "yMqKOXBcVARa6vjU7wImf3Tp85J2" | "kbUNayqmgSfRnlShtHxoPHQMwOi2" | "bUCvwdPYolPe6i8JuCaY5w2PcB53"
courseId: string|null = "34lLitkRftoS3B3vTOxP" | "bW2kM05cD01nGm1tXU3R"
slotStartUtc: string = "2026-02-17T03:30:00.000Z" | "2026-02-17T02:15:00.000Z" | "2026-02-27T00:00:00.000Z" | "2026-02-16T12:30:00.000Z" | "2026-06-20T09:00:00.000Z" | "2026-02-17T01:15:00.000Z"
slotEndUtc: string = "2026-02-17T04:00:00.000Z" | "2026-02-17T03:00:00.000Z" | "2026-02-27T00:30:00.000Z" | "2026-02-16T13:00:00.000Z" | "2026-06-20T10:00:00.000Z" | "2026-02-17T01:45:00.000Z"
status: string = "scheduled" | "cancelled"
createdAt: string|Timestamp = "2026-02-16T20:27:07.977Z" | "2026-02-16T20:26:59.955Z" | "2026-02-26T22:49:26.217Z" | "2026-02-16T18:03:56.579Z" | "2026-02-16T18:15:37.225Z" | "2026-02-16T18:15:30.762Z" | "2026-02-16T18:22:06.281Z" | "2026-02-16T18:15:10.972Z"
callLinkUpdatedAt: string (2/11) = "2026-02-16T20:27:46.478Z" | "2026-02-16T19:18:25.218Z"
callLink: string (5/11) = "https://meet.google.com/dag-pgot-yft" | "https://meet.google.com/abc-def-ghi"
clientDisplayName: string (3/11) = "Test API User"
durationMinutes: number (3/11) = 60
updatedAt: Timestamp (3/11)
```

### Example (doc: TtDxDtOy6bacTrXWHRsK)
```json
{
  "creatorId": "bUCvwdPYolPe6i8JuCaY5w2PcB53",
  "clientUserId": "bUCvwdPYolPe6i8JuCaY5w2PcB53",
  "clientDisplayName": "Test API User",
  "slotStartUtc": "2026-06-20T09:00:00.000Z",
  "slotEndUtc": "2026-06-20T10:00:00.000Z",
  "durationMinutes": 60,
  "courseId": null,
  "createdAt": {
    "__type": "Timestamp",
    "value": "2026-03-18T20:53:58.109Z",
    "_seconds": 1773867238
  },
  "callLink": "https://meet.google.com/abc-def-ghi",
  "status": "cancelled",
  "updatedAt": {
    "__type": "Timestamp",
    "value": "2026-03-18T20:54:14.789Z",
    "_seconds": 1773867254
  }
}
```

### Alternate shape (doc: 8Q9CLuQ8664sAJsQARv1) — extra fields: callLinkUpdatedAt
```json
{
  "creatorId": "bUCvwdPYolPe6i8JuCaY5w2PcB53",
  "clientUserId": "wX7RQWnhj8hIBZwuVn5WrBw0z7J3",
  "courseId": "34lLitkRftoS3B3vTOxP",
  "slotStartUtc": "2026-02-17T03:30:00.000Z",
  "slotEndUtc": "2026-02-17T04:00:00.000Z",
  "status": "scheduled",
  "createdAt": "2026-02-16T20:27:07.977Z",
  "callLinkUpdatedAt": "2026-02-16T20:27:46.478Z",
  "callLink": "https://meet.google.com/dag-pgot-yft"
}
```

---

## checkout_intents
**4 documents**

### Schema
```
courseTitle: string = "BOOST X JFF"
userEmail: string = "andresrobayyo7@gmail.com" | "guerrerodaniel1311@gmail.com" | "juanespayan@gmail.com" | "fbejaranofit@gmail.com"
state: string = "pending"
subscriptionId: null
userName: null
courseId: string = "352ruaYiQ4Sa6oXz1HOO"
userId: string = "7sPqmKbOioeCXv9ReLH60za2ehW2" | "pFVPUO5NOaYyAAsJT4H4mzywtrI3" | "qI85ujCxuSMOxhVqbNUjdd9Ehbi2" | "yMqKOXBcVARa6vjU7wImf3Tp85J2"
paymentType: string = "otp"
status: string = "pending"
startedAt: Timestamp
updatedAt: Timestamp
```

### Example (doc: v1|7sPqmKbOioeCXv9ReLH60za2ehW2|352ruaYiQ4Sa6oXz1HOO|otp)
```json
{
  "courseTitle": "BOOST X JFF",
  "userEmail": "andresrobayyo7@gmail.com",
  "state": "pending",
  "subscriptionId": null,
  "userName": null,
  "courseId": "352ruaYiQ4Sa6oXz1HOO",
  "userId": "7sPqmKbOioeCXv9ReLH60za2ehW2",
  "paymentType": "otp",
  "status": "pending",
  "startedAt": {
    "__type": "Timestamp",
    "value": "2026-03-11T21:57:40.560Z",
    "_seconds": 1773266260
  },
  "updatedAt": {
    "__type": "Timestamp",
    "value": "2026-03-11T21:57:40.560Z",
    "_seconds": 1773266260
  }
}
```

---

## client_nutrition_plan_content
**1 documents**

### Schema
```
source_plan_id: string = "pLDMTolblrm6Ppc3Vm30"
assignment_id: string = "S6f0fxhZG6QNTVYvnT5B"
name: string = "prueba nutricion"
description: string = ""
daily_calories: number = 2500
daily_protein_g: number = 187.5
daily_carbs_g: number = 250
daily_fat_g: number = 83.3
categories: array
  [array of object]
  item {
    id: string = "breakfast" | "lunch" | "dinner"
    label: string = "Desayuno" | "Almuerzo" | "Cena"
    order: number = 0 | 1 | 2
    options: array
      [array of object]
      item {
        id: string = "opt_1" | "opt_1772147174963"
        label: string = "Opción 1" | "Opción 2"
        items: array
          [array of object]
          item {
            serving_id: string = "11058" | "1200892" | "20461453" | "10075" | "819407" | "6578" | "4194100" | "327524" | "derived-1g" | "107530"
            number_of_units: number = 6 | 1 | 2 | 400
            servings: array
              [array of object]
              item {
                serving_id: string = "derived-1g" | "11942" | "10244" | "1200892" | "20461453" | "12328" | "10075" | "819407" | "6578" | "6230" | "4194100" | "327523" | "327524" | "111494" | "3942" | "3943" | "107530"
                number_of_units: number|string = 1 | "1.000"
                carbohydrate: number|string = 0.01 | "0.56" | "0.49" | 0.77 | "23.00" | 0.03 | "1.00" | 0.54 | "13.06" | "14.69" | 0 | "0" | 0.02 | "0.48" | "0.39" | 0.31 | "42.95" | "24.54" | 0.78 | "35.00"
                metric_serving_unit: string = "g"
                metric_serving_amount: number|string = 1 | "50.000" | "44.000" | "30.000" | "24.000" | "27.000" | "221.000" | "21.000" | "17.000" | "112.000" | "140.000" | "80.000" | "7.000" | "28.350" | "45.000"
                serving_description: string = "1 g" | "1 large" | "1 medium" | "1 arepa" | "2 tbsp" | "1 regular slice" | "1 large slice" | "1 slice" | "1 slice (4-1/4" sq) (0.75 oz)" | "1 very thin slice, shaved slice" | "4 oz" | "1 cup cooked" | "1 oz, dry, yields" | "1 egg" | "1 thin slice (approx 2" x 1-1/2" x 1/8")" | "1 oz boneless, cooked" | "1/4 cup prepared"
                fat: number|string (25+ unique)
                protein: number|string (23+ unique)
                calories: number|string (23+ unique)
                measurement_description: string = "g" | "large" | "medium" | "serving" | "regular slice" | "large slice" | "slice (4-1/4" sq) (0.75 oz)" | "very thin slice, shaved slice" | "cup, cooked" | "oz, dry, yields" | "thin slice (approx 2" x 1-1/2" x 1/8")" | "oz, boneless, cooked"
                serving_url: string (16/27) = "https://foods.fatsecret.com/calories-nutrition/generic/egg-w..." | "https://foods.fatsecret.com/calories-nutrition/generic/egg-w..." | "https://foods.fatsecret.com/calories-nutrition/harina-pan/ar..." | "https://foods.fatsecret.com/calories-nutrition/heb/queso-bla..." | "https://foods.fatsecret.com/calories-nutrition/generic/bread..." | "https://foods.fatsecret.com/calories-nutrition/generic/bread..." | "https://foods.fatsecret.com/calories-nutrition/lucerne/2%25-..." | "https://foods.fatsecret.com/calories-nutrition/generic/ham-s..." | "https://foods.fatsecret.com/calories-nutrition/generic/ham-s..." | "https://foods.fatsecret.com/calories-nutrition/wal-mart/93-7..." | "https://foods.fatsecret.com/calories-nutrition/generic/fettu..." | "https://foods.fatsecret.com/calories-nutrition/generic/fettu..." | "https://foods.fatsecret.com/calories-nutrition/egglands-best..." | "https://foods.fatsecret.com/calories-nutrition/generic/chick..." | "https://foods.fatsecret.com/calories-nutrition/generic/chick..." | "https://foods.fatsecret.com/calories-nutrition/mahatma/basma..."
                calcium: string (13/27) = "25" | "22" | "0" | "29" | "32" | "1" | "20" | "10" | "6" | "30" | "4"
                vitamin_a: string (11/27) = "84" | "74" | "0" | "80" | "3" | "14"
                potassium: string (13/27) = "63" | "55" | "82" | "31" | "35" | "62" | "50" | "365" | "36" | "70" | "15"
                vitamin_c: string (10/27) = "0" | "0.0"
                saturated_fat: string (16/27) = "1.627" | "1.432" | "0" | "3.000" | "0.139" | "0.156" | "0.567" | "0.459" | "0.245" | "0.140" | "1.000" | "0.263" | "1.066"
                cholesterol: string (15/27) = "211" | "186" | "0" | "15" | "11" | "9" | "70" | "170" | "6" | "25"
                sugar: string (15/27) = "0.56" | "0.49" | "0" | "1.14" | "1.28" | "0.78" | "0.45"
                monounsaturated_fat: string (11/27) = "2.030" | "1.787" | "0.191" | "0.215" | "0.827" | "0.670" | "0.182" | "0.104" | "2.000" | "0.371" | "1.501"
                polyunsaturated_fat: string (11/27) = "0.704" | "0.620" | "0.502" | "0.564" | "0.195" | "0.158" | "0.444" | "0.254" | "1.000" | "0.206" | "0.835"
                fiber: string (16/27) = "0" | "2.0" | "0.6" | "0.7" | "2.5" | "1.4"
                sodium: string (16/27) = "139" | "122" | "0" | "220" | "142" | "160" | "50" | "268" | "217" | "75" | "326" | "186" | "65" | "28" | "115"
                iron: string (13/27) = "0.60" | "0.52" | "1.40" | "0.80" | "0.90" | "0.19" | "0.15" | "2.75" | "1.85" | "1.06" | "0.09" | "0.35"
                vitamin_d: string (2/27) = "0" | "6"
                trans_fat: string (5/27) = "0" | "0.500"
                added_sugars: string (2/27) = "0"
              }
            serving_unit: string = "1 g" | "1 large slice" | "1 slice" | "1 slice (4-1/4" sq) (0.75 oz)"
            grams_per_unit: number = 1 | 27 | 221 | 21
            food_id: string = "3094" | "1204459" | "21804835" | "3434" | "805339" | "1907" | "4308635" | "292098" | "76960" | "1623" | "59015"
            carbs: number = 3.9 | 23 | 1 | 29.4 | 0 | 0.5 | 24.5 | 35
            fat: number = 36.8 | 1 | 6 | 2.2 | 4.5 | 1.8 | 8 | 0.7 | 0.1 | 52 | 0
            protein: number = 43.6 | 2 | 4 | 4.9 | 6 | 3.8 | 22 | 4.6 | 0.1 | 108
            name: string = "Boiled Egg" | "Arepa" | "Queso Blanco" | "Toasted White Bread" | "2% Sliced Swiss Cheese" | "Deli Sliced Ham" | "93/7 Lean Ground Beef" | "Fettuccine" | "Large Grade A Eggs" | "Chicken" | "Basmati Rice"
            calories: number = 534 | 110 | 70 | 158 | 34 | 170 | 126 | 1 | 960 | 160
            food_category: string = "Hard Boiled Eggs" | "Cornbread" | "Mexican Cheese" | "White Bread" | "Swiss Cheese" | "Ham" | "Ground Beef" | "Pasta" | "Eggs" | "Chicken" | "Rice"
          }
      }
  }
updated_at: Timestamp
created_at: Timestamp
```

### Example (doc: S6f0fxhZG6QNTVYvnT5B)
```json
{
  "source_plan_id": "pLDMTolblrm6Ppc3Vm30",
  "assignment_id": "S6f0fxhZG6QNTVYvnT5B",
  "name": "prueba nutricion",
  "description": "",
  "daily_calories": 2500,
  "daily_protein_g": 187.5,
  "daily_carbs_g": 250,
  "daily_fat_g": 83.3,
  "categories": [
    {
      "id": "breakfast",
      "label": "Desayuno",
      "order": 0,
      "options": [
        {
          "id": "opt_1",
          "label": "Opción 1",
          "items": [
            {
              "serving_id": "11058",
              "number_of_units": 6,
              "servings": [
                {
                  "serving_id": "derived-1g",
                  "number_of_units": 1,
                  "carbohydrate": 0.01,
                  "metric_serving_unit": "g",
                  "metric_serving_amount": 1,
                  "serving_description": "1 g",
                  "fat": 0.11,
                  "protein": 0.13,
                  "calories": 1.5,
                  "measurement_description": "g"
                },
                {
                  "protein": "6.26",
                  "serving_url": "https://foods.fatsecret.com/calories-nutrition/generic/egg-whole-boiled?portionid=11942&portionamount=1.000",
                  "calcium": "25",
                  "vitamin_a": "84",
                  "calories": "77",
                  "measurement_description": "large",
                  "potassium": "63",
                  "vitamin_c": "0",
                  "saturated_fat": "1.627",
                  "serving_id": "11942",
                  "cholesterol": "211",
                  "sugar": "0.56",
                  "fat": "5.28",
                  "monounsaturated_fat": "2.030",
                  "serving_description": "1 large",
                  "polyunsaturated_fat": "0.704",
                  "fiber": "0",
                  "sodium": "139",
                  "number_of_units": "1.000",
                  "metric_serving_amount": "50.000",
                  "carbohydrate": "0.56",
                  "iron": "0.60",
                  "metric_serving_unit": "g"
                },
                {
                  "vitamin_a": "74",
                  "calcium": "22",
                  "serving_url": "https://foods.fatsecret.com/calories-nutrition/generic/egg-whole-boiled?portionid=10244&portionamount=1.000",
                  "protein": "5.51",
                  "calories": "68",
                  "vitamin_c": "0",
                  "potassium": "55",
                  "measurement_description": "medium",
                  "serving_id": "10244",
                  "saturated_fat": "1.432",
                  "sugar": "0.49",
                  "cholesterol": "186",
                  "serving_description": "1 medium",
                  "polyunsaturated_fat": "0.620",
                  "monounsaturated_fat": "1.787",
                  "fat": "4.65",
                  "fiber": "0",
                  "number_of_units": "1.000",
                  "sodium": "122",
                  "carbohydrate": "0.49",
                  "iron": "0.52",
                  "metric_serving_unit": "g",
                  "metric_serving_amount": "44.000"
                },
                {
                  "fiber": "0",
                  "serving_description": "1 small",
                  "polyunsaturated_fat": "0.521",
                  "fat": "3.91",
                  "monounsaturated_fat": "1.502",
                  "carbohydrate": "0.41",
                  "iron": "0.44",
                  "metric_serving_unit": "g",
                  "metric_serving_amount": "37.000",
                  "number_of_units": "1.000",
                  "sodium": "103",
                  "calories": "57",
                  "measurement_description": "small",
                  "potassium": "47",
                  "vitamin_c": "0",
                  "calcium": "18",
                  "vitamin_a": "62",
                  "serving_url": "https://foods.fatsecret.com/calories-nutrition/generic/egg-whole-boiled?portionid=12126&portionamount=1.000",
                  "protein": "4.64",
                  "cholesterol": "156",
                  "sugar": "0.41",
                  "serving_id": "12126",
                  "saturated_fat": "1.204"
                },
                {
                  "saturated_fat": "1.887",
                  "serving_id": "11058",
                  "sugar": "0.65",
                  "cholesterol": "245",
                  "protein": "7.27",
                  "serving_url": "https://foods.fatsecret.com/calories-nutrition/generic/egg-whole-boiled?portionid=11058&portionamount=1.000",
                  "vitamin_a": "97",
                  "calcium": "29",
                  "calories": "89",
                  "vitamin_c": "0",
                  "potassium": "73",
                  "measurement_description": "extra large",
                  "sodium": "161",
                  "number_of_units": "1.000",
                  "metric_serving_amount": "58.000",
                  "carbohydrate": "0.65",
                  "metric_serving_unit": "g",
                  "iron": "0.69",
                  "fat": "6.13",
                  "monounsaturated_fat": "2.355",
                  "serving_description": "1 extra large",
                  "polyunsaturated_fat": "0.817",
                  "fiber": "0"
                }
              ],
              "serving_unit": "1 g",
              "grams_per_unit": 1,
              "food_id": "3094",
              "carbs": 3.9,
              "fat": 36.8,
              "protein": 43.6,
              "name": "Boiled Egg",
              "calories": 534,
              "food_category": "Hard Boiled Eggs"
            },
            {
              "fat": 1,
              "protein": 2,
              "food_category": "Cornbread",
              "name": "Arepa",
              "calories": 110,
              "serving_id": "1200892",
              "number_of_units": 1,
              "grams_per_unit": 1,
              "carbs": 23,
              "food_id": "1204459",
              "serving_unit": "1 g",
              "servings": [
                {
                  "serving_description": "1 g",
                  "fat": 0.03,
                  "protein": 0.07,
                  "measurement_description": "g",
                  "calories": 3.7,
                  "serving_id": "derived-1g",
                  "number_of_units": 1,
                  "metric_serving_unit": "g",
                  "carbohydrate": 0.77,
                  "metric_serving_amount": 1
                },
                {
                  "serving_id": "1200892",
                  "saturated_fat": "0",
                  "vitamin_d": "0",
                  "cholesterol": "0",
                  "sugar": "0",
                  "calcium": "0",
                  "protein": "2.00",
                  "serving_url": "https://foods.fatsecret.com/calories-nutrition/harina-pan/arepa",
                  "potassium": "82",
                  "measurement_description": "serving",
                  "calories": "110",
                  "trans_fat": "0",
                  "number_of_units": "1.000",
                  "sodium": "0",
                  "metric_serving_unit": "g",
                  "iron": "1.40",
                  "carbohydrate": "23.00",
                  "metric_serving_amount": "30.000",
                  "serving_description": "1 arepa",
                  "fat": "1.00",
                  "added_sugars": "0",
                  "fiber": "2.0"
                }
              ]
            },
            {
              "serving_id": "20461453",
              "number_of_units": 1,
              "carbs": 1,
              "grams_per_unit": 1,
              "food_id": "21804835",
              "serving_unit": "1 g",
              "servings": [
                {
                  "metric_serving_amount": 1,
                  "carbohydrate": 0.03,
                  "metric_serving_unit": "g",
                  "serving_id": "derived-1g",
                  "number_of_units": 1,
                  "calories": 2.3,
                  "measurement_description": "g",
                  "protein": 0.13,
                  "fat": 0.2,
                  "serving_description": "1 g"
                },
                {
                  "metric_serving_unit": "g",
                  "carbohydrate": "1.00",
                  "metric_serving_amount": "30.000",
                  "number_of_units": "1.000",
                  "sodium": "220",
                  "fiber": "0",
                  "serving_description": "2 tbsp",
                  "fat": "6.00",
                  "cholesterol": "15",
                  "serving_id": "20461453",
                  "saturated_fat": "3.000",
                  "measurement_description": "serving",
                  "calories": "70",
                  "trans_fat": "0",
                  "protein": "4.00",
                  "serving_url": "https://foods.fatsecret.com/calories-nutrition/heb/queso-blanco"
                }
              ],
              "protein": 4,
              "fat": 6,
              "food_category": "Mexican Cheese",
              "calories": 70,
              "name": "Queso Blanco"
            },
            {
              "fat": 7.5,
              "protein": 1,
              "food_category": "Avocados",
              "calories": 85,
              "name": "Avocado",
              "serving_id": "derived-1g",
              "number_of_units": 50,
              "serving_unit": "1 g",
              "carbs": 4.5,
              "food_id": "66325",
              "grams_per_unit": 1,
              "servings": [
                {
                  "serving_id": "derived-1g",
                  "number_of_units": 1,
                  "carbohydrate": 0.09,
                  "metric_serving_unit": "g",
                  "metric_serving_amount": 1,
                  "serving_description": "1 g",
                  "fat": 0.15,
                  "protein": 0.02,
                  "calories": 1.7,
                  "measurement_description": "g"
                },
                {
                  "sodium": "11",
                  "number_of_units": "1.000",
                  "metric_serving_amount": "136.000",
                  "carbohydrate": "12.00",
                  "metric_serving_unit": "g",
                  "fat": "21.00",
                  "serving_description": "1 avocado",
                  "fiber": "9.0",
                  "saturated_fat": "4.000",
                  "serving_id": "122491",
                  "cholesterol": "0",
                  "sugar": "0.40",
                  "protein": "3.00",
                  "serving_url": "https://foods.fatsecret.com/calories-nutrition/calavo/avocado",
                  "calories": "227",
                  "potassium": "760",
                  "measurement_description": "serving"
                }
              ]
            }
          ]
        },
        "...(2 total)"
      ]
    },
    "...(4 total)"
  ],
  "updated_at": {
    "__type": "Timestamp",
    "value": "2026-03-20T23:56:21.628Z",
    "_seconds": 1774050981
  },
  "created_at": {
    "__type": "Timestamp",
    "value": "2026-03-20T23:56:21.628Z",
    "_seconds": 1774050981
  }
}
```

---

## client_plan_content
**5 documents**

### Schema
```
title: string = "Semana 1" | "Semana 3" | "Semana 2"
order: number = 0 | 2 | 1
source_plan_id: string = "h3fNPL78Ebp1xXmV6k4z" | "4O2cw0wiVd1yzpiYM5UG"
source_module_id: string = "zIszJpXxaKNFKfsRhiJI" | "i0zJS2QuiUrjdv99VGXK" | "UIhm1WIP1C40KivesPIL" | "6w3T0B9GrI3FlenlLisC"
updated_at: Timestamp
created_at: Timestamp
```

### Subcollection: client_plan_content/{id}/sessions
**19 documents**

```
id: string (18/19) = "SNQBSZkeMSBljnZrNYew" | "pg4571Pdoc9b7lSkPfE2" | "NgOZMg2yReHPg4Q4ABjI" | "KsOJ6gwVnDGC1UlqeHgh" | "YERkK0IVHp9gYZ3JtxQq" | "YGS5gTBBwkbtV3FVWTXm" | "s7GzYKmoNZELmNJ0K4oH" | "wvR8K7V5e2wgLGflZ2zU" | "6FUVeV9TB1bkMStB0WoL" | "PrTQZYQBwTDg3Xbyfonc" | "QnXOKYBKp1LAR9opoLbb" | "pznyvZs9Jr9hURT38LVi" | "EDdoo030qtojcn3tz5sV" | "Kj2DHFQV57SOJPOa4qS6" | "Ojjm012QsGLsU3UAXW6r" | "kMeUKviGG7uevwp5BBzi" | "rnxPRJYKf4KZl1gpriAP"
created_at: Timestamp (18/19)
image_url: null|string (18/19) = "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.fireb..." | "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.fireb..."
librarySessionRef: string (18/19) = "ATyzYJotFpIcW4rpoWyY" | "EsFARdr8x0AGHhuYV0kO" | "wSfxWyxtxXK3wsIRzBh7" | "qSPpZVY2eE0f9iOuivgf"
order: number = 0 | 3 | 6 | 5 | 1
dayIndex: number = 0 | 3 | 6 | 4 | 1 | 5
title: string = "Prueba push" | "Pull" | "Push 1" | "Pierna"
updated_at: Timestamp
useLocalContent: boolean (2/19) = true
```

<details><summary>Example</summary>

```json
{
  "id": "SNQBSZkeMSBljnZrNYew",
  "created_at": {
    "__type": "Timestamp",
    "value": "2026-03-21T17:35:24.993Z",
    "_seconds": 1774114524
  },
  "image_url": null,
  "librarySessionRef": "ATyzYJotFpIcW4rpoWyY",
  "order": 0,
  "dayIndex": 0,
  "title": "Prueba push",
  "updated_at": {
    "__type": "Timestamp",
    "value": "2026-03-21T17:43:54.692Z",
    "_seconds": 1774115034
  }
}
```
</details>

### Subcollection: client_plan_content/{id}/sessions/*/exercises
**53 documents**

```
id: string (47/53) = "NaffxLMnDGWUXwifs0Eq" | "7B7mbF6NdBmOyMODgc9V" | "cliRXIAkTbY7o75eNM6U" | "1yUhAJuJ3RZMeLnt7raC" | "JWpe4CbNyHabVev7fw8L" | "NTKN3ml5c2yxT1G5BKv0" | "zYFxkmSuhrToTfjaHV08" | "d0T943SeIR9nTvuotIdp" | "AwOZrIxlKPm4LgQ59G7Q" | "E4CzwB9NgvFockv3w7zA" | "OENvGpSlE9uZXRcxl8zd" | "Zylwwxy0Vgh6WEm23hIT" | "1Bi5vypIpUgXcn6AJvsy" | "mFpV3jy36VNeyesWHqry" | "qq6t4dJK7BmRXZQrgla1" | "eTcVKPebGYegLAgqwfYv" | "ljCf41zKT1TFEW7rbLU5"
alternatives: object (50/53)
  {
    8k3qVl2OXuuKsg7EURqE: array (6/50)
      [array of string]
      samples: ["Press inclinado con mancuernas"]
  }
measures: array (50/53)
  [array of string]
  samples: ["reps","weight","custom_mn0lu6l0_sd74"]
primary: object (50/53)
  {
    ftX6UgCfhh43wWaLDvfo: string (2/50) = "Prueba bench press"
    8k3qVl2OXuuKsg7EURqE: string (48/50) = "Curl de biceps con mancuernas" | "Remo con barra" | "Bench press" | "Press inclinado con mancuernas" | "Press hombros" | "Sentadilla" | "Jalon ancho"
  }
created_at: Timestamp (47/53)
order: number = 0 | 2 | 1 | 3
objectives: array (50/53)
  [array of string]
  samples: ["reps","intensity","previous","custom_mn0meunc_ho45","custom_mltio9jd_fvgv","custom_mm42i92v_ch9f"]
customMeasureLabels: object (50/53)
  {
    custom_mn0lu6l0_sd74: string (2/50) = "Percepción RPE"
  }
customObjectiveLabels: object (50/53)
  {
    custom_mn0meunc_ho45: string (1/50) = "Tiempo de descanso (s)"
    custom_mltio9jd_fvgv: string (6/50) = "tiempo de descanso"
    custom_mm42i92v_ch9f: string (2/50) = "buñuelos"
  }
updated_at: Timestamp
title: string (10/53) = "Ejercicio" | "Bench press" | "Press inclinado con mancuernas" | "Press hombros" | "Remo con barra" | "Curl de biceps con mancuernas" | "Jalon ancho"
name: string (10/53) = "Ejercicio" | "Bench press" | "Press inclinado con mancuernas" | "Press hombros" | "Remo con barra" | "Curl de biceps con mancuernas" | "Jalon ancho"
defaultSetValues: object (10/53)
  {
    reps: string = "10-12" | "10"
    custom_mltio9jd_fvgv: string (2/10) = ""
    intensity: string = "8/10" | "10/10"
    custom_mm42i92v_ch9f: null (2/10)
  }
```

<details><summary>Example</summary>

```json
{
  "id": "NaffxLMnDGWUXwifs0Eq",
  "alternatives": {},
  "measures": [
    "reps",
    "...(3 total)"
  ],
  "primary": {
    "ftX6UgCfhh43wWaLDvfo": "Prueba bench press"
  },
  "created_at": {
    "__type": "Timestamp",
    "value": "2026-03-21T17:33:30.415Z",
    "_seconds": 1774114410
  },
  "order": 0,
  "objectives": [
    "reps",
    "...(3 total)"
  ],
  "customMeasureLabels": {
    "custom_mn0lu6l0_sd74": "Percepción RPE"
  },
  "customObjectiveLabels": {},
  "updated_at": {
    "__type": "Timestamp",
    "value": "2026-03-21T17:43:54.692Z",
    "_seconds": 1774115034
  }
}
```
</details>

### Subcollection: client_plan_content/{id}/sessions/*/exercises/*/sets
**171 documents**

```
id: string (153/171) (25+ unique)
title: string = "Serie 2" | "Serie 4" | "Serie 1" | "Serie 3" | "Serie 5"
order: number = 1 | 3 | 0 | 2 | 4
intensity: string (162/171) = "6/10" | "9/10" | "4/10" | "8/10" | "10/10"
reps: string (162/171) = "6-10" | "3-5" | "8-12" | "9" | "10" | "10-12" | "7"
created_at: Timestamp (153/171)
updated_at: Timestamp
custom_mm42i92v_ch9f: null (6/171)
```

<details><summary>Example</summary>

```json
{
  "id": "7Vp17DgV70JSnNjobKa0",
  "title": "Serie 2",
  "order": 1,
  "intensity": "6/10",
  "reps": "6-10",
  "created_at": {
    "__type": "Timestamp",
    "value": "2026-03-21T17:33:32.806Z",
    "_seconds": 1774114412
  },
  "updated_at": {
    "__type": "Timestamp",
    "value": "2026-03-21T17:43:54.692Z",
    "_seconds": 1774115034
  }
}
```
</details>

### Example (doc: 0XR4EO8HHzUXHsdhKXa3EK1EoZJ3_eT62MX3V5O0KKWqU8dQe_2026-W12)
```json
{
  "title": "Semana 1",
  "order": 0,
  "source_plan_id": "h3fNPL78Ebp1xXmV6k4z",
  "source_module_id": "zIszJpXxaKNFKfsRhiJI",
  "updated_at": {
    "__type": "Timestamp",
    "value": "2026-03-21T17:43:54.692Z",
    "_seconds": 1774115034
  },
  "created_at": {
    "__type": "Timestamp",
    "value": "2026-03-21T17:43:54.692Z",
    "_seconds": 1774115034
  }
}
```

---

## client_programs
**7 documents**

### Schema
```
program_id: string = "eT62MX3V5O0KKWqU8dQe" | "hFhgVWJGpKcfP3w6Mu6Y" | "XkPmWN1S7CGDwuOCR445" | "bW2kM05cD01nGm1tXU3R" | "ZSo5DKsQmcvsmm3g2R21" | "Xsh2cd9O5Rz9gNgpKktp"
user_id: string = "0XR4EO8HHzUXHsdhKXa3EK1EoZJ3" | "FVSLSu6zuNRFsozrrAQhHF2hHkv1" | "QEjugFhBOjdcTfsLC1kQJdak7zP2" | "XQ9NDAngzAPEIwPMjDAX8e6xYa72" | "b7UKQiRztOSUFRbBOgar3mbC3LJ2" | "kbUNayqmgSfRnlShtHxoPHQMwOi2"
content_plan_id: null
version_snapshot: object
  {
    program_version: string = "2026-01"
    library_versions: object
      {
        sessions: object
          {
          }
        modules: object
          {
          }
      }
  }
created_at: Timestamp
planAssignments: object (4/7)
  {
    2026-W15: object (1/4)
      {
        planId: string = "h3fNPL78Ebp1xXmV6k4z"
        moduleIndex: number = 3
        moduleId: string = "CqKnraJiTjCNkdRwqxs4"
        assignedAt: Timestamp
      }
    2026-W16: object (1/4)
      {
        planId: string = "h3fNPL78Ebp1xXmV6k4z"
        moduleIndex: number = 4
        moduleId: string = "jqCvxKsRNIUeE6v4OdpF"
        assignedAt: Timestamp
      }
    2026-W13: object (1/4)
      {
        planId: string = "h3fNPL78Ebp1xXmV6k4z"
        moduleIndex: number = 1
        moduleId: string = "TtFGjN2ChkBpl2RvLMhO"
        assignedAt: Timestamp
      }
    2026-W14: object (1/4)
      {
        planId: string = "h3fNPL78Ebp1xXmV6k4z"
        moduleIndex: number = 2
        moduleId: string = "xwxWbyvkUW8X8tPpPz18"
        assignedAt: Timestamp
      }
    2026-W12: object (2/4)
      {
        planId: string = "h3fNPL78Ebp1xXmV6k4z" | "4O2cw0wiVd1yzpiYM5UG"
        moduleIndex: number = 0 | 3
        moduleId: string = "zIszJpXxaKNFKfsRhiJI" | "PGivak60m0lH7RoODv4H"
        assignedAt: Timestamp
      }
    2026-W06: object (1/4)
      {
        assignedAt: Timestamp
        moduleIndex: number = 1
        moduleId: string = "BxMwIohzzprcW4QrYisl"
        planId: string = "4O2cw0wiVd1yzpiYM5UG"
      }
    2026-W05: object (1/4)
      {
        moduleIndex: number = 0
        assignedAt: Timestamp
        planId: string = "4O2cw0wiVd1yzpiYM5UG"
        moduleId: string = "i0zJS2QuiUrjdv99VGXK"
      }
    2026-W07: object (3/4)
      {
        moduleId: string (1/3) = "UIhm1WIP1C40KivesPIL"
        planId: string = "4O2cw0wiVd1yzpiYM5UG" | "ncadTZgdGjZfUSviAOdy"
        assignedAt: Timestamp
        moduleIndex: number = 2 | 0
      }
    2026-W08: object (3/4)
      {
        assignedAt: Timestamp
        moduleIndex: number = 3 | 1
        moduleId: string (1/3) = "PGivak60m0lH7RoODv4H"
        planId: string = "4O2cw0wiVd1yzpiYM5UG" | "ncadTZgdGjZfUSviAOdy"
      }
    2026-W09: object (2/4)
      {
        planId: string = "4O2cw0wiVd1yzpiYM5UG" | "ncadTZgdGjZfUSviAOdy"
        moduleIndex: number = 0 | 2
        moduleId: string (1/2) = "i0zJS2QuiUrjdv99VGXK"
        assignedAt: Timestamp
      }
    2026-W11: object (1/4)
      {
        planId: string = "4O2cw0wiVd1yzpiYM5UG"
        moduleIndex: number = 2
        moduleId: string = "UIhm1WIP1C40KivesPIL"
        assignedAt: Timestamp
      }
    2026-W10: object (2/4)
      {
        planId: string = "4O2cw0wiVd1yzpiYM5UG" | "ncadTZgdGjZfUSviAOdy"
        moduleIndex: number = 1 | 2
        moduleId: string (1/2) = "BxMwIohzzprcW4QrYisl"
        assignedAt: Timestamp
      }
  }
updated_at: Timestamp
```

### Example (doc: 0XR4EO8HHzUXHsdhKXa3EK1EoZJ3_eT62MX3V5O0KKWqU8dQe)
```json
{
  "program_id": "eT62MX3V5O0KKWqU8dQe",
  "user_id": "0XR4EO8HHzUXHsdhKXa3EK1EoZJ3",
  "content_plan_id": null,
  "version_snapshot": {
    "program_version": "2026-01",
    "library_versions": {
      "sessions": {},
      "modules": {}
    }
  },
  "created_at": {
    "__type": "Timestamp",
    "value": "2026-03-21T17:41:58.909Z",
    "_seconds": 1774114918
  },
  "planAssignments": {
    "2026-W15": {
      "planId": "h3fNPL78Ebp1xXmV6k4z",
      "moduleIndex": 3,
      "moduleId": "CqKnraJiTjCNkdRwqxs4",
      "assignedAt": {
        "__type": "Timestamp",
        "value": "2026-03-21T17:43:35.061Z",
        "_seconds": 1774115015
      }
    },
    "2026-W16": {
      "planId": "h3fNPL78Ebp1xXmV6k4z",
      "moduleIndex": 4,
      "moduleId": "jqCvxKsRNIUeE6v4OdpF",
      "assignedAt": {
        "__type": "Timestamp",
        "value": "2026-03-21T17:43:35.061Z",
        "_seconds": 1774115015
      }
    },
    "2026-W13": {
      "planId": "h3fNPL78Ebp1xXmV6k4z",
      "moduleIndex": 1,
      "moduleId": "TtFGjN2ChkBpl2RvLMhO",
      "assignedAt": {
        "__type": "Timestamp",
        "value": "2026-03-21T17:43:35.061Z",
        "_seconds": 1774115015
      }
    },
    "2026-W14": {
      "planId": "h3fNPL78Ebp1xXmV6k4z",
      "moduleIndex": 2,
      "moduleId": "xwxWbyvkUW8X8tPpPz18",
      "assignedAt": {
        "__type": "Timestamp",
        "value": "2026-03-21T17:43:35.061Z",
        "_seconds": 1774115015
      }
    },
    "2026-W12": {
      "planId": "h3fNPL78Ebp1xXmV6k4z",
      "moduleIndex": 0,
      "moduleId": "zIszJpXxaKNFKfsRhiJI",
      "assignedAt": {
        "__type": "Timestamp",
        "value": "2026-03-21T17:43:35.061Z",
        "_seconds": 1774115015
      }
    }
  },
  "updated_at": {
    "__type": "Timestamp",
    "value": "2026-03-21T17:43:35.061Z",
    "_seconds": 1774115015
  }
}
```

---

## client_sessions
**120 documents**

### Schema
```
client_id: string = "0XR4EO8HHzUXHsdhKXa3EK1EoZJ3" | "FVSLSu6zuNRFsozrrAQhHF2hHkv1" | "QEjugFhBOjdcTfsLC1kQJdak7zP2" | "XQ9NDAngzAPEIwPMjDAX8e6xYa72" | "b7UKQiRztOSUFRbBOgar3mbC3LJ2" | "kbUNayqmgSfRnlShtHxoPHQMwOi2" | "ucKeIU6fhuhsxbI8K7hs3IfjNpr1"
program_id: string = "eT62MX3V5O0KKWqU8dQe" | "hFhgVWJGpKcfP3w6Mu6Y" | "XkPmWN1S7CGDwuOCR445" | "bW2kM05cD01nGm1tXU3R" | "ZSo5DKsQmcvsmm3g2R21" | "Xsh2cd9O5Rz9gNgpKktp"
plan_id: null|string = "h3fNPL78Ebp1xXmV6k4z" | "4O2cw0wiVd1yzpiYM5UG" | "ncadTZgdGjZfUSviAOdy"
session_id: string (25+ unique)
module_id: null|string = "zIszJpXxaKNFKfsRhiJI" | "TtFGjN2ChkBpl2RvLMhO" | "xwxWbyvkUW8X8tPpPz18" | "CqKnraJiTjCNkdRwqxs4" | "jqCvxKsRNIUeE6v4OdpF" | "i0zJS2QuiUrjdv99VGXK" | "BxMwIohzzprcW4QrYisl" | "UIhm1WIP1C40KivesPIL" | "PGivak60m0lH7RoODv4H" | "IhM2cV2WlMPfnWvT7ZIf" | "5HzLxq9PsZldzdYh9g7e" | "6w3T0B9GrI3FlenlLisC"
date: string (25+ unique)
date_timestamp: Timestamp
library_session_ref: boolean (54/120) = true
updated_at: Timestamp
created_at: Timestamp
day_index: number (66/120) = 0 | 3 | 1 | 5 | 6
week_key: string (50/120) = "2026-W12" | "2026-W13" | "2026-W14" | "2026-W15" | "2026-W16" | "2026-W05" | "2026-W06" | "2026-W07" | "2026-W08" | "2026-W09" | "2026-W10" | "2026-W11"
```

### Example (doc: 0XR4EO8HHzUXHsdhKXa3EK1EoZJ3_2026-03-23_SNQBSZkeMSBljnZrNYew)
```json
{
  "client_id": "0XR4EO8HHzUXHsdhKXa3EK1EoZJ3",
  "program_id": "eT62MX3V5O0KKWqU8dQe",
  "plan_id": "h3fNPL78Ebp1xXmV6k4z",
  "session_id": "SNQBSZkeMSBljnZrNYew",
  "module_id": "zIszJpXxaKNFKfsRhiJI",
  "date": "2026-03-23",
  "date_timestamp": {
    "__type": "Timestamp",
    "value": "2026-03-23T05:00:00.000Z",
    "_seconds": 1774242000
  },
  "day_index": 0,
  "week_key": "2026-W12",
  "updated_at": {
    "__type": "Timestamp",
    "value": "2026-03-21T17:43:35.944Z",
    "_seconds": 1774115015
  },
  "created_at": {
    "__type": "Timestamp",
    "value": "2026-03-21T17:43:35.944Z",
    "_seconds": 1774115015
  }
}
```

### Alternate shape (doc: 0XR4EO8HHzUXHsdhKXa3EK1EoZJ3_2026-03-21_ATyzYJotFpIcW4rpoWyY) — extra fields: library_session_ref
```json
{
  "client_id": "0XR4EO8HHzUXHsdhKXa3EK1EoZJ3",
  "program_id": "eT62MX3V5O0KKWqU8dQe",
  "plan_id": null,
  "session_id": "ATyzYJotFpIcW4rpoWyY",
  "module_id": null,
  "date": "2026-03-21",
  "date_timestamp": {
    "__type": "Timestamp",
    "value": "2026-03-21T05:00:00.000Z",
    "_seconds": 1774069200
  },
  "library_session_ref": true,
  "updated_at": {
    "__type": "Timestamp",
    "value": "2026-03-21T17:42:24.531Z",
    "_seconds": 1774114944
  },
  "created_at": {
    "__type": "Timestamp",
    "value": "2026-03-21T17:42:24.531Z",
    "_seconds": 1774114944
  }
}
```

---

## courses
**8 documents**

### Schema
```
creator_id: string = "QEjugFhBOjdcTfsLC1kQJdak7zP2" | "eIwqct7kL4aWaI68lZJZbny8v2j2" | "0XR4EO8HHzUXHsdhKXa3EK1EoZJ3" | "bUCvwdPYolPe6i8JuCaY5w2PcB53"
creatorName: string = "Juan Felipe Frieri" | "Maria Angelica Navas" | "Diego Ramírez" | "Test"
description: string = "Programa de 12 semanas con una guía semipersonalizada que te..." | ""
discipline: string = "Fuerza - hipertrofia"
duration: string|null = "12 semanas" | "6 semanas"
programSettings: object
  {
    streakEnabled: boolean (5/8) = true | false
    minimumSessionsPerWeek: number (5/8) = 2 | 3 | 1 | 0
  }
weight_suggestions: boolean = true
created_at: Timestamp
image_path: string|null (5/8) = "courses/352ruaYiQ4Sa6oXz1HOO/image.jpeg"
image_url: string (5/8) = "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.fireb..." | "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.fireb..." | "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.fireb..." | "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.fireb..." | "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.fireb..."
title: string = "BOOST X JFF" | "JUAN FELIPE FRIERI (PERSONAL)" | "Ensayo Ana 1" | "PLAN ACELERADOR" | "Hybrid" | "Prueba asesorías" | "Prueba uno a uno" | "Plan General"
video_intro_url: string (1/8) = "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.fireb..."
version: string = "2025-01" | "2026-01"
availableLibraries: array
  [array of string]
  samples: ["OkoQHnBCSebXbhMhQRw6","gFkPua4jCZrqxlJZABFx","8k3qVl2OXuuKsg7EURqE","ftX6UgCfhh43wWaLDvfo"]
updated_at: Timestamp
tutorials: object
  {
    workoutCompletion: array
      [array of string]
      samples: ["https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.firebasestorage.app/o/courses%2F352ruaYiQ4Sa6oXz1HOO%2Ftutorials%2FworkoutCompletion%2Fvideo_1764510618556.MOV?alt=media&token=97baee3c-0020-45f6-bda0-540d22180d09"]
    workoutExecution: array
    dailyWorkout: array
      [array of string]
      samples: ["https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.firebasestorage.app/o/courses%2F352ruaYiQ4Sa6oXz1HOO%2Ftutorials%2FdailyWorkout%2Fvideo_1764537824734.MOV?alt=media&token=942691a3-e66b-4ae0-a774-86b4a3f19b4f"]
  }
last_update: Timestamp
free_trial: object
  {
    duration_days: number = 4 | 0 | 7
    active: boolean = false | true
  }
iap_product_id: string (1/8) = "wake.monthly.subscription"
status: string = "published" | "draft"
access_duration: string = "yearly" | "monthly"
price: number|null = 130000 | 300000
deliveryType: string (7/8) = "one_on_one" | "low_ticket"
content_plan_id: null (7/8)
published_version: string (7/8) = "2026-01"
```

### Subcollection: courses/{id}/modules
**13 documents**

```
title: string = "SEMANA 8" | "SEMANA 7" | "SEMANA 9" | "SEMANA 4" | "SEMANA 3" | "SEMANA 6" | "SEMANA 5" | "SEMANA 12" | "SEMANA 10" | "SEMANA 2" | "SEMANA 11" | "SEMANA 1" | "Semana 1"
created_at: Timestamp
order: number = 7 | 6 | 8 | 3 | 2 | 5 | 4 | 11 | 9 | 1 | 10 | 0
updated_at: Timestamp
description: string (1/13) = "Semana 1"
```

<details><summary>Example</summary>

```json
{
  "title": "SEMANA 8",
  "created_at": {
    "__type": "Timestamp",
    "value": "2025-11-30T21:48:33.145Z",
    "_seconds": 1764539313
  },
  "order": 7,
  "updated_at": {
    "__type": "Timestamp",
    "value": "2025-11-30T21:59:38.355Z",
    "_seconds": 1764539978
  }
}
```
</details>

### Subcollection: courses/{id}/modules/*/sessions
**44 documents**

```
title: string = "EMPUJE 2" | "PIERNA 2" | "JALÓN 2" | "CUERPO COMPLETO" | "PIERNA 3" | "CUERPO COMPLETO 2" | "EMPUJE 3" | "JALÓN 3" | "JALÓN" | "EMPUJE" | "PIERNA"
image_url: string = "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.fireb..." | "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.fireb..." | "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.fireb..." | "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.fireb..." | "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.fireb..." | "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.fireb..." | "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.fireb..." | "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.fireb..." | "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.fireb..." | "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.fireb..." | "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.fireb..."
created_at: Timestamp
updated_at: Timestamp
order: number = 0 | 1 | 2 | 3
```

<details><summary>Example</summary>

```json
{
  "title": "EMPUJE 2",
  "image_url": "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.firebasestorage.app/o/courses%2F352ruaYiQ4Sa6oXz1HOO%2Fmodules%2F...",
  "created_at": {
    "__type": "Timestamp",
    "value": "2025-11-30T21:48:43.113Z",
    "_seconds": 1764539323
  },
  "updated_at": {
    "__type": "Timestamp",
    "value": "2025-11-30T22:02:02.703Z",
    "_seconds": 1764540122
  },
  "order": 0
}
```
</details>

### Subcollection: courses/{id}/modules/*/sessions/*/exercises
**224 documents**

```
order: number = 3 | 0 | 1 | 2 | 4 | 5
created_at: Timestamp
measures: array
  [array of string]
  samples: ["reps","weight"]
updated_at: Timestamp
alternatives: object
  {
    OkoQHnBCSebXbhMhQRw6: array
      [array of string]
      samples: ["PRESS MILITAR CON MANCUERNAS","PRESS MILITAR EN MAQUINA","PRESS DE BANCA MAQUINA","PRESS INCLINADO EN MAQUINA","ELEVACIÓN LATERAL CON CABLE","EXTENSIÓN DE TRICEPS","ELEVACIONES DE PIERNA","SENTADILLA EN SMITH","PESO MUERTO CON MANCUERNAS","PESO MUERTO RUMANO CON MANCUERNAS"]
  }
objectives: array
  [array of string]
  samples: ["reps","intensity","previous"]
primary: object
  {
    OkoQHnBCSebXbhMhQRw6: string (25+ unique)
  }
```

<details><summary>Example</summary>

```json
{
  "order": 3,
  "created_at": {
    "__type": "Timestamp",
    "value": "2025-11-30T21:48:48.961Z",
    "_seconds": 1764539328
  },
  "measures": [
    "reps",
    "...(2 total)"
  ],
  "updated_at": {
    "__type": "Timestamp",
    "value": "2025-11-30T21:48:49.116Z",
    "_seconds": 1764539329
  },
  "alternatives": {
    "OkoQHnBCSebXbhMhQRw6": [
      "PRESS MILITAR CON MANCUERNAS",
      "...(2 total)"
    ]
  },
  "objectives": [
    "reps",
    "...(3 total)"
  ],
  "primary": {
    "OkoQHnBCSebXbhMhQRw6": "PRESS MILITAR CON BARRA"
  }
}
```
</details>

### Subcollection: courses/{id}/modules/*/sessions/*/exercises/*/sets
**684 documents**

```
title: string = "Serie 1" | "Serie 2" | "Serie 3" | "Serie 4"
order: number = 0 | 1 | 2 | 3
created_at: Timestamp
intensity: string = "8/10" | "10/10" | "7/10" | "9/10"
reps: string = "8" | "10" | "12" | "15" | "6"
updated_at: Timestamp
```

<details><summary>Example</summary>

```json
{
  "title": "Serie 1",
  "order": 0,
  "created_at": {
    "__type": "Timestamp",
    "value": "2025-11-30T21:48:49.490Z",
    "_seconds": 1764539329
  },
  "intensity": "8/10",
  "reps": "8",
  "updated_at": {
    "__type": "Timestamp",
    "value": "2025-11-30T21:48:49.632Z",
    "_seconds": 1764539329
  }
}
```
</details>

### Example (doc: XkPmWN1S7CGDwuOCR445)
```json
{
  "creator_id": "QEjugFhBOjdcTfsLC1kQJdak7zP2",
  "creatorName": "Juan Felipe Frieri",
  "title": "JUAN FELIPE FRIERI (PERSONAL)",
  "description": "",
  "discipline": "Fuerza - hipertrofia",
  "access_duration": "monthly",
  "deliveryType": "one_on_one",
  "status": "draft",
  "price": null,
  "free_trial": {
    "active": false,
    "duration_days": 0
  },
  "duration": null,
  "programSettings": {},
  "weight_suggestions": true,
  "availableLibraries": [
    "OkoQHnBCSebXbhMhQRw6",
    "...(1 total)"
  ],
  "content_plan_id": null,
  "tutorials": {
    "dailyWorkout": [],
    "workoutCompletion": [],
    "workoutExecution": []
  },
  "version": "2026-01",
  "published_version": "2026-01",
  "created_at": {
    "__type": "Timestamp",
    "value": "2026-03-02T13:39:58.974Z",
    "_seconds": 1772458798
  },
  "image_path": null,
  "updated_at": {
    "__type": "Timestamp",
    "value": "2026-03-02T13:49:15.983Z",
    "_seconds": 1772459355
  },
  "image_url": "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.firebasestorage.app/o/creator_media%2FQEjugFhBOjdcTfsLC1kQJdak7zP...",
  "last_update": {
    "__type": "Timestamp",
    "value": "2026-03-02T13:49:15.983Z",
    "_seconds": 1772459355
  }
}
```

### Alternate shape (doc: 352ruaYiQ4Sa6oXz1HOO) — extra fields: video_intro_url, iap_product_id
```json
{
  "creator_id": "QEjugFhBOjdcTfsLC1kQJdak7zP2",
  "creatorName": "Juan Felipe Frieri",
  "description": "Programa de 12 semanas con una guía semipersonalizada que te da claridad total: qué entrenar, cómo progresar y cómo estr...",
  "discipline": "Fuerza - hipertrofia",
  "duration": "12 semanas",
  "programSettings": {
    "streakEnabled": true,
    "minimumSessionsPerWeek": 2
  },
  "weight_suggestions": true,
  "created_at": {
    "__type": "Timestamp",
    "value": "2025-11-28T16:25:39.086Z",
    "_seconds": 1764347139
  },
  "image_path": "courses/352ruaYiQ4Sa6oXz1HOO/image.jpeg",
  "image_url": "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.firebasestorage.app/o/courses%2F352ruaYiQ4Sa6oXz1HOO%2Fimage.jpeg...",
  "title": "BOOST X JFF",
  "video_intro_url": "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.firebasestorage.app/o/courses%2F352ruaYiQ4Sa6oXz1HOO%2Fintro_vide...",
  "version": "2025-01",
  "availableLibraries": [
    "OkoQHnBCSebXbhMhQRw6",
    "...(1 total)"
  ],
  "updated_at": {
    "__type": "Timestamp",
    "value": "2025-11-30T21:24:01.709Z",
    "_seconds": 1764537841
  },
  "tutorials": {
    "workoutCompletion": [
      "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.firebasestorage.app/o/courses%2F352ruaYiQ4Sa6oXz1HOO%2Ftutorials%2FworkoutCompletion%2Fvideo_1764510618556.MOV?alt=media&token=97baee3c-0020-45f6-bda0-540d22180d09",
      "...(1 total)"
    ],
    "workoutExecution": [],
    "dailyWorkout": [
      "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.firebasestorage.app/o/courses%2F352ruaYiQ4Sa6oXz1HOO%2Ftutorials%2FdailyWorkout%2Fvideo_1764537824734.MOV?alt=media&token=942691a3-e66b-4ae0-a774-86b4a3f19b4f",
      "...(1 total)"
    ]
  },
  "last_update": {
    "__type": "Timestamp",
    "value": "2025-11-30T21:24:01.709Z",
    "_seconds": 1764537841
  },
  "free_trial": {
    "duration_days": 4,
    "active": false
  },
  "iap_product_id": "wake.monthly.subscription",
  "status": "published",
  "access_duration": "yearly",
  "price": 130000
}
```

---

## creator_availability
**1 documents**

### Schema
```
timezone: string = "America/Bogota"
days: object
  {
    2026-02-20: object
      {
        slots: array
          [array of object]
          item {
            endUtc: string = "2026-02-20T17:45:00.000Z" | "2026-02-20T18:45:00.000Z" | "2026-02-20T19:45:00.000Z"
            durationMinutes: number = 45
            startUtc: string = "2026-02-20T17:00:00.000Z" | "2026-02-20T18:00:00.000Z" | "2026-02-20T19:00:00.000Z"
          }
      }
    2026-02-26: object
      {
        slots: array
          [array of object]
          item {
            endUtc: string = "2026-02-27T00:30:00.000Z"
            startUtc: string = "2026-02-27T00:00:00.000Z"
            durationMinutes: number = 30
          }
      }
    2026-02-16: object
      {
        slots: array
          [array of object]
          item {
            endUtc: string = "2026-02-16T13:00:00.000Z" | "2026-02-16T14:15:00.000Z" | "2026-02-16T15:00:00.000Z"
            durationMinutes: number = 30
            startUtc: string = "2026-02-16T12:30:00.000Z" | "2026-02-16T13:45:00.000Z" | "2026-02-16T14:30:00.000Z"
          }
      }
    2026-03-22: object
      {
        slots: array
          [array of object]
          item {
            startUtc: string = "2026-03-22T14:45:00.000Z"
            endUtc: string = "2026-03-22T15:15:00.000Z"
            durationMinutes: number = 30
          }
      }
  }
updatedAt: string = "2026-03-20T23:38:55.624Z"
```

### Example (doc: bUCvwdPYolPe6i8JuCaY5w2PcB53)
```json
{
  "timezone": "America/Bogota",
  "days": {
    "2026-02-20": {
      "slots": [
        {
          "endUtc": "2026-02-20T17:45:00.000Z",
          "durationMinutes": 45,
          "startUtc": "2026-02-20T17:00:00.000Z"
        },
        "...(4 total)"
      ]
    },
    "2026-02-26": {
      "slots": [
        {
          "endUtc": "2026-02-27T00:30:00.000Z",
          "startUtc": "2026-02-27T00:00:00.000Z",
          "durationMinutes": 30
        },
        "...(1 total)"
      ]
    },
    "2026-02-16": {
      "slots": [
        {
          "endUtc": "2026-02-16T13:00:00.000Z",
          "durationMinutes": 30,
          "startUtc": "2026-02-16T12:30:00.000Z"
        },
        "...(9 total)"
      ]
    },
    "2026-03-22": {
      "slots": [
        {
          "startUtc": "2026-03-22T14:45:00.000Z",
          "endUtc": "2026-03-22T15:15:00.000Z",
          "durationMinutes": 30
        },
        "...(1 total)"
      ]
    }
  },
  "updatedAt": "2026-03-20T23:38:55.624Z"
}
```

---

## creator_client_access
**7 documents**

### Schema
```
creatorId: string = "0XR4EO8HHzUXHsdhKXa3EK1EoZJ3" | "QEjugFhBOjdcTfsLC1kQJdak7zP2" | "bUCvwdPYolPe6i8JuCaY5w2PcB53" | "eIwqct7kL4aWaI68lZJZbny8v2j2"
userId: string = "0XR4EO8HHzUXHsdhKXa3EK1EoZJ3" | "FVSLSu6zuNRFsozrrAQhHF2hHkv1" | "QEjugFhBOjdcTfsLC1kQJdak7zP2" | "b7UKQiRztOSUFRbBOgar3mbC3LJ2" | "XQ9NDAngzAPEIwPMjDAX8e6xYa72" | "kbUNayqmgSfRnlShtHxoPHQMwOi2"
updated_at: Timestamp
```

### Example (doc: 0XR4EO8HHzUXHsdhKXa3EK1EoZJ3_0XR4EO8HHzUXHsdhKXa3EK1EoZJ3)
```json
{
  "creatorId": "0XR4EO8HHzUXHsdhKXa3EK1EoZJ3",
  "userId": "0XR4EO8HHzUXHsdhKXa3EK1EoZJ3",
  "updated_at": {
    "__type": "Timestamp",
    "value": "2026-03-21T17:41:58.214Z",
    "_seconds": 1774114918
  }
}
```

---

## creator_feedback
**1 documents**

### Schema
```
creatorId: string = "bUCvwdPYolPe6i8JuCaY5w2PcB53"
type: string = "suggestion"
text: string = "probando sistema"
imageUrl: null
creatorEmail: string = "test@gmail.com"
creatorDisplayName: string = "Test"
createdAt: Timestamp
```

### Example (doc: R1peqxrD2HUa0JH9mmOx)
```json
{
  "creatorId": "bUCvwdPYolPe6i8JuCaY5w2PcB53",
  "type": "suggestion",
  "text": "probando sistema",
  "imageUrl": null,
  "creatorEmail": "test@gmail.com",
  "creatorDisplayName": "Test",
  "createdAt": {
    "__type": "Timestamp",
    "value": "2026-02-20T19:13:07.539Z",
    "_seconds": 1771614787
  }
}
```

---

## creator_libraries
**Empty collection** (0 documents)

## creator_media
**Empty collection** (0 documents)

## creator_nutrition_library
**Empty collection** (0 documents)

## event_signups
**Empty collection** (0 documents)

## events
**7 documents**

### Schema
```
description: string = "Un taller de fitness avanzado" | "okokok" | "Juan Felipe Frieri x Simon Orduz" | ""
date: string|Timestamp = "2026-06-15T10:00:00.000Z"
maxRegistrations: number (4/7) = 10
fields: array
  [array of object]
  item {
    fieldId: string (8/17) = "field_0_1773865396564" | "field_1_1773865396564" | "field_0_1773867160967" | "field_1_1773867160967" | "field_0_1773865537473" | "field_1_1773865537473" | "field_0_1773865195050" | "field_1_1773865195050"
    fieldName: string (8/17) = "Número de teléfono" | "Nivel de experiencia"
    fieldType: string (8/17) = "text" | "select"
    required: boolean = false | true
    id: string (9/17) = "f_nombre" | "f_email" | "f_telefono"
    label: string (9/17) = "Nombre" | "Email" | "Teléfono"
    type: string (9/17) = "text" | "email" | "tel"
    placeholder: string (9/17) = "Tu nombre completo" | "correo@ejemplo.com" | "+57 300 000 0000"
    locked: boolean (9/17) = true
  }
creatorId: string (4/7) = "bUCvwdPYolPe6i8JuCaY5w2PcB53"
createdAt: Timestamp (4/7)
location: string = "Medellín, Colombia" | "parque" | "Parque de los Hippies 9:00AM" | ""
title: string = "Seminar de Fitness Avanzado" | "prueba" | "SEXY PACE RUN" | "Sexy pace run"
status: string = "active" | "draft"
updatedAt: Timestamp (4/7)
access: string (3/7) = "public"
max_registrations: number|null (3/7) = 90 | 50
settings: object (3/7)
  {
    confirmation_message: string = "" | "Ponte sexy (si es con Adidas mejor)" | "Ponte sexy"
    send_confirmation_email: boolean = false | true
    enable_qr_checkin: boolean = false | true
    show_registration_count: boolean = false
  }
image_url: string (3/7) = "" | "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.fireb..." | "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.fireb..."
creator_id: string (3/7) = "bUCvwdPYolPe6i8JuCaY5w2PcB53" | "QEjugFhBOjdcTfsLC1kQJdak7zP2"
registration_count: number (3/7) = 0 | 21
created_at: Timestamp (3/7)
updated_at: Timestamp (3/7)
```

### Example (doc: event-mmtayv6s-k2n1b)
```json
{
  "title": "prueba",
  "description": "okokok",
  "date": {
    "__type": "Timestamp",
    "value": "2026-03-24T05:00:00.000Z",
    "_seconds": 1774328400
  },
  "location": "parque",
  "access": "public",
  "max_registrations": 90,
  "settings": {
    "confirmation_message": "",
    "send_confirmation_email": false,
    "enable_qr_checkin": false,
    "show_registration_count": false
  },
  "fields": [
    {
      "id": "f_nombre",
      "label": "Nombre",
      "type": "text",
      "required": true,
      "placeholder": "Tu nombre completo",
      "locked": true
    },
    "...(5 total)"
  ],
  "image_url": "",
  "creator_id": "bUCvwdPYolPe6i8JuCaY5w2PcB53",
  "registration_count": 0,
  "created_at": {
    "__type": "Timestamp",
    "value": "2026-03-16T14:52:44.413Z",
    "_seconds": 1773672764
  },
  "updated_at": {
    "__type": "Timestamp",
    "value": "2026-03-16T14:53:08.301Z",
    "_seconds": 1773672788
  },
  "status": "active"
}
```

### Alternate shape (doc: ITaSSp9O9emU3R1y7UjI) — extra fields: maxRegistrations, creatorId, createdAt, updatedAt
```json
{
  "description": "Un taller de fitness avanzado",
  "date": "2026-06-15T10:00:00.000Z",
  "maxRegistrations": 10,
  "fields": [
    {
      "fieldId": "field_0_1773865396564",
      "fieldName": "Número de teléfono",
      "fieldType": "text",
      "required": false
    },
    "...(2 total)"
  ],
  "creatorId": "bUCvwdPYolPe6i8JuCaY5w2PcB53",
  "createdAt": {
    "__type": "Timestamp",
    "value": "2026-03-18T20:23:16.748Z",
    "_seconds": 1773865396
  },
  "location": "Medellín, Colombia",
  "title": "Seminar de Fitness Avanzado",
  "status": "active",
  "updatedAt": {
    "__type": "Timestamp",
    "value": "2026-03-18T20:23:25.465Z",
    "_seconds": 1773865405
  }
}
```

---

## exercises_library
**12 documents**

> Structure: Each document represents a creator's exercise library. Fixed fields are `creator_id`, `creator_name`, `created_at`. 
> All other fields are **dynamic keys** where the key is the exercise name (186 unique exercises across all creators).

### Schema
```
creator_id: string (required)
creator_name: string (required)
title: string (required)
created_at: Timestamp (required)
updated_at: Timestamp (required)
icon: string (optional, 1/12)

[exercise_name]: object  ← dynamic key, one per exercise
  muscle_activation: object
    [muscle_group]: number (0-100 activation %)
  implements: array of string
  updated_at: Timestamp
  created_at: Timestamp
  video_url: string (optional)
  image_url: string (optional)
```

### Dynamic key values

**Exercise names (186 total):**
- ABDUCTOR EN MAQUINA
- APERTURA EN CABLE
- APERTURA PLANA
- APERTURA PLANA EN MAQUINA
- Archer pull-ups
- Around the world
- Around the world avanzado
- Asymmetric pull-ups
- Australian chin ups
- Australian chin- ups
- Australian chin-ups
- Australian pull-ups
- Australian pull-ups avanzado
- BAYESIAN CURL
- Bar knee raise
- Bench dips
- Bench press
- Bodyweight squat tempo 3–2–1
- Bodyweight squats
- Burpee + pull-up
- Burpee with pull-up
- CABLE CRUNCH
- CURL CONCENTRADO BARRA Z
- CURL DE BICEP CON BARRA
- CURL DE BICEP CON MANCUERNA
- CURL DE BICEP EN CABLE
- CURL DE FEMORAL
- CURL DE FEMORAL ACOSTADO
- CURL DE PIERNA
- CURL MARTILLO
- Curl de biceps con mancuernas
- DOMINADAS
- Dead Bug
- Dead bug
- Dead hang
- Dead hang + scapular retraction
- Declin push-ups
- Decline pike push-ups
- Decline push-up
- Decline push-up + pause
- Decline push-ups
- Deep dip ismoetric hold
- Dips isometric deep hold
- Dominada prona negativa
- Double pull-ups
- ELEVACIONES DE PIERNA
- ELEVACIONES LATERALES CON MANCUERNA
- ELEVACIONES LATERALES CON MAQUINA
- ELEVACIÓN DE PANTORILLAS EN MAQUINA
- ELEVACIÓN DE PANTORRILLA
- ELEVACIÓN DE PIERNA ASISTIDA
- ELEVACIÓN LATERAL CON CABLE
- EXTENSIÓN DE PIERNA
- EXTENSIÓN DE TRICEP UNILATERAL
- EXTENSIÓN DE TRICEPS
- Elevated pike push-up
- Elevated pike push-ups
- Explosive pull-up
- Explosive pull-ups
- Explosive push-up
- FONDOS
- Goblet squat
- Good morning
- Half squat pulses
- Half-range prone pull-up
- Half-range prone pull-ups
- Half-range supinated pull-ups
- Hanging knee raises
- Hanging knee twist
- Hanging leg raises
- Headbangers
- Hip hinge wall drill
- Hip thrust
- Hollow Hold
- Hollow hold
- Incline Push-ups
- Incline push-ups
- Incline push-ups explosivas
- Isometric Dips
- Isometric L-sit on bar
- Isometric dip hold
- Isometric half-way prone pull-up
- Isometric knee hold
- Isometric knee raise
- Isometric knee raises
- Isometric supine pull-ups
- Isometric top hold
- JALON A LA CARA
- JALON AL PECHO
- Jalon ancho
- Jump assisted muscle-up
- Jump assited muscle-up
- Kettlebell Lunges
- Kettlebell back lunge
- Kettlebell deadlift
- Knee Raises
- Knee push-ups
- Knee raises
- Knee raises with wink
- L-sit leg raises
- Lateral lunges
- Lunges
- Mixed grip pull-ups
- Narrow grip pull-ups
- Negative prone pull-up
- Negative push-ups
- Negative supinated pull-ups
- Neutral grip pull-up
- Neutral grip pull-ups
- PESO MUERTO CON BARRA
- PESO MUERTO CON MANCUERNAS
- PESO MUERTO RUMANO CON BARRA
- PESO MUERTO RUMANO CON MANCUERNAS
- PRESS DE BANCA MAQUINA
- PRESS DE BANCA PLANO CON BARRA
- PRESS DE BANCA PLANO CON MANCUERNAS
- PRESS DE PIERNA
- PRESS INCLINADO CON BARRA
- PRESS INCLINADO CON MANCUERNAS
- PRESS INCLINADO EN MAQUINA
- PRESS MILITAR CON BARRA
- PRESS MILITAR CON MANCUERNAS
- PRESS MILITAR EN MAQUINA
- PULLOVER CON CABLE
- Peso Muerto Ensayo
- Pike Push-ups
- Pike downs
- Pike push-ups
- Plank
- Press hombros
- Press inclinado con mancuernas
- Prueba bench press
- Pseudo planch push-ups
- Pull-ups
- Pulse squats
- Push-up negative slow
- Push-ups
- Push-ups explosivas
- Push-ups tempo 3-1-3
- REMO CON BARRA
- REMO CON MANCUERNAS
- REMO EN MAQUINA
- REMO EN T
- REMO UNILATERAL CON MANCUERNA
- Remo con barra
- Reverse lunge with reach
- Reverse lunges
- Reverse lunges with reach
- Romanian Deadlift
- Romanian deadlift
- Rowing on bar
- SENTADILLA BULGARA
- SENTADILLA EN SMITH
- SENTADILLA LIBRE
- Scapular retraction
- Sentadilla
- Sentadilla Ensayo
- Short prone pull-ups
- Short supine pull-ups
- Shoulder extensiones on floor
- Shoulder extensions
- Shoulder extensions on floor
- Step-ups
- Straight bar dips
- Supine pull-up isometric
- Supine pull-ups
- Supine pull-ups L-Progression
- Supine pull-ups in L
- Supine pull-ups isometric
- Tempo push-ups (3-2-1)
- Tuck Hollow
- Tuck hold
- Tuck hollow
- Typewriter pull-ups
- Up-middle-down isometrics
- VUELOS POSTERIORES
- Walking lunges
- Wall push-ups
- Wide grip pull-up negativa
- Wide grip pull-ups
- Windshield wipers
- ZANCADA CON PESO
- ZANCADAS
- icon
- title
- updated_at

**Muscle groups tracked (19):**
abs, biceps, calves, forearms, front_delts, glutes, hamstrings, hip_flexors, lats, lower_back, neck, obliques, pecs, quads, rear_delts, rhomboids, side_delts, traps, triceps

**Implements (10):**
Banco, Banco Inclinado, Barra, Barra Z, Cable, Discos, Mancuernas, Máquina, Máquina Smith, Peso Corporal

### Example (doc: 3CfAVo0JBrHrZY1OlvI4, showing 2 exercises)
```json
{
  "creator_id": "gUHpFB8qmbgCEbWw1u96927u7JE3",
  "creator_name": "Simón",
  "created_at": {
    "__type": "Timestamp",
    "value": "2025-12-11T04:19:57.985Z",
    "_seconds": 1765426797
  },
  "<<exercise_name>>": {
    "_key_is_exercise_name": "Australian pull-ups",
    "muscle_activation": {},
    "implements": [],
    "updated_at": {
      "__type": "Timestamp",
      "value": "2025-12-11T04:20:17.863Z",
      "_seconds": 1765426817
    },
    "created_at": {
      "__type": "Timestamp",
      "value": "2025-12-11T04:20:17.863Z",
      "_seconds": 1765426817
    }
  }
}
```

---

## nutrition_assignments
**3 documents**

### Schema
```
userId: string = "0XR4EO8HHzUXHsdhKXa3EK1EoZJ3" | "XQ9NDAngzAPEIwPMjDAX8e6xYa72" | "b7UKQiRztOSUFRbBOgar3mbC3LJ2"
planId: string = "nxxwvYjdUFviCwa88hrt" | "pLDMTolblrm6Ppc3Vm30" | "QCiavz0QOYSRDg0YPUED"
plan: object
  {
    id: string = "nxxwvYjdUFviCwa88hrt" | "pLDMTolblrm6Ppc3Vm30" | "QCiavz0QOYSRDg0YPUED"
    name: string = "Prueba plan alimentación" | "prueba nutricion" | "Plan de Alimentación Juan Jose Rubiano"
    description: string = ""
    daily_calories: number = 2500 | 2450
    daily_protein_g: number = 187.5 | 183.8
    daily_carbs_g: number = 250 | 245
    daily_fat_g: number = 83.3 | 81.7
    categories: array
      [array of object]
      item {
        id: string = "breakfast" | "lunch" | "dinner"
        label: string = "Desayuno" | "Almuerzo" | "Cena"
        order: number = 0 | 1 | 2
        options: array
          [array of object]
          item {
            id: string = "opt_1" | "opt_1774115522516" | "opt_1774115645866" | "opt_1772147174963"
            label: string = "Opción 1" | "Opción 2"
            items: array
              [array of object]
              item {
                servings: array
                  [array of object]
                  item {
                    serving_description: string (25+ unique)
                    carbohydrate: number|string (25+ unique)
                    serving_id: string (25+ unique)
                    protein: number|string (25+ unique)
                    fat: number|string (25+ unique)
                    metric_serving_amount: number|string (63/64) (25+ unique)
                    number_of_units: number|string = 1 | "1.000" | "0.500" | "1.0"
                    measurement_description: string = "g" | "large" | "medium" | "serving" | "cup, cooked, shredded" | "oz, boneless, cooked" | "medium piece (yield after cooking, bone removed)" | "large piece (yield after cooking, bone removed)" | "cup" | "serving (33g)" | "regular slice" | "large slice" | "slice (4-1/4" sq) (0.75 oz)" | "very thin slice, shaved slice" | "cup, cooked" | "oz, dry, yields" | "thin slice (approx 2" x 1-1/2" x 1/8")" | "serving (105g)" | "small breast (yield after cooking, bone removed)" | "oz"
                    metric_serving_unit: string (63/64) = "g" | "oz"
                    calories: number|string (25+ unique)
                    vitamin_c: string (27/64) = "0" | "8.2" | "0.0" | "27.0" | "5.6" | "0.9"
                    saturated_fat: string (39/64) (25+ unique)
                    iron: string (32/64) (25+ unique)
                    calcium: string (32/64) = "25" | "22" | "0" | "60" | "12" | "3" | "16" | "27" | "54" | "29" | "32" | "1" | "20" | "10" | "6" | "4" | "11" | "44" | "7"
                    polyunsaturated_fat: string (29/64) (23+ unique)
                    sugar: string (37/64) = "0.56" | "0.49" | "0" | "10.00" | "0.20" | "0.32" | "7.45" | "1.14" | "1.28" | "0.78" | "0.45" | "0.08" | "0.05" | "1.00" | "5.57" | "0.87"
                    serving_url: string (38/64) (25+ unique)
                    potassium: string (34/64) (22+ unique)
                    fiber: string (38/64) = "0" | "2.0" | "1.0" | "0.3" | "0.4" | "1.7" | "0.6" | "0.7" | "2.5" | "1.4" | "4.0" | "7.8" | "1.2"
                    monounsaturated_fat: string (29/64) (23+ unique)
                    cholesterol: string (38/64) = "211" | "186" | "0" | "10" | "105" | "25" | "73" | "119" | "15" | "11" | "9" | "70" | "6" | "215" | "24"
                    vitamin_a: string (26/64) = "84" | "74" | "0" | "34" | "55" | "162" | "3" | "14" | "24" | "8" | "415" | "65"
                    sodium: string (39/64) (25+ unique)
                    vitamin_d: string (4/64) = "0"
                    added_sugars: string (5/64) = "0" | "10.00"
                    trans_fat: string (11/64) = "0" | "0.500"
                  }
                food_id: string (22+ unique)
                carbs: number = 1.5 | 46.2 | 40 | 0 | 14 | 27.4 | 3.9 | 23 | 1 | 29.4 | 0.5 | 24.5 | 35 | 3 | 54.4 | 42 | 5.5 | 21.6 | 13
                number_of_units: number = 3 | 60 | 1 | 6 | 2 | 400 | 150 | 200 | 80 | 180 | 50 | 120 | 100
                calories: number (23+ unique)
                serving_unit: string = "1 medium" | "1 g" | "3 pancakes" | "1 cup cooked, shredded" | "1 large piece (yield after cooking, bone removed)" | "1 cup" | "1 large slice" | "1 slice" | "1 slice (4-1/4" sq) (0.75 oz)"
                protein: number (21+ unique)
                fat: number = 14 | 1.8 | 8 | 23.6 | 24.2 | 1.1 | 36.8 | 1 | 6 | 2.2 | 4.5 | 0.7 | 52 | 0 | 13.5 | 4.8 | 14.4 | 2
                food_category: string (22+ unique)
                grams_per_unit: number = 44 | 1 | 105 | 121 | 140 | 33 | 27 | 221 | 21
                name: string (22+ unique)
                serving_id: string = "10244" | "derived-1g" | "47950736" | "2593" | "1973" | "17224" | "11058" | "1200892" | "20461453" | "10075" | "819407" | "6578" | "4194100" | "327524" | "107530"
              }
          }
      }
  }
assignedBy: string = "0XR4EO8HHzUXHsdhKXa3EK1EoZJ3" | "bUCvwdPYolPe6i8JuCaY5w2PcB53" | "QEjugFhBOjdcTfsLC1kQJdak7zP2"
source: string = "one_on_one"
programId: string = "eT62MX3V5O0KKWqU8dQe" | "bW2kM05cD01nGm1tXU3R" | "ZSo5DKsQmcvsmm3g2R21"
startDate: string = "2026-03-20" | "2026-02-25" | "2026-03-02"
endDate: null|string = "2026-06-02"
createdAt: Timestamp
updatedAt: Timestamp
```

### Example (doc: F0G0Y3tDbeEWRMoaAdsA)
```json
{
  "userId": "0XR4EO8HHzUXHsdhKXa3EK1EoZJ3",
  "planId": "nxxwvYjdUFviCwa88hrt",
  "plan": {
    "id": "nxxwvYjdUFviCwa88hrt",
    "name": "Prueba plan alimentación",
    "description": "",
    "daily_calories": 2500,
    "daily_protein_g": 187.5,
    "daily_carbs_g": 250,
    "daily_fat_g": 83.3,
    "categories": [
      {
        "id": "breakfast",
        "label": "Desayuno",
        "order": 0,
        "options": [
          {
            "id": "opt_1",
            "label": "Opción 1",
            "items": [
              {
                "servings": [
                  {
                    "serving_description": "1 g",
                    "carbohydrate": 0.01,
                    "serving_id": "derived-1g",
                    "protein": 0.13,
                    "fat": 0.11,
                    "metric_serving_amount": 1,
                    "number_of_units": 1,
                    "measurement_description": "g",
                    "metric_serving_unit": "g",
                    "calories": 1.5
                  },
                  {
                    "calories": "77",
                    "vitamin_c": "0",
                    "metric_serving_unit": "g",
                    "number_of_units": "1.000",
                    "metric_serving_amount": "50.000",
                    "saturated_fat": "1.627",
                    "protein": "6.26",
                    "iron": "0.60",
                    "calcium": "25",
                    "serving_description": "1 large",
                    "polyunsaturated_fat": "0.704",
                    "sugar": "0.56",
                    "serving_url": "https://foods.fatsecret.com/calories-nutrition/generic/egg-whole-boiled?portionid=11942&portionamount=1.000",
                    "potassium": "63",
                    "measurement_description": "large",
                    "fiber": "0",
                    "monounsaturated_fat": "2.030",
                    "cholesterol": "211",
                    "fat": "5.28",
                    "vitamin_a": "84",
                    "serving_id": "11942",
                    "carbohydrate": "0.56",
                    "sodium": "139"
                  },
                  {
                    "fiber": "0",
                    "monounsaturated_fat": "1.787",
                    "fat": "4.65",
                    "cholesterol": "186",
                    "sugar": "0.49",
                    "serving_url": "https://foods.fatsecret.com/calories-nutrition/generic/egg-whole-boiled?portionid=10244&portionamount=1.000",
                    "measurement_description": "medium",
                    "potassium": "55",
                    "sodium": "122",
                    "serving_id": "10244",
                    "vitamin_a": "74",
                    "carbohydrate": "0.49",
                    "saturated_fat": "1.432",
                    "metric_serving_amount": "44.000",
                    "protein": "5.51",
                    "calories": "68",
                    "vitamin_c": "0",
                    "metric_serving_unit": "g",
                    "number_of_units": "1.000",
                    "serving_description": "1 medium",
                    "polyunsaturated_fat": "0.620",
                    "iron": "0.52",
                    "calcium": "22"
                  },
                  {
                    "fat": "3.91",
                    "cholesterol": "156",
                    "monounsaturated_fat": "1.502",
                    "fiber": "0",
                    "measurement_description": "small",
                    "potassium": "47",
                    "serving_url": "https://foods.fatsecret.com/calories-nutrition/generic/egg-whole-boiled?portionid=12126&portionamount=1.000",
                    "sugar": "0.41",
                    "sodium": "103",
                    "carbohydrate": "0.41",
                    "vitamin_a": "62",
                    "serving_id": "12126",
                    "protein": "4.64",
                    "saturated_fat": "1.204",
                    "metric_serving_amount": "37.000",
                    "number_of_units": "1.000",
                    "metric_serving_unit": "g",
                    "vitamin_c": "0",
                    "calories": "57",
                    "polyunsaturated_fat": "0.521",
                    "serving_description": "1 small",
                    "calcium": "18",
                    "iron": "0.44"
                  },
                  {
                    "serving_description": "1 extra large",
                    "polyunsaturated_fat": "0.817",
                    "iron": "0.69",
                    "calcium": "29",
                    "saturated_fat": "1.887",
                    "metric_serving_amount": "58.000",
                    "protein": "7.27",
                    "calories": "89",
                    "vitamin_c": "0",
                    "number_of_units": "1.000",
                    "metric_serving_unit": "g",
                    "sodium": "161",
                    "vitamin_a": "97",
                    "serving_id": "11058",
                    "carbohydrate": "0.65",
                    "fiber": "0",
                    "monounsaturated_fat": "2.355",
                    "cholesterol": "245",
                    "fat": "6.13",
                    "sugar": "0.65",
                    "serving_url": "https://foods.fatsecret.com/calories-nutrition/generic/egg-whole-boiled?portionid=11058&portionamount=1.000",
                    "potassium": "73",
                    "measurement_description": "extra large"
                  }
                ],
                "food_id": "3094",
                "carbs": 1.5,
                "number_of_units": 3,
                "calories": 204,
                "serving_unit": "1 medium",
                "protein": 16.5,
                "fat": 14,
                "food_category": "Hard Boiled Eggs",
                "grams_per_unit": 44,
                "name": "Boiled Egg",
                "serving_id": "10244"
              },
              {
                "number_of_units": 60,
                "carbs": 46.2,
                "food_id": "1204459",
                "servings": [
                  {
                    "serving_id": "derived-1g",
                    "carbohydrate": 0.77,
                    "serving_description": "1 g",
                    "calories": 3.7,
                    "metric_serving_unit": "g",
                    "number_of_units": 1,
                    "measurement_description": "g",
                    "metric_serving_amount": 1,
                    "protein": 0.07,
                    "fat": 0.03
                  },
                  {
                    "measurement_description": "serving",
                    "potassium": "82",
                    "sugar": "0",
                    "serving_url": "https://foods.fatsecret.com/calories-nutrition/harina-pan/arepa",
                    "fat": "1.00",
                    "cholesterol": "0",
                    "fiber": "2.0",
                    "vitamin_d": "0",
                    "carbohydrate": "23.00",
                    "serving_id": "1200892",
                    "sodium": "0",
                    "metric_serving_unit": "g",
                    "number_of_units": "1.000",
                    "added_sugars": "0",
                    "calories": "110",
                    "protein": "2.00",
                    "saturated_fat": "0",
                    "metric_serving_amount": "30.000",
                    "iron": "1.40",
                    "calcium": "0",
                    "serving_description": "1 arepa",
                    "trans_fat": "0"
                  }
                ],
                "calories": 222,
                "serving_unit": "1 g",
                "fat": 1.8,
                "protein": 4.2,
                "grams_per_unit": 1,
                "food_category": "Cornbread",
                "name": "Arepa",
                "serving_id": "derived-1g"
              }
            ]
          },
          "...(2 total)"
        ]
      },
      "...(4 total)"
    ]
  },
  "assignedBy": "0XR4EO8HHzUXHsdhKXa3EK1EoZJ3",
  "source": "one_on_one",
  "programId": "eT62MX3V5O0KKWqU8dQe",
  "startDate": "2026-03-20",
  "endDate": null,
  "createdAt": {
    "__type": "Timestamp",
    "value": "2026-03-21T17:58:39.401Z",
    "_seconds": 1774115919
  },
  "updatedAt": {
    "__type": "Timestamp",
    "value": "2026-03-21T17:58:39.401Z",
    "_seconds": 1774115919
  }
}
```

---

## one_on_one_clients
**8 documents**

### Schema
```
creatorId: string = "QEjugFhBOjdcTfsLC1kQJdak7zP2" | "eIwqct7kL4aWaI68lZJZbny8v2j2" | "bUCvwdPYolPe6i8JuCaY5w2PcB53" | "0XR4EO8HHzUXHsdhKXa3EK1EoZJ3"
clientUserId: string = "ucKeIU6fhuhsxbI8K7hs3IfjNpr1" | "kbUNayqmgSfRnlShtHxoPHQMwOi2" | "b7UKQiRztOSUFRbBOgar3mbC3LJ2" | "XQ9NDAngzAPEIwPMjDAX8e6xYa72" | "0XR4EO8HHzUXHsdhKXa3EK1EoZJ3" | "FVSLSu6zuNRFsozrrAQhHF2hHkv1" | "QEjugFhBOjdcTfsLC1kQJdak7zP2"
clientName: string = "Santiago Riaño" | "Emilio Lobo-Guerrero" | "Juan Jose Rubiano Oviedo" | "Prueba" | "Diego Ramírez" | "Juan Alejandro Palacios" | "Juan Felipe Frieri"
clientEmail: string = "riagnocontent@gmail.com" | "emilioloboguerrero@gmail.com" | "juanjoseroo@gmail.com" | "prueba@gmail.com" | "diegoramirezcf@gmail.com" | "japalacios2803@gmail.com" | "contactojuanfrieri@gmail.com"
createdAt: Timestamp
courseId: array
  [array of string]
  samples: ["ZSo5DKsQmcvsmm3g2R21","Xsh2cd9O5Rz9gNgpKktp","bW2kM05cD01nGm1tXU3R","eT62MX3V5O0KKWqU8dQe","hFhgVWJGpKcfP3w6Mu6Y","XkPmWN1S7CGDwuOCR445"]
updatedAt: Timestamp
```

### Example (doc: 1uCJoc77bgudIAfeSDlt)
```json
{
  "creatorId": "QEjugFhBOjdcTfsLC1kQJdak7zP2",
  "clientUserId": "ucKeIU6fhuhsxbI8K7hs3IfjNpr1",
  "clientName": "Santiago Riaño",
  "clientEmail": "riagnocontent@gmail.com",
  "createdAt": {
    "__type": "Timestamp",
    "value": "2026-02-10T01:14:32.624Z",
    "_seconds": 1770686072
  },
  "courseId": [
    "ZSo5DKsQmcvsmm3g2R21",
    "...(1 total)"
  ],
  "updatedAt": {
    "__type": "Timestamp",
    "value": "2026-02-10T01:14:34.439Z",
    "_seconds": 1770686074
  }
}
```

---

## plans
**4 documents**

### Schema
```
creator_id: string = "bUCvwdPYolPe6i8JuCaY5w2PcB53" | "QEjugFhBOjdcTfsLC1kQJdak7zP2" | "0XR4EO8HHzUXHsdhKXa3EK1EoZJ3" | "eIwqct7kL4aWaI68lZJZbny8v2j2"
creatorName: string = "Test" | "Juan Felipe Frieri" | "Diego Ramírez" | "Maria Angelica Navas"
title: string = "ensayo plan" | "Plan 12S UxL (H)" | "Prueba plan" | "Plan Ensayo 8 semanas"
description: string = ""
discipline: string = "Fuerza"
updated_at: Timestamp
created_at: Timestamp
```

### Subcollection: plans/{id}/modules
**17 documents**

```
title: string = "Semana 2" | "Semana 4" | "Semana 3" | "Semana 1" | "Semana 5"
order: number = 1 | 3 | 2 | 0 | 4
updated_at: Timestamp
created_at: Timestamp
```

<details><summary>Example</summary>

```json
{
  "title": "Semana 2",
  "order": 1,
  "updated_at": {
    "__type": "Timestamp",
    "value": "2026-03-01T02:57:40.355Z",
    "_seconds": 1772333860
  },
  "created_at": {
    "__type": "Timestamp",
    "value": "2026-03-01T02:57:40.355Z",
    "_seconds": 1772333860
  }
}
```
</details>

### Subcollection: plans/{id}/modules/*/sessions
**54 documents**

```
title: string = "Pierna" | "Push 1" | "Pull" | "UPPER B" | "UPPER A" | "LOWER A" | "LOWER B" | "Prueba push" | "Upper body"
order: number = 5 | 3 | 0 | 1 | 6
image_url: string|null = "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.fireb..." | "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.fireb..." | "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.fireb..." | "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.fireb..." | "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.fireb..." | "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.fireb..."
librarySessionRef: string = "qSPpZVY2eE0f9iOuivgf" | "wSfxWyxtxXK3wsIRzBh7" | "EsFARdr8x0AGHhuYV0kO" | "juHzIyySH4y2Q6DltLJW" | "I6IICaOfW5Rqmuasv8Lr" | "qW8mAuVqSei5M1fsdfOg" | "eOLHDYcbfwOr2rmY5I5C" | "ATyzYJotFpIcW4rpoWyY" | "dAvfP42cbHKWzHyNDlUe" | "dy4vxkPUjxluif2N92sN"
dayIndex: number = 5 | 3 | 0 | 1 | 6
updated_at: Timestamp
created_at: Timestamp
useLocalContent: boolean (9/54) = true
```

<details><summary>Example</summary>

```json
{
  "title": "Pierna",
  "order": 5,
  "image_url": "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.firebasestorage.app/o/creator_media%2FbUCvwdPYolPe6i8JuCaY5w2PcB5...",
  "librarySessionRef": "qSPpZVY2eE0f9iOuivgf",
  "dayIndex": 5,
  "updated_at": {
    "__type": "Timestamp",
    "value": "2026-03-01T02:57:42.901Z",
    "_seconds": 1772333862
  },
  "created_at": {
    "__type": "Timestamp",
    "value": "2026-03-01T02:57:42.901Z",
    "_seconds": 1772333862
  }
}
```
</details>

### Subcollection: plans/{id}/modules/*/sessions/*/exercises
**36 documents**

```
title: string (33/36) = "Bench press" | "Press inclinado con mancuernas" | "Press hombros" | "Remo con barra" | "Ejercicio" | "Jalon ancho" | "Curl de biceps con mancuernas" | "ELEVACIÓN LATERAL CON CABLE" | "EXTENSIÓN DE TRICEPS" | "JALON AL PECHO" | "PULLOVER CON CABLE" | "BAYESIAN CURL" | "APERTURA PLANA EN MAQUINA" | "PRESS INCLINADO CON BARRA" | "JALON A LA CARA" | "CURL DE BICEP CON MANCUERNA" | "PRESS INCLINADO CON MANCUERNAS" | "REMO CON BARRA" | "Prueba bench press"
name: string (33/36) = "Bench press" | "Press inclinado con mancuernas" | "Press hombros" | "Remo con barra" | "Ejercicio" | "Jalon ancho" | "Curl de biceps con mancuernas" | "ELEVACIÓN LATERAL CON CABLE" | "EXTENSIÓN DE TRICEPS" | "JALON AL PECHO" | "PULLOVER CON CABLE" | "BAYESIAN CURL" | "APERTURA PLANA EN MAQUINA" | "PRESS INCLINADO CON BARRA" | "JALON A LA CARA" | "CURL DE BICEP CON MANCUERNA" | "PRESS INCLINADO CON MANCUERNAS" | "REMO CON BARRA" | "Prueba bench press"
order: number = 0 | 1 | 3 | 2 | 4 | 5 | 6
created_at: Timestamp
measures: array
  [array of string]
  samples: ["weight","reps","custom_mn0lu6l0_sd74"]
updated_at: Timestamp
defaultSetValues: object (12/36)
  {
    custom_mltio9jd_fvgv: string (3/12) = ""
    reps: string = "10-12" | "10" | "8-10" | "8-12"
    intensity: string = "8/10" | "10/10" | "4/10"
    custom_mm42i92v_ch9f: null (2/12)
    custom_mlqwv6bj_nn8a: string (2/12) = ""
  }
alternatives: object
  {
    8k3qVl2OXuuKsg7EURqE: array (3/36)
      [array of string]
      samples: ["Press inclinado con mancuernas"]
  }
customMeasureLabels: object
  {
    custom_mn0lu6l0_sd74: string (2/36) = "Percepción RPE"
  }
objectives: array
  [array of string]
  samples: ["intensity","reps","custom_mltio9jd_fvgv","previous","custom_mm42i92v_ch9f","custom_mlqwv6bj_nn8a"]
customObjectiveLabels: object
  {
    custom_mltio9jd_fvgv: string (3/36) = "tiempo de descanso"
    custom_mm42i92v_ch9f: string (2/36) = "buñuelos"
    custom_mlqwv6bj_nn8a: string (13/36) = "Descanso"
  }
primary: object
  {
    8k3qVl2OXuuKsg7EURqE: string (21/36) = "Bench press" | "Press inclinado con mancuernas" | "Sentadilla" | "Press hombros" | "Remo con barra" | "Jalon ancho" | "Curl de biceps con mancuernas"
    OkoQHnBCSebXbhMhQRw6: string (13/36) = "ELEVACIÓN LATERAL CON CABLE" | "EXTENSIÓN DE TRICEPS" | "JALON AL PECHO" | "PULLOVER CON CABLE" | "BAYESIAN CURL" | "APERTURA PLANA EN MAQUINA" | "PRESS INCLINADO CON BARRA" | "JALON A LA CARA" | "CURL DE BICEP CON MANCUERNA" | "REMO CON BARRA"
    ftX6UgCfhh43wWaLDvfo: string (2/36) = "Prueba bench press"
  }
```

<details><summary>Example</summary>

```json
{
  "title": "Bench press",
  "name": "Bench press",
  "order": 0,
  "created_at": {
    "__type": "Timestamp",
    "value": "2026-03-01T02:57:50.237Z",
    "_seconds": 1772333870
  },
  "measures": [
    "weight",
    "...(2 total)"
  ],
  "updated_at": {
    "__type": "Timestamp",
    "value": "2026-03-01T02:57:50.396Z",
    "_seconds": 1772333870
  },
  "defaultSetValues": {
    "custom_mltio9jd_fvgv": "",
    "reps": "10-12",
    "intensity": "8/10"
  },
  "alternatives": {
    "8k3qVl2OXuuKsg7EURqE": [
      "Press inclinado con mancuernas",
      "...(1 total)"
    ]
  },
  "customMeasureLabels": {},
  "objectives": [
    "intensity",
    "...(4 total)"
  ],
  "customObjectiveLabels": {
    "custom_mltio9jd_fvgv": "tiempo de descanso"
  },
  "primary": {
    "8k3qVl2OXuuKsg7EURqE": "Bench press"
  }
}
```
</details>

### Subcollection: plans/{id}/modules/*/sessions/*/exercises/*/sets
**111 documents**

```
title: string = "Serie 3" | "Serie 2" | "Serie 1" | "Serie 4" | "Serie 5"
order: number = 2 | 1 | 0 | 3 | 4
created_at: Timestamp
intensity: string (93/111) = "8/10" | "10/10" | "9/10" | "4/10" | "6/10"
reps: string (93/111) = "10-12" | "10" | "9" | "12" | "8-10" | "8" | "6-8" | "8-12" | "3-5" | "6-10"
updated_at: Timestamp
custom_mm42i92v_ch9f: null (6/111)
custom_mlqwv6bj_nn8a: string (6/111) = "90s"
```

<details><summary>Example</summary>

```json
{
  "title": "Serie 3",
  "order": 2,
  "created_at": {
    "__type": "Timestamp",
    "value": "2026-03-01T02:57:51.274Z",
    "_seconds": 1772333871
  },
  "intensity": "8/10",
  "reps": "10-12",
  "updated_at": {
    "__type": "Timestamp",
    "value": "2026-03-01T02:57:51.521Z",
    "_seconds": 1772333871
  }
}
```
</details>

### Example (doc: 4O2cw0wiVd1yzpiYM5UG)
```json
{
  "creator_id": "bUCvwdPYolPe6i8JuCaY5w2PcB53",
  "creatorName": "Test",
  "title": "ensayo plan",
  "description": "",
  "discipline": "Fuerza",
  "updated_at": {
    "__type": "Timestamp",
    "value": "2026-02-19T13:50:56.799Z",
    "_seconds": 1771509056
  },
  "created_at": {
    "__type": "Timestamp",
    "value": "2026-02-19T13:50:56.799Z",
    "_seconds": 1771509056
  }
}
```

---

## rate_limit_first_party
**68 documents**

### Schema
```
expires_at: number (25+ unique)
count: number (25+ unique)
```

### Example (doc: user_bUCvwdPYolPe6i8JuCaY5w2PcB53_29562559)
```json
{
  "expires_at": 29562561,
  "count": 1
}
```

---

## rate_limit_windows
**1 documents**

### Schema
```
expires_at: number = 29562582
count: number = 1
```

### Example (doc: UzdjL2lCrBE0vg2sOcck_29562580)
```json
{
  "expires_at": 29562582,
  "count": 1
}
```

---

## users
**41 documents**

### Schema
```
provider: string = "google" | "email"
displayName: string (20+ unique)
email: string (20+ unique)
created_at: Timestamp
country: string (38/41) = "CO" | "colombia"
gender: string (38/41) = "male" | "Masculino" | "female"
city: string (38/41) = "Pereira" | "Bogotá" | "Villavicencio" | "Medellín" | "Cúcuta" | "Manizales" | "Cartagena" | "Neiva" | "Cali" | "Envigado" | "Barranquilla"
profileCompleted: boolean (38/41) = true
bodyweight: number|null (38/41) (20+ unique)
birthDate: string|Timestamp (38/41) (20+ unique)
generalTutorials: object (38/41)
  { mainScreen: boolean, library: boolean, profile: boolean, community: boolean }
age: number (38/41) (17+ unique)
height: number|null (38/41) (19+ unique)
username: string (38/41) (20+ unique)
onboardingData: object (37/41)
  primaryGoal: string = "performance" | "fat_loss" | "muscle"
  trainingExperience: string = "over_3yrs" | "beginner" | "less_1yr" | "1_3yrs"
  trainingDaysPerWeek: string|number = "6+" | 5 | 4 | 3
  sessionDuration: string = "60_90" | "45_60"
  equipment: string = "full_gym" | "bodyweight" | "mixed"
  nutritionGoal: string = "cut" | "maintain" | "bulk" | "unsure"
  dietaryRestrictions: array of string (samples: ["none"])
  sleepHours: string = "7_8" | "under_6" | "6_7" | "over_8"
  stressLevel: string = "medium" | "high" | "low"
  completedAt: string (ISO date)
  motivation: array of string (optional)
  interests: array of string (optional)
  activityLevel: string (optional)
  workoutPreference: string (optional)
  obstacles: string (optional)
onboardingCompleted: boolean (38/41) = true | false
role: string (19/41) = "creator" | "user" | "admin"
profilePictureUrl: string (8/41) = "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.fireb..." | "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.fireb..." | "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.fireb..." | "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.fireb..." | "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.fireb..." | "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.fireb..." | "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.fireb..." | "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.fireb..."
profilePictureUpdatedAt: Timestamp (8/41)
profilePicturePath: string (8/41) = "profiles/0XR4EO8HHzUXHsdhKXa3EK1EoZJ3/profile.jpg" | "profiles/QEjugFhBOjdcTfsLC1kQJdak7zP2/profile.jpg" | "profiles/XQ9NDAngzAPEIwPMjDAX8e6xYa72/profile.jpg" | "profiles/bUCvwdPYolPe6i8JuCaY5w2PcB53/profile.jpg" | "profiles/eIwqct7kL4aWaI68lZJZbny8v2j2/profile.jpg" | "profiles/gUHpFB8qmbgCEbWw1u96927u7JE3/profile.jpg" | "profiles/wX7RQWnhj8hIBZwuVn5WrBw0z7J3/profile.jpg" | "profiles/yMqKOXBcVARa6vjU7wImf3Tp85J2/profile.jpg"
cards: object (7/41)  ← dynamic keys: card title → Storage URL
webOnboardingData: object (7/41)
  { completedAt: string (ISO date) }
webOnboardingCompleted: boolean (7/41) = true
webOnboardingCompletedAt: Timestamp (7/41)
photoURL: string (30/41) (20+ unique)
lastLoginAt: Timestamp
activityStreak: object (7/41)
phoneNumber: string (30/41) (20+ unique)
pinnedTrainingCourseId: null|string (2/41) = "352ruaYiQ4Sa6oXz1HOO"
purchased_courses: array (8/41)
name: string (2/41) = "Juan Felipe Frieri" | "Simón Orduz"
weightUnit: string (2/41) = "kg"
weight: number|string (2/41) = 70 | "71"
goalWeight: number (1/41) = 70
updated_at: Timestamp (1/41)

courses: object (13/41)  ← map of courseId → enrollment entry
  [courseId]: object
    access_duration: string = "one_on_one" | "yearly" | "monthly"
    expires_at: string (ISO date)
    status: string = "active"
    purchased_at: string (ISO date)
    deliveryType: string = "one_on_one" | "low_ticket"
    assigned_by: string (userId, optional — one_on_one only)
    assigned_at: string (ISO date, optional — one_on_one only)
    title: string
    image_url: string|null
    discipline: string
    creatorName: string
    completedTutorials: object { dailyWorkout: array, warmup: array, workoutExecution: array, workoutCompletion: array }
    update_status: string = "ready" (optional)
    downloaded_version: string (optional)
    lastUpdated: number (timestamp ms, optional)
    last_version_check: Timestamp (optional)
```

### Example (doc: bUCvwdPYolPe6i8JuCaY5w2PcB53)
```json
{
  "email": "test@gmail.com",
  "created_at": {
    "__type": "Timestamp",
    "value": "2025-10-13T16:04:10.885Z",
    "_seconds": 1760371450
  },
  "gender": "male",
  "profileCompleted": true,
  "birthDate": "2000-03-21",
  "age": 25,
  "phoneNumber": "573123333333",
  "generalTutorials": {
    "library": true
  },
  "onboardingData": {
    "motivation": [
      "Ganar músculo o fuerza",
      "Perder peso o grasa corporal"
    ],
    "interests": [
      "Movilidad o bienestar general"
    ],
    "activityLevel": "Tengo una rutina moderadamente activa",
    "workoutPreference": "Depende del día, me gusta variar",
    "...": "2 more"
  },
  "onboardingCompleted": true,
  "profilePicturePath": "profiles/bUCvwdPYolPe6i8JuCaY5w2PcB53/profile.jpg",
  "webOnboardingData": {
    "completedAt": "2025-11-28T03:44:33.106Z"
  },
  "webOnboardingCompleted": true,
  "webOnboardingCompletedAt": {
    "__type": "Timestamp",
    "value": "2025-11-28T03:44:33.209Z",
    "_seconds": 1764301473
  },
  "cards": {
    "Primera historia": "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.firebasestorage.app/o/car...",
    "Prueba": "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.firebasestorage.app/o/car..."
  },
  "purchased_courses": [
    "NJ1EEO8wryjFBpMmahcE",
    "352ruaYiQ4Sa6oXz1HOO"
  ],
  "free_trial_history": {
    "NJ1EEO8wryjFBpMmahcE": {
      "consumed": true,
      "last_started_at": "2025-12-01T21:56:58.840Z",
      "last_expires_at": "2025-12-08T21:56:58.840Z"
    }
  },
  "username": "test",
  "courses": {
    "352ruaYiQ4Sa6oXz1HOO": {
      "completedTutorials": {
        "workoutCompletion": [],
        "dailyWorkout": [
          "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.firebasestorage.app/o/courses%2F352ruaYiQ4Sa6oXz1HOO%2Ftutorials%2FdailyWorkout%2Fvideo_1764537824734.MOV?alt=media&token=942691a3-e66b-4ae0-a774-86b4a3f19b4f"
        ],
        "warmup": [],
        "workoutExecution": []
      },
      "discipline": "Fuerza - hipertrofia",
      "purchased_at": "2026-01-25T20:00:46.821Z",
      "title": "BOOST X JFF",
      "image_url": "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.firebasestorage.app/o/courses%2F352ruaYiQ4Sa6...",
      "creatorName": "Juan Felipe Frieri",
      "access_duration": "monthly",
      "expires_at": "2026-02-24T20:00:46.820Z",
      "status": "active"
    },
    "...": "(1 total enrollments)"
  },
  "provider": "email",
  "role": "admin",
  "oneRepMaxEstimates": {
    "lX4MkL2xCwel2lE944KD_Curl de bíceps barra EZ": {
      "current": 114.8,
      "lastUpdated": "2025-10-17T22:21:44.949Z"
    },
    "lX4MkL2xCwel2lE944KD_Jalón ancho de hombros": {
      "current": 172.3,
      "lastUpdated": "2025-10-18T14:50:35.538Z"
    },
    "lX4MkL2xCwel2lE944KD_Bíceps banco inclinado": {
      "current": 15.3,
      "lastUpdated": "2025-10-18T21:35:02.319Z"
    },
    "lX4MkL2xCwel2lE944KD_Jalón neutro - unilateral": {
      "current": 147.7,
      "lastUpdated": "2025-10-21T14:47:08.267Z"
    },
    "...": "28 more"
  },
  "weeklyMuscleVolume": {
    "2025-W42": {
      "pecs": 1,
      "forearms": 0.8,
      "hamstrings": 5,
      "glutes": 0.5,
      "calves": 0.8,
      "traps": 0.7,
      "triceps": 3.1999999999999997,
      "front_delts": 2.5,
      "side_delts": 1,
      "lats": 6,
      "rear_delts": 2.1999999999999997,
      "rhomboids": 4.3,
      "biceps": 8
    },
    "2025-W39": {
      "pecs": 50
    },
    "2025-W38": {
      "pecs": 80
    },
    "2025-W40": {
      "pecs": 80
    },
    "...": "10 more"
  },
  "courseProgress": {
    "352ruaYiQ4Sa6oXz1HOO": {
      "lastSessionCompleted": "x6PboYYZy7VTJYLvBatw",
      "totalSessionsCompleted": 26,
      "allSessionsCompleted": [
        "QqXOoybzWP7E1znnxSPK",
        "pB6OOi7wgcCbONMKykLI",
        "60gQHlrvg6m2Ux6nSfCH",
        "3mUp0nuPaga3UwtULhNM",
        "gPkcAbIXlkXbfqX5hEkx",
        "PY9RXVeA4GxADM9iuCRt",
        "TlFCiybgnylJAjdip6HF",
        "lwmO4Rn4mwLqOlHBS1Wk",
        "SlvF6MUM48uzukntwi4h",
        "AVcSfbhmlGO6FH4DpnJb",
        "GaEdmcsPZj75Bp3kEH8H",
        "4cOW6eMN8ncjYbjZ4LqY",
        "6H0S8ZLGn9tf8rWfUKbq",
        "ur6L8Snw7CDjwUtXWHag",
        "5fqTeqaG33aNJpnZLwxw",
        "x6PboYYZy7VTJYLvBatw",
        "gMIFUh1KuXj0Lw0BZifx",
        "lcIYGyFhLurr3nXhoCeZ"
      ],
      "lastActivity": {
        "__type": "Timestamp",
        "value": "2026-02-04T13:13:51.965Z",
        "_seconds": 1770210831
      },
      "weeklyStreak": {
        "sessionsCompletedThisWeek": 2,
        "weekStart": "2026-W05",
        "lastWorkoutDate": "2026-02-04T13:13:54.106Z",
        "currentStreak": 2
      }
    }
  },
  "bodyweight": 70,
  "weightUnit": "kg",
  "country": "CO",
  "city": "Medellín",
  "displayName": "Test API User",
  "weight": 70,
  "height": 175,
  "goalWeight": 70,
  "profilePictureUrl": "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.firebasestorage.app/o/profiles%2FbUCvwdPYolPe...",
  "profilePictureUpdatedAt": {
    "__type": "Timestamp",
    "value": "2026-03-18T16:28:51.233Z",
    "_seconds": 1773851331
  },
  "updated_at": {
    "__type": "Timestamp",
    "value": "2026-03-18T16:30:16.657Z",
    "_seconds": 1773851416
  },
  "lastLoginAt": {
    "__type": "Timestamp",
    "value": "2026-03-19T15:05:31.202Z",
    "_seconds": 1773932731
  }
}
```

---

### Subcollection: users/{id}/bodyLog
**8 documents**

```
date: string = "2026-03-21" | "2026-03-14" | "2026-03-15" | "2026-02-12" | "2026-02-26" | "2026-03-05" | "2026-03-12" | "2026-03-18"
weight: number = 69.7 | 71.4 | 72.9 | 72.2 | 70.3 | 70.1 | 71.3 | 65.8
updatedAt: Timestamp
photos: array (3/8)
  [array of object]
  item {
    id: string = "front_1773487810302" | "front_1773618823930" | "front_1773346543985"
    angle: string = "front"
    storageUrl: string = "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.fireb..." | "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.fireb..." | "https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.fireb..."
    storagePath: string = "progress_photos/XQ9NDAngzAPEIwPMjDAX8e6xYa72/2026-03-14/fron..." | "progress_photos/XQ9NDAngzAPEIwPMjDAX8e6xYa72/2026-03-15/fron..." | "progress_photos/bUCvwdPYolPe6i8JuCaY5w2PcB53/2026-03-12/fron..."
  }
```

<details><summary>Example</summary>

```json
{
  "date": "2026-03-21",
  "weight": 69.7,
  "updatedAt": {
    "__type": "Timestamp",
    "value": "2026-03-21T18:09:44.542Z",
    "_seconds": 1774116584
  }
}
```
</details>

### Subcollection: users/{id}/diary
**80 documents**

```
userId: string = "0XR4EO8HHzUXHsdhKXa3EK1EoZJ3" | "XQ9NDAngzAPEIwPMjDAX8e6xYa72"
date: string (16+ unique)
meal: string = "breakfast" | "dinner" | "lunch" | "snack"
food_id: string (20+ unique)
serving_id: string (20+ unique)
number_of_units: number = 3 | 60 | 1 | 6 | 400 | 50 | 2 | 200
name: string (20+ unique)
food_category: null|string = "Cornbread" | "Pancakes" | "Hard Boiled Eggs" | "Chicken" | "Avocados" | "Pasta" | "Rice" | "Mexican Cheese" | "ensayo" | "Ground Beef" | "Ham" | "Swiss Cheese" | "White Bread"
calories: number (20+ unique)
protein: number (20+ unique)
carbs: number (20+ unique)
fat: number (20+ unique)
serving_unit: string (16+ unique)
grams_per_unit: number|null = 240 | 1 | 105 | 44 | 113 | 37 | 28.35 | 21 | 221 | 27 | 131 | 18 | 28
servings: array
  [array of object]
  item {
    serving_id: string (20+ unique)
    serving_description: string (20+ unique)
    calories: number|string (20+ unique)
    protein: number|string (20+ unique)
    carbohydrate: number|string (20+ unique)
    fat: number|string (20+ unique)
    metric_serving_amount: number|string|null (197/198) (20+ unique)
    metric_serving_unit: string (195/198) = "g" | "ml"
    serving_url: string (117/198) (20+ unique)
    number_of_units: string|number (178/198) = "1.000" | "100.0" | 1 | "0.500"
    measurement_description: string (178/198) (20+ unique)
    saturated_fat: string (118/198) (20+ unique)
    polyunsaturated_fat: string (82/198) (20+ unique)
    monounsaturated_fat: string (82/198) (20+ unique)
    trans_fat: string (32/198) = "0" | "0.500"
    cholesterol: string (117/198) (20+ unique)
    sodium: string (118/198) (20+ unique)
    potassium: string (108/198) (20+ unique)
    fiber: string (118/198) = "0" | "2.0" | "1.0" | "9.0" | "2.5" | "1.4" | "1.3" | "3.0" | "3.2" | "0.4" | "0.6" | "0.7" | "2.3" | "2.9"
    sugar: string (114/198) (20+ unique)
    vitamin_d: string (25/198) = "0"
    iron: string (101/198) (20+ unique)
    added_sugars: string (19/198) = "0" | "10.00" | "1.00"
    calcium: string (101/198) (20+ unique)
    vitamin_a: string (79/198) = "84" | "74" | "75" | "3" | "14" | "0" | "24" | "8" | "26" | "35" | "83" | "10" | "5"
    vitamin_c: string (79/198) = "0" | "0.0" | "0.1" | "0.2" | "17.7" | "2.1" | "1.0" | "1.3" | "0.3" | "0.6"
  }
createdAt: Timestamp
```

<details><summary>Example</summary>

```json
{
  "userId": "0XR4EO8HHzUXHsdhKXa3EK1EoZJ3",
  "date": "2026-03-21",
  "meal": "breakfast",
  "food_id": "5146506",
  "serving_id": "5007293",
  "number_of_units": 3,
  "name": "Juicy Juice Mango",
  "food_category": null,
  "calories": 360,
  "protein": 0,
  "carbs": 87,
  "fat": 0,
  "serving_unit": "8 fl oz",
  "grams_per_unit": 240,
  "servings": [
    {
      "serving_id": "derived-1g",
      "serving_description": "1 g",
      "calories": 0.5,
      "protein": 0,
      "carbohydrate": 0.12,
      "fat": 0,
      "metric_serving_amount": 1,
      "metric_serving_unit": "g"
    },
    "...(3 total)"
  ],
  "createdAt": {
    "__type": "Timestamp",
    "value": "2026-03-21T18:08:54.951Z",
    "_seconds": 1774116534
  }
}
```
</details>

### Subcollection: users/{id}/exerciseHistory
**246 documents**

```
sessions: array
  [array of object]
  item {
    date: string (20+ unique)
    sessionId: string (20+ unique)
    sets: array
      [array of object]
      item {
        reps: string (20+ unique)
        weight: string (20+ unique)
        intensity: string (743/749) = "4/10" | "6/10" | "9/10" | "8/10" | "7/10" | "10/10" | "RPE 8" | "RPE 9"
        id: string (739/749) (20+ unique)
        title: string (739/749) = "Serie 1" | "Serie 2" | "Serie 3" | "Serie 4" | ""
        order: number|string (739/749) = 0 | 1 | 2 | 3 | ""
        previous: string (71/749) = ""
      }
  }
```

<details><summary>Example</summary>

```json
{
  "sessions": [
    {
      "date": "2026-03-21T18:06:03.255Z",
      "sessionId": "0XR4EO8HHzUXHsdhKXa3EK1EoZJ3_2026-03-21_ATyzYJotFpIcW4rpoWyY",
      "sets": [
        {
          "reps": "8",
          "weight": "85",
          "intensity": "4/10",
          "id": "R0V5os5RZkJFydA7ADWz",
          "title": "Serie 1",
          "order": 0
        },
        "...(4 total)"
      ]
    },
    "...(2 total)"
  ]
}
```
</details>

### Subcollection: users/{id}/exerciseLastPerformance
**72 documents**

```
exerciseId: string (20+ unique)
exerciseName: string (20+ unique)
libraryId: string = "ftX6UgCfhh43wWaLDvfo" | "OkoQHnBCSebXbhMhQRw6" | "8k3qVl2OXuuKsg7EURqE" | "lib-001"
lastSessionId: string (20+ unique)
lastPerformedAt: string (20+ unique)
totalSets: number = 4 | 3 | 2 | 1
bestSet: object
  {
    reps: string = "5" | "15" | "10" | "12" | "8" | "7" | "" | "6" | "11" | "1" | "40"
    weight: string (20+ unique)
    intensity: string (71/72) = "9/10" | "8/10" | "7/10" | "RPE 9"
    id: string (70/72) (20+ unique)
    title: string (70/72) = "Serie 4" | "Serie 1" | "Serie 2" | "Serie 3"
    order: number (70/72) = 3 | 0 | 1 | 2
  }
```

<details><summary>Example</summary>

```json
{
  "exerciseId": "NaffxLMnDGWUXwifs0Eq",
  "exerciseName": "Prueba bench press",
  "libraryId": "ftX6UgCfhh43wWaLDvfo",
  "lastSessionId": "0XR4EO8HHzUXHsdhKXa3EK1EoZJ3_2026-03-21_ATyzYJotFpIcW4rpoWyY",
  "lastPerformedAt": "2026-03-21T18:06:03.255Z",
  "totalSets": 4,
  "bestSet": {
    "reps": "5",
    "weight": "115",
    "intensity": "9/10",
    "id": "7onyeqr1VpZzbRobeMt7",
    "title": "Serie 4",
    "order": 3
  }
}
```
</details>

### Subcollection: users/{id}/oneRepMaxHistory
**0 documents**

### Subcollection: users/{id}/readiness
**84 documents**

```
userId: string (20+ unique)
date: string (20+ unique)
energy: number = 3 | 10 | 6 | 8 | 9 | 7 | 4 | 5
soreness: number = 8 | 1 | 7 | 2 | 3 | 6 | 5 | 4 | 10 | 9
sleep: number = 3 | 8 | 1 | 6 | 7 | 9 | 10 | 5 | 4
completedAt: Timestamp
```

<details><summary>Example</summary>

```json
{
  "userId": "0XR4EO8HHzUXHsdhKXa3EK1EoZJ3",
  "date": "2026-03-20",
  "energy": 3,
  "soreness": 8,
  "sleep": 3,
  "completedAt": {
    "__type": "Timestamp",
    "value": "2026-03-21T00:35:56.208Z",
    "_seconds": 1774053356
  }
}
```
</details>

### Subcollection: users/{id}/sessionHistory
**110 documents**

```
sessionId: string (format: "{userId}_{date}_{sessionDocId}" or legacy Firestore ID)
courseId: string
couseName: string
sessionName: string
completedAt: string (ISO date)
duration: number (seconds)
userNotes: string (optional)
exercises: object  <- dynamic keys: "{libraryId}_{exerciseName}"
  [key]: object
    exerciseName: string
    sets: array of object
      reps: string, weight: string, intensity: string, id: string, title: string, order: number
planned: object (optional)
  exercises: array of object
    id: string, title: string, name: string, primary: object, sets: array of object
      reps: string, intensity: string
completionDocId: string (optional)
readinessId: string (optional)
weekLabel: string (optional)
startedAt: string (optional)
moduleId: string (optional)
sessionDocId: string (optional)
```

<details><summary>Example</summary>

```json
{
  "sessionId": "0XR4EO8HHzUXHsdhKXa3EK1EoZJ3_2026-03-21_ATyzYJotFpIcW4rpoWyY",
  "courseId": "eT62MX3V5O0KKWqU8dQe",
  "courseName": "Prueba uno a uno",
  "sessionName": "Prueba push",
  "completedAt": "2026-03-21T18:06:03.255Z",
  "duration": 0,
  "userNotes": "",
  "exercises": {
    "ftX6UgCfhh43wWaLDvfo_Prueba bench press": {
      "exerciseName": "Prueba bench press",
      "sets": [
        {
          "reps": "8",
          "weight": "85",
          "intensity": "4/10",
          "id": "R0V5os5RZkJFydA7ADWz",
          "title": "Serie 1",
          "order": 0
        },
        "...(4 total)"
      ]
    }
  },
  "planned": {
    "exercises": [
      {
        "id": "NaffxLMnDGWUXwifs0Eq",
        "title": "Prueba bench press",
        "name": "Prueba bench press",
        "primary": {
          "ftX6UgCfhh43wWaLDvfo": "Prueba bench press"
        },
        "sets": [
          {
            "reps": "8-12",
            "intensity": "4/10"
          },
          {
            "reps": "6-10",
            "intensity": "6/10"
          },
          {
            "reps": "3-5",
            "intensity": "9/10"
          },
          {
            "reps": "3-5",
            "intensity": "9/10"
          }
        ]
      },
      "...(1 total)"
    ]
  }
}
```
</details>

### Subcollection: users/{id}/meals
**1 documents**

```
name: string = "Prueba comida"
items: array
  [array of object]
  item {
    food_id: string = "1641"
    serving_id: string = "4833"
    number_of_units: number = 1
    name: string = "Chicken Breast"
    food_category: null
    calories: number = 55
    protein: number = 8.4
    carbs: number = 0
    fat: number = 2.2
    serving_unit: string = "1 oz boneless, cooked"
    grams_per_unit: number = 28.35
    servings: array
      [array of object]
      item {
        serving_id: string = "derived-1g" | "5034" | "4833"
        serving_description: string = "1 g" | "1/2 small (yield after cooking, bone removed)" | "1 oz boneless, cooked"
        calories: number|string = 2 | "164" | "55"
        protein: number|string = 0.3 | "24.82" | "8.38"
        carbohydrate: number|string = 0 | "0"
        fat: number|string = 0.08 | "6.48" | "2.19"
        metric_serving_amount: number|string = 1 | "84.000" | "28.350"
        metric_serving_unit: string = "g"
        serving_url: string (2/3) = "https://foods.fatsecret.com/calories-nutrition/generic/chick..." | "https://foods.fatsecret.com/calories-nutrition/generic/chick..."
        number_of_units: string (2/3) = "0.500" | "1.000"
        measurement_description: string (2/3) = "small breast (yield after cooking, bone removed)" | "oz, boneless, cooked"
        saturated_fat: string (2/3) = "1.824" | "0.616"
        polyunsaturated_fat: string (2/3) = "1.383" | "0.467"
        monounsaturated_fat: string (2/3) = "2.524" | "0.852"
        cholesterol: string (2/3) = "70" | "24"
        sodium: string (2/3) = "330" | "111"
        potassium: string (2/3) = "204" | "69"
        fiber: string (2/3) = "0"
        sugar: string (2/3) = "0"
        vitamin_a: string (2/3) = "24" | "8"
        vitamin_c: string (2/3) = "0"
        calcium: string (2/3) = "12" | "4"
        iron: string (2/3) = "0.89" | "0.30"
      }
  }
createdAt: Timestamp
updatedAt: Timestamp
```

<details><summary>Example</summary>

```json
{
  "name": "Prueba comida",
  "items": [
    {
      "food_id": "1641",
      "serving_id": "4833",
      "number_of_units": 1,
      "name": "Chicken Breast",
      "food_category": null,
      "calories": 55,
      "protein": 8.4,
      "carbs": 0,
      "fat": 2.2,
      "serving_unit": "1 oz boneless, cooked",
      "grams_per_unit": 28.35,
      "servings": [
        {
          "serving_id": "derived-1g",
          "serving_description": "1 g",
          "calories": 2,
          "protein": 0.3,
          "carbohydrate": 0,
          "fat": 0.08,
          "metric_serving_amount": 1,
          "metric_serving_unit": "g"
        },
        "...(10 total)"
      ]
    },
    "...(1 total)"
  ],
  "createdAt": {
    "__type": "Timestamp",
    "value": "2026-02-27T23:15:20.482Z",
    "_seconds": 1772234120
  },
  "updatedAt": {
    "__type": "Timestamp",
    "value": "2026-02-27T23:15:20.482Z",
    "_seconds": 1772234120
  }
}
```
</details>

### Subcollection: users/{id}/saved_foods
**3 documents**

```
userId: string = "XQ9NDAngzAPEIwPMjDAX8e6xYa72"
food_id: string = "2100" | "3094" | "custom-1772227319901-w8ptgrfpd4i"
name: string = "Tuna" | "Boiled Egg" | "Prueba"
food_category: null|string = "ensayo"
serving_id: string = "derived-1g" | "0"
serving_description: string = "1 g" | "1 porción"
number_of_units: number = 1 | 100
calories_per_unit: number = 1.1 | 1.5 | 50
protein_per_unit: number = 0.23 | 0.13 | 50
carbs_per_unit: null|number = 0.01 | 10
fat_per_unit: number = 0.01 | 0.11 | 9
grams_per_unit: number|null = 1
servings: array
  [array of object]
  item {
    serving_id: string = "derived-1g" | "6667" | "7495" | "0"
    serving_description: string = "1 g" | "1 oz boneless" | "1 serving (57 g)" | "1 porción"
    calories: number|string = 1.1 | "31" | "62" | 1.5 | 50
    protein: number|string = 0.23 | "6.63" | "13.33" | 0.13 | 50
    carbohydrate: number|string = 0 | "0" | 0.01 | 10
    fat: number|string = 0.01 | "0.27" | "0.54" | 0.11 | 9
    metric_serving_amount: number|string|null = 1 | "28.350" | "57.000"
    metric_serving_unit: string (4/5) = "g"
    serving_url: string (2/5) = "https://foods.fatsecret.com/calories-nutrition/generic/tuna-..." | "https://foods.fatsecret.com/calories-nutrition/generic/tuna-..."
    number_of_units: string (2/5) = "1.000"
    measurement_description: string (2/5) = "oz, boneless, raw" | "serving (57g)"
    saturated_fat: string (2/5) = "0.067" | "0.134"
    polyunsaturated_fat: string (2/5) = "0.081" | "0.162"
    monounsaturated_fat: string (2/5) = "0.044" | "0.088"
    cholesterol: string (2/5) = "13" | "26"
    sodium: string (2/5) = "10" | "21"
    potassium: string (2/5) = "126" | "253"
    fiber: string (2/5) = "0"
    sugar: string (2/5) = "0"
    vitamin_a: string (2/5) = "5" | "10"
    vitamin_c: string (2/5) = "0.3" | "0.6"
    calcium: string (2/5) = "5" | "9"
    iron: string (2/5) = "0.21" | "0.42"
  }
savedAt: Timestamp
```

<details><summary>Example</summary>

```json
{
  "userId": "XQ9NDAngzAPEIwPMjDAX8e6xYa72",
  "food_id": "2100",
  "name": "Tuna",
  "food_category": null,
  "serving_id": "derived-1g",
  "serving_description": "1 g",
  "number_of_units": 1,
  "calories_per_unit": 1.1,
  "protein_per_unit": 0.23,
  "carbs_per_unit": null,
  "fat_per_unit": 0.01,
  "grams_per_unit": 1,
  "servings": [
    {
      "serving_id": "derived-1g",
      "serving_description": "1 g",
      "calories": 1.1,
      "protein": 0.23,
      "carbohydrate": 0,
      "fat": 0.01,
      "metric_serving_amount": 1,
      "metric_serving_unit": "g"
    },
    "...(4 total)"
  ],
  "savedAt": {
    "__type": "Timestamp",
    "value": "2026-02-23T14:19:47.205Z",
    "_seconds": 1771856387
  }
}
```
</details>

### Subcollection: users/{id}/subscriptions
**30 documents**

```
subscription_id: string (29/30) (20+ unique)
course_id: string (29/30) = "352ruaYiQ4Sa6oXz1HOO" | "NJ1EEO8wryjFBpMmahcE"
management_url: string (27/30) (20+ unique)
payer_email: string (29/30) = "emilioloboguerrero@gmail.com" | "e.lobog2@uniandes.edu.co" | "test@gmail.com" | "emilioloboguerrero@icloud.com" | "julianmontesps4@gmail.com" | "alg@alg.com" | "david.parrap95@gmail.com" | "Simonangel2002@gmail.com"
user_id: string (29/30) = "bUCvwdPYolPe6i8JuCaY5w2PcB53"
course_title: string (29/30) = "BOOST X JFF" | "Prueba JFF"
transaction_amount: number|null = 130000 | 2000
created_at: Timestamp (29/30)
currency_id: string|null = "COP"
next_billing_date: string|Timestamp (20+ unique)
status: string = "pending" | "cancelled" | "active"
reason: string (27/30) = "BOOST X JFF" | "Prueba JFF"
updated_at: Timestamp
last_action: string (27/30) = "updated"
cancelled_at: Timestamp (12/30)
iap_product_id: string (3/30) = "wake.monthly.subscription"
type: string (3/30) = "iap"
iap_transaction_id: string (3/30) = "2000001089725711" | "2000001089690016" | "2000001089712768"
expires_at: Timestamp (3/30)
iap_original_transaction_id: string (3/30) = "2000001089671617" | "2000001089690016" | "2000001089710509"
renewal_date: Timestamp (3/30)
purchase_date: Timestamp (3/30)
```

<details><summary>Example</summary>

```json
{
  "subscription_id": "00f6a929a80448d18f92aa1eb67627d9",
  "course_id": "352ruaYiQ4Sa6oXz1HOO",
  "management_url": "https://www.mercadopago.com.co/subscriptions/management?preapproval_id=00f6a929a80448d18f92aa1eb6762...",
  "payer_email": "emilioloboguerrero@gmail.com",
  "user_id": "bUCvwdPYolPe6i8JuCaY5w2PcB53",
  "course_title": "BOOST X JFF",
  "transaction_amount": 130000,
  "created_at": {
    "__type": "Timestamp",
    "value": "2026-01-22T22:49:57.771Z",
    "_seconds": 1769122197
  },
  "currency_id": "COP",
  "next_billing_date": "2026-01-22T18:49:57.000-04:00",
  "status": "pending",
  "reason": "BOOST X JFF",
  "updated_at": {
    "__type": "Timestamp",
    "value": "2026-01-22T22:51:32.537Z",
    "_seconds": 1769122292
  },
  "last_action": "updated"
}
```
</details>

---

## processed_payments
**0 documents** (collection exists per CLAUDE.md but no documents found in export)

> Used for MercadoPago webhook idempotency. Each document ID is a payment ID, ensuring webhooks are not processed twice.

### Expected Schema (from codebase)
```
paymentId: string (document ID)
— fields TBD when first payment is processed
```

---

## subscription_cancellation_feedback
**0 documents** (collection exists per CLAUDE.md but no documents found in export)

> Stores user feedback when they cancel a subscription.

### Expected Schema (from codebase)
```
— fields TBD when first cancellation feedback is submitted
```

---
