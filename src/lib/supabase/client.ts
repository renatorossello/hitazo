"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase para el browser (board y player).
 * Usa la anon key. Su único uso en el MVP es Realtime (broadcast + presence)
 * sobre el canal game:{room_code}. El estado de la partida se lee/escribe vía
 * rutas server-side; este cliente no toca tablas directamente.
 */
let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowser(): SupabaseClient {
  if (browserClient) return browserClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY en el entorno."
    );
  }
  browserClient = createClient(url, anonKey, {
    auth: { persistSession: false },
  });
  return browserClient;
}
