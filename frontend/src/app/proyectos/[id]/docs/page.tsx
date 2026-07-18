"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ChevronRight, Save, BookOpen, Network } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { MarkdownEditor } from "@/components/knowledge/markdown-editor";
import { useAppStore } from "@/lib/store";
import { fetchProjectKnowledge, uploadProjectDoc } from "@/lib/api";

export default function ProjectDocsPage() {
  const params = useParams<{ id: string }>();
  const hydrated = useAppStore((s) => s.hydrated);
  const projects = useAppStore((s) => s.projects);

  const [overview, setOverview] = useState("");
  const [modules, setModules] = useState<Array<{ id: string; name: string; code?: string | null; summary?: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const project = projects.find((p) => p.id === params.id);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { knowledge } = await fetchProjectKnowledge(params.id);
      setOverview(knowledge.overview_md ?? "");
      setModules(knowledge.modules ?? []);
      setLoading(false);
    }
    if (hydrated) void load();
  }, [hydrated, params.id]);

  async function handleSave() {
    setSaving(true);
    const { ok } = await uploadProjectDoc(params.id, "Visión general", overview, "project_overview");
    if (ok) toast.success("Documentación guardada");
    else toast.error("No se pudo guardar");
    setSaving(false);
  }

  if (!hydrated || loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 p-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={project?.name ?? "Documentación del proyecto"}
        description="Visión general en markdown y módulos del knowledge base"
        actions={
          <>
            <Link href={`/proyectos/${params.id}/grafo`}>
              <Button size="sm" variant="outline">
                <Network className="size-4" />
                Grafo
              </Button>
            </Link>
            <Link href={`/proyectos/${params.id}`}>
              <Button size="sm" variant="ghost">
                <ArrowLeft className="size-4" />
                Proyecto
              </Button>
            </Link>
          </>
        }
      />

      <div className="mx-auto max-w-4xl space-y-8 p-4 sm:p-8">
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              <BookOpen className="size-4" />
              Visión general
            </h2>
            <Button size="sm" onClick={handleSave} loading={saving}>
              <Save className="size-4" />
              Guardar
            </Button>
          </div>
          <MarkdownEditor
            value={overview}
            onChange={setOverview}
            placeholder="# Visión del proyecto…"
            rows={14}
          />
        </section>

        <section>
          <h2 className="mb-4 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            Módulos ({modules.length})
          </h2>
          {modules.length === 0 ? (
            <EmptyState title="Sin módulos" description="Los módulos aparecen cuando se documenta el alcance del proyecto." />
          ) : (
            <div className="space-y-2">
              {modules.map((mod) => (
                <Link key={mod.id} href={`/proyectos/${params.id}/modulos/${mod.id}`}>
                  <Card className="flex items-center justify-between p-4 transition hover:border-neutral-300 dark:hover:border-neutral-700">
                    <div>
                      <div className="flex items-center gap-2">
                        {mod.code && (
                          <span className="rounded bg-neutral-100 px-2 py-0.5 font-mono text-[11px] dark:bg-neutral-800">
                            {mod.code}
                          </span>
                        )}
                        <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{mod.name}</span>
                      </div>
                      {mod.summary && (
                        <p className="mt-1 line-clamp-1 text-xs text-neutral-500">{mod.summary}</p>
                      )}
                    </div>
                    <ChevronRight className="size-4 text-neutral-400" />
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
