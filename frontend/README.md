# Frontend — Meeting-to-Tickets PM

Next.js 16 + TypeScript + Tailwind CSS 4. La reunión entra por un lado, el plan de trabajo aprobado sale por el otro.

Ver el contrato completo del equipo en [`../PROYECTO.md`](../PROYECTO.md).

## Correrlo

```bash
npm install
npm run dev
```

Abrí [http://localhost:3000](http://localhost:3000).

**No necesitás backend ni Supabase para probarlo.** Sin variables de entorno configuradas, la app corre en
**modo demo**: simula ElevenLabs, el Meeting Agent y el Assignment Agent localmente, siguiendo fielmente las
reglas del contrato (sección 4.6 de `PROYECTO.md`), y persiste el estado en `localStorage` del navegador.

## Conectar al backend / Supabase real

Copiá `.env.example` a `.env.local` y completá lo que ya esté listo:

```bash
NEXT_PUBLIC_API_URL=http://<ip-laptop-r1>:8000
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

- Si `NEXT_PUBLIC_API_URL` está seteada, todas las escrituras (`/api/transcribe`, `/api/agents/*`,
  `PATCH /api/tickets/:id`, `/api/approve/:id`) van al backend real. Si el backend no responde, cae
  automáticamente a la simulación local (ver `src/lib/api.ts`) para que la demo nunca se caiga en vivo.
- El cliente de Supabase (`src/lib/supabase.ts`) queda listo para lectura directa de `tickets`/`members`
  cuando R3 tenga el proyecto armado; mientras tanto, el store local (`src/lib/store.ts`) cumple ese rol.

## Estructura

```
src/
  app/                  rutas (App Router)
    page.tsx            Panel general
    reuniones/nueva/    Nueva reunión (pegar transcript / grabar audio → procesar)
    reuniones/[id]/     Board Kanban de una reunión
    equipo/             Skills y carga del equipo
    sistema/            Salud del backend, arquitectura, logs de agentes
  components/
    ui/                 primitivos (Button, Card, Badge, Dialog, Sheet, Tooltip...)
    layout/             Sidebar, AppShell, PageHeader
    meeting/            grabadora de audio, pasos del pipeline
    tickets/            Kanban, tarjeta de ticket, panel de detalle, badges de riesgo/prioridad
    requirements/       badge de estado, diálogo de aprobación
    team/, dashboard/, system/
  lib/
    types.ts            tipos alineados al CONTRATO (sección 4)
    mock-data.ts         seed de equipo + transcripts de ejemplo (dorado/realista)
    mock-engine.ts       simulación del Meeting Agent / Assignment Agent
    store.ts             estado global (Zustand + localStorage)
    api.ts               capa de datos: backend real con fallback a mock
    supabase.ts           cliente Supabase opcional
```

## Flujo de "menor cantidad de clicks"

1. **Panel** → clic en "Nueva reunión".
2. Pegás el transcript (o grabás audio) → un solo clic en **"Procesar con IA"** corre transcripción (si aplica),
   Meeting Agent y Assignment Agent, y te deja directo en el board con todo asignado.
3. En el board, **1 clic en "Aprobar plan"** (+ confirmación) dispara la notificación por email (n8n).

## Deploy en Netlify

Ya incluye `netlify.toml` con el plugin oficial de Next.js. Solo hace falta conectar el repo desde el
dashboard de Netlify ("Import an existing project" → GitHub → este repo, root `frontend/`) y, si aplica,
cargar las variables de entorno de `.env.example`.

## Scripts

- `npm run dev` — desarrollo con Turbopack
- `npm run build` — build de producción
- `npm run start` — sirve el build
- `npm run lint` — ESLint
