# AI Meeting-to-Tickets PM

> "La reunión entra por un lado, el plan de trabajo aprobado sale por el otro."

Cursor Buildathon El Salvador · 4-5 julio 2026.

**La fuente de verdad del proyecto es [`PROYECTO.md`](./PROYECTO.md)** — arquitectura, contrato de
datos/endpoints, roles y guion de demo. Leelo primero.

## Estructura del repo

| Carpeta | Contenido | Dueño |
|---|---|---|
| [`frontend/`](./frontend) | Next.js + Tailwind — **listo y corriendo**, ver su README | R2 |
| [`backend/`](./backend) | Python FastAPI + agentes de IA | R1 |
| [`seed/`](./seed) | SQL de Supabase, transcripts de ejemplo, workflow n8n | R3 |
| [`docs/`](./docs) | Deck, guion de demo, capturas, video de respaldo | R4 |

## Estado actual

El **frontend está completo y funcional en modo demo** (sin depender de backend/Supabase todavía):
board Kanban, asignación con semáforo de riesgo, flujo de aprobación, y las 4 vistas del producto.
Ver [`frontend/README.md`](./frontend/README.md) para correrlo y para instrucciones de cómo conectarlo
al backend real y a Supabase apenas estén listos.
