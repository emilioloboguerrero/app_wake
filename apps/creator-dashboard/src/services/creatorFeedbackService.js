import apiClient from '../utils/apiClient';

export async function uploadFeedbackImage(_creatorId, file, _onProgress = null) {
  const result = await apiClient.post('/creator/feedback/upload-url', {
    filename: file.name,
    contentType: file.type,
  });
  const { uploadUrl, storagePath } = result.data;
  await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type },
  });
  return storagePath;
}

export async function submitCreatorFeedback({
  _creatorId,
  _type,
  _text,
  _imageFile = null,
  _creatorEmail = null,
  _creatorDisplayName = null,
  _onImageProgress = null,
}) {
  let storagePath = null;
  if (_imageFile) {
    storagePath = await uploadFeedbackImage(_creatorId, _imageFile, _onImageProgress);
  }
  const result = await apiClient.post('/creator/feedback', {
    type: _type,
    text: _text,
    ...(storagePath ? { storagePath } : {}),
    ...(_creatorEmail ? { creatorEmail: _creatorEmail } : {}),
    ...(_creatorDisplayName ? { creatorDisplayName: _creatorDisplayName } : {}),
  });
  return result?.data?.feedbackId;
}
