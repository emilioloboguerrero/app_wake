import {describe, it, expect, vi, beforeAll, beforeEach} from "vitest";

// ─── Fake Storage bucket ────────────────────────────────────────────────────
interface FakeObject { size: number; contentType: string }

const objects = new Map<string, FakeObject>();
const deleted: string[] = [];
const moves: Array<[string, string]> = [];

const fakeBucket = {
  file(path: string) {
    return {
      name: path,
      exists: async () => [objects.has(path)],
      getMetadata: async () => [objects.get(path) ?? {}],
      delete: async () => {
        objects.delete(path);
        deleted.push(path);
      },
      move: async (dest: string) => {
        const obj = objects.get(path);
        objects.delete(path);
        if (obj) objects.set(dest, obj);
        moves.push([path, dest]);
      },
    };
  },
  deleteFiles: async () => undefined,
};

vi.mock("firebase-admin", () => ({
  storage: () => ({bucket: () => fakeBucket}),
}));

vi.mock("../../firestore.js", () => ({
  db: {},
  FieldValue: {serverTimestamp: () => ({_methodName: "serverTimestamp"})},
}));

vi.mock("../../middleware/auth.js", () => ({validateAuth: vi.fn()}));
vi.mock("../../middleware/validate.js", () => ({
  validateBody: vi.fn(),
  pickFields: vi.fn(),
  validateStoragePath: vi.fn(),
}));
vi.mock("../../middleware/rateLimit.js", () => ({
  checkRateLimit: vi.fn(),
  checkIpRateLimit: vi.fn(),
  checkIpDailyRateLimit: vi.fn(),
}));
vi.mock("../../middleware/securityHelpers.js", () => ({
  assertHttpsUrl: vi.fn(),
  assertTextLength: vi.fn(),
  TEXT_CAP_TITLE: 200,
  TEXT_CAP_DESCRIPTION: 2000,
}));
vi.mock("../../services/storageMetadata.js", () => ({applyLongCacheControl: vi.fn()}));
vi.mock("firebase-functions", () => ({
  logger: {info: vi.fn(), warn: vi.fn(), error: vi.fn()},
}));

// tsconfig targets CommonJS, so the module is pulled in from beforeAll rather
// than with a top-level await.
type EventsModule = typeof import("../events.js");
let assertPhotoField: EventsModule["assertPhotoField"];
let resolveAttachments: EventsModule["resolveAttachments"];
let attachToRecord: EventsModule["attachToRecord"];
let isFileValue: EventsModule["isFileValue"];

beforeAll(async () => {
  ({assertPhotoField, resolveAttachments, attachToRecord, isFileValue} =
    await import("../events.js"));
});

const EVENT_ID = "evt1";
const UPLOAD_ID = "3f8a1c2e-4b5d-4e6f-8a9b-0c1d2e3f4a5b";
const PHOTO_EVENT = {
  fields: [
    {id: "f_nombre", type: "text", label: "Nombre"},
    {id: "f_doc", type: "photo", label: "Comprobante", required: true},
  ],
};

function sourcePath(ext = "jpg") {
  return `events/${EVENT_ID}/uploads/${UPLOAD_ID}.${ext}`;
}

beforeEach(() => {
  objects.clear();
  deleted.length = 0;
  moves.length = 0;
});

describe("assertPhotoField", () => {
  it("accepts a field declared as photo", () => {
    expect(() => assertPhotoField(PHOTO_EVENT, "f_doc")).not.toThrow();
  });

  it("rejects a field of another type", () => {
    // The guard that stops the public endpoint from being free storage.
    expect(() => assertPhotoField(PHOTO_EVENT, "f_nombre")).toThrow(/no pide un archivo/i);
  });

  it("rejects a field the event never declared", () => {
    expect(() => assertPhotoField(PHOTO_EVENT, "f_ghost")).toThrow(/no pide un archivo/i);
  });

  it("accepts the fieldId alias used by older event docs", () => {
    const legacy = {fields: [{fieldId: "f_doc", type: "photo"}]};
    expect(() => assertPhotoField(legacy, "f_doc")).not.toThrow();
  });

  it("rejects when the event has no fields at all", () => {
    expect(() => assertPhotoField({}, "f_doc")).toThrow(/no pide un archivo/i);
  });
});

