"use client";

import { useEffect } from "react";
import { useAppStore } from "@/lib/store";
import { fetchWorkspace, HAS_LIVE_BACKEND } from "@/lib/api";

/**
 * Hidrata el store de Zustand y, si hay backend real configurado,
 * reemplaza los miembros mock con los reales de Supabase.
 */
export function StoreHydrator() {
  useEffect(() => {
    const finish = () => useAppStore.getState().setHydrated();

    const unsub = useAppStore.persist.onFinishHydration(finish);

    useAppStore.persist.rehydrate();

    const timer = window.setTimeout(finish, 800);

    // Sincronizar miembros desde backend cuando está disponible
    if (HAS_LIVE_BACKEND) {
      fetchWorkspace().then(({ members, projects, requirements, tickets, mode }) => {
        if (mode === "live") {
          useAppStore.getState().setWorkspace({ members, projects, requirements, tickets });
        }
      }).catch(() => {
        // silencioso — el store sigue con sus datos locales
      });
    }

    return () => {
      unsub();
      window.clearTimeout(timer);
    };
  }, []);

  return null;
}
