// Long-cache metadata for user-uploaded assets (videos, images, audio).
// These objects are content-addressed by storagePath and never overwritten;
// once uploaded, the bytes at a given path don't change. Letting browsers +
// edge proxies cache for a year cuts repeat egress on the bucket meaningfully
// — April 2026 saw ~37 GB / month leaving wolf-20b8b.firebasestorage.app
// without any cache header set.

import type {File as StorageFile} from "@google-cloud/storage";
import * as functions from "firebase-functions";

const ONE_YEAR_IMMUTABLE = "public, max-age=31536000, immutable";

export async function applyLongCacheControl(
  file: StorageFile,
  extraMetadata?: Record<string, string>
): Promise<void> {
  try {
    await file.setMetadata({
      cacheControl: ONE_YEAR_IMMUTABLE,
      ...(extraMetadata ? {metadata: extraMetadata} : {}),
    });
  } catch (err: unknown) {
    // Don't fail the confirm — the upload itself already succeeded.
    // Worst case is the object is served without cache-control.
    functions.logger.warn("applyLongCacheControl: setMetadata failed", {
      path: file.name,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