describe("resolveAttachments", () => {
  it("ignores plain text answers", async () => {
    const out = await resolveAttachments(EVENT_ID, PHOTO_EVENT, {
      f_nombre: "Ana Ruiz",
      f_multi: ["a", "b"],
    });
    expect(out).toEqual([]);
  });

  it("rejects an uploadId that is not a uuid", async () => {
    await expect(
      resolveAttachments(EVENT_ID, PHOTO_EVENT, {
        f_doc: {uploadId: "../../secrets/key", contentType: "image/jpeg"},
      })
    ).rejects.toThrow(/inválido/i);
  });

  it("rejects an unsupported contentType", async () => {
    await expect(
      resolveAttachments(EVENT_ID, PHOTO_EVENT, {
        f_doc: {uploadId: UPLOAD_ID, contentType: "application/pdf"},
      })
    ).rejects.toThrow(/Formato no soportado/i);
  });

  it("rejects an attachment on a field that is not a photo field", async () => {
    await expect(
      resolveAttachments(EVENT_ID, PHOTO_EVENT, {
        f_nombre: {uploadId: UPLOAD_ID, contentType: "image/jpeg"},
      })
    ).rejects.toThrow(/no pide un archivo/i);
  });

  it("rejects when nothing was actually uploaded", async () => {
    await expect(
      resolveAttachments(EVENT_ID, PHOTO_EVENT, {
        f_doc: {uploadId: UPLOAD_ID, contentType: "image/jpeg"},
      })
    ).rejects.toThrow(/No encontramos el archivo/i);
  });

  it("deletes and rejects an object over the size cap", async () => {
    objects.set(sourcePath(), {size: 6 * 1024 * 1024, contentType: "image/jpeg"});

    await expect(
      resolveAttachments(EVENT_ID, PHOTO_EVENT, {
        f_doc: {uploadId: UPLOAD_ID, contentType: "image/jpeg"},
      })
    ).rejects.toThrow(/tamaño permitido/i);

    expect(deleted).toEqual([sourcePath()]);
  });

  it("deletes and rejects an object whose real type is not an image", async () => {
    // The signed URL pins a contentType, but trust the bucket, not the client.
    objects.set(sourcePath(), {size: 1024, contentType: "application/zip"});

    await expect(
      resolveAttachments(EVENT_ID, PHOTO_EVENT, {
        f_doc: {uploadId: UPLOAD_ID, contentType: "image/jpeg"},
      })
    ).rejects.toThrow(/tamaño permitido|no es una imagen/i);

    expect(deleted).toEqual([sourcePath()]);
  });

  it("returns metadata read from Storage, not the values the client claimed", async () => {
    objects.set(sourcePath("png"), {size: 4321, contentType: "image/png"});

    const out = await resolveAttachments(EVENT_ID, PHOTO_EVENT, {
      f_doc: {uploadId: UPLOAD_ID, contentType: "image/png"},
    });

    expect(out).toEqual([
      {
        fieldId: "f_doc",
        sourcePath: sourcePath("png"),
        contentType: "image/png",
        size: 4321,
      },
    ]);
  });
});

describe("attachToRecord", () => {
  it("moves the object under the owning record and returns a file value", async () => {
    objects.set(sourcePath(), {size: 4321, contentType: "image/jpeg"});
    const attachments = await resolveAttachments(EVENT_ID, PHOTO_EVENT, {
      f_doc: {uploadId: UPLOAD_ID, contentType: "image/jpeg"},
    });

    const prefix = `events/${EVENT_ID}/registrations/reg9/`;
    const values = await attachToRecord(attachments, prefix);

    expect(moves).toEqual([[sourcePath(), `${prefix}f_doc.jpg`]]);
    expect(values.f_doc).toMatchObject({
      kind: "file",
      storagePath: `${prefix}f_doc.jpg`,
      contentType: "image/jpeg",
      size: 4321,
      review_status: "pending",
    });
  });

  it("is a no-op when there is nothing attached", async () => {
    expect(await attachToRecord([], "events/x/registrations/y/")).toEqual({});
    expect(moves).toEqual([]);
  });
});

describe("isFileValue", () => {
  it("accepts a stored file value", () => {
    expect(isFileValue({kind: "file", storagePath: "events/a/b.jpg", contentType: "image/jpeg"})).toBe(true);
  });

  it("rejects text, arrays, null and half-formed objects", () => {
    expect(isFileValue("Ana")).toBe(false);
    expect(isFileValue(["a"])).toBe(false);
    expect(isFileValue(null)).toBe(false);
    expect(isFileValue({kind: "file"})).toBe(false);
    expect(isFileValue({storagePath: "events/a/b.jpg"})).toBe(false);
  });
});
