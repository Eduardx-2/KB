import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase opcional (lectura directa de tickets/members, según el CONTRATO).
 * Si las env vars no están configuradas, el resto de la app sigue funcionando
 * con el store local (ver `lib/store.ts`) para poder demostrar sin depender de nadie más.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const HAS_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (!HAS_SUPABASE) return null;
  if (!client) {
    client = createClient(SUPABASE_URL as string, SUPABASE_ANON_KEY as string);
  }
  return client;
}
