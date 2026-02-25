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
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }

  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
      return response.status(500).json({ error: 'Blob token not found' });
    }

    const form = new IncomingForm();
    const [fields, files] = await form.parse(request);
    
    const file = Array.isArray(files.file) ? files.file[0] : files.file;
    if (!file) {
      return response.status(400).json({ error: 'No file uploaded' });
    }

    const filenameField = Array.isArray(fields.filename) ? fields.filename[0] : fields.filename;
    const filename = filenameField || `${Date.now()}-${file.originalFilename}`;

    const fileBuffer = fs.readFileSync(file.filepath);

    // Try with explicit store URL
    const blob = await put(filename, fileBuffer, {
      access: 'private',
      token: token,
      addRandomSuffix: true,
    });

    return response.status(200).json(blob);
  } catch (error: any) {
    console.error('Upload error:', error);
    
    // Check if it's a token issue
    if (error.message?.includes('token') || error.statusCode === 403) {
      return response.status(500).json({ 
        error: 'Invalid or expired token. Please check your BLOB_READ_WRITE_TOKEN in Vercel environment variables.' 
      });
    }
    
    return response.status(500).json({ 
      error: `Upload failed: ${error.message || 'Unknown error'}` 
    });
  }
}
