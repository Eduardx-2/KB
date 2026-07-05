"use client";

import { useEffect } from "react";
import { installGlobalErrorReporting } from "@/lib/error-reporting";

/** Instala los listeners globales de errores del navegador una sola vez. */
export function ErrorReportingInit() {
  useEffect(() => {
    installGlobalErrorReporting();
  }, []);
  return null;
}
