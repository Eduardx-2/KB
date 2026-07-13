"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getSupabaseClient, AUTH_DISABLED } from "@/lib/supabase";
import { useAuthStore } from "@/lib/auth-store";

export default function SignupPage() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (AUTH_DISABLED) {
      toast.message("Auth deshabilitado — modo demo activo");
      router.replace("/");
      return;
    }

    const sb = getSupabaseClient();
    if (!sb) {
      toast.error("Supabase no configurado");
      return;
    }

    if (password.length < 6) {
      toast.error("La contraseña debe tener al menos 6 caracteres");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await sb.auth.signUp({ email, password });
      if (error) throw error;

      if (data.session) {
        setSession(data.session);
        toast.success("Cuenta creada");
        router.replace("/onboarding");
      } else {
        toast.success("Revisá tu email para confirmar la cuenta");
        router.replace("/login");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo crear la cuenta");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[var(--background)] px-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900">
            <Sparkles className="size-5" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">
            Crear cuenta
          </h1>
          <p className="mt-1.5 text-sm text-[var(--muted)]">
            Empezá a convertir reuniones en tickets aprobados
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm"
        >
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--foreground)] outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500"
              placeholder="tu@empresa.com"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--foreground)] outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500"
              placeholder="Mínimo 6 caracteres"
            />
          </div>
          <Button type="submit" className="w-full" loading={loading}>
            Registrarme
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-[var(--muted)]">
          ¿Ya tenés cuenta?{" "}
          <Link href="/login" className="font-medium text-[var(--foreground)] underline-offset-2 hover:underline">
            Iniciar sesión
          </Link>
        </p>
      </div>
    </div>
  );
}
