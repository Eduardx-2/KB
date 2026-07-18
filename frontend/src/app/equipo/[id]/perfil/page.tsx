"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Plus, CalendarOff, Clock, BookOpen, Save, Layers, X } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Avatar } from "@/components/ui/avatar";
import { DutyList } from "@/components/knowledge/duty-list";
import { MarkdownEditor } from "@/components/knowledge/markdown-editor";
import { ProjectKnowledgePanel } from "@/components/knowledge/project-knowledge-panel";
import { useAppStore } from "@/lib/store";
import {
  fetchMemberDuties,
  createMemberDuty,
  deleteMemberDuty,
  fetchMemberAbsences,
  createMemberAbsence,
  fetchMemberCapacity,
  updateMemberCapacity,
  fetchMemberDocs,
  saveMemberDocs,
  fetchMemberProjectNotes,
  saveMemberProjectNote,
  assignMemberToProject,
  unassignMemberFromProject,
} from "@/lib/api";
import { DUTY_TYPE_LABELS, SKILL_LABELS, cn } from "@/lib/utils";
import type { MemberAbsence, MemberCapacity, MemberDuty, MemberProjectNote, DutyType } from "@/lib/types";

const inputCls =
  "w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100";

export default function MemberPerfilPage() {
  const params = useParams<{ id: string }>();
  const hydrated = useAppStore((s) => s.hydrated);
  const members = useAppStore((s) => s.members);
  const projects = useAppStore((s) => s.projects);
  const member = members.find((m) => m.id === params.id);

  const [duties, setDuties] = useState<MemberDuty[]>([]);
  const [absences, setAbsences] = useState<MemberAbsence[]>([]);
  const [capacity, setCapacity] = useState<MemberCapacity | null>(null);
  const [profileMd, setProfileMd] = useState("");
  const [projectNotes, setProjectNotes] = useState<MemberProjectNote[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [savingCapacity, setSavingCapacity] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [assignProjectId, setAssignProjectId] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const [dutyTitle, setDutyTitle] = useState("");
  const [dutyDesc, setDutyDesc] = useState("");
  const [dutyType, setDutyType] = useState<DutyType>("recurring");
  const [dutyLoad, setDutyLoad] = useState(10);
  const [dutyHours, setDutyHours] = useState(2);
  const [addingDuty, setAddingDuty] = useState(false);

  const [absStart, setAbsStart] = useState("");
  const [absEnd, setAbsEnd] = useState("");
  const [absReason, setAbsReason] = useState("");
  const [addingAbsence, setAddingAbsence] = useState(false);

  const activeNote = projectNotes.find((n) => n.project_id === activeProjectId) ?? projectNotes[0] ?? null;

  async function load() {
    setLoading(true);
    const [d, a, c, docs, notes] = await Promise.all([
      fetchMemberDuties(params.id),
      fetchMemberAbsences(params.id),
      fetchMemberCapacity(params.id),
      fetchMemberDocs(params.id),
      fetchMemberProjectNotes(params.id),
    ]);
    setDuties(d.duties);
    setAbsences(a.absences);
    setCapacity(c.capacity);
    setProfileMd(docs.docs.overview_md ?? "");
    setProjectNotes(notes.notes);
    setActiveProjectId(notes.notes[0]?.project_id ?? null);
    setLoading(false);
  }

  useEffect(() => {
    if (hydrated) void load();
  }, [hydrated, params.id]);

  async function handleAddDuty(e: React.FormEvent) {
    e.preventDefault();
    if (!dutyTitle.trim()) return;
    setAddingDuty(true);
    const { duty } = await createMemberDuty(params.id, {
      title: dutyTitle.trim(),
      description: dutyDesc.trim() || undefined,
      duty_type: dutyType,
      load_pct: dutyLoad,
      hours_per_week: dutyHours,
    });
    if (duty) {
      setDuties((prev) => [duty, ...prev]);
      setDutyTitle("");
      setDutyDesc("");
      toast.success("Responsabilidad agregada");
    }
    setAddingDuty(false);
  }

  async function handleDeleteDuty(id: string) {
    setDeletingId(id);
    const { ok } = await deleteMemberDuty(id);
    if (ok) {
      setDuties((prev) => prev.filter((d) => d.id !== id));
      toast.success("Eliminada");
    }
    setDeletingId(null);
  }

  async function handleAddAbsence(e: React.FormEvent) {
    e.preventDefault();
    if (!absStart || !absEnd) return;
    setAddingAbsence(true);
    const { absence } = await createMemberAbsence(params.id, {
      start_date: absStart,
      end_date: absEnd,
      reason: absReason.trim() || undefined,
    });
    if (absence) {
      setAbsences((prev) => [absence, ...prev]);
      setAbsStart("");
      setAbsEnd("");
      setAbsReason("");
      toast.success("Ausencia registrada");
    }
    setAddingAbsence(false);
  }

  async function handleSaveProfile() {
    setSavingProfile(true);
    const { docs } = await saveMemberDocs(params.id, profileMd);
    setProfileMd(docs.overview_md);
    toast.success("Perfil global guardado");
    setSavingProfile(false);
  }

  async function handleSaveProjectNote() {
    if (!activeNote) return;
    setSavingNote(true);
    const { note } = await saveMemberProjectNote(params.id, activeNote.project_id, {
      md_notes: activeNote.md_notes,
      role_in_project: activeNote.role_in_project,
      importance_pct: activeNote.importance_pct,
    });
    if (note) {
      setProjectNotes((prev) => prev.map((n) => (n.project_id === note.project_id ? note : n)));
      toast.success("Notas del proyecto guardadas");
    } else {
      toast.error("No se pudo guardar");
    }
    setSavingNote(false);
  }

  async function handleAssignProject() {
    if (!assignProjectId) return;
    setAssigning(true);
    const { note } = await assignMemberToProject(params.id, assignProjectId);
    if (note) {
      setProjectNotes((prev) => {
        const without = prev.filter((n) => n.project_id !== note.project_id);
        return [...without, note].sort((a, b) => a.project_name.localeCompare(b.project_name));
      });
      setActiveProjectId(note.project_id);
      setAssignProjectId("");
      toast.success("Proyecto asignado");
    } else {
      toast.error("No se pudo asignar el proyecto");
    }
    setAssigning(false);
  }

  async function handleUnassignProject(projectId: string) {
    setRemovingId(projectId);
    const { ok } = await unassignMemberFromProject(params.id, projectId);
    if (ok) {
      const next = projectNotes.filter((n) => n.project_id !== projectId);
      setProjectNotes(next);
      setActiveProjectId(next[0]?.project_id ?? null);
      toast.success("Proyecto quitado del perfil");
    } else {
      toast.error("No se pudo quitar");
    }
    setRemovingId(null);
  }

  async function handleSaveCapacity() {
    if (!capacity) return;
    setSavingCapacity(true);
    const { capacity: updated } = await updateMemberCapacity(params.id, capacity.weekly_hours);
    setCapacity(updated);
    toast.success("Capacidad actualizada");
    setSavingCapacity(false);
  }

  if (!hydrated || loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (!member) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <EmptyState
          title="Miembro no encontrado"
          action={
            <Link href="/equipo">
              <Button size="sm" variant="outline">
                <ArrowLeft className="size-4" />
                Volver al equipo
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
        title={`Perfil — ${member.name}`}
        description="Perfil global corto + MD por proyecto + responsabilidades con tiempo"
        actions={
          <div className="flex gap-2">
            <Link href={`/equipo/${params.id}/reorg`}>
              <Button size="sm" variant="outline">Historial reorg</Button>
            </Link>
            <Link href={`/equipo/${params.id}`}>
              <Button size="sm" variant="ghost">
                <ArrowLeft className="size-4" />
                Dashboard
              </Button>
            </Link>
          </div>
        }
      />

      <div className="mx-auto max-w-3xl space-y-8 p-4 sm:p-8">
        <Card className="p-5">
          <div className="flex items-center gap-4">
            <Avatar name={member.name} size="lg" className="size-14 text-lg" />
            <div>
              <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">{member.name}</h2>
              <p className="text-sm text-neutral-500">{member.role}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {member.skills.map((s) => (
                  <span key={s} className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs dark:bg-neutral-800">
                    {SKILL_LABELS[s]}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen className="size-4" />
              Perfil global
            </CardTitle>
            <Button size="sm" onClick={handleSaveProfile} loading={savingProfile}>
              <Save className="size-4" />
              Guardar
            </Button>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-xs text-neutral-500">
              Solo stack y restricciones globales. El detalle de cada proyecto va abajo (ahorra tokens al asignar).
            </p>
            <MarkdownEditor
              value={profileMd}
              onChange={setProfileMd}
              placeholder="# Perfil global…"
              rows={8}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Layers className="size-4" />
              Por proyecto ({projectNotes.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[180px] flex-1">
                <label className="mb-1 block text-xs text-neutral-500">Agregar proyecto asignado</label>
                <select
                  className={inputCls}
                  value={assignProjectId}
                  onChange={(e) => setAssignProjectId(e.target.value)}
                >
                  <option value="">Elegir proyecto…</option>
                  {projects
                    .filter((p) => !projectNotes.some((n) => n.project_id === p.id))
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code ? `${p.code} — ${p.name}` : p.name}
                      </option>
                    ))}
                </select>
                <p className="mt-1 text-[11px] text-neutral-400">
                  Solo proyectos aún no asignados. Para editar uno existente, elegilo en las pastillas de abajo.
                </p>
              </div>
              <Button size="sm" onClick={handleAssignProject} loading={assigning} disabled={!assignProjectId}>
                <Plus className="size-4" />
                Asignar
              </Button>
            </div>

            {projectNotes.length === 0 ? (
              <p className="text-sm text-neutral-500">
                Sin proyectos asignados. Usá el selector de arriba — solo aparecen aquí los que vos asignás.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  {projectNotes.map((n) => (
                    <div key={n.project_id} className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setActiveProjectId(n.project_id)}
                        className={cn(
                          "rounded-lg border px-3 py-1.5 text-xs font-medium transition",
                          activeNote?.project_id === n.project_id
                            ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
                            : "border-neutral-200 text-neutral-600 hover:border-neutral-400 dark:border-neutral-700 dark:text-neutral-300"
                        )}
                      >
                        {n.project_code || n.project_name}
                      </button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="size-7 p-0 text-neutral-400 hover:text-red-600"
                        title="Quitar del perfil"
                        loading={removingId === n.project_id}
                        onClick={() => handleUnassignProject(n.project_id)}
                      >
                        <X className="size-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
                {activeNote && (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="min-w-[140px] flex-1">
                        <label className="mb-1 block text-xs text-neutral-500">Rol en el proyecto</label>
                        <input
                          className={inputCls}
                          value={activeNote.role_in_project}
                          onChange={(e) =>
                            setProjectNotes((prev) =>
                              prev.map((n) =>
                                n.project_id === activeNote.project_id
                                  ? { ...n, role_in_project: e.target.value }
                                  : n
                              )
                            )
                          }
                        />
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-neutral-500">
                        Mi contexto en este proyecto (nota corta del integrante)
                      </label>
                      <MarkdownEditor
                        value={activeNote.md_notes}
                        onChange={(v) =>
                          setProjectNotes((prev) =>
                            prev.map((n) =>
                              n.project_id === activeNote.project_id ? { ...n, md_notes: v } : n
                            )
                          )
                        }
                        placeholder="Qué hago yo acá, restricciones, runbook personal…"
                        rows={5}
                      />
                      <div className="mt-2 flex justify-end">
                        <Button size="sm" onClick={handleSaveProjectNote} loading={savingNote}>
                          <Save className="size-4" />
                          Guardar mi contexto y rol
                        </Button>
                      </div>
                    </div>
                    <ProjectKnowledgePanel
                      projectId={activeNote.project_id}
                      projectCode={activeNote.project_code}
                    />
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Responsabilidades recurrentes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <DutyList duties={duties} onDelete={handleDeleteDuty} deletingId={deletingId} />
            <form onSubmit={handleAddDuty} className="space-y-3 rounded-xl border border-dashed border-neutral-200 p-4 dark:border-neutral-700">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Agregar acción repetitiva</p>
              <input className={inputCls} placeholder="Título (ej. Revisión backups Metabase)" value={dutyTitle} onChange={(e) => setDutyTitle(e.target.value)} required />
              <input className={inputCls} placeholder="Qué implica (opcional)" value={dutyDesc} onChange={(e) => setDutyDesc(e.target.value)} />
              <div className="grid grid-cols-3 gap-3">
                <select className={inputCls} value={dutyType} onChange={(e) => setDutyType(e.target.value as DutyType)}>
                  {(Object.keys(DUTY_TYPE_LABELS) as DutyType[]).map((t) => (
                    <option key={t} value={t}>{DUTY_TYPE_LABELS[t]}</option>
                  ))}
                </select>
                <input
                  type="number"
                  min={0}
                  max={40}
                  step={0.5}
                  className={inputCls}
                  value={dutyHours}
                  onChange={(e) => setDutyHours(Number(e.target.value))}
                  placeholder="h/semana"
                  title="Horas por semana"
                />
                <input
                  type="number"
                  min={0}
                  max={100}
                  className={inputCls}
                  value={dutyLoad}
                  onChange={(e) => setDutyLoad(Number(e.target.value))}
                  placeholder="% carga"
                />
              </div>
              <p className="text-[11px] text-neutral-400">Horas/semana y % carga alimentan la capacidad efectiva al asignar.</p>
              <Button type="submit" size="sm" loading={addingDuty}>
                <Plus className="size-4" />
                Agregar
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarOff className="size-4" />
              Ausencias
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {absences.length === 0 ? (
              <p className="text-sm text-neutral-500">Sin ausencias registradas.</p>
            ) : (
              <ul className="space-y-2">
                {absences.map((a) => (
                  <li key={a.id} className="rounded-lg border border-neutral-200 px-3 py-2.5 text-sm dark:border-neutral-800">
                    <div className="flex justify-between">
                      <span className="font-medium">{a.start_date} → {a.end_date}</span>
                      <span className={cn(
                        "text-xs font-medium",
                        a.status === "approved" ? "text-emerald-600" : a.status === "pending" ? "text-amber-600" : "text-neutral-400"
                      )}>
                        {a.status === "approved" ? "Aprobada" : a.status === "pending" ? "Pendiente" : "Cancelada"}
                      </span>
                    </div>
                    {a.reason && <p className="mt-1 text-xs text-neutral-500">{a.reason}</p>}
                  </li>
                ))}
              </ul>
            )}
            <form onSubmit={handleAddAbsence} className="space-y-3 rounded-xl border border-dashed border-neutral-200 p-4 dark:border-neutral-700">
              <div className="grid grid-cols-2 gap-3">
                <input type="date" className={inputCls} value={absStart} onChange={(e) => setAbsStart(e.target.value)} required />
                <input type="date" className={inputCls} value={absEnd} onChange={(e) => setAbsEnd(e.target.value)} required />
              </div>
              <input className={inputCls} placeholder="Motivo (opcional)" value={absReason} onChange={(e) => setAbsReason(e.target.value)} />
              <Button type="submit" size="sm" loading={addingAbsence}>Registrar ausencia</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="size-4" />
              Capacidad semanal
            </CardTitle>
          </CardHeader>
          <CardContent>
            {capacity && (
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <label className="mb-1 block text-xs text-neutral-500">Horas disponibles / semana</label>
                  <input
                    type="number"
                    min={1}
                    max={80}
                    className={cn(inputCls, "w-32")}
                    value={capacity.weekly_hours}
                    onChange={(e) => setCapacity({ ...capacity, weekly_hours: Number(e.target.value) })}
                  />
                </div>
                <Button size="sm" onClick={handleSaveCapacity} loading={savingCapacity}>
                  Guardar
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
