import {defineConfig} from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    testTimeout: 30_000,
    // Serialize file execution. Multiple test files share a single emulator
    // (Firestore + Auth + Storage + Functions). Running them in parallel
    // causes `clearFs()`/`clearStorage()` in one file to wipe state another
    // file is mid-test against, producing spurious 401/EMAIL_EXISTS/etc.
    // failures. The trade-off is ~2× wall-clock for the full suite.
    fileParallelism: false,
    // Within a file, tests still run sequentially by default — don't change
    // that or beforeEach/clearFs becomes nondeterministic.
    sequence: {
      concurrent: false,
    },
  },
});
