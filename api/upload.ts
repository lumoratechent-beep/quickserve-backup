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
    // Check if token exists
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
      console.error('BLOB_READ_WRITE_TOKEN is not set');
      return response.status(500).json({ 
        error: 'Server configuration error: Blob token not found' 
      });
    }

    // Parse the incoming form data
    const form = new IncomingForm();
    const [fields, files] = await form.parse(request);
    
    // Get the uploaded file
    const file = Array.isArray(files.file) ? files.file[0] : files.file;
    if (!file) {
      return response.status(400).json({ error: 'No file uploaded' });
    }

    // Get filename from form or generate one
    const filenameField = Array.isArray(fields.filename) ? fields.filename[0] : fields.filename;
    const filename = filenameField || `${Date.now()}-${file.originalFilename}`;

    // Read file buffer
    const fileBuffer = fs.readFileSync(file.filepath);

    console.log('Uploading file:', filename, 'size:', fileBuffer.length);

    // Upload to Vercel Blob with PUBLIC access
    const blob = await put(filename, fileBuffer, {
      access: 'public',  // Using PUBLIC access for your new public blob
      token: token,
      addRandomSuffix: true, // Avoid filename conflicts
    });

    console.log('Upload successful:', blob.url);

    // Return the blob info
    return response.status(200).json({
      url: blob.url,
      pathname: blob.pathname,
      size: blob.size,
      uploadedAt: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('Upload error:', error);
    
    // Return detailed error for debugging
    return response.status(500).json({ 
      error: `Upload failed: ${error.message || 'Unknown error'}`,
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    });
  }
}
