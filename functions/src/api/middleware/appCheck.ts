import type {Request} from "express";
import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import {WakeApiServerError} from "../errors.js";

// M-14: shared App Check enforcement. Used by both validateAuth's Firebase
// branch and the parallelized validateAuthAndRateLimit Firebase branch.
//   - emulator: skipped by default. Set APP_CHECK_IN_EMULATOR=true in
//     `dev:prod` to exercise the real verifier against PWA-minted tokens.
//   - missing token: 401 unless APP_CHECK_ENFORCE=false (escape hatch for
//     synthetic test runners; default behavior matches Gen1).
//   - present + invalid token: always 401, regardless of any flag — this is
//     the silent-pass bug the audit specifically called out.
//
// Lives in its own module so unit tests in appCheck.test.ts can import
// without dragging in firestore.ts's `admin.firestore()` side effect.
export interface EnforceAppCheckOptions {
  enforceMissing: boolean;
  enforceInEmulator: boolean;
  verifier: (token: string) => Promise<unknown>;
  warn: (msg: string, data: Record<string, unknown>) => void;
}

const DEFAULT_APP_CHECK_VERIFIER: EnforceAppCheckOptions["verifier"] =
  (token) => admin.appCheck().verifyToken(token);
const DEFAULT_LOGGER_WARN: EnforceAppCheckOptions["warn"] =
  (msg, data) => functions.logger.warn(msg, data);

// F-MW-01: APP_CHECK_ENFORCE=false used to be a global escape hatch — set
// the env var on a deployed function and every request without an App
// Check token sailed through. After this fix the flag is honoured ONLY
// when running in the Functions emulator (FUNCTIONS_EMULATOR=true), so a
// production deploy with the flag flipped no longer downgrades enforcement.
function appCheckOptionsFromEnv(): Pick<EnforceAppCheckOptions, "enforceMissing" | "enforceInEmulator"> {
  const isEmulator = process.env.FUNCTIONS_EMULATOR === "true";
  const flagAllowed = isEmulator && process.env.APP_CHECK_ENFORCE === "false";
  return {
    enforceMissing: !flagAllowed,
    enforceInEmulator: process.env.APP_CHECK_IN_EMULATOR === "true",
  };
}

export async function enforceAppCheck(
  req: Pick<Request, "headers">,
  uid: string,
  isEmulator: boolean,
  optionsOverride?: Partial<EnforceAppCheckOptions>
): Promise<void> {
  const opts: EnforceAppCheckOptions = {
    ...appCheckOptionsFromEnv(),
    verifier: DEFAULT_APP_CHECK_VERIFIER,
    warn: DEFAULT_LOGGER_WARN,
    ...optionsOverride,
  };
  if (isEmulator && !opts.enforceInEmulator) return;
  const appCheckToken = req.headers["x-firebase-appcheck"] as string | undefined;
  if (!appCheckToken) {
    if (!opts.enforceMissing) {
      opts.warn("appCheck:missing-token-allowed-by-flag", {uid});
      return;
    }
    throw new WakeApiServerError(
      "UNAUTHENTICATED",
      401,
      "App Check token requerido"
    );
  }
  try {
    await opts.verifier(appCheckToken);
  } catch (err) {
    opts.warn("appCheck:verify-failed", {uid, error: String(err)});
    throw new WakeApiServerError(
      "UNAUTHENTICATED",
      401,
      "App Check token inválido o expirado"
    );
  }
}
