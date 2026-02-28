import express from 'express';
import { createServer as createViteServer } from 'vite';
import { put } from '@vercel/blob';
import multer from 'multer';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  const supabaseUrl = 'https://anknjpuiklglykguneax.supabase.co';
  const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFua25qcHVpa2xnbHlrZ3VuZWF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5ODkwNTAsImV4cCI6MjA4NzU2NTA1MH0.DUMHeKg0v-1oI9nLT-nZP9cg1eYPI0R4fRNBzE9K2MI';
  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  // Configure Multer for memory storage
  const upload = multer({ storage: multer.memoryStorage() });

  // API Routes
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.post('/api/login', async (req, res) => {
    console.log('Login attempt for:', req.body?.username);
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, username, role, restaurant_id, is_active, email, phone, password')
        .eq('username', username)
        .eq('password', password)
        .single();

      if (error || !data) {
        console.log('Login failed for:', username);
        return res.status(401).json({ error: 'Invalid username or password' });
      }

      if (data.is_active === false) {
        console.log('Account deactivated for:', username);
        return res.status(403).json({ error: 'Account deactivated' });
      }

      // Map to camelCase to match frontend User interface
      const userResponse = {
        id: data.id,
        username: data.username,
        role: data.role,
        restaurantId: data.restaurant_id,
        isActive: data.is_active,
        email: data.email,
        phone: data.phone
      };
      
      console.log('Login successful for:', username);
      res.json(userResponse);
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/orders/report', async (req, res) => {
    const { restaurantId, startDate, endDate, status, search, page = 1, limit = 30, locationName, timezoneOffsetMinutes } = req.query;
    
    const start = (Number(page) - 1) * Number(limit);
    const end = start + Number(limit) - 1;
    
    // Get timezone offset from client (in minutes). If not provided, assume UTC (0)
    const tzOffset = timezoneOffsetMinutes ? Number(timezoneOffsetMinutes) : 0;

    try {
      let query = supabase.from('orders').select('*', { count: 'exact' });

      if (restaurantId && restaurantId !== 'ALL') query = query.eq('restaurant_id', restaurantId);
      if (locationName && locationName !== 'ALL') query = query.eq('location_name', locationName);
      if (status && status !== 'ALL') query = query.eq('status', status);
      
      if (startDate) {
        // startDate is in format "YYYY-MM-DD" representing local midnight
        // Convert to UTC by accounting for timezone offset
        const startD = new Date(startDate as string);
        startD.setHours(0, 0, 0, 0);
        // The date string is interpreted as UTC, but we need to convert it to the UTC that represents
        // the start of that day in the client's timezone. 
        // For a client at UTC+8 selecting "2026-03-01":
        // - They want: 2026-03-01 00:00:00+08 which is 2026-02-28 16:00:00 UTC
        // - We have: 2026-03-01 00:00:00 (from the string, interpreted as UTC)
        // - We need to subtract 8 hours (the offset) to get the correct UTC time
        const startTimestamp = startD.getTime() - (tzOffset * 60000);
        query = query.gte('timestamp', startTimestamp);
      }
      if (endDate) {
        // endDate is in format "YYYY-MM-DD" representing local midnight
        // For a client at UTC+8 selecting "2026-03-01":
        // - They want: 2026-03-02 00:00:00+08 (end of 2026-03-01) which is 2026-03-01 16:00:00 UTC
        // - So we set to 23:59:59 of the selected date and adjust for timezone
        const endD = new Date(endDate as string);
        endD.setHours(23, 59, 59, 999);
        const endTimestamp = endD.getTime() - (tzOffset * 60000);
        query = query.lte('timestamp', endTimestamp);
      }
      
      if (search) query = query.ilike('id', `%${search}%`);

      const { data, error, count } = await query
        .order('timestamp', { ascending: false })
        .range(start, end);

      if (error) throw error;

      // Summary query - we need total revenue and efficiency for the SAME filters
      let summaryQuery = supabase.from('orders').select('total, status');
      if (restaurantId && restaurantId !== 'ALL') summaryQuery = summaryQuery.eq('restaurant_id', restaurantId);
      if (locationName && locationName !== 'ALL') summaryQuery = summaryQuery.eq('location_name', locationName);
      if (status && status !== 'ALL') summaryQuery = summaryQuery.eq('status', status);
      
      if (startDate) {
        const startD = new Date(startDate as string);
        startD.setHours(0, 0, 0, 0);
        const startTimestamp = startD.getTime() - (tzOffset * 60000);
        summaryQuery = summaryQuery.gte('timestamp', startTimestamp);
      }
      if (endDate) {
        const endD = new Date(endDate as string);
        endD.setHours(23, 59, 59, 999);
        const endTimestamp = endD.getTime() - (tzOffset * 60000);
        summaryQuery = summaryQuery.lte('timestamp', endTimestamp);
      }
      
      if (search) summaryQuery = summaryQuery.ilike('id', `%${search}%`);

      const { data: summaryData, error: summaryError } = await summaryQuery;
      if (summaryError) throw summaryError;

      const totalRevenue = summaryData
        .filter(o => o.status === 'COMPLETED')
        .reduce((acc, o) => acc + Number(o.total || 0), 0);
      
      const orderVolume = summaryData.length;
      const completedCount = summaryData.filter(o => o.status === 'COMPLETED').length;
      const efficiency = orderVolume > 0 ? Math.round((completedCount / orderVolume) * 100) : 0;

      res.json({
        orders: data.map(o => ({
          id: o.id,
          items: typeof o.items === 'string' ? JSON.parse(o.items) : o.items,
          total: Number(o.total || 0),
          status: o.status,
          timestamp: Number(o.timestamp),
          customerId: o.customer_id,
          restaurantId: o.restaurant_id,
          tableNumber: o.table_number,
          locationName: o.location_name,
          remark: o.remark,
          rejectionReason: o.rejection_reason,
          rejectionNote: o.rejection_note
        })),
        summary: {
          totalRevenue,
          orderVolume,
          efficiency
        },
        totalCount: count || 0
      });
    } catch (error) {
      console.error('Report error:', error);
      res.status(500).json({ error: 'Failed to fetch report' });
    }
  });

  app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const filename = req.body.filename || `${Date.now()}-${req.file.originalname}`;
      
      // Upload to Vercel Blob
      // Note: BLOB_READ_WRITE_TOKEN must be set in environment variables
      const blob = await put(filename, req.file.buffer, {
        access: 'public',
      });

      res.json(blob);
    } catch (error) {
      console.error('Upload error:', error);
      res.status(500).json({ error: 'Upload failed' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve('dist/index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
