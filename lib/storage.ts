
/**
 * Uploads a file to Vercel Blob via our server API and returns the public URL.
 * @param file The file to upload
 * @param _bucket Unused (kept for compatibility)
 * @param path The path prefix for the filename
 */
export const uploadImage = async (file: File, _bucket: string = 'quickserve', path: string = 'uploads'): Promise<string> => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('filename', `${path}/${Date.now()}-${file.name}`);

  const response = await fetch('/api/upload', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Upload failed');
  }

  const data = await response.json();
  return data.url;
};
