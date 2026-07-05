"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { SEED_MEMBERS, SEED_AGENT_LOGS, buildSeedData } from "./mock-data";
import type {
  Member,
  Requirement,
  Ticket,
  AgentLog,
  MeetingAgentOutput,
  AssignmentAgentOutput,
  TicketStatus,
} from "./types";

interface AppState {
  members: Member[];
  requirements: Requirement[];
  tickets: Ticket[];
  agentLogs: AgentLog[];
  hydrated: boolean;

  setHydrated: () => void;
  setMembers: (members: Member[]) => void;
  createRequirement: (title: string, transcript: string, id?: string) => string;
  setTranscript: (requirementId: string, transcript: string) => void;
  renameRequirement: (requirementId: string, title: string) => void;
  applyMeetingOutput: (requirementId: string, output: MeetingAgentOutput) => void;
  applyAssignmentOutput: (requirementId: string, output: AssignmentAgentOutput) => void;
  updateTicket: (
    ticketId: string,
    patch: Partial<Pick<Ticket, "status" | "assignee_id" | "deadline">>
  ) => void;
  approveRequirement: (requirementId: string) => void;
  pushAgentLog: (log: Omit<AgentLog, "id" | "created_at">) => void;
  ticketsFor: (requirementId: string) => Ticket[];
  memberByName: (name: string) => Member | undefined;
  resetDemo: () => void;
}

const seed = buildSeedData();

function uid(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      members: SEED_MEMBERS,
      requirements: seed.requirements,
      tickets: seed.tickets,
      agentLogs: SEED_AGENT_LOGS,
      hydrated: false,

      setHydrated: () => set({ hydrated: true }),

      setMembers: (members) => set({ members }),

      createRequirement: (title, transcript, id) => {
        const rid = id ?? uid("req");
        const requirement: Requirement = {
          id: rid,
          title: title.trim() || "Reunión sin título",
          raw_transcript: transcript,
          summary: "",
          status: "draft",
          created_at: new Date().toISOString(),
          team_id: "demo",
        };
        set((s) => ({ requirements: [requirement, ...s.requirements] }));
        return rid;
      },

      setTranscript: (requirementId, transcript) => {
        set((s) => ({
          requirements: s.requirements.map((r) =>
            r.id === requirementId ? { ...r, raw_transcript: transcript } : r
          ),
        }));
      },

      renameRequirement: (requirementId, title) => {
        set((s) => ({
          requirements: s.requirements.map((r) => (r.id === requirementId ? { ...r, title } : r)),
        }));
      },

      applyMeetingOutput: (requirementId, output) => {
        set((s) => {
          const newTickets: Ticket[] = output.tickets.map((t, idx) => ({
            id: uid(`${requirementId}-t${idx}`),
            requirement_id: requirementId,
            title: t.title,
            description: t.description,
            priority: t.priority,
            estimate_hours: t.estimate_hours,
            required_skill: t.required_skill,
            risk_pct: 0,
            assignee_id: null,
            status: "backlog" as TicketStatus,
            deadline: null,
            team_id: "demo",
          }));

          return {
            requirements: s.requirements.map((r) =>
              r.id === requirementId ? { ...r, summary: output.summary, status: "extracted" } : r
            ),
            tickets: [...s.tickets.filter((t) => t.requirement_id !== requirementId), ...newTickets],
          };
        });
      },

      applyAssignmentOutput: (requirementId, output) => {
        set((s) => {
          const members = s.members;
          const tickets = s.tickets.map((t) => {
            if (t.requirement_id !== requirementId) return t;
            const rec = output.recommendations.find((r) => r.ticket_title === t.title);
            if (!rec) return t;
            const member = members.find((m) => m.name === rec.assignee_name);
            return {
              ...t,
              assignee_id: member?.id ?? null,
              risk_pct: rec.risk_pct,
              reasoning: rec.reasoning,
              status: "todo" as TicketStatus,
            };
          });
          return { tickets };
        });
      },

      updateTicket: (ticketId, patch) => {
        set((s) => ({
          tickets: s.tickets.map((t) => (t.id === ticketId ? { ...t, ...patch } : t)),
        }));
      },

      approveRequirement: (requirementId) => {
        set((s) => ({
          requirements: s.requirements.map((r) =>
            r.id === requirementId ? { ...r, status: "approved" } : r
          ),
        }));
      },

      pushAgentLog: (log) => {
        set((s) => ({
          agentLogs: [
            { ...log, id: uid("log"), created_at: new Date().toISOString() },
            ...s.agentLogs,
          ].slice(0, 40),
        }));
      },

      ticketsFor: (requirementId) => get().tickets.filter((t) => t.requirement_id === requirementId),
      memberByName: (name) => get().members.find((m) => m.name === name),

      resetDemo: () => {
        const fresh = buildSeedData();
        set({
          members: SEED_MEMBERS,
          requirements: fresh.requirements,
          tickets: fresh.tickets,
          agentLogs: SEED_AGENT_LOGS,
        });
      },
    }),
    {
      name: "kb-meeting-pm-demo",
      partialize: (state) => ({
        members: state.members,
        requirements: state.requirements,
        tickets: state.tickets,
        agentLogs: state.agentLogs,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
      },
    }
  )
);
