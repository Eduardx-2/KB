"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient, AUTH_DISABLED } from "@/lib/supabase";
import { useAuthStore } from "@/lib/auth-store";

/**
 * Callback de email confirm / magic link.
 * Intercambia el hash/query de Supabase por una sesión y redirige.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const [message, setMessage] = useState("Confirmando…");

  useEffect(() => {
    if (AUTH_DISABLED) {
      router.replace("/");
      return;
    }

    const sb = getSupabaseClient();
    if (!sb) {
      setMessage("Supabase no configurado");
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        // PKCE / code exchange si viene ?code=
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");
        if (code) {
          const { error } = await sb.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }

        const { data, error } = await sb.auth.getSession();
        if (error) throw error;
        if (!cancelled) {
          setSession(data.session);
          setMessage(data.session ? "Sesión confirmada" : "Sin sesión activa");
          router.replace(data.session ? "/onboarding" : "/login");
        }
      } catch (err) {
        if (!cancelled) {
          setMessage(err instanceof Error ? err.message : "Error en callback");
          setTimeout(() => router.replace("/login"), 1500);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, setSession]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[var(--background)]">
      <p className="text-sm text-[var(--muted)]">{message}</p>
    </div>
  );
}
