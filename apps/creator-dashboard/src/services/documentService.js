import apiClient from '../utils/apiClient';

// Cover rendering happens here, in the creator's browser, at upload time.
// Doing it once per document is what keeps the public page cheap: visitors get
// a ~60 KB JPEG instead of pulling the whole PDF down to draw page 1.
const COVER_MAX_WIDTH = 800;
const COVER_QUALITY = 0.82;

if (typeof Promise.withResolvers !== 'function') {
  Promise.withResolvers = function withResolvers() {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  };
}

async function loadPdf(file) {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = (
    await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  ).default;
  const buffer = await file.arrayBuffer();
  return pdfjs.getDocument({ data: buffer }).promise;
}

/** Renders page 1 to a JPEG blob and reports the page count. */
async function renderCover(file) {
  const pdf = await loadPdf(file);
  const page = await pdf.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: COVER_MAX_WIDTH / base.width });

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  await page.render({ canvas, viewport }).promise;

  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', COVER_QUALITY)
  );
  return { blob, pageCount: pdf.numPages };
}

async function putSigned(uploadUrl, body, contentType) {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body,
  });
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);
}

class DocumentService {
  async list() {
    const { data } = await apiClient.get('/creator/documents');
    return data.documents;
  }

  async create({ title, ctaLabel }) {
    const { data } = await apiClient.post('/creator/documents', { title, ctaLabel });
    return data;
  }

  async update(docId, patch) {
    const { data } = await apiClient.patch(`/creator/documents/${docId}`, patch);
    return data;
  }

  async remove(docId) {
    await apiClient.delete(`/creator/documents/${docId}`);
  }

  // Uploads the file and its cover. onProgress reports which stage is running
  // so the UI can say something truthful instead of spinning silently.
  async uploadFile(docId, file, onProgress = () => {}) {
    onProgress('cover');
    let cover = null;
    try {
      cover = await renderCover(file);
    } catch {
      // A PDF pdf.js cannot render still uploads; the public page falls back
      // to rendering it in the visitor's browser.
      cover = null;
    }

    onProgress('file');
    const { data: fileSlot } = await apiClient.post(
      `/creator/documents/${docId}/file/upload-url`,
      { contentType: 'application/pdf', fileName: file.name }
    );
    await putSigned(fileSlot.uploadUrl, file, 'application/pdf');
    await apiClient.post(`/creator/documents/${docId}/file/confirm`, {
      storagePath: fileSlot.storagePath,
      fileName: file.name,
      pageCount: cover?.pageCount ?? null,
    });

    if (cover?.blob) {
      onProgress('cover-upload');
      const { data: coverSlot } = await apiClient.post(
        `/creator/documents/${docId}/cover/upload-url`,
        { contentType: 'image/jpeg' }
      );
      await putSigned(coverSlot.uploadUrl, cover.blob, 'image/jpeg');
      await apiClient.post(`/creator/documents/${docId}/cover/confirm`, {
        storagePath: coverSlot.storagePath,
      });
    }

    onProgress('done');
  }
}

export default new DocumentService();
