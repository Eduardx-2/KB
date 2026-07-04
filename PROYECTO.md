# PROYECTO.md — Plano contextual del equipo
## AI Meeting-to-Tickets PM · Cursor Buildathon El Salvador · 4-5 julio 2026

> **Este archivo es la fuente de verdad.** Si tenés una duda, primero buscá aquí. La sección CONTRATO se congela en la hora 0:45 y nadie la modifica sin acuerdo de los 4.

---

## 1. QUÉ ESTAMOS CONSTRUYENDO (léelo aunque tengas prisa)

Una web app donde un manager sube o graba la reunión de requerimientos con otra área. La IA:
1. Transcribe el audio a texto (ElevenLabs Scribe)
2. Extrae resumen + tickets accionables (OpenAI, Meeting Agent)
3. Cruza los tickets con el equipo de IT (skills + carga actual) y asigna cada uno con % de riesgo (OpenAI, Assignment Agent)
4. Lo muestra en un board Kanban
5. El jefe aprueba con 1 clic → n8n manda los emails a cada asignado

**Frase del pitch:** "La reunión entra por un lado, el plan de trabajo aprobado sale por el otro."

**Lo que NO construimos** (se dice como roadmap en el pitch): ingesta del organigrama real, mover deadlines automáticamente, análisis histórico de incumplimiento.

## 2. ARQUITECTURA (quién habla con quién)

```
[Navegador / Next.js en Netlify]
        │  (la web NUNCA habla directo con la IA)
        ▼
[Backend Python FastAPI — laptop de R1, puerto 8000]
   ├──► ElevenLabs Scribe  (audio → texto)
   ├──► OpenAI gpt-4o-mini (texto → formularios JSON exactos)
   ├──► Supabase           (guardar/leer tablas)
   └──► n8n cloud webhook  (al aprobar → emails)
```

Regla: el backend es el único que conoce las llaves secretas. El frontend solo pide y muestra.

## 3. STACK Y CUENTAS

| Pieza | Herramienta | Dueño |
|---|---|---|
| Frontend | Next.js + Tailwind, deploy en Netlify | R2 |
| Backend | Python 3.11+, FastAPI, Pydantic v2 (código base ya generado en `/backend`) | R1 |
| LLM | OpenAI `gpt-4o-mini` con Structured Outputs, `temperature: 0` | R1 |
| Transcripción | ElevenLabs Scribe (`scribe_v1`, idioma es) | R1 |
| DB | Supabase (proyecto compartido del equipo) | R3 crea, todos usan |
| Emails/automatización | n8n cloud (crédito Pro del evento) | R3 |
| IDE | Cursor (todos) + Codex para tareas paralelas | todos |

Llaves necesarias (van en `.env`, NUNCA en el código ni por WhatsApp — usar el vault del equipo):
`OPENAI_API_KEY, ELEVENLABS_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, N8N_WEBHOOK_URL`

Ramas Git: `main` protegida; cada quien trabaja en `r1/`, `r2/`, `r3/`. Merge a main cada ~2h, lo coordinan R4 + el dueño de la rama. Carpetas: `backend/` = R1 · `frontend/` = R2 · `seed/` = R3 · `docs/` = R4.

---

## 4. 🔒 CONTRATO (congelado a H0:45 — no se toca después)

### 4.1 Tablas Supabase

```sql
create table members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text,
  skills text[] default '{}',
  current_load int default 0,        -- 0 a 100
  team_id text default 'demo'
);

create table requirements (
  id uuid primary key default gen_random_uuid(),
  title text,
  raw_transcript text,
  summary text,
  status text default 'draft',       -- draft | extracted | approved
  created_at timestamptz default now(),
  team_id text default 'demo'
);

create table tickets (
  id uuid primary key default gen_random_uuid(),
  requirement_id uuid references requirements(id),
  title text not null,
  description text,
  priority text,                     -- low | medium | high
  estimate_hours int,
  risk_pct int default 0,            -- 0 a 100
  assignee_id uuid references members(id),
  status text default 'backlog',     -- backlog | todo | in_progress | done
  deadline date,
  team_id text default 'demo'
);

create table agent_logs (
  id uuid primary key default gen_random_uuid(),
  agent text,
  latency_ms int,
  model text,
  ok boolean,
  created_at timestamptz default now()
);
```

