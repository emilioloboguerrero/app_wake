import { firestore, storage } from '../config/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';

const FEEDBACK_COLLECTION = 'creator_feedback';
const STORAGE_ROOT = 'creator_feedback_attachments';
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * Upload an image for feedback attachment. Returns the download URL.
 * @param {string} creatorId
 * @param {File} file
 * @param {(percent: number) => void} [onProgress]
 * @returns {Promise<string>}
 */
export async function uploadFeedbackImage(creatorId, file, onProgress = null) {
  if (!file || !file.type.startsWith('image/')) {
    throw new Error('El archivo debe ser una imagen');
  }
  if (file.size > MAX_IMAGE_SIZE) {
    throw new Error('La imagen no puede superar 5MB');
  }
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
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
  return downloadURL;
}

/**
 * Submit creator feedback (suggestion or bug report).
 * @param {Object} params
 * @param {string} params.creatorId - Firebase Auth UID
 * @param {string} params.type - 'bug' | 'suggestion'
 * @param {string} params.text - Required description
 * @param {File} [params.imageFile] - Optional image attachment
 * @param {string} [params.creatorEmail] - Optional, for admin display
 * @param {string} [params.creatorDisplayName] - Optional, for admin display
 * @param {(percent: number) => void} [params.onImageProgress] - Optional progress for image upload
 * @returns {Promise<{ id: string }>}
 */
export async function submitCreatorFeedback({
  creatorId,
  type,
  text,
  imageFile = null,
  creatorEmail = null,
  creatorDisplayName = null,
  onImageProgress = null,
}) {
  if (!creatorId || !type || !text?.trim()) {
    throw new Error('Faltan datos obligatorios (creatorId, type, text)');
  }
  if (type !== 'bug' && type !== 'suggestion') {
    throw new Error('type debe ser "bug" o "suggestion"');
  }

  let imageUrl = null;
  if (imageFile) {
    imageUrl = await uploadFeedbackImage(creatorId, imageFile, onImageProgress);
  }

  const feedbackRef = collection(firestore, FEEDBACK_COLLECTION);
  const docRef = await addDoc(feedbackRef, {
    creatorId,
    type,
    text: text.trim(),
    imageUrl: imageUrl || null,
    creatorEmail: creatorEmail || null,
    creatorDisplayName: creatorDisplayName || null,
    createdAt: serverTimestamp(),
  });

  return { id: docRef.id };
}
