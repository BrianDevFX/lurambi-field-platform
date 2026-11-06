import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export function getSupabaseConfigError(): string | null {
  if (!supabaseUrl || !supabaseAnonKey) {
    return 'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to connect this app to Supabase.';
  }
  return null;
}
