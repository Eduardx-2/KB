# Backend — AI Meeting-to-Tickets PM (FastAPI)

Backend descrito en `PROYECTO.md` (secciones 2, 3 y 4.2). Python 3.11+, FastAPI,
Pydantic v2, OpenAI `gpt-4o-mini` (Structured Outputs), ElevenLabs Scribe, Supabase, n8n.

## Levantar en 3 comandos
```bash
pip install -r requirements.txt
cp .env.example .env   # y llenar las keys
uvicorn main:app --reload
```
Docs interactivas: http://localhost:8000/docs

Mientras este backend no esté corriendo, el frontend (`frontend/`) funciona igual gracias a una
simulación local fiel al contrato — ver `frontend/src/lib/api.ts` y `frontend/src/lib/mock-engine.ts`.
Para conectar el frontend a este backend real, seteá `NEXT_PUBLIC_API_URL` (ver `frontend/.env.example`).

## Conectar Supabase
1. En Supabase, crea un proyecto y abre `SQL Editor`.
2. Ejecuta `seed/001_schema.sql`.
3. Ejecuta `seed/002_seed_demo.sql` para cargar datos de demo.
4. Ejecuta `seed/004_error_logs.sql` para la tabla de error tracking.
5. Copia `backend/.env.example` a `backend/.env` y llena:
   - `SUPABASE_URL`: Project URL.
   - `SUPABASE_SERVICE_ROLE_KEY`: service role key, solo para backend.
6. Levanta el backend desde `backend/` o desde la raíz:
   ```bash
   uvicorn backend.main:app --reload
   ```
7. Valida conexión en `GET /api/health/db`.

No expongas `SUPABASE_SERVICE_ROLE_KEY` en frontend. Para frontend usa la anon/publishable key con RLS.

## Archivos
- `main.py` — app + endpoints + CORS + `request_id` + manejo global de errores
- `services.py` — OpenAI (Structured Outputs), Supabase, ElevenLabs Scribe, webhook n8n, agent_logs, error_logs
- `schemas.py` — el CONTRATO (Pydantic v2)
- `config.py` — env vars con pydantic-settings

## Endpoints
| Método y ruta | Para qué |
|---|---|
| `POST /api/requirements` | crea un requirement (uuid real) para que el frontend lo use en el pipeline |
| `POST /api/transcribe` | audio → texto (ElevenLabs) + guarda transcript en `meetings` |
| `POST /api/agents/meeting` | transcript → summary + tickets en DB |
| `POST /api/agents/assignment` | asigna tickets + escribe `ticket_assignments` y `ticket_status_events` |
| `PATCH /api/tickets/{id}` | actualiza estado/assignee/deadline + registra `ticket_status_events` |
| `POST /api/approve/{requirement_id}` | aprueba, escribe `approvals` + `notifications` y dispara webhook n8n |
| `GET /api/health` · `GET /api/health/db` | salud del backend y de Supabase |
| `POST /api/client-errors` | el frontend reporta acá sus errores |
| `GET /api/errors` | últimos errores (backend + frontend) para el panel Sistema |

## Flujo de la demo (orden de llamadas)
1. `POST /api/requirements` → `{id, project_id, status}` (id real para el pipeline)
2. `POST /api/transcribe` (audio) → `{text, meeting_id}`
3. `POST /api/agents/meeting` con `{transcript, requirement_id}` → guarda transcript en
   `meetings.raw_transcript`, summary en `requirements.summary` y tickets en DB
4. `POST /api/agents/assignment` con `{requirement_id}` → assignees + risk_pct en DB
5. Board: `PATCH /api/tickets/{id}` al mover cards
6. `POST /api/approve/{requirement_id}` → dispara webhook n8n (emails)

## Error tracking
Todos los errores se registran en la tabla `error_logs` de Supabase (ver `seed/004_error_logs.sql`).

- **Backend:** los exception handlers (`OpenAIError`, `RuntimeError`, `Exception`) registran
  automáticamente cada error con `request_id`, método, ruta, tipo de excepción, mensaje y traceback.
- **request_id:** cada respuesta lleva el header `X-Request-ID` y, en los errores, también en el body
  (`{"detail": "...", "request_id": "..."}`). Sirve para correlacionar un error visto en el navegador
  con su fila en `error_logs` (ej: cuando un endpoint devuelve 500).
- **Frontend:** reporta sus errores vía `POST /api/client-errors` (respeta el CONTRATO: el frontend
  nunca escribe directo a Supabase). Ver `frontend/src/lib/error-reporting.ts`.
- **Best-effort:** si el logging falla, el request nunca se cae (igual patrón que `agent_logs`).
- **Seguridad:** `error_logs` es interna (RLS ON, sin policy anon), igual que `agent_runs`. Solo el
  backend (service_role) lee/escribe. El frontend la ve vía `GET /api/errors`.

## Notas de diseño (para responder a jueces)
- Structured Outputs (`client.beta.chat.completions.parse`) garantiza el schema: cero parseo frágil de JSON.
- El transcript viaja SIEMPRE como mensaje `user`, nunca en el system → mitiga prompt injection.
- Endpoints síncronos (`def`) a propósito: FastAPI los corre en threadpool; simple y seguro para hackathon.
- `agent_logs` guarda latencia/modelo/ok de cada llamada; si el log falla, el request no se cae.
- Si n8n falla, la aprobación igual se persiste (`n8n_notified: false` en la respuesta).
