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
  // Add CORS headers
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }

  // Only allow POST
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get token from environment
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
      return response.status(500).json({ error: 'Blob token not configured' });
    }

    // Parse form data
    const form = new IncomingForm();
    const [fields, files] = await form.parse(request);
    
    // Get file
    const file = Array.isArray(files.file) ? files.file[0] : files.file;
    if (!file) {
      return response.status(400).json({ error: 'No file uploaded' });
    }

    // Get filename
    const filenameField = Array.isArray(fields.filename) ? fields.filename[0] : fields.filename;
    const filename = filenameField || `${Date.now()}-${file.originalFilename}`;

    // Read file
    const fileBuffer = fs.readFileSync(file.filepath);

    console.log('Uploading to public blob:', filename);

    // Upload to Vercel Blob
    const blob = await put(filename, fileBuffer, {
      access: 'public',
      token: token,
      addRandomSuffix: true,
    });

    console.log('Upload successful:', blob.url);

    // Return just the URL (simplified)
    return response.status(200).json({ 
      url: blob.url 
    });

  } catch (error: any) {
    console.error('Upload error:', error);
    return response.status(500).json({ 
      error: error.message || 'Upload failed' 
    });
  }
}
