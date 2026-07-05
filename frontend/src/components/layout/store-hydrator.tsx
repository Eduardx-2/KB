"use client";

import { useEffect } from "react";
import { useAppStore } from "@/lib/store";

/** Garantiza que el store de Zustand hidrate aunque localStorage falle o tarde. */
export function StoreHydrator() {
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

  return null;
}
