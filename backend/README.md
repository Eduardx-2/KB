# Backend — AI Meeting-to-Tickets PM (FastAPI)

Backend descrito en `PROYECTO.md` (secciones 2, 3 y 4.2). Python 3.11+, FastAPI,
Pydantic v2, OpenAI `gpt-4o-mini` (Structured Outputs), ElevenLabs Scribe, Supabase, n8n.

SaaS: JWT Supabase, multi-tenant (`team_memberships`), cuotas/planes y rate limits.
Go-live: [`docs/SAAS_GOLIVE.md`](../docs/SAAS_GOLIVE.md).

## Levantar en 3 comandos
```bash
pip install -r requirements.txt
cp .env.example .env   # y llenar las keys
uvicorn main:app --reload
```
Docs interactivas: http://localhost:8000/docs

Docker / Compose: ver `backend/Dockerfile` y `docker-compose.yml` en la raíz.
Render: `render.yaml` en la raíz (`healthCheckPath: /api/health`).

Mientras este backend no esté corriendo, el frontend (`frontend/`) funciona igual gracias a una
simulación local fiel al contrato — ver `frontend/src/lib/api.ts` y `frontend/src/lib/mock-engine.ts`.
Para conectar el frontend a este backend real, seteá `NEXT_PUBLIC_API_URL` (ver `frontend/.env.example`).

## Auth

### Headers

| Header | Uso |
|--------|-----|
| `Authorization: Bearer <jwt>` | Token de sesión Supabase Auth (requerido si `AUTH_DISABLED=false`) |
| `X-Team-Id: <uuid>` | Tenant activo (membership del usuario, o team demo si auth off) |

### `AUTH_DISABLED`

| Valor | Comportamiento |
|-------|----------------|
| `true` | Demo: no exige JWT. Usa `X-Team-Id` o `DEFAULT_TEAM_ID`. Rol efectivo `owner`. |
| `false` | Producción: valida JWT con `SUPABASE_JWT_SECRET` (audience `authenticated`) y resuelve `team_memberships`. |

En prod: `AUTH_DISABLED=false` + `SUPABASE_JWT_SECRET` + `CORS_ORIGINS` restringido.

### Roles

`owner` · `admin` · `member` · `viewer` — algunos endpoints exigen rol mínimo (`require_role`).

## Conectar Supabase
1. En Supabase, crea un proyecto y abre `SQL Editor`.
2. Ejecuta `seed/001_schema.sql`.
3. (Opcional) Ejecuta `seed/002_seed_demo.sql` para datos de demo.
4. Ejecuta `seed/004_error_logs.sql` para error tracking.
5. Ejecuta `seed/006_saas_multitenant.sql` para teams SaaS, memberships, planes y cuotas.
6. Copia `backend/.env.example` a `backend/.env` y llena:
   - `SUPABASE_URL`: Project URL.
   - `SUPABASE_SERVICE_ROLE_KEY`: service role key, solo para backend.
   - `SUPABASE_JWT_SECRET` si auth está ON.
7. Levanta el backend desde `backend/` o desde la raíz:
   ```bash
   uvicorn backend.main:app --reload
   ```
8. Valida conexión en `GET /api/health/db`.

No expongas `SUPABASE_SERVICE_ROLE_KEY` en frontend. Para frontend usa la anon/publishable key con RLS.

## Cuotas y planes

- Caps por team: `max_meetings_per_month`, `max_tokens_per_month` (y `plan_tier`).
- Antes de transcribir / agents se llama `check_quota`; al exceder → **HTTP 402**.
- Uso en `usage_events`; resumen en `GET /api/usage`.
- Catálogo: `GET /api/billing/plans`.
- Stripe: schema `team_subscriptions` listo; webhook pendiente (ver go-live).

## Rate limits

Middleware in-memory (`rate_limit.py`): ventana deslizante por IP.
Configurable con `RATE_LIMIT_PER_MINUTE` (default `60`). Pensado para una sola instancia.

## Archivos
- `main.py` — app + endpoints + CORS + `request_id` + manejo global de errores
- `auth.py` — JWT Supabase + contexto de tenant
- `tenancy.py` — helpers multi-tenant
- `quotas.py` — cuotas mensuales y usage
- `rate_limit.py` — rate limit por IP
- `services.py` — OpenAI, Supabase, ElevenLabs, n8n, agent_logs, error_logs
- `llm_firewall.py` — validación/redacción del transcript
- `schemas.py` — el CONTRATO (Pydantic v2)
- `config.py` — env vars con pydantic-settings

## Endpoints
| Método y ruta | Para qué |
|---|---|
| `GET /api/me` | Usuario autenticado + team/rol actuales |
| `GET /api/teams` · `POST /api/teams` | Listar / crear teams |
| `POST /api/teams/{id}/invitations` | Invitar a un team |
| `POST /api/invitations/accept` | Aceptar invitación |
| `GET /api/usage` | Uso mensual vs cuotas del team |
| `GET /api/billing/plans` | Planes disponibles |
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
