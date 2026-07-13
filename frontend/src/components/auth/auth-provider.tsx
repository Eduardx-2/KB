"use client";

import { useEffect } from "react";
import { getSupabaseClient, AUTH_DISABLED, HAS_SUPABASE } from "@/lib/supabase";
import { useAuthStore } from "@/lib/auth-store";
import { fetchTeams } from "@/lib/api";

/**
 * Hidrata la sesión de Supabase Auth y sincroniza teams del backend.
 * En modo demo (AUTH_DISABLED) no hace nada.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const hydrateFromSupabase = useAuthStore((s) => s.hydrateFromSupabase);
  const setSession = useAuthStore((s) => s.setSession);
  const setTeams = useAuthStore((s) => s.setTeams);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    void hydrateFromSupabase();
  }, [hydrateFromSupabase]);

  useEffect(() => {
    if (AUTH_DISABLED || !HAS_SUPABASE) return;

    const sb = getSupabaseClient();
    if (!sb) return;

    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, [setSession]);

  useEffect(() => {
    if (AUTH_DISABLED || !user) return;

    let cancelled = false;
    fetchTeams()
      .then((teams) => {
        if (!cancelled && teams.length > 0) setTeams(teams);
      })
      .catch(() => {
        // silencioso
      });

    return () => {
      cancelled = true;
    };
  }, [user, setTeams]);

  return <>{children}</>;
}
