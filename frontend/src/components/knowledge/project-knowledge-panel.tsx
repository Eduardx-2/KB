"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Upload, Network, FileText, RefreshCw, Pencil, PlusSquare, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarkdownEditor } from "@/components/knowledge/markdown-editor";
import {
  fetchProjectDoc,
  fetchProjectKnowledge,
  updateProjectDoc,
  uploadProjectDoc,
} from "@/lib/api";
import type { KnowledgeSummary } from "@/lib/types";

type SourceRow = NonNullable<KnowledgeSummary["sources"]>[number];

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
  const [editing, setEditing] = useState<SourceRow | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editMode, setEditMode] = useState<"replace" | "append">("replace");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { knowledge: k } = await fetchProjectKnowledge(projectId);
    setKnowledge(k);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openEditor(source: SourceRow, mode: "replace" | "append") {
    setEditing(source);
    setEditMode(mode);
    setEditTitle(source.title);
    setEditBody("");
    if (mode === "replace") {
      const { doc } = await fetchProjectDoc(projectId, source.id);
      setEditBody(doc?.raw_content ?? "");
    } else {
      setEditBody("## Nueva función\n\n- Qué hace:\n- Dónde vive:\n");
    }
  }

  async function handleSaveEdit() {
    if (!editing) return;
    setSaving(true);
    const { ok, error } = await updateProjectDoc(projectId, editing.id, {
      title: editTitle,
      md_body: editBody,
      mode: editMode,
    });
    setSaving(false);
    if (!ok) {
      toast.error(error || "No se pudo guardar el MD");
      return;
    }
    toast.success(editMode === "append" ? "Sección agregada al MD" : "MD actualizado");
    setEditing(null);
    await load();
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    const mdFiles = files.filter((f) => f.name.toLowerCase().endsWith(".md"));
    if (mdFiles.length === 0) {
      toast.error("Solo archivos .md");
      return;
    }
    if (mdFiles.length < files.length) {
      toast.message("Se ignoraron archivos que no son .md");
    }
    setUploading(true);
    let okCount = 0;
    try {
      for (const file of mdFiles) {
        const text = await file.text();
        const title = file.name.replace(/\.md$/i, "").replace(/[-_]/g, " ");
        // Mismo título → actualiza el MD existente (no duplica).
        const { ok, error } = await uploadProjectDoc(projectId, title, text, "document", {
          mode: "replace",
        });
        if (ok) {
          okCount += 1;
        } else {
          toast.error(`Falló "${title}": ${error || "error desconocido"}`);
        }
      }
      if (okCount > 0) {
        toast.success(
          okCount === 1 ? "1 MD ingerido / actualizado" : `${okCount} MD ingeridos / actualizados`
        );
        await load();
      }
    } catch {
      toast.error("Error leyendo los archivos");
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
            Subí o editá .md. Los tickets en done agregan funciones al changelog automáticamente.
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
          multiple
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
          Subir / actualizar .md
        </Button>
      </div>

      {editing && (
        <div className="space-y-3 rounded-xl border border-neutral-300 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-950">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">
              {editMode === "append" ? "Agregar sección a" : "Editar"}: {editing.title}
            </p>
            <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
              <X className="size-4" />
            </Button>
          </div>
          <input
            className="w-full rounded-lg border border-neutral-200 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            placeholder="Título del documento"
          />
          <MarkdownEditor
            value={editBody}
            onChange={setEditBody}
            placeholder={
              editMode === "append"
                ? "## Nueva función…"
                : "Contenido completo del MD…"
            }
            rows={12}
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button size="sm" loading={saving} onClick={() => void handleSaveEdit()}>
              <Save className="size-4" />
              {editMode === "append" ? "Agregar sección" : "Guardar MD"}
            </Button>
          </div>
        </div>
      )}

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
              className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-950"
            >
              <FileText className="size-4 shrink-0 text-neutral-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-neutral-800 dark:text-neutral-200">{s.title}</p>
                <p className="text-[11px] text-neutral-400">{s.source_type}</p>
              </div>
              <Button size="sm" variant="ghost" title="Editar MD completo" onClick={() => void openEditor(s, "replace")}>
                <Pencil className="size-3.5" />
                Editar
              </Button>
              <Button size="sm" variant="ghost" title="Agregar sección ##" onClick={() => void openEditor(s, "append")}>
                <PlusSquare className="size-3.5" />
                + Sección
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
