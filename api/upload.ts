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

  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }

  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Check if token exists
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      console.error('BLOB_READ_WRITE_TOKEN is not set');
      return response.status(500).json({ 
        error: 'Server configuration error: Blob token not found' 
      });
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

    console.log('Uploading to Vercel Blob...');
    console.log('Filename:', filename);
    console.log('File size:', fileBuffer.length);

    const blob = await put(filename, fileBuffer, {
      access: 'public',
      token: process.env.BLOB_READ_WRITE_TOKEN,
      addRandomSuffix: true, // Add random suffix to avoid conflicts
    });

    console.log('Upload successful:', blob.url);
    return response.status(200).json(blob);
  } catch (error: any) {
    console.error('Upload error details:', {
      message: error.message,
      status: error.status,
      statusCode: error.statusCode,
      name: error.name,
    });
    
    // Return specific error message
    return response.status(500).json({ 
      error: `Upload failed: ${error.message || 'Unknown error'}`,
      details: error.statusCode ? `Status: ${error.statusCode}` : undefined
    });
  }
}
