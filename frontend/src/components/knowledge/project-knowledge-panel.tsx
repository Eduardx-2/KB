"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Upload, Network, FileText, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchProjectKnowledge, uploadProjectDoc } from "@/lib/api";
import type { KnowledgeSummary } from "@/lib/types";

export function ProjectKnowledgePanel({
  projectId,
  projectCode,
}: {
  projectId: string;
  projectCode?: string | null;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [knowledge, setKnowledge] = useState<KnowledgeSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { knowledge: k } = await fetchProjectKnowledge(projectId);
    setKnowledge(k);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".md")) {
      toast.error("Solo archivos .md");
      return;
    }
    setUploading(true);
    try {
      const text = await file.text();
      const title = file.name.replace(/\.md$/i, "").replace(/[-_]/g, " ");
      const { ok } = await uploadProjectDoc(projectId, title, text, "document");
      if (ok) {
        toast.success(`Nodo "${title}" ingerido al grafo`);
        await load();
      } else {
        toast.error("No se pudo subir el MD");
      }
    } catch {
      toast.error("Error leyendo el archivo");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const sources = knowledge?.sources ?? [];
  const nodeCount = knowledge?.nodes?.length ?? 0;
  const edgeCount = knowledge?.edges?.length ?? 0;
  const chunks = knowledge?.chunks_count ?? 0;

  return (
    <div className="space-y-4 rounded-xl border border-neutral-200 bg-neutral-50/50 p-4 dark:border-neutral-800 dark:bg-neutral-900/40">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
            Nodos MD del proyecto {projectCode ? `(${projectCode})` : ""}
          </p>
          <p className="text-xs text-neutral-500">
            Subí .md → chunks + embeddings + nodos en el grafo. Compartido con todo el equipo.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className="size-4" />
          </Button>
          <Link href={`/proyectos/${projectId}/grafo`}>
            <Button size="sm" variant="outline">
              <Network className="size-4" />
              Grafo ({nodeCount})
            </Button>
          </Link>
          <Link href={`/proyectos/${projectId}/docs`}>
            <Button size="sm" variant="ghost">
              Docs completos
            </Button>
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-500">
        <span>{sources.length} documentos</span>
        <span>·</span>
        <span>{chunks} chunks RAG</span>
        <span>·</span>
        <span>{edgeCount} relaciones</span>
      </div>

      <div>
        <input
          ref={fileRef}
          type="file"
          accept=".md,text/markdown"
          className="hidden"
          onChange={handleFile}
        />
        <Button
          size="sm"
          variant="outline"
          loading={uploading}
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="size-4" />
          Subir archivo .md
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-neutral-400">Cargando nodos…</p>
      ) : sources.length === 0 ? (
        <p className="text-sm text-neutral-500">
          Sin documentos todavía. Subí un .md con secciones ## para crear nodos en el grafo.
        </p>
      ) : (
        <ul className="space-y-2">
          {sources.map((s) => (
            <li
              key={s.id}
              className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-950"
            >
              <FileText className="size-4 shrink-0 text-neutral-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-neutral-800 dark:text-neutral-200">{s.title}</p>
                <p className="text-[11px] text-neutral-400">{s.source_type}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
