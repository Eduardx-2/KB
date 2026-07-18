"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Save } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { MarkdownEditor } from "@/components/knowledge/markdown-editor";
import { useAppStore } from "@/lib/store";
import { fetchProjectModules, updateProjectModule } from "@/lib/api";
import type { ProjectModule } from "@/lib/types";

export default function ProjectModulePage() {
  const params = useParams<{ id: string; moduleId: string }>();
  const hydrated = useAppStore((s) => s.hydrated);

  const [mod, setMod] = useState<ProjectModule | null>(null);
  const [mdBody, setMdBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { modules } = await fetchProjectModules(params.id);
      const found = modules.find((m) => m.id === params.moduleId) ?? null;
      setMod(found);
      setMdBody(found?.md_body ?? "");
      setLoading(false);
    }
    if (hydrated) void load();
  }, [hydrated, params.id, params.moduleId]);

  async function handleSave() {
    if (!mod) return;
    setSaving(true);
    const { module: updated } = await updateProjectModule(mod.id, { md_body: mdBody });
    if (updated) {
      setMod(updated);
      toast.success("Módulo guardado");
    } else {
      toast.error("No se pudo guardar");
    }
    setSaving(false);
  }

  if (!hydrated || loading) {
    return (
      <div className="mx-auto max-w-4xl p-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-4 h-96" />
      </div>
    );
  }

  if (!mod) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <EmptyState
          title="Módulo no encontrado"
          action={
            <Link href={`/proyectos/${params.id}/docs`}>
              <Button size="sm" variant="outline">
                <ArrowLeft className="size-4" />
                Volver a docs
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={mod.name}
        description={mod.summary ?? mod.code ?? "Especificación del módulo"}
        actions={
          <>
            <Button size="sm" onClick={handleSave} loading={saving}>
              <Save className="size-4" />
              Guardar
            </Button>
            <Link href={`/proyectos/${params.id}/docs`}>
              <Button size="sm" variant="ghost">
                <ArrowLeft className="size-4" />
                Docs
              </Button>
            </Link>
          </>
        }
      />

      <div className="mx-auto max-w-4xl p-4 sm:p-8">
        {mod.expected_outcomes && (
          <p className="mb-6 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
            <span className="font-medium text-neutral-800 dark:text-neutral-200">Resultado esperado: </span>
            {mod.expected_outcomes}
          </p>
        )}
        <MarkdownEditor value={mdBody} onChange={setMdBody} label="Especificación (markdown)" rows={18} />
      </div>
    </div>
  );
}
