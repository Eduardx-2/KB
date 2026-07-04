import { useAppStore } from "./store";
import { simulateAssignmentAgent, simulateMeetingAgent } from "./mock-engine";
import { sleep } from "./utils";
import type { AssignmentAgentOutput, HealthState, MeetingAgentOutput, RunMode } from "./types";

/**
 * Capa de acceso a datos. Sigue la regla del CONTRATO: el frontend nunca
 * habla directo con OpenAI/ElevenLabs; siempre pasa por el backend FastAPI.
 *
 * Si `NEXT_PUBLIC_API_URL` está configurada, se usa el backend real.
 * Si no responde (o no está configurada), cae a una simulación local
 * fiel al contrato — así el equipo puede demostrar el flujo completo
 * aunque el backend de R1 no esté disponible en ese momento.
 */

export const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "";
export const HAS_LIVE_BACKEND = Boolean(API_BASE);

async function fetchWithTimeout(input: string, init: RequestInit = {}, timeoutMs = 6000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function checkHealth(): Promise<HealthState> {
  const checked_at = new Date().toISOString();
  if (!HAS_LIVE_BACKEND) {
    return { status: "ok", version: "mock", mode: "mock", checked_at };
  }
  try {
    const res = await fetchWithTimeout(`${API_BASE}/api/health`, {}, 3500);
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    return { status: data.status === "ok" ? "ok" : "error", version: data.version, mode: "live", checked_at };
  } catch {
    return { status: "error", mode: "live", checked_at };
  }
}

export async function transcribeAudio(file: Blob): Promise<{ text: string; mode: RunMode }> {
  const start = performance.now();
  if (HAS_LIVE_BACKEND) {
    try {
      const form = new FormData();
      form.append("file", file, "grabacion.webm");
      const res = await fetchWithTimeout(`${API_BASE}/api/transcribe`, { method: "POST", body: form }, 20000);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      useAppStore.getState().pushAgentLog({
        agent: "transcribe",
        latency_ms: Math.round(performance.now() - start),
        model: "scribe_v1",
        ok: true,
      });
      return { text: data.text, mode: "live" };
    } catch {
      // sigue a la simulación de abajo
    }
  }

  await sleep(1400);
  useAppStore.getState().pushAgentLog({
    agent: "transcribe",
    latency_ms: Math.round(performance.now() - start),
    model: "scribe_v1 (mock)",
    ok: true,
  });
  return {
    text:
      "[Transcripción simulada — conectá NEXT_PUBLIC_API_URL para usar ElevenLabs real] " +
      "El audio grabado se procesaría acá con la misma calidad que un transcript pegado a mano.",
    mode: "mock",
  };
}

export async function runMeetingAgent(
  transcript: string,
  requirementId: string
): Promise<{ output: MeetingAgentOutput; mode: RunMode }> {
  const start = performance.now();
  if (HAS_LIVE_BACKEND) {
    try {
      const res = await fetchWithTimeout(
        `${API_BASE}/api/agents/meeting`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript, requirement_id: requirementId }),
        },
        15000
      );
      if (!res.ok) throw new Error(String(res.status));
      const output: MeetingAgentOutput = await res.json();
      useAppStore.getState().pushAgentLog({
        agent: "meeting",
        latency_ms: Math.round(performance.now() - start),
        model: "gpt-4o-mini",
        ok: true,
      });
      return { output, mode: "live" };
    } catch {
      // sigue a la simulación
    }
  }

  await sleep(1700);
  const output = simulateMeetingAgent(transcript);
  useAppStore.getState().pushAgentLog({
    agent: "meeting",
    latency_ms: Math.round(performance.now() - start),
    model: "gpt-4o-mini (mock)",
    ok: true,
  });
  return { output, mode: "mock" };
}

export async function runAssignmentAgent(
  requirementId: string
): Promise<{ output: AssignmentAgentOutput; mode: RunMode }> {
  const start = performance.now();
  if (HAS_LIVE_BACKEND) {
    try {
      const res = await fetchWithTimeout(
        `${API_BASE}/api/agents/assignment`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requirement_id: requirementId }),
        },
        15000
      );
      if (!res.ok) throw new Error(String(res.status));
      const output: AssignmentAgentOutput = await res.json();
      useAppStore.getState().pushAgentLog({
        agent: "assignment",
        latency_ms: Math.round(performance.now() - start),
        model: "gpt-4o-mini",
        ok: true,
      });
      return { output, mode: "live" };
    } catch {
      // sigue a la simulación
    }
  }

  await sleep(1300);
  const state = useAppStore.getState();
  const tickets = state.ticketsFor(requirementId);
  const output = simulateAssignmentAgent(
    tickets.map((t) => ({
      title: t.title,
      description: t.description,
      priority: t.priority,
      estimate_hours: t.estimate_hours,
      required_skill: t.required_skill,
    })),
    state.members
  );
  useAppStore.getState().pushAgentLog({
    agent: "assignment",
    latency_ms: Math.round(performance.now() - start),
    model: "gpt-4o-mini (mock)",
    ok: true,
  });
  return { output, mode: "mock" };
}

export async function patchTicket(
  ticketId: string,
  patch: Record<string, unknown>
): Promise<{ mode: RunMode }> {
  if (HAS_LIVE_BACKEND) {
    try {
      const res = await fetchWithTimeout(
        `${API_BASE}/api/tickets/${ticketId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        },
        8000
      );
      if (!res.ok) throw new Error(String(res.status));
      return { mode: "live" };
    } catch {
      // sigue a la simulación
    }
  }
  await sleep(220);
  return { mode: "mock" };
}

export async function approveRequirement(
  requirementId: string
): Promise<{ n8n_notified: boolean; mode: RunMode }> {
  const start = performance.now();
  if (HAS_LIVE_BACKEND) {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/approve/${requirementId}`, { method: "POST" }, 10000);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      useAppStore.getState().pushAgentLog({
        agent: "approve",
        latency_ms: Math.round(performance.now() - start),
        model: "n8n webhook",
        ok: true,
      });
      return { n8n_notified: Boolean(data.n8n_notified), mode: "live" };
    } catch {
      // sigue a la simulación
    }
  }

  await sleep(1100);
  useAppStore.getState().pushAgentLog({
    agent: "approve",
    latency_ms: Math.round(performance.now() - start),
    model: "n8n webhook (mock)",
    ok: true,
  });
  return { n8n_notified: true, mode: "mock" };
}
