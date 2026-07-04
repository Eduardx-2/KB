import { ArrowRight, Bot, Database, Mail, Mic, MonitorSmartphone, Server } from "lucide-react";
import { Card } from "@/components/ui/card";

const NODES = [
  { icon: MonitorSmartphone, label: "Next.js", sub: "Netlify" },
  { icon: Server, label: "FastAPI", sub: "Backend" },
];

const SERVICES = [
  { icon: Mic, label: "ElevenLabs Scribe", sub: "audio → texto" },
  { icon: Bot, label: "OpenAI gpt-4o-mini", sub: "texto → tickets" },
  { icon: Database, label: "Supabase", sub: "datos" },
  { icon: Mail, label: "n8n cloud", sub: "emails" },
];

export function ArchitectureDiagram() {
  return (
    <Card className="p-5">
      <p className="mb-4 text-sm font-semibold text-neutral-900">Arquitectura</p>
      <div className="flex flex-wrap items-center gap-3">
        {NODES.map((n, i) => (
          <div key={n.label} className="flex items-center gap-3">
            <div className="flex items-center gap-2.5 rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5">
              <n.icon className="size-4 text-neutral-500" />
              <div>
                <p className="text-xs font-semibold text-neutral-800">{n.label}</p>
                <p className="text-[10px] text-neutral-400">{n.sub}</p>
              </div>
            </div>
            {i < NODES.length - 1 && <ArrowRight className="size-4 text-neutral-300" />}
          </div>
        ))}
      </div>

      <div className="my-3 ml-2 h-4 w-px bg-neutral-200" />

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {SERVICES.map((s) => (
          <div key={s.label} className="flex items-center gap-2 rounded-xl bg-neutral-50 px-3 py-2.5">
            <s.icon className="size-3.5 shrink-0 text-neutral-400" />
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-neutral-700">{s.label}</p>
              <p className="truncate text-[10px] text-neutral-400">{s.sub}</p>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-4 text-xs leading-relaxed text-neutral-400">
        Regla del contrato: la web nunca habla directo con la IA. El backend es el único que conoce las llaves
        secretas; el frontend lee tickets/miembros directo de Supabase y solo escribe a través del backend.
      </p>
    </Card>
  );
}
