"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText, Mic, Sparkles, Wand2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AudioRecorder } from "@/components/meeting/audio-recorder";
import { PipelineSteps, type PipelineStep } from "@/components/meeting/pipeline-steps";
import { useAppStore } from "@/lib/store";
import { runAssignmentAgent, runMeetingAgent, transcribeAudio } from "@/lib/api";
import { GOLDEN_TRANSCRIPT, REALISTIC_TRANSCRIPT } from "@/lib/mock-data";
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

  const [source, setSource] = useState<Source>("text");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [processing, setProcessing] = useState(false);
  const [steps, setSteps] = useState<PipelineStep[]>(TEXT_STEPS);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const canProcess = useMemo(() => {
    if (processing) return false;
    return source === "text" ? text.trim().length > 20 : Boolean(audioBlob);
  }, [processing, source, text, audioBlob]);

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
    const requirementId = createRequirement(autoTitle, source === "text" ? text : "");

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
      const { output: meetingOutput } = await runMeetingAgent(transcript, requirementId);
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

      toast.success("Plan de trabajo generado", {
        description: `${meetingOutput.tickets.length} tickets asignados al equipo.`,
      });
      router.push(`/reuniones/${requirementId}`);
    } catch {
      const failing = steps.find((s) => s.status === "active");
      if (failing) updateStep(failing.id, "error");
      setErrorMsg("Algo falló procesando la reunión. Podés reintentar sin perder el texto.");
      setProcessing(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Nueva reunión"
        description="Pegá el transcript o grabá el audio. La IA hace el resto: resumen, tickets y asignación."
      />

      <div className="mx-auto grid max-w-5xl gap-6 p-4 sm:p-8 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-5 sm:p-6">
          <div className="space-y-5">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-neutral-800">
                Título de la reunión <span className="font-normal text-neutral-400">(opcional)</span>
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={processing}
                placeholder="Ej. Requerimientos de Finanzas — ERP"
                className="w-full rounded-lg border border-neutral-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-neutral-400 focus:ring-4 focus:ring-neutral-100 disabled:bg-neutral-50"
              />
            </div>

            <div className="flex gap-1 rounded-lg bg-neutral-100 p-1">
              <button
                onClick={() => setSource("text")}
                disabled={processing}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition-colors",
                  source === "text" ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-800"
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
                  source === "audio" ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-800"
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
                  className="w-full resize-none rounded-lg border border-neutral-200 px-3.5 py-3 text-sm leading-relaxed outline-none transition focus:border-neutral-400 focus:ring-4 focus:ring-neutral-100 disabled:bg-neutral-50"
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    onClick={() => setText(GOLDEN_TRANSCRIPT)}
                    disabled={processing}
                    className="rounded-full border border-neutral-200 px-3 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
                  >
                    Usar transcript dorado (ERP)
                  </button>
                  <button
                    onClick={() => setText(REALISTIC_TRANSCRIPT)}
                    disabled={processing}
                    className="rounded-full border border-neutral-200 px-3 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
                  >
                    Usar transcript realista (CRM)
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
            <div className="flex size-7 items-center justify-center rounded-lg bg-neutral-900 text-white">
              <Sparkles className="size-3.5" />
            </div>
            <h3 className="text-sm font-semibold text-neutral-900">Qué va a pasar</h3>
          </div>

          {processing ? (
            <PipelineSteps steps={steps} />
          ) : (
            <ol className="space-y-3 text-sm text-neutral-500">
              <li className="flex gap-2">
                <span className="font-semibold text-neutral-400">1.</span>
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
