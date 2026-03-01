const SUPABASE_URL = 'https://jvcbodpwqinjilxyotzm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp2Y2JvZHB3cWluamlseHlvdHptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0MDE5NzEsImV4cCI6MjA4Nzk3Nzk3MX0.8wo53XdSpzGQgcT86a5HFtZjLtLA8Crc0yA5ePvpRV0';

let supabaseClient = null;

export async function getSupabase() {
  if (supabaseClient) return supabaseClient;

  // Dynamic import from CDN
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return supabaseClient;
}
