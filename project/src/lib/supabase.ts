import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Category } from '../types';

// Static property access is required for Vite AST compile-time replacement
const supabaseUrl: string = 
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SUPABASE_URL) ||
  (typeof process !== 'undefined' && process.env && process.env.VITE_SUPABASE_URL) ||
  '';

const supabaseAnonKey: string = 
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SUPABASE_ANON_KEY) ||
  (typeof process !== 'undefined' && process.env && process.env.VITE_SUPABASE_ANON_KEY) ||
  '';

export const isSupabaseConfigured = Boolean(
  supabaseUrl && 
  supabaseAnonKey && 
  !supabaseUrl.includes('placeholder') &&
  !supabaseAnonKey.includes('placeholder')
);

// Fallback client to prevent application crash if env vars are missing
export const supabase: SupabaseClient = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : createClient('https://mock-supabase.local', 'mock-key-bypass');

export const FETCH_NEWS_URL = isSupabaseConfigured ? `${supabaseUrl}/functions/v1/fetch-news` : '';

/**
 * Valid DB schema category constraint: CHECK (category IN ('Tech', 'Politics', 'Finance', 'Sports'))
 */
export type DbCategory = 'Tech' | 'Politics' | 'Finance' | 'Sports';

export function mapToDbCategory(category?: string | null): DbCategory {
  if (!category) return 'Tech';
  const c = category.toLowerCase().trim();
  if (c.includes('tech') || c.includes('science')) return 'Tech';
  if (c.includes('politic') || c.includes('world') || c.includes('india') || c.includes('general')) return 'Politics';
  if (c.includes('financ') || c.includes('business') || c.includes('market') || c.includes('environment')) return 'Finance';
  if (c.includes('sport')) return 'Sports';
  return 'Tech';
}

export function mapFromDbCategory(dbCat?: string | null): Category {
  if (!dbCat) return 'General';
  if (dbCat === 'Tech') return 'Technology';
  if (dbCat === 'Finance') return 'Business';
  if (dbCat === 'Politics') return 'Politics';
  if (dbCat === 'Sports') return 'Sports';
  return (dbCat as Category) || 'General';
}

/**
 * Check connectivity to Supabase news_articles table
 */
export async function testSupabaseConnection(): Promise<{ connected: boolean; count: number; error?: string }> {
  if (!isSupabaseConfigured) {
    return { connected: false, count: 0, error: 'Supabase credentials not configured in environment' };
  }
  try {
    const { count, error } = await supabase
      .from('news_articles')
      .select('id', { count: 'exact', head: true });

    if (error) {
      return { connected: false, count: 0, error: error.message };
    }
    return { connected: true, count: count ?? 0 };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { connected: false, count: 0, error: msg };
  }
}
