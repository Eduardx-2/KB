"use client";

import { create } from "zustand";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseClient, AUTH_DISABLED, HAS_SUPABASE } from "./supabase";
import type { MembershipRole, Team } from "./types";

const TEAM_STORAGE_KEY = "kb-active-team";

function readStoredTeamId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(TEAM_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredTeamId(teamId: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (teamId) localStorage.setItem(TEAM_STORAGE_KEY, teamId);
    else localStorage.removeItem(TEAM_STORAGE_KEY);
  } catch {
    // ignore
  }
}

interface AuthUser {
  id: string;
  email: string;
}

interface AuthState {
  user: AuthUser | null;
  session: Session | null;
  teamId: string | null;
  role: MembershipRole | string | null;
  teams: Team[];
  loading: boolean;
  setSession: (session: Session | null) => void;
  setTeamId: (teamId: string | null) => void;
  setTeams: (teams: Team[]) => void;
  logout: () => Promise<void>;
  hydrateFromSupabase: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  teamId: readStoredTeamId(),
  role: null,
  teams: [],
  loading: !AUTH_DISABLED && HAS_SUPABASE,

  setSession: (session) => {
    const user = session?.user
      ? { id: session.user.id, email: session.user.email ?? "" }
      : null;
    set({ session, user });
  },

  setTeamId: (teamId) => {
    writeStoredTeamId(teamId);
    const team = get().teams.find((t) => t.id === teamId);
    set({ teamId, role: team?.role ?? get().role });
  },

  setTeams: (teams) => {
    const currentId = get().teamId;
    const stillValid = currentId && teams.some((t) => t.id === currentId);
    const nextId = stillValid ? currentId : teams[0]?.id ?? null;
    if (nextId !== currentId) writeStoredTeamId(nextId);
    const team = teams.find((t) => t.id === nextId);
    set({ teams, teamId: nextId, role: team?.role ?? null });
  },

  logout: async () => {
    const sb = getSupabaseClient();
    if (sb) {
      try {
        await sb.auth.signOut();
      } catch {
        // ignore
      }
    }
    writeStoredTeamId(null);
    set({
      user: null,
      session: null,
      teamId: null,
      role: null,
      teams: [],
      loading: false,
    });
  },

  hydrateFromSupabase: async () => {
    if (AUTH_DISABLED || !HAS_SUPABASE) {
      set({ loading: false, user: null, session: null });
      return;
    }

    const sb = getSupabaseClient();
    if (!sb) {
      set({ loading: false });
      return;
    }

    set({ loading: true });
    try {
      const { data } = await sb.auth.getSession();
      const session = data.session ?? null;
      const user = session?.user
        ? { id: session.user.id, email: session.user.email ?? "" }
        : null;
      set({
        session,
        user,
        teamId: get().teamId ?? readStoredTeamId(),
        loading: false,
      });
    } catch {
      set({ loading: false, user: null, session: null });
    }
  },
}));
