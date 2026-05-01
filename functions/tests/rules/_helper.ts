/**
 * Shared rules-emulator helper for the security audit test suite.
 *
 * Pattern matches functions/tests/rules/crossCreator.test.ts: boot the
 * emulator once per file, clear between tests, expose seed helpers that
 * write with rules disabled.
 *
 * Each test file imports {bootRulesEnv, seedUser, seedCourse, …}.
 */

import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {doc, setDoc} from "firebase/firestore";

export const RULES_PATH = resolve(
  __dirname,
  "../../../config/firebase/firestore.rules"
);

export const STORAGE_RULES_PATH = resolve(
  __dirname,
  "../../../config/firebase/storage.rules"
);

export type Role = "user" | "creator" | "admin";

export async function bootRulesEnv(projectId: string): Promise<RulesTestEnvironment> {
  return initializeTestEnvironment({
    projectId,
    firestore: {
      rules: readFileSync(RULES_PATH, "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
}

export async function bootStorageRulesEnv(projectId: string): Promise<RulesTestEnvironment> {
  return initializeTestEnvironment({
    projectId,
    storage: {
      rules: readFileSync(STORAGE_RULES_PATH, "utf8"),
      host: "127.0.0.1",
      port: 9199,
    },
    firestore: {
      rules: readFileSync(RULES_PATH, "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
}

export async function seedUser(
  env: RulesTestEnvironment,
  userId: string,
  data: Record<string, unknown> = {}
): Promise<void> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `users/${userId}`), {
      role: "user",
      email: `${userId}@example.com`,
      ...data,
    });
  });
}

export async function seedCreator(
  env: RulesTestEnvironment,
  userId: string,
  data: Record<string, unknown> = {}
): Promise<void> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `users/${userId}`), {
      role: "creator",
      email: `${userId}@example.com`,
      ...data,
    });
  });
}

export async function seedAdmin(
  env: RulesTestEnvironment,
  userId: string,
  data: Record<string, unknown> = {}
): Promise<void> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `users/${userId}`), {
      role: "admin",
      email: `${userId}@example.com`,
      ...data,
    });
  });
}

export async function seedCourse(
  env: RulesTestEnvironment,
  courseId: string,
  creatorId: string,
  data: Record<string, unknown> = {}
): Promise<void> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `courses/${courseId}`), {
      creator_id: creatorId,
      title: "Test course",
      status: "published",
      deliveryType: "low_ticket",
      ...data,
    });
  });
}

export async function seedDoc(
  env: RulesTestEnvironment,
  path: string,
  data: Record<string, unknown>
): Promise<void> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data);
  });
}

export {assertFails, assertSucceeds};
