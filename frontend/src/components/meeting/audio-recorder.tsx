"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square, Trash2, CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function formatTime(sec: number) {
  const m = Math.floor(sec / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(sec % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

export function AudioRecorder({
  onRecorded,
  onClear,
}: {
  onRecorded: (blob: Blob) => void;
  onClear: () => void;
}) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [hasClip, setHasClip] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [levels, setLevels] = useState<number[]>(Array(28).fill(4));

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (timerRef.current) clearInterval(timerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  function tickLevels() {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    const chunk = Math.floor(data.length / 28);
    const next = Array.from({ length: 28 }, (_, i) => {
      const slice = data.slice(i * chunk, (i + 1) * chunk);
      const avg = slice.reduce((a, b) => a + b, 0) / (slice.length || 1);
      return Math.max(4, Math.min(32, Math.round((avg / 255) * 32)));
    });
    setLevels(next);
    rafRef.current = requestAnimationFrame(tickLevels);
  }

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtx();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128;
      source.connect(analyser);
      analyserRef.current = analyser;
      rafRef.current = requestAnimationFrame(tickLevels);

      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        onRecorded(blob);
        setHasClip(true);
        stream.getTracks().forEach((t) => t.stop());
        audioCtx.close();
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      setError("No se pudo acceder al micrófono. Revisá los permisos del navegador.");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setLevels(Array(28).fill(4));
  }

  function clearClip() {
    setHasClip(false);
    setSeconds(0);
    onClear();
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-red-200 bg-red-50/60 px-6 py-10 text-center">
        <CircleAlert className="size-6 text-red-500" />
        <p className="text-sm text-red-700">{error}</p>
        <Button size="sm" variant="outline" onClick={() => setError(null)}>
          Reintentar
        </Button>
      </div>
    );
  }

  if (hasClip) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3.5">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <Mic className="size-4" />
          </div>
          <div>
            <p className="text-sm font-medium text-neutral-900">Audio grabado</p>
            <p className="text-xs text-neutral-500">Duración {formatTime(seconds)}</p>
          </div>
        </div>
        <button
          onClick={clearClip}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-neutral-500 hover:bg-neutral-200/60 hover:text-neutral-800"
        >
          <Trash2 className="size-3.5" />
          Borrar
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-neutral-200 bg-neutral-50 px-6 py-8">
      <div className="flex h-10 items-end gap-1">
        {levels.map((lvl, i) => (
          <span
            key={i}
            className={cn("w-1 rounded-full transition-all", recording ? "bg-neutral-900" : "bg-neutral-300")}
            style={{ height: `${lvl}px` }}
          />
        ))}
      </div>

      {recording ? (
        <>
          <p className="font-mono text-lg tabular-nums text-neutral-900">{formatTime(seconds)}</p>
          <Button variant="danger" onClick={stopRecording}>
            <Square className="size-4" />
            Detener grabación
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm text-neutral-500">Grabá la reunión directo desde el navegador</p>
          <Button onClick={startRecording}>
            <Mic className="size-4" />
            Empezar a grabar
          </Button>
        </>
      )}
    </div>
  );
}
