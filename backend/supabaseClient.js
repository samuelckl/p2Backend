import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) { // Validate supabase url and key
    console.error("Missing Supabase environment variables. Check .env file.");
    process.exit(1); 
}

// Create a single supabase client for the entire server
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);