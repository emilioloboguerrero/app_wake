// Unit tests for enforceAppCheck (M-14). Covers all five branches without
// touching firebase-admin or firebase-functions — the helper accepts a
// verifier + warn-logger via options, so tests inject fakes.
import {describe, it, expect, vi} from "vitest";
import {enforceAppCheck} from "./appCheck.js";
import {WakeApiServerError} from "../errors.js";

interface FakeReq {
  headers: Record<string, string | undefined>;
}

const okVerifier = vi.fn(async () => ({}));
const failingVerifier = vi.fn(async () => {
  throw new Error("token expired");
});

function makeWarn() {
  return vi.fn();
}

describe("enforceAppCheck (M-14)", () => {
  it("skips entirely in the emulator by default", async () => {
    const req: FakeReq = {headers: {}};
    const verifier = vi.fn(async () => ({}));
    const warn = makeWarn();
    await enforceAppCheck(req, "uid1", true, {
      enforceMissing: true,
      enforceInEmulator: false,
      verifier,
      warn,
    });
    expect(verifier).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it("verifies in the emulator when APP_CHECK_IN_EMULATOR opt-in is set", async () => {
    const req: FakeReq = {headers: {"x-firebase-appcheck": "real-token"}};
    const verifier = vi.fn(async () => ({}));
    await enforceAppCheck(req, "uid1", true, {
      enforceMissing: true,
      enforceInEmulator: true,
      verifier,
      warn: makeWarn(),
    });
    expect(verifier).toHaveBeenCalledWith("real-token");
  });

  it("throws 401 when the token is missing and enforcement is on", async () => {
    const req: FakeReq = {headers: {}};
    await expect(
      enforceAppCheck(req, "uid1", false, {
        enforceMissing: true,
        enforceInEmulator: false,
        verifier: okVerifier,
        warn: makeWarn(),
      })
    ).rejects.toThrowError(WakeApiServerError);
  });

  it("warns + passes when token is missing and enforceMissing=false", async () => {
    const req: FakeReq = {headers: {}};
    const warn = makeWarn();
    const verifier = vi.fn(async () => ({}));
    await enforceAppCheck(req, "uid1", false, {
      enforceMissing: false,
      enforceInEmulator: false,
      verifier,
      warn,
    });
    expect(verifier).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      "appCheck:missing-token-allowed-by-flag",
      expect.objectContaining({uid: "uid1"})
    );
  });

  it("throws 401 when token is present but verifier rejects (regardless of enforceMissing)", async () => {
    const req: FakeReq = {headers: {"x-firebase-appcheck": "stale-token"}};
    const warn = makeWarn();
    await expect(
      enforceAppCheck(req, "uid1", false, {
        enforceMissing: false, // even with the escape hatch on …
        enforceInEmulator: false,
        verifier: failingVerifier,
        warn,
      })
    ).rejects.toThrowError(WakeApiServerError);
    expect(warn).toHaveBeenCalledWith(
      "appCheck:verify-failed",
      expect.objectContaining({uid: "uid1"})
    );
  });

  it("passes silently when token is present and verifier resolves", async () => {
    const req: FakeReq = {headers: {"x-firebase-appcheck": "good-token"}};
    const verifier = vi.fn(async () => ({}));
    const warn = makeWarn();
    await enforceAppCheck(req, "uid1", false, {
      enforceMissing: true,
      enforceInEmulator: false,
      verifier,
      warn,
    });
    expect(verifier).toHaveBeenCalledWith("good-token");
    expect(warn).not.toHaveBeenCalled();
  });
});
