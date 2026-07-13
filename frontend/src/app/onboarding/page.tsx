"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createTeam, fetchTeams } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { AUTH_DISABLED } from "@/lib/supabase";

function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

export default function OnboardingPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const setTeams = useAuthStore((s) => s.setTeams);
  const setTeamId = useAuthStore((s) => s.setTeamId);
  const teams = useAuthStore((s) => s.teams);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (AUTH_DISABLED) {
      router.replace("/");
      return;
    }
    if (teams.length > 0) {
      router.replace("/");
    }
  }, [teams.length, router]);

  useEffect(() => {
    if (!user && !AUTH_DISABLED) {
      router.replace("/login");
    }
  }, [user, router]);

  function onNameChange(value: string) {
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Ingresá un nombre para el workspace");
      return;
    }

    setLoading(true);
    try {
      const team = await createTeam(name.trim(), slug.trim() || undefined);
      if (!team) {
        toast.error("No se pudo crear el workspace");
        return;
      }
      const all = await fetchTeams();
      if (all.length > 0) setTeams(all);
      else setTeams([team]);
      setTeamId(team.id);
      toast.success(`Workspace «${team.name}» listo`);
      router.replace("/");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al crear workspace");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[var(--background)] px-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900">
            <Building2 className="size-5" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">
            Creá tu workspace
          </h1>
          <p className="mt-1.5 text-sm text-[var(--muted)]">
            Un espacio para tu equipo, proyectos y reuniones
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm"
        >
          <div>
            <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">
              Nombre del workspace
            </label>
            <input
              id="name"
              required
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--foreground)] outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500"
              placeholder="Acme Engineering"
            />
          </div>
          <div>
            <label htmlFor="slug" className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">
              Slug
            </label>
            <input
              id="slug"
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(slugify(e.target.value));
              }}
              className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2.5 font-mono text-sm text-[var(--foreground)] outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500"
              placeholder="acme-engineering"
            />
            <p className="mt-1.5 text-xs text-[var(--muted)]">Identificador único en minúsculas</p>
          </div>
          <Button type="submit" className="w-full" loading={loading}>
            Continuar
          </Button>
        </form>
      </div>
    </div>
  );
}
