/**
 * print-server.js — LAN Print Proxy for QuickServe
 * 
 * Runs on any device on your local network (PC, laptop, Android via Termux, Raspberry Pi).
 * Receives ESC/POS data from QuickServe via HTTP and forwards it to the printer via raw TCP.
 * 
 * Usage:
 *   node print-server.js
 * 
 * Default port: 3001
 * Set custom port: PORT=3002 node print-server.js
 * 
 * Endpoint:
 *   POST /print
 *   Body: { "ip": "192.168.1.100", "port": 9100, "data": "base64encodedESC/POSbytes" }
 *   Response: { "success": true } or { "success": false, "error": "..." }
 */

const http = require('http');
const net = require('net');

const PORT = parseInt(process.env.PORT || '3001', 10);
const PRINT_TIMEOUT = 15000; // 15 seconds max per print job

/**
 * Decode base64 string to Buffer
 */
function base64ToBuffer(base64) {
  return Buffer.from(base64, 'base64');
}

/**
 * Send raw data to a network printer via TCP on port 9100 (or custom port)
 */
function sendToPrinter(ip, port, dataBuffer) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
        reject(new Error(`Connection timed out after ${PRINT_TIMEOUT / 1000}s`));
      }
    }, PRINT_TIMEOUT);

    socket.connect(port, ip, () => {
      socket.write(dataBuffer, (err) => {
        if (err) {
          clearTimeout(timeout);
          if (!resolved) {
            resolved = true;
            socket.destroy();
            reject(err);
          }
          return;
        }
        // Give printer a moment to process before closing
        setTimeout(() => {
          clearTimeout(timeout);
          if (!resolved) {
            resolved = true;
            socket.end();
            resolve(true);
          }
        }, 500);
      });
    });

    socket.on('error', (err) => {
      clearTimeout(timeout);
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    });

    socket.on('close', () => {
      clearTimeout(timeout);
      if (!resolved) {
        resolved = true;
        resolve(true);
      }
    });
  });
}

/**
 * Create HTTP server
 */
const server = http.createServer((req, res) => {
  // CORS headers — allow any origin since this runs on LAN
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', server: 'print-server', port: PORT }));
    return;
  }

  // Only accept POST /print
  if (req.method !== 'POST' || req.url !== '/print') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'Not found. Use POST /print' }));
    return;
  }

  // Parse JSON body
  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', async () => {
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Invalid JSON' }));
      return;
    }

    const { ip, port, data } = parsed;

    if (!ip || !data) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Missing required fields: ip, data' }));
      return;
    }

    const targetPort = port || 9100;
    const dataBuffer = base64ToBuffer(data);

    console.log(`[Print] Sending ${dataBuffer.length} bytes to ${ip}:${targetPort}...`);

    try {
      await sendToPrinter(ip, targetPort, dataBuffer);
      console.log(`[Print] ✅ Successfully sent to ${ip}:${targetPort}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (err) {
      console.error(`[Print] ❌ Failed to send to ${ip}:${targetPort}:`, err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║       QuickServe LAN Print Proxy            ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  Listening on: http://0.0.0.0:${PORT}            ║`);
  console.log('║  Endpoint:     POST /print                  ║');
  console.log('║  Health:       GET  /health                 ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log('║  Configure in QuickServe:                   ║');
  console.log(`║  Print Server IP: <this-device-ip>:${PORT}     ║`);
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');
});