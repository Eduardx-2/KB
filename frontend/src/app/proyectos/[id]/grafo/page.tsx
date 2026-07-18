"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, GitBranch, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useAppStore } from "@/lib/store";
import { fetchProjectKnowledge } from "@/lib/api";
import type { GraphEdge, GraphNode } from "@/lib/types";

const NODE_TYPE_LABELS: Record<string, string> = {
  project: "Proyecto",
  module: "Módulo",
  entity: "Entidad",
  table: "Tabla",
  meeting: "Reunión",
  ticket: "Ticket",
  person: "Persona",
  concept: "Concepto",
};

export default function ProjectGrafoPage() {
  const params = useParams<{ id: string }>();
  const hydrated = useAppStore((s) => s.hydrated);
  const projects = useAppStore((s) => s.projects);

  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [loading, setLoading] = useState(true);

  const project = projects.find((p) => p.id === params.id);
  const nodeMap = Object.fromEntries(nodes.map((n) => [n.id, n]));

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { knowledge } = await fetchProjectKnowledge(params.id);
      setNodes(knowledge.nodes);
      setEdges(knowledge.edges);
      setLoading(false);
    }
    if (hydrated) void load();
  }, [hydrated, params.id]);

  if (!hydrated || loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 p-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={`Grafo de conocimiento — ${project?.name ?? "Proyecto"}`}
        description="Nodos y relaciones extraídas del knowledge base"
        actions={
          <>
            <Link href={`/proyectos/${params.id}/docs`}>
              <Button size="sm" variant="outline">Docs</Button>
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
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <GitBranch className="size-4" />
              Nodos ({nodes.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {nodes.length === 0 ? (
              <EmptyState title="Sin nodos" description="El grafo se poblará cuando haya módulos y entidades documentadas." />
            ) : (
              <ul className="space-y-2">
                {nodes.map((n) => (
                  <li
                    key={n.id}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2.5 dark:border-neutral-800"
                  >
                    <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{n.label}</span>
                    <Badge className="bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                      {NODE_TYPE_LABELS[n.node_type] ?? n.node_type}
                    </Badge>
                    {n.canonical_key && (
                      <span className="font-mono text-[11px] text-neutral-400">{n.canonical_key}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Relaciones ({edges.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {edges.length === 0 ? (
              <p className="text-sm text-neutral-500">Sin aristas definidas.</p>
            ) : (
              <ul className="space-y-3">
                {edges.map((e) => {
                  const from = nodeMap[e.from_node_id];
                  const to = nodeMap[e.to_node_id];
                  return (
                    <li
                      key={e.id}
                      className="rounded-lg bg-neutral-50 p-3 dark:bg-neutral-900"
                    >
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-medium text-neutral-800 dark:text-neutral-200">
                          {from?.label ?? e.from_node_id}
                        </span>
                        <ArrowRight className="size-3.5 text-neutral-400" />
                        <Badge className="bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                          {e.relation}
                        </Badge>
                        <ArrowRight className="size-3.5 text-neutral-400" />
                        <span className="font-medium text-neutral-800 dark:text-neutral-200">
                          {to?.label ?? e.to_node_id}
                        </span>
                        {e.confidence_pct != null && (
                          <span className="text-xs text-neutral-400">{e.confidence_pct}% conf.</span>
                        )}
                      </div>
                      {e.evidence_text && (
                        <p className="mt-1.5 text-xs text-neutral-500">{e.evidence_text}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
