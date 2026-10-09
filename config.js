const env = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {};

export const SUPABASE_URL = (env.VITE_SUPABASE_URL || "https://zcdyrthoaemymrlrehhg.supabase.co").trim();
export const SUPABASE_ANON_KEY = (env.VITE_SUPABASE_ANON_KEY || "sb_publishable_xRNh4HD6E2kM5-rY2k-cAg_tVCizw6A").trim();