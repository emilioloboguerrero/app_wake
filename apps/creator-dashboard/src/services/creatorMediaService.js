import apiClient from '../utils/apiClient';

export async function listFiles(_creatorId) {
  const result = await apiClient.get('/creator/media');
  return (result?.data ?? []).map((f) => ({ ...f, id: f.fileId }));
}

export async function uploadFile(_creatorId, _file, _onProgress = null) {
  const result = await apiClient.post('/creator/media/upload-url', {
    filename: _file.name,
    contentType: _file.type,
  });
  const { uploadUrl, storagePath } = result.data;
  await fetch(uploadUrl, {
    method: 'PUT',
    body: _file,
    headers: { 'Content-Type': _file.type },
  });
  return { storagePath, fileId: null };
}

export async function deleteFile(_creatorId, _fileId) {
  await apiClient.delete(`/creator/media/${_fileId}`);
}
