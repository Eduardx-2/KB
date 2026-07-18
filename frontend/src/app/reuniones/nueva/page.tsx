"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText, Mic, Sparkles, Wand2, BookOpen } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AudioRecorder } from "@/components/meeting/audio-recorder";
import { PipelineSteps, type PipelineStep } from "@/components/meeting/pipeline-steps";
import { useAppStore } from "@/lib/store";
import { createRequirementInBackend, fetchWorkspace, runAssignmentAgent, runMeetingAgent, transcribeAudio } from "@/lib/api";
import { GOLDEN_TRANSCRIPT, LANDING_ECOMMERCE_TRANSCRIPT, REALISTIC_TRANSCRIPT } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

type Source = "text" | "audio";

const TEXT_STEPS: PipelineStep[] = [
  { id: "meeting", label: "Analizando la reunión (Meeting Agent)", status: "pending" },
  { id: "assignment", label: "Cruzando tickets con el equipo (Assignment Agent)", status: "pending" },
];

const AUDIO_STEPS: PipelineStep[] = [
  { id: "transcribe", label: "Transcribiendo audio (ElevenLabs Scribe)", status: "pending" },
  ...TEXT_STEPS,
];

export default function NuevaReunionPage() {
  const router = useRouter();
  const createRequirement = useAppStore((s) => s.createRequirement);
  const setTranscript = useAppStore((s) => s.setTranscript);
  const renameRequirement = useAppStore((s) => s.renameRequirement);
  const applyMeetingOutput = useAppStore((s) => s.applyMeetingOutput);
  const applyAssignmentOutput = useAppStore((s) => s.applyAssignmentOutput);
  const setWorkspace = useAppStore((s) => s.setWorkspace);
  const projects = useAppStore((s) => s.projects);

  const [source, setSource] = useState<Source>("text");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [projectId, setProjectId] = useState("");
  const [processing, setProcessing] = useState(false);
  const [steps, setSteps] = useState<PipelineStep[]>(TEXT_STEPS);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const canProcess = useMemo(() => {
    if (processing) return false;
    return source === "text" ? text.trim().length > 20 : Boolean(audioBlob);
  }, [processing, source, text, audioBlob]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setProjectId(params.get("project_id") ?? "");
  }, []);

  function updateStep(id: string, status: PipelineStep["status"]) {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)));
  }

  async function handleProcess() {
    setErrorMsg(null);
    setProcessing(true);
    const initialSteps = source === "audio" ? AUDIO_STEPS : TEXT_STEPS;
    setSteps(initialSteps.map((s) => ({ ...s })));

    const hasCustomTitle = title.trim().length > 0;
    const autoTitle =
      title.trim() ||
      (source === "text" ? text : "Reunión grabada").slice(0, 60).replace(/\s+\S*$/, "") + "…";

    // Crear primero en el backend para obtener un UUID real de Supabase
    const { id: backendId } = await createRequirementInBackend(autoTitle, projectId || undefined);
    const requirementId = createRequirement(autoTitle, source === "text" ? text : "", backendId, projectId || undefined);

    try {
      let transcript = text;

      if (source === "audio" && audioBlob) {
        updateStep("transcribe", "active");
        const { text: transcribed } = await transcribeAudio(audioBlob);
        transcript = transcribed;
        setTranscript(requirementId, transcript);
        updateStep("transcribe", "done");
      }

      updateStep("meeting", "active");
      const { output: meetingOutput } = await runMeetingAgent(transcript, requirementId, projectId || undefined);
      applyMeetingOutput(requirementId, meetingOutput);
      if (!hasCustomTitle) {
        const shortTitle = meetingOutput.summary.split(/(?<=[.!?])\s/)[0]?.slice(0, 70) ?? autoTitle;
        renameRequirement(requirementId, shortTitle);
      }
      updateStep("meeting", "done");

      updateStep("assignment", "active");
      const { output: assignmentOutput } = await runAssignmentAgent(requirementId);
      applyAssignmentOutput(requirementId, assignmentOutput);
      updateStep("assignment", "done");

      const workspace = await fetchWorkspace();
      if (workspace.mode === "live") {
        setWorkspace(workspace);
      }

      toast.success("Plan de trabajo generado", {
        description: `${meetingOutput.tickets.length} tickets asignados al equipo.`,
      });
      router.push(`/reuniones/${requirementId}`);
    } catch (err) {
      const failing = steps.find((s) => s.status === "active");
      if (failing) updateStep(failing.id, "error");
      const detail = err instanceof Error ? err.message : "Error desconocido";
      setErrorMsg(detail);
      toast.error("No se pudo completar la extracción", { description: detail });
      setProcessing(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Nueva reunión"
        description="Pegá el transcript o grabá el audio. La IA hace el resto: resumen, tickets y asignación."
      />

      <div className="mx-auto max-w-5xl px-4 pt-4 sm:px-8">
        <div className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2">
            <BookOpen className="mt-0.5 size-4 shrink-0" />
            <p>
              <strong>Antes de asignar:</strong> cada developer debe tener su MD de proyectos/stack en el perfil.
              Sin eso, el Assignment Agent asigna a ciegas.
            </p>
          </div>
          <Link href="/equipo" className="shrink-0 text-sm font-medium underline underline-offset-2">
            Ir al equipo →
          </Link>
        </div>
      </div>

      <div className="mx-auto grid max-w-5xl gap-6 p-4 sm:p-8 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-5 sm:p-6">
          <div className="space-y-5">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-neutral-800 dark:text-neutral-200">
                Título de la reunión <span className="font-normal text-neutral-400">(opcional)</span>
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={processing}
                placeholder="Ej. Requerimientos de Finanzas — ERP"
                className="w-full rounded-lg border border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-900 outline-none transition focus:border-neutral-400 focus:ring-4 focus:ring-neutral-100 disabled:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder-neutral-500 dark:focus:border-neutral-500 dark:disabled:bg-neutral-900"
              />
            </div>

            {projects.length > 0 && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-neutral-800 dark:text-neutral-200">
                  Proyecto
                </label>
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  disabled={processing}
                  className="w-full rounded-lg border border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-900 outline-none transition focus:border-neutral-400 focus:ring-4 focus:ring-neutral-100 disabled:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                >
                  <option value="">Usar proyecto por defecto</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-neutral-400">
                  Las siguientes reuniones del mismo proyecto tomarán en cuenta tickets existentes para evitar duplicados.
                </p>
              </div>
            )}

            <div className="flex gap-1 rounded-lg bg-neutral-100 p-1 dark:bg-neutral-800">
              <button
                onClick={() => setSource("text")}
                disabled={processing}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition-colors",
                  source === "text"
                    ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-neutral-100"
                    : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
                )}
              >
                <FileText className="size-4" />
                Pegar transcript
              </button>
              <button
                onClick={() => setSource("audio")}
                disabled={processing}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition-colors",
                  source === "audio"
                    ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-neutral-100"
                    : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
                )}
              >
                <Mic className="size-4" />
                Grabar audio
              </button>
            </div>

            {source === "text" ? (
              <div>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  disabled={processing}
                  rows={12}
                  placeholder="Pegá acá la transcripción de la reunión de requerimientos…"
                  className="w-full resize-none rounded-lg border border-neutral-200 bg-white px-3.5 py-3 text-sm leading-relaxed text-neutral-900 outline-none transition focus:border-neutral-400 focus:ring-4 focus:ring-neutral-100 disabled:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder-neutral-500 dark:disabled:bg-neutral-900"
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    onClick={() => setText(GOLDEN_TRANSCRIPT)}
                    disabled={processing}
                    className="rounded-full border border-neutral-200 px-3 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
                  >
                    Usar transcript dorado (ERP)
                  </button>
                  <button
                    onClick={() => setText(REALISTIC_TRANSCRIPT)}
                    disabled={processing}
                    className="rounded-full border border-neutral-200 px-3 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
                  >
                    Usar transcript realista (CRM)
                  </button>
                  <button
                    onClick={() => setText(LANDING_ECOMMERCE_TRANSCRIPT)}
                    disabled={processing}
                    className="rounded-full border border-neutral-200 px-3 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
                  >
                    Landing e-commerce (granular)
                  </button>
                </div>
              </div>
            ) : (
              <AudioRecorder onRecorded={setAudioBlob} onClear={() => setAudioBlob(null)} />
            )}

            {errorMsg && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errorMsg}</p>
            )}

            <Button className="w-full" size="lg" disabled={!canProcess} loading={processing} onClick={handleProcess}>
              <Wand2 className="size-4" />
              Procesar con IA
            </Button>
            <p className="text-center text-xs text-neutral-400">
              1 clic: transcribe (si aplica), extrae tickets y asigna al equipo automáticamente.
            </p>
          </div>
        </Card>

        <Card className="h-fit p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900">
              <Sparkles className="size-3.5" />
            </div>
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Qué va a pasar</h3>
          </div>

          {processing ? (
            <PipelineSteps steps={steps} />
          ) : (
            <ol className="space-y-3 text-sm text-neutral-500 dark:text-neutral-400">
              <li className="flex gap-2">
                <span className="font-semibold text-neutral-400 dark:text-neutral-500">1.</span>
                {source === "audio"
                  ? "ElevenLabs transcribe el audio a texto."
                  : "Tu transcript se envía tal cual al Meeting Agent."}
              </li>
              <li className="flex gap-2">
                <span className="font-semibold text-neutral-400">2.</span>
                El Meeting Agent extrae un resumen y tickets accionables — sin inventar nada fuera del transcript.
              </li>
              <li className="flex gap-2">
                <span className="font-semibold text-neutral-400">3.</span>
                El Assignment Agent cruza cada ticket con el equipo de IT según skills y carga actual.
              </li>
              <li className="flex gap-2">
                <span className="font-semibold text-neutral-400">4.</span>
                Aterrizás directo en el board con todo ya asignado, listo para aprobar.
              </li>
            </ol>
          )}
        </Card>
      </div>
    </div>
  );
}