### 4.2 Endpoints del backend (base: `http://<ip-laptop-R1>:8000`)

| Método y ruta | Recibe | Devuelve |
|---|---|---|
| `POST /api/transcribe` | archivo de audio (FormData, campo `file`) | `{"text": "..."}` |
| `POST /api/agents/meeting` | `{"transcript": "...", "requirement_id": "uuid"}` | MeetingAgentOutput (y guarda tickets en DB) |
| `POST /api/agents/assignment` | `{"requirement_id": "uuid"}` | AssignmentAgentOutput (y actualiza assignees en DB) |
| `PATCH /api/tickets/{id}` | `{"status"?|"assignee_id"?|"deadline"?}` | el ticket actualizado |
| `POST /api/approve/{requirement_id}` | — | `{"status":"approved", "n8n_notified": true}` (dispara webhook n8n) |
| `GET /api/health` | — | `{"status":"ok","version":"v2"}` |

El frontend LEE tickets/members directo de Supabase con el cliente JS (clave anon). Solo ESCRIBE a través del backend.

### 4.3 Formas exactas (schemas)

```
Ticket:                  title, description, priority(low|medium|high),
                         estimate_hours(int), required_skill(frontend|backend|data|qa|devops)
MeetingAgentOutput:      summary(str), tickets(Ticket[])
AssignmentRecommendation: ticket_title, assignee_name, risk_pct(0-100), reasoning(1 frase)
AssignmentAgentOutput:   recommendations(AssignmentRecommendation[])
```

### 4.4 MOCKS (R2 trabaja contra ESTO toda la mañana)

`POST /api/agents/meeting` responde:
```json
{
  "summary": "Finanzas necesita un ERP con módulo de costos e inventario, migrando la data histórica de Excel, en un plazo de 3 a 6 meses.",
  "tickets": [
    {"title": "Diseñar esquema de datos del módulo de costos", "description": "Modelar tablas de costos y rentabilidad por producto.", "priority": "high", "estimate_hours": 16, "required_skill": "data"},
    {"title": "API de carga de Excel históricos", "description": "Endpoint que recibe archivos Excel y los normaliza.", "priority": "high", "estimate_hours": 24, "required_skill": "backend"},
    {"title": "Pantalla de conciliación de inventario", "description": "Vista para cuadrar inventario contra registros.", "priority": "medium", "estimate_hours": 20, "required_skill": "frontend"},
    {"title": "Plan de pruebas del módulo de costos", "description": "Casos de prueba de cálculos y cargas.", "priority": "medium", "estimate_hours": 8, "required_skill": "qa"}
  ]
}
```

`POST /api/agents/assignment` responde:
```json
{
  "recommendations": [
    {"ticket_title": "Diseñar esquema de datos del módulo de costos", "assignee_name": "Carla", "risk_pct": 25, "reasoning": "Skill de data y carga baja."},
    {"ticket_title": "API de carga de Excel históricos", "assignee_name": "Beto", "risk_pct": 80, "reasoning": "Único backend pero está al 85% de carga."},
    {"ticket_title": "Pantalla de conciliación de inventario", "assignee_name": "Ana", "risk_pct": 35, "reasoning": "Frontend con carga media."},
    {"ticket_title": "Plan de pruebas del módulo de costos", "assignee_name": "David", "risk_pct": 50, "reasoning": "QA con carga moderada."}
  ]
}
```

### 4.5 Seed data (equipo ficticio — R3 lo inserta antes de H2)

| name | role | skills | current_load |
|---|---|---|---|
| Ana | Frontend Dev | {frontend} | 40 |
| Beto | Backend Dev | {backend} | 85 |
| Carla | Data Analyst | {data} | 30 |
| David | QA Engineer | {qa} | 60 |
| Elena | Redes | {devops} | 20 |

