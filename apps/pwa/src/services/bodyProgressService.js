import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  collection,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { firestore, storage } from '../config/firebase';
import logger from '../utils/logger';

async function compressProgressPhoto(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const MAX = 1080;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width >= height) {
          height = Math.round((height * MAX) / width);
          width = MAX;
        } else {
          width = Math.round((width * MAX) / height);
          height = MAX;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      canvas.toBlob(resolve, 'image/jpeg', 0.85);
    };
    img.onerror = reject;
    img.src = objectUrl;
  });
}

class BodyProgressService {
  async saveEntry(userId, dateStr, { weight, note, photos } = {}) {
    const docRef = doc(firestore, 'users', userId, 'bodyLog', dateStr);
    const data = { date: dateStr, updatedAt: serverTimestamp() };
    if (weight !== undefined) data.weight = weight;
    if (note !== undefined) data.note = note;
    if (photos !== undefined) data.photos = photos;
    await setDoc(docRef, data, { merge: true });
  }

  async getEntry(userId, dateStr) {
    const snap = await getDoc(doc(firestore, 'users', userId, 'bodyLog', dateStr));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  }

  async getEntries(userId) {
    const q = query(
      collection(firestore, 'users', userId, 'bodyLog'),
      orderBy('date', 'asc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  async uploadPhoto(userId, dateStr, file, angle, onProgress) {
    const blob = await compressProgressPhoto(file);
    const timestamp = Date.now();
    const storagePath = `progress_photos/${userId}/${dateStr}/${angle}_${timestamp}.jpg`;
    const storageRef = ref(storage, storagePath);
    await new Promise((resolve, reject) => {
      const task = uploadBytesResumable(storageRef, blob, { contentType: 'image/jpeg' });
      task.on(
        'state_changed',
        (snap) => onProgress?.(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
        reject,
        resolve,
      );
    });
    const storageUrl = await getDownloadURL(storageRef);
    return { id: `${angle}_${timestamp}`, angle, storageUrl, storagePath };
  }

  async cleanupPhoto(storagePath) {
    try {
      await deleteObject(ref(storage, storagePath));
    } catch (e) {
      if (e.code !== 'storage/object-not-found') {
        logger.warn('[bodyProgress] cleanup photo failed', e?.message);
      }
    }
  }

  async deleteEntry(userId, dateStr) {
    const entry = await this.getEntry(userId, dateStr);
    if (entry?.photos?.length) {
      await Promise.all(entry.photos.map((p) => this.cleanupPhoto(p.storagePath)));
    }
    await deleteDoc(doc(firestore, 'users', userId, 'bodyLog', dateStr));
  }

  async setGoalWeight(userId, goalWeightKg) {
    await setDoc(doc(firestore, 'users', userId), { goalWeight: goalWeightKg }, { merge: true });
  }
}

export default new BodyProgressService();
