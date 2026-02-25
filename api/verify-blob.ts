import type { VercelRequest, VercelResponse } from '@vercel/node';
import { list } from '@vercel/blob';

export default async function handler(
  request: VercelRequest,
  response: VercelResponse
) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }

  try {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    
    if (!token) {
      return response.status(500).json({
        success: false,
        error: 'No token found',
        env: process.env.NODE_ENV
      });
    }

    // Try to list blobs to verify token works
    const blobs = await list({
      token: token,
      limit: 1
    });

    return response.status(200).json({
      success: true,
      tokenExists: true,
      tokenPrefix: token.substring(0, 15) + '...',
      blobsCount: blobs.blobs.length,
      message: 'Token is valid!'
    });

  } catch (error: any) {
    return response.status(500).json({
      success: false,
      error: error.message,
      tokenExists: !!process.env.BLOB_READ_WRITE_TOKEN,
      tokenPrefix: process.env.BLOB_READ_WRITE_TOKEN ? 
        process.env.BLOB_READ_WRITE_TOKEN.substring(0, 15) + '...' : 'none',
      env: process.env.NODE_ENV
    });
  }
}