Nota de demo: Beto saturado → sus tickets salen con riesgo alto (rojo). Elena es de redes → si el requerimiento no lo necesita, no recibe nada. Ambos momentos se señalan en el pitch.

### 4.6 Prompts de los agentes (ya implementados en `backend/services.py`)

- Meeting Agent: analista de requerimientos; extrae resumen 2-3 frases + tickets; NO inventa tickets que no estén en el transcript. El transcript viaja SIEMPRE como mensaje `user` (anti prompt-injection).
- Assignment Agent: PM técnico; matchea skill; si `current_load > 70` sube `risk_pct`; si nadie tiene la skill, asigna al de menor carga con riesgo >= 70.

---

## 5. ROLES Y PILAS DE TAREAS

**Regla de oro: nunca esperás a una persona, esperás al contrato.** Bloqueado en tu P0 → bajás a tu P1. Si decís "no puedo avanzar porque falta X de otro", avisale a R4 y se resuelve con un mock en 5 minutos.

### R1 — Backend + IA (Python)
- **H1–H3.5 · P0:** correr el backend base de `/backend` (`pip install -r requirements.txt`, llenar `.env`, `uvicorn main:app --reload`). Verificar `/api/health`. Probar `POST /api/agents/meeting` con el transcript dorado desde `/docs` (la página de pruebas que FastAPI genera sola). Objetivo: JSON con tickets reales ANTES de que exista la web.
- **P1:** probar `/api/transcribe` con un audio corto grabado en el celular.
- **H3.5–H7 · P0:** assignment real probado; `/approve` disparando el webhook de R3; pipeline completo por `/docs` con los 2 transcripts.
- **H7–H10.5:** timeouts y errores limpios; congelar dependencias. **P1:** endpoint `/api/speak` (TTS ElevenLabs).
- Su laptop queda enchufada, sin dormirse, con IP anotada en este archivo: `IP LAPTOP R1: ______________`

### R2 — Frontend (Next.js)
- **H1–H3.5 · P0:** proyecto Next.js en `/frontend`, deploy inmediato a Netlify (aunque esté vacío). Pantalla "Nueva reunión" (textarea + botón grabar + procesar) y board Kanban 4 columnas, TODO contra los mocks de la sección 4.4.
- **P1:** grabadora de audio del navegador (MediaRecorder).
- **H3.5–H7 · P0:** conectar a backend real (cambiar la URL base); mover card = PATCH; vista de asignación con semáforo de riesgo (verde <40, amarillo 40-70, rojo >70) y reasoning en tooltip; botón "Aprobar plan".
- **H7–H10.5:** spinners y mensajes de error visibles; responsive (los jueces abren desde celular); pulido.

### R3 — Datos + n8n
- **H1–H2 · P0 ABSOLUTO:** crear proyecto Supabase, correr el SQL de 4.1, insertar el seed de 4.5, repartir llaves por el vault. Escribir 2 transcripts de ejemplo en `/seed`: el dorado (~300 palabras, pide un ERP de finanzas con costos, inventario y migración de Excel) y uno realista (~800 palabras con muletillas).
- **H2–H3.5 · P0:** workflow n8n "Aprobación": Webhook → formatear → email a cada assignee + email al jefe → nodo IF (risk_pct > 60 → alerta extra). Probarlo con curl usando el mock de 4.4. Pegar la URL del webhook en el vault y en `.env` de R1.
- **H3.5–H7:** probar el flujo con el payload REAL de `/approve`; guardar respuestas reales de la IA en `/seed/cached/` (respaldo).
- **H7–H10.5:** `seed/reset_demo.sql` (limpia y re-siembra para los ensayos); README de "levantar todo en 3 comandos"; **P1:** workflow cron de deadlines vencidas.

