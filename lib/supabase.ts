
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://thqocawdihcsvtkluddy.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRocW9jYXdkaWhjc3Z0a2x1ZGR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3NDMwODMsImV4cCI6MjA4NjMxOTA4M30.qecVHx2IaW8dOdzHNS3K7d-2hBwvh7EMI9pOP4crMjQ';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
