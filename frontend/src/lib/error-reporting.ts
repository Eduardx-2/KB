/**
 * Reporte de errores del frontend hacia el backend.
 *
 * Regla del CONTRATO: el frontend NUNCA escribe directo a Supabase. Los errores
 * del cliente se envían a `POST /api/client-errors` y el backend (service_role)
 * los persiste en la tabla `error_logs`.
 *
 * Es best-effort: si el backend no está disponible o falla, nunca rompe la app.
 */

import { authHeaders, API_BASE } from "./api";

export type ErrorSeverity = "info" | "warning" | "error" | "critical";

export interface ClientErrorInput {
  message: string;
  error_type?: string;
  severity?: ErrorSeverity;
  http_status?: number;
  http_method?: string;
  path?: string;
  stack?: string;
  context?: Record<string, unknown>;
  request_id?: string;
}

export async function reportClientError(input: ClientErrorInput): Promise<void> {
  // Sin backend real no hay dónde loguear (la demo corre en modo mock).
  if (!API_BASE) return;
  try {
    const headers = await authHeaders({ "Content-Type": "application/json" });
    await fetch(`${API_BASE}/api/client-errors`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        severity: "error",
        ...input,
        path: input.path ?? (typeof window !== "undefined" ? window.location.pathname : undefined),
      }),
      keepalive: true,
    });
  } catch {
    // El logging jamás debe romper la app.
  }
}

/** Instala listeners globales para capturar errores no manejados del navegador. */
export function installGlobalErrorReporting(): void {
  if (typeof window === "undefined") return;
  const w = window as Window & { __errorReportingInstalled?: boolean };
  if (w.__errorReportingInstalled) return;
  w.__errorReportingInstalled = true;

  window.addEventListener("error", (event) => {
    void reportClientError({
      message: event.message || "window.onerror",
      error_type: event.error?.name ?? "Error",
      severity: "error",
      stack: event.error?.stack,
      context: { filename: event.filename, lineno: event.lineno, colno: event.colno },
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    void reportClientError({
      message: reason instanceof Error ? reason.message : String(reason),
      error_type: reason instanceof Error ? reason.name : "UnhandledRejection",
      severity: "error",
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });
}
