import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase opcional (Auth + lectura directa según el CONTRATO).
 * Si las env vars no están configuradas, la app sigue en modo demo.
 *
 * IMPORTANTE: NEXT_PUBLIC_SUPABASE_ANON_KEY debe ser la clave anon/publishable.
 * Nunca uses service_role en el frontend.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const HAS_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/** Cuando es true, se omite el gate de auth (modo demo / desarrollo local). */
export const AUTH_DISABLED =
  process.env.NEXT_PUBLIC_AUTH_DISABLED === "true" || !HAS_SUPABASE;

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (!HAS_SUPABASE) return null;
  if (!client) {
    client = createClient(SUPABASE_URL as string, SUPABASE_ANON_KEY as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: typeof window !== "undefined" ? window.localStorage : undefined,
      },
    });
  }
  return client;
}

/** JWT de la sesión actual, o null si no hay sesión / auth deshabilitado. */
export async function getAccessToken(): Promise<string | null> {
  if (AUTH_DISABLED) return null;
  const sb = getSupabaseClient();
  if (!sb) return null;
  try {
    const { data } = await sb.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}
