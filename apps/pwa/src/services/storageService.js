// Firebase Storage service for Wake
import { storage } from '../config/firebase';
import { ref, getDownloadURL } from 'firebase/storage';

class StorageService {
  async getDownloadURL(filePath) {
    const storageRef = ref(storage, filePath);
    return await getDownloadURL(storageRef);
  }
}

export default new StorageService();
