/**
 * Compress an image file client-side to stay within Vercel's payload limit.
 * Returns the original file if it's already small enough or not an image.
 */
const compressImage = async (file: File, maxDim = 1200, quality = 0.85, maxBytes = 4 * 1024 * 1024): Promise<File> => {
  if (file.size <= maxBytes || !file.type.startsWith('image/')) return file;

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(file); return; }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob || blob.size >= file.size) { resolve(file); return; }
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.webp'), { type: 'image/webp' }));
        },
        'image/webp',
        quality,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
};

/**
 * Uploads a file to Vercel Blob via our server API and returns the public URL.
 * @param file The file to upload
 * @param _bucket Unused (kept for compatibility)
 * @param path The path prefix for the filename
 */
export const uploadImage = async (file: File, _bucket: string = 'quickserve', path: string = 'uploads'): Promise<string> => {
  const compressed = await compressImage(file);
  const formData = new FormData();
  formData.append('file', compressed);
  formData.append('filename', `${path}/${Date.now()}-${compressed.name}`);

  try {
    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Upload failed');
    }

    return data.url;
  } catch (error) {
    console.error('Upload error:', error);
    throw error;
  }
};
