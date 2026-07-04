# Frontend — Meeting-to-Tickets PM

> **Cursor Buildathon El Salvador · Julio 2026**
> Stack: Next.js 16 · TypeScript · Tailwind CSS 4 · Zustand · @dnd-kit

---

## Índice

1. [Descripción general](#descripción-general)
2. [Stack técnico](#stack-técnico)
3. [Estructura de archivos](#estructura-de-archivos)
4. [Vistas implementadas](#vistas-implementadas)
5. [Componentes UI](#componentes-ui)
6. [Capa de datos](#capa-de-datos)
7. [Estado global (Zustand)](#estado-global-zustand)
8. [Modo oscuro / claro](#modo-oscuro--claro)
9. [Configuración de despliegue](#configuración-de-despliegue)
10. [Variables de entorno](#variables-de-entorno)
11. [Comandos](#comandos)
12. [Porcentaje de avance del proyecto](#porcentaje-de-avance-del-proyecto)

---

## Descripción general

Aplicación web que convierte grabaciones o transcripciones de reuniones de requerimientos en un plan de trabajo estructurado con tickets asignados al equipo de IT, usando agentes de IA (OpenAI GPT-4o-mini + ElevenLabs Scribe).

**Flujo principal:**
```
Reunión (audio / transcript)
  → ElevenLabs Scribe (transcripción)
  → Meeting Agent (GPT-4o-mini) → resumen + tickets
  → Assignment Agent (GPT-4o-mini) → asignación por skill/carga
  → Board Kanban → aprobación → notificación (n8n webhook)
```

Opera en **modo demo** (motor mock local, sin backend) o **modo live** (FastAPI backend real), detectado automáticamente por `NEXT_PUBLIC_API_URL`.

---

## Stack técnico

| Capa | Tecnología |
|---|---|
| Framework | Next.js 16.2 (App Router, Turbopack) |
| Lenguaje | TypeScript 5 (strict) |
| Estilos | Tailwind CSS 4 (CSS-first config) |
| Estado | Zustand 5 + `persist` middleware |
| Drag & drop | @dnd-kit/core |
| Iconos | lucide-react |
| Notificaciones | sonner |
| Fechas | date-fns |
| Fuentes | Geist Sans / Geist Mono (next/font) |
| Deploy target | Netlify / Vercel |

---

## Estructura de archivos

```
frontend/
├── src/
│   ├── app/                          # App Router (Next.js)
│   │   ├── globals.css               # Variables CSS + Tailwind config
│   │   ├── layout.tsx                # Root layout (ThemeProvider, AppShell, Toaster)
│   │   ├── page.tsx                  # /  → Dashboard general
│   │   ├── proyectos/
│   │   │   └── page.tsx              # /proyectos → Vista granulada de proyectos
│   │   ├── reuniones/
│   │   │   ├── nueva/
│   │   │   │   └── page.tsx          # /reuniones/nueva → Nueva reunión
│   │   │   └── [id]/
│   │   │       └── page.tsx          # /reuniones/[id] → Board Kanban
│   │   ├── equipo/
│   │   │   ├── page.tsx              # /equipo → Vista del equipo
│   │   │   └── [id]/
│   │   │       └── page.tsx          # /equipo/[id] → Dashboard por developer
│   │   └── sistema/
│   │       └── page.tsx              # /sistema → Health + logs de agentes
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   ├── app-shell.tsx         # Layout principal (sidebar + header móvil)
│   │   │   ├── sidebar.tsx           # Sidebar con nav + toggle dark mode
│   │   │   ├── nav-items.ts          # Definición de rutas del nav
│   │   │   ├── page-header.tsx       # Cabecera de página reutilizable
│   │   │   ├── theme-provider.tsx    # Contexto de tema claro/oscuro
│   │   │   ├── store-hydrator.tsx    # Hidratación de Zustand persist
│   │   │   └── connection-badge.tsx  # Badge de estado del backend
│   │   │
│   │   ├── ui/                       # Sistema de diseño base
│   │   │   ├── avatar.tsx
│   │   │   ├── badge.tsx
│   │   │   ├── button.tsx            # Variantes: primary/secondary/outline/ghost/danger
│   │   │   ├── card.tsx
│   │   │   ├── dialog.tsx            # Dialog + Sheet (panel lateral)
│   │   │   ├── empty-state.tsx
│   │   │   ├── progress-bar.tsx
│   │   │   ├── skeleton.tsx
│   │   │   └── tooltip.tsx
│   │   │
│   │   ├── dashboard/
│   │   │   ├── requirement-row.tsx   # Fila de reunión en el dashboard
│   │   │   └── stat-card.tsx         # Tarjeta de estadística
│   │   │
│   │   ├── meeting/
│   │   │   ├── audio-recorder.tsx    # Grabador de audio con visualizador
│   │   │   └── pipeline-steps.tsx    # Stepper del pipeline de IA
│   │   │
│   │   ├── tickets/
│   │   │   ├── kanban-board.tsx      # Board Kanban principal (DnD)
│   │   │   ├── kanban-column.tsx     # Columna droppable
│   │   │   ├── ticket-card.tsx       # Tarjeta draggable
│   │   │   ├── ticket-detail-sheet.tsx # Panel lateral de detalle
│   │   │   ├── priority-badge.tsx
│   │   │   └── risk-badge.tsx        # Badge con tooltip de razonamiento
│   │   │
│   │   ├── requirements/
│   │   │   ├── approve-dialog.tsx    # Diálogo de aprobación
│   │   │   └── status-badge.tsx      # Badge de estado de requisito
│   │   │
│   │   ├── team/
│   │   │   └── member-card.tsx       # Tarjeta de developer (clickeable)
│   │   │
│   │   └── system/
│   │       ├── agent-logs-table.tsx  # Tabla de logs de agentes
│   │       └── health-card.tsx       # Estado de salud del backend
│   │
│   └── lib/
│       ├── types.ts                  # Interfaces TypeScript (contrato 4.x)
│       ├── mock-data.ts              # Datos seed y transcripts de ejemplo
│       ├── mock-engine.ts            # Simulación local de Meeting/Assignment Agent
│       ├── api.ts                    # Cliente API (live + mock fallback)
│       ├── store.ts                  # Zustand store global
│       ├── supabase.ts               # Cliente Supabase (lectura directa opcional)
│       └── utils.ts                  # cn, formatters, color helpers
│
├── .env.example
├── netlify.toml
├── next.config.ts
├── tailwind.config.ts
└── package.json
```

---

## Vistas implementadas

### `/` — Dashboard general
- 4 stat cards: reuniones procesadas, pendientes de aprobar, tickets en riesgo alto, carga promedio del equipo
- Lista de reuniones recientes con estado, cantidad de tickets y tiempo relativo
- Estado vacío con CTA cuando no hay reuniones

### `/proyectos` — Vista granulada de proyectos ⭐
- **Tab "Proyectos"**: tarjeta colapsable por cada reunión procesada con:
  - Barra de progreso multi-segmento (done / in_progress / todo / backlog)
  - Porcentaje de avance y horas entregadas vs estimadas
  - Alertas de riesgo alto
  - Por cada developer: sus tickets en ese proyecto con estado, horas, prioridad
  - Link directo al board Kanban del proyecto
- **Tab "Equipo cruzado"**: fila por developer mostrando:
  - En cuántos proyectos simultáneos está trabajando
  - Chips con nombre abreviado de cada proyecto + cantidad de tickets
  - Barra de carga actual
  - Badge de tickets en progreso

### `/reuniones/nueva` — Nueva reunión
- Selector de fuente: texto (pegar transcript) o audio (grabar desde el navegador)
- Campo de título opcional (se genera automáticamente desde el resumen de IA)
- Grabador de audio con visualizador de frecuencias en tiempo real (Web Audio API)
- Botones de transcript de demo (ERP dorado / CRM realista)
- Pipeline steps animado: Transcripción → Meeting Agent → Assignment Agent
- Panel informativo de qué hace cada paso

### `/reuniones/[id]` — Board Kanban
- 4 columnas: Backlog / Por hacer / En progreso / Hecho
- Drag & drop de tickets entre columnas (@dnd-kit)
- Panel lateral (Sheet) de detalle de ticket con:
  - Cambiar estado, asignado y fecha límite
  - Razonamiento del Assignment Agent con badge de riesgo
- Botón de aprobación con diálogo de confirmación (lista de destinatarios de email)
- Modal de transcript original
- Integración con webhook n8n al aprobar

### `/equipo` — Vista del equipo
- 4 stat cards del equipo: miembros, carga promedio, tickets completados, riesgo alto
- Grid de tarjetas por developer (clickeables, link a `/equipo/[id]`)
- Cada tarjeta muestra: skills, barra de carga, tickets asignados, % completados

### `/equipo/[id]` — Dashboard individual del developer ⭐
- Perfil + gauge de carga con alerta de sobrecarga (>80%)
- 4 métricas: total tickets, completados, en progreso, horas restantes
- Distribución visual por estado (barra proporcional + leyenda)
- Exposición al riesgo: riesgo promedio, velocidad de entrega, conteo riesgo alto
- **Proyección textual**: sobrecargado / carga moderada / capacidad disponible
- Tickets agrupados por proyecto con link a cada board

### `/sistema` — Estado del sistema
- Health card del backend (live/demo)
- Tabla de logs de agentes: agente, modelo, latencia, estado, tiempo relativo
- Polling automático cada 30s

---

## Componentes UI

### Sistema de diseño

Todos los componentes soportan **modo oscuro** con variantes `dark:` de Tailwind.

| Componente | Descripción |
|---|---|
| `Button` | 5 variantes × 3 tamaños, estado loading con spinner |
| `Card` | Contenedor con borde y sombra suave |
| `Badge` | Pill con punto de color opcional |
| `Avatar` | Iniciales con paleta de colores determinista |
| `Dialog` | Modal con backdrop blur y escape |
| `Sheet` | Panel lateral deslizable |
| `EmptyState` | Estado vacío con ícono, título, descripción y acción |
| `Skeleton` | Placeholder animado para carga |
| `ProgressBar` | Barra de progreso con color configurable |
| `Tooltip` | Tooltip accesible |

---

## Capa de datos

### Modo demo (sin backend)
`mock-engine.ts` simula localmente los agentes de IA:

- **MeetingAgent**: parsea el transcript y genera 3-7 tickets con título, descripción, prioridad, skill requerido y estimación de horas
- **AssignmentAgent**: cruza tickets con miembros del equipo por skill matching, calcula `risk_pct` según carga actual y disponibilidad única

Los datos seed incluyen dos proyectos precargados:
- **ERP de Finanzas** (estado: aprobado) — 4 tickets asignados
- **Mini CRM Ventas** (estado: tickets listos) — 4 tickets en backlog

### Modo live (con backend FastAPI)
Cuando `NEXT_PUBLIC_API_URL` está definida, `api.ts` hace calls reales:
- `POST /api/v1/meeting-agent/run`
- `POST /api/v1/assignment-agent/run`
- `POST /api/v1/tickets/{id}` (PATCH)
- `POST /api/v1/requirements/{id}/approve`
- `GET /api/v1/health`

---

## Estado global (Zustand)

```typescript
interface AppState {
  hydrated: boolean          // hidratación completada
  members: Member[]          // equipo de IT
  requirements: Requirement[] // reuniones procesadas
  tickets: Ticket[]          // tickets generados
  agentLogs: AgentLog[]      // historial de agentes

  // Acciones
  setHydrated()
  createRequirement(title, transcript) → id
  setTranscript(id, text)
  renameRequirement(id, title)
  applyMeetingOutput(id, output)
  applyAssignmentOutput(id, output)
  updateTicket(id, patch)
  approveRequirement(id)
  addAgentLog(log)
}
```

Persistido en `localStorage` bajo la clave `kb-meeting-pm-demo`. El campo `hydrated` se excluye del storage con `partialize` para evitar el bug de loading infinito.

---

## Modo oscuro / claro

- **Toggle**: botón Sol/Luna en la parte inferior del sidebar
- **Persistencia**: preferencia guardada en `localStorage` bajo `kb-theme`
- **Detección inicial**: `prefers-color-scheme` del sistema operativo
- **Sin flash**: script inline en `<head>` aplica el tema antes del primer render
- **Implementación**: clase `dark` en `<html>`, variante `@variant dark` en Tailwind v4

```css
/* globals.css */
:root  { --background: #fafafa; --foreground: #171717; ... }
.dark  { --background: #0c0c0c; --foreground: #f5f5f5; ... }
@variant dark (&:where(.dark, .dark *));
```

---

## Configuración de despliegue

### Netlify (`netlify.toml`)
```toml
[build]
  base    = "frontend"
  command = "npm run build"
  publish = ".next"

[[plugins]]
  package = "@netlify/plugin-nextjs"
```

### Variables requeridas en producción

| Variable | Descripción |
|---|---|
| `NEXT_PUBLIC_API_URL` | URL del backend FastAPI (ej. `https://api.kb-pm.com`) |
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase (opcional) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key de Supabase (opcional) |

Si `NEXT_PUBLIC_API_URL` no está definida, la app opera en modo demo con datos mock locales — **totalmente funcional para demos sin backend**.

---

## Variables de entorno

Copiar `.env.example` a `.env.local`:

```bash
# Backend FastAPI (opcional — sin esto usa modo mock)
NEXT_PUBLIC_API_URL=http://localhost:8000

# Supabase (opcional — para lectura directa de BD)
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

---

## Comandos

```bash
# Desarrollo
cd frontend
npm install
npm run dev          # http://localhost:3000

# Verificación de tipos
npm run lint
npx tsc --noEmit

# Build de producción
npm run build
npm run start        # Preview del build
```

---

## Porcentaje de avance del proyecto

| Módulo | Estado | % |
|---|---|---|
| **Frontend** | | |
| Sistema de diseño (UI kit) | ✅ Completo | 100% |
| Dark mode / Light mode | ✅ Completo | 100% |
| Layout + navegación + responsive | ✅ Completo | 100% |
| Dashboard general | ✅ Completo | 100% |
| Vista de proyectos (granulada) | ✅ Completo | 100% |
| Nueva reunión (texto + audio) | ✅ Completo | 100% |
| Board Kanban + drag & drop | ✅ Completo | 100% |
| Detalle de ticket + edición | ✅ Completo | 100% |
| Aprobación + n8n webhook | ✅ Completo | 100% |
| Vista del equipo (overview) | ✅ Completo | 100% |
| Dashboard individual por developer | ✅ Completo | 100% |
| Vista de estado del sistema | ✅ Completo | 100% |
| Capa mock (demo sin backend) | ✅ Completo | 100% |
| Integración API FastAPI (live) | ✅ Completo | 100% |
| **Frontend Total** | **Completo** | **100%** |
| | | |
| **Backend** | | |
| FastAPI setup + health endpoint | ✅ Completo | 100% |
| Modelos Pydantic (contrato 4.x) | ✅ Completo | 100% |
| Meeting Agent endpoint | 🔲 Pendiente | 0% |
| Assignment Agent endpoint | 🔲 Pendiente | 0% |
| Supabase schema + migrations | 🔲 Pendiente | 0% |
| CRUD tickets y requirements | 🔲 Pendiente | 0% |
| Webhook n8n de notificación | 🔲 Pendiente | 0% |
| Auth (API key / JWT) | 🔲 Pendiente | 0% |
| **Backend Total** | **En progreso** | **~15%** |
| | | |
| **Agentes IA** | | |
| Prompt de Meeting Agent | 🔲 Pendiente | 0% |
| Prompt de Assignment Agent | 🔲 Pendiente | 0% |
| Integración ElevenLabs Scribe | 🔲 Pendiente | 0% |
| **Agentes Total** | **Pendiente** | **0%** |
| | | |
| **Infraestructura / DevOps** | | |
| Netlify deploy config | ✅ Completo | 100% |
| Variables de entorno documentadas | ✅ Completo | 100% |
| CI/CD pipeline | 🔲 Pendiente | 0% |
| Docker / contenedores | 🔲 Pendiente | 0% |
| **Infra Total** | **Parcial** | **25%** |

### **Avance global estimado: ~45%**

> El frontend está al 100% — funcional, con dark mode, responsive, con datos reales o demo, listo para deploy.
> El bloque pendiente es backend + agentes IA reales + infraestructura de producción completa.

---

*Generado el 4 de julio de 2026 · Meeting-to-Tickets PM · Cursor Buildathon El Salvador*
