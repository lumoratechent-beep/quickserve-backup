import { put } from '@vercel/blob';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { IncomingForm } from 'formidable';
import fs from 'fs';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(
  request: VercelRequest,
  response: VercelResponse
) {
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const form = new IncomingForm();
    const [fields, files] = await form.parse(request);
    
    const file = Array.isArray(files.file) ? files.file[0] : files.file;
    if (!file) {
      return response.status(400).json({ error: 'No file uploaded' });
    }

    const filenameField = Array.isArray(fields.filename) ? fields.filename[0] : fields.filename;
    const filename = filenameField || `${Date.now()}-${file.originalFilename}`;

    const fileBuffer = fs.readFileSync(file.filepath);

    const blob = await put(filename, fileBuffer, {
      access: 'public',
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    return response.status(200).json(blob);
  } catch (error) {
    console.error('Upload error:', error);
    return response.status(500).json({ error: 'Upload failed' });
  }
}
