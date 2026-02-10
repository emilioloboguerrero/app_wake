/**
 * Creator Media Service – personal media library (images/videos).
 *
 * DATA STRUCTURE
 * --------------
 * Firestore: creator_media/{creatorId}/files (subcollection)
 *   Each doc: { name, storagePath, url, contentType, size, createdAt }
 *   - name: original filename
 *   - storagePath: full Storage path (creator_media/{creatorId}/{fileId}.{ext})
 *   - url: download URL (stored so listing doesn’t need getDownloadURL per file)
 *   - contentType: image/* or video/*
 *   - size: bytes
 *   - createdAt: serverTimestamp
 *
 * Storage: creator_media/{creatorId}/{timestamp}.{ext}
 *   Single canonical file per upload; entities (programs, sessions) store only
 *   the URL reference, so the same file can be reused without duplication.
 *
 * PERFORMANCE BENEFITS
 * --------------------
 * - One file per asset: reuse the same image on many sessions → 1 Storage object,
 *   N references (no N copies). Saves space and upload time.
 * - List by Firestore: list "my media" with one query (orderBy createdAt),
 *   no Storage listAll; URLs in docs avoid N getDownloadURL calls when rendering.
 * - Assign = write URL only: assigning to a program/session is a single Firestore
 *   update (image_url), no upload.
 */

import { firestore, storage } from '../config/firebase';
import {
  collection,
  getDocs,
  getDoc,
  addDoc,
  deleteDoc,
  doc,
  orderBy,
  query,
  serverTimestamp,
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';

const STORAGE_ROOT = 'creator_media';
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB

function getFilesRef(creatorId) {
  return collection(firestore, 'creator_media', creatorId, 'files');
}

/**
 * @param {string} creatorId
 * @returns {Promise<Array<{ id: string, name: string, url: string, storagePath: string, contentType: string, size: number, createdAt: any }>>}
 */
export async function listFiles(creatorId) {
  if (!creatorId) return [];
  const q = query(getFilesRef(creatorId), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * @param {string} creatorId
 * @param {File} file
 * @param {(percent: number) => void} [onProgress]
 * @returns {Promise<{ id: string, name: string, url: string, storagePath: string, contentType: string, size: number, createdAt: any }>}
 */
export async function uploadFile(creatorId, file, onProgress = null) {
  const isImage = file.type.startsWith('image/');
  const isVideo = file.type.startsWith('video/');
  if (!isImage && !isVideo) {
    throw new Error('Solo se permiten imágenes o videos');
  }
  if (isImage && file.size > MAX_IMAGE_SIZE) {
    throw new Error('La imagen no puede superar 10MB');
  }

  const ext = (file.name.split('.').pop() || (isImage ? 'jpg' : 'mp4')).toLowerCase();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const fileName = `${Date.now()}_${safeName}`;
  const storagePath = `${STORAGE_ROOT}/${creatorId}/${fileName}`;
  const storageRef = ref(storage, storagePath);

  const uploadTask = uploadBytesResumable(storageRef, file);

  const downloadURL = await new Promise((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const pct = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        if (onProgress) onProgress(pct);
      },
      reject,
      async () => {
        try {
          const url = await getDownloadURL(uploadTask.snapshot.ref);
          resolve(url);
        } catch (e) {
          reject(e);
        }
      }
    );
  });

  const fileDoc = {
    name: file.name,
    storagePath,
    url: downloadURL,
    contentType: file.type,
    size: file.size,
    createdAt: serverTimestamp(),
  };
  const docRef = await addDoc(getFilesRef(creatorId), fileDoc);

  return {
    id: docRef.id,
    ...fileDoc,
    createdAt: fileDoc.createdAt,
  };
}

/**
 * @param {string} creatorId
 * @param {string} fileId
 */
export async function deleteFile(creatorId, fileId) {
  const fileDocRef = doc(firestore, 'creator_media', creatorId, 'files', fileId);
  const fileSnap = await getDoc(fileDocRef);
  if (!fileSnap.exists()) return;
  const data = fileSnap.data();
  if (data.storagePath) {
    const storageRef = ref(storage, data.storagePath);
    try {
      await deleteObject(storageRef);
    } catch (e) {
      console.warn('Storage delete failed (file may be missing):', e);
    }
  }
  await deleteDoc(fileDocRef);
}