### R4 — Producto + pitch (no programa)
- **H1–H3.5:** guion de demo (sección 7); escribir a mano el output esperado del transcript dorado; foto + tweet H1; esqueleto del deck (6 slides: problema, solución, arquitectura, demo, roadmap, equipo).
- **H3.5–H7:** probar cada pieza como usuario apenas aterrice; lista ROTO/RARO/FEO con capturas; tweet H5 con video corto.
- **H7–H10.5:** ensayo #1 cronometrado; GRABAR VIDEO DE RESPALDO (guardarlo en 2 lugares); terminar deck; QR a la URL de Netlify.
- **H10.5–H13:** ensayos #2 y #3; repartir el pitch; tweet con video de 30s.

## 6. CHECKPOINTS (R4 hace la ronda, respuestas sí/no)

- **H3.5:** ¿Netlify vivo? ¿La IA devolvió tickets del transcript dorado por `/docs`? ¿Seed en Supabase? ¿Email de prueba de n8n recibido?
- **H7 — EL SAGRADO:** ¿Puede R4, solo, pegar el transcript → ver tickets asignados en el board → aprobar → recibir el email? Si NO → reglas de corte YA.
- **H10.5:** ¿Video de respaldo en 2 lugares? ¿Cuánto duró la demo? ¿Qué se rompió?
- **H13:** build congelado, nadie agrega features. H13–H15 = colchón.

## 7. GUION DE DEMO (3 minutos)

1. (20s) Problema: las reuniones de requerimientos mueren en un Excel y en más reuniones.
2. (40s) R4 graba 30s de audio en vivo actuando de "jefa de finanzas" pidiendo el ERP.
3. (30s) Aparece la transcripción (ElevenLabs).
4. (30s) Meeting Agent extrae los tickets en vivo (2-6s de espera; se narra encima).
5. (40s) Assignment: board con asignaciones y semáforo. Señalar: Beto en rojo por saturado, Elena sin tickets porque es de redes — "la IA entiende quién es quién".
6. (40s) Clic en Aprobar → email llegando en vivo al celular de R3 (pantalla partida). Remate: QR en pantalla — "está deployado, úsenlo ahora".

Respaldos, en orden: video grabado en H10.5 → outputs cacheados en `/seed/cached/`.

## 8. REGLAS DE CORTE (R4 decide, sin votación, en este orden)

1. ¿Desbloquea la demo? No → fuera, va al slide de roadmap.
2. Assignment Agent es cortable (Meeting + board + aprobar + email ya es demo completa).
3. TTS cortable. 4. Grabación en vivo cortable (pegar texto + audio pregrabado). 5. Auth cortable (login falso). 6. Dashboard cortable.
7. NO negociable: transcript → tickets → board → aprobar, en vivo o por video.

## 9. RESPUESTAS PARA JUECES

- **Arquitectura:** "Serverless donde importa (Netlify, Supabase, n8n cloud) y un backend Python liviano. Structured Outputs garantiza el JSON: cero parseo frágil."
- **Seguridad:** "Llaves solo en el servidor; el transcript viaja como mensaje user separado del system, lo que mitiga prompt injection; RLS por team_id en Supabase."
- **Costos:** "~$0.02 por reunión procesada."
- **Roadmap:** "Conectar Jira/Slack reales, re-priorización con aprobación humana, análisis de incumplimiento, y modo on-premise con modelos locales para datos sensibles."

## 10. SI ALGO SE ROMPE (arreglos ya decididos)

| Síntoma | Arreglo |
|---|---|
| Backend no arranca | 90% es el `.env`: llave mal copiada o falta una variable. Compará contra `.env.example` |
| Frontend no ve al backend | ¿Misma red? ¿IP correcta de la laptop R1? ¿Firewall de Windows bloqueando el puerto 8000? Plan B: correr frontend en la MISMA laptop de R1 |
| OpenAI da error | Verificar crédito cargado y llave; probar en `/docs` aislado |
| ElevenLabs falla | La demo sigue: se pega el transcript a mano en el textarea |
| n8n no manda emails | Mostrar screenshot de un email de un ensayo anterior |
| Wifi del venue horrible | Hotspot de celular para la laptop de R1 |
| Datos sucios tras ensayos | Correr `seed/reset_demo.sql` |
