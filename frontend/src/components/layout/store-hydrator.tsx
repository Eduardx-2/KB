"use client";

import { useEffect } from "react";
import { useAppStore } from "@/lib/store";
import { useAuthStore } from "@/lib/auth-store";
import { fetchWorkspace, HAS_LIVE_BACKEND } from "@/lib/api";

/**
 * Hidrata el store de Zustand y, si hay backend real configurado,
 * reemplaza los datos mock con los del workspace del team activo.
 */
export function StoreHydrator() {
  const teamId = useAuthStore((s) => s.teamId);

  useEffect(() => {
    const finish = () => useAppStore.getState().setHydrated();

    const unsub = useAppStore.persist.onFinishHydration(finish);

    useAppStore.persist.rehydrate();

    const timer = window.setTimeout(finish, 800);

    return () => {
      unsub();
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!HAS_LIVE_BACKEND) return;

    let cancelled = false;
    fetchWorkspace()
      .then(({ members, projects, requirements, tickets, mode }) => {
        if (cancelled) return;
        if (mode === "live") {
          useAppStore.getState().setWorkspace({ members, projects, requirements, tickets });
        }
      })
      .catch(() => {
        // silencioso — el store sigue con sus datos locales
      });

    return () => {
      cancelled = true;
    };
  }, [teamId]);

  return null;
}
