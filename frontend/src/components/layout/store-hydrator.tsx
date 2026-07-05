"use client";

import { useEffect } from "react";
import { useAppStore } from "@/lib/store";
import { fetchMembers } from "@/lib/api";

/** Garantiza que el store de Zustand hidrate aunque localStorage falle o tarde. */
export function StoreHydrator() {
  useEffect(() => {
    const finish = () => useAppStore.getState().setHydrated();

    const unsub = useAppStore.persist.onFinishHydration(finish);

    useAppStore.persist.rehydrate();

    const timer = window.setTimeout(finish, 800);

    // Si hay backend real, reemplaza el equipo mock por los miembros de Supabase
    // (incluye al manager). Si falla o no hay backend, se conserva el seed local.
    fetchMembers().then((members) => {
      if (members) useAppStore.getState().setMembers(members);
    });

    return () => {
      unsub();
      window.clearTimeout(timer);
    };
  }, []);

  return null;
}
