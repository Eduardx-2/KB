"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { acceptInvite, fetchTeams } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { AUTH_DISABLED } from "@/lib/supabase";

export default function InvitePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  const setTeams = useAuthStore((s) => s.setTeams);
  const setTeamId = useAuthStore((s) => s.setTeamId);

  const [status, setStatus] = useState<"idle" | "working" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (AUTH_DISABLED) {
      setStatus("error");
      setMessage("Las invitaciones requieren autenticación habilitada.");
      return;
    }
    if (loading) return;
    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
    }
  }, [loading, user, token, router]);

  async function handleAccept() {
    if (!token) return;
    setStatus("working");
    try {
      const result = await acceptInvite(token);
      if (!result?.accepted) {
        setStatus("error");
        setMessage("No se pudo aceptar la invitación. Puede estar expirada o ya usada.");
        return;
      }
      const teams = await fetchTeams();
      setTeams(teams);
      setTeamId(result.team_id);
      setStatus("done");
      toast.success("Te uniste al workspace");
      setTimeout(() => router.replace("/"), 800);
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Error al aceptar invitación");
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[var(--background)] px-4">
      <div className="w-full max-w-md animate-fade-in text-center">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900">
          <MailCheck className="size-5" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">
          Invitación al workspace
        </h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Aceptá para unirte al equipo y empezar a colaborar.
        </p>

        <div className="mt-8 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
          {status === "error" ? (
            <p className="text-sm text-red-600 dark:text-red-400">{message}</p>
          ) : status === "done" ? (
            <p className="text-sm text-[var(--foreground)]">¡Listo! Redirigiendo…</p>
          ) : (
            <Button
              className="w-full"
              loading={status === "working" || loading}
              onClick={() => void handleAccept()}
              disabled={!user}
            >
              Aceptar invitación
            </Button>
          )}
        </div>

        {!user && !AUTH_DISABLED && (
          <p className="mt-4 text-sm text-[var(--muted)]">
            <Link href={`/login?next=/invite/${token}`} className="underline-offset-2 hover:underline">
              Iniciá sesión
            </Link>{" "}
            para continuar
          </p>
        )}
      </div>
    </div>
  );
}
