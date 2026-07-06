// Test/QA accounts and courses excluded from creator-facing analytics.
//
// These are the accounts Emilio/Felipe use to test the payment flows end to end
// (real Firestore docs, but NOT real revenue: creator self-purchases, QA guests,
// 2000-COP price tests, Polar $4/$21 test charges). Kept as an explicit,
// reversible denylist rather than deleting prod payment data. Testing from any
// of these accounts (or on a test course) is automatically excluded going
// forward — the pattern for keeping the dashboard honest.
//
// Audited 2026-07-06 via scratchpad/payments-audit.js. Add new test accounts
// here as they appear; never hard-delete the underlying payment docs.

export const TEST_USER_IDS = new Set<string>([
  "bUCvwdPYolPe6i8JuCaY5w2PcB53", // test@gmail.com (test creator + BOOST/NJ1 test subs)
  "EaulLBwn79Pgn7e8RAgN6umeygU2", // emilioloboguerrero@gmail.com
  "oXKlavb5RtSOzooC3K4k4FHPlMi1", // emilioprieva@gmail.com (Polar $4 test)
  "XQ9NDAngzAPEIwPMjDAX8e6xYa72", // prueba@gmail.com
  "TI5dkYVwemUru8yRzi2lctLemO43", // coachmaleardila@hotmail.com (Método 2000 test)
  "Yh4qyL4JN6db4diMDUmVlwK7p6k2", // coachmaleardila.1@gmail.com
  "yMqKOXBcVARa6vjU7wImf3Tp85J2", // fbejaranofit@gmail.com (creator self-test, Polar $21)
  "OBJj1ip3iEOu0q53iLW46g11wdN2", // wake.qa.guest.jul05@gmail.com
  "wX7RQWnhj8hIBZwuVn5WrBw0z7J3", // lusuarezpi2007@gmail.com (Método 2000 test)
  "Iv9LRuqDcXN5t1DkRmpkgji2bC32", // sebastianlunaperdomo@gmail.com (Método 2000 test)
]);

// Courses that only exist for testing (not sold). Excluded wholesale.
export const TEST_COURSE_IDS = new Set<string>([
  "80DynSiQ7txL8tWbeGx1", // "general prueba"
  "bW2kM05cD01nGm1tXU3R", // "Prueba asesorías"
  "eT62MX3V5O0KKWqU8dQe", // "Prueba uno a uno"
  "uJk6jPTbdzn0UOIpDSQf", // "prueba general subscripcion"
  "NJ1EEO8wryjFBpMmahcE", // unnamed test course
]);

// True when a money object (ledger row / subscription) is a test and must be
// excluded from creator analytics. Accepts unknown so callers can pass raw
// Firestore fields without casting.
export function isTestSale(userId: unknown, courseId: unknown): boolean {
  if (typeof userId === "string" && TEST_USER_IDS.has(userId)) return true;
  if (typeof courseId === "string" && TEST_COURSE_IDS.has(courseId)) return true;
  return false;
}
