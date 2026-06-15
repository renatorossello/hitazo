import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase para rutas server-side (route handlers / server actions).
 * Usa la service-role key: escribe sin RLS. NUNCA importar esto en componentes
 * cliente — la key no debe llegar al browser.
 */
export function createServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno."
    );
  }
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}
