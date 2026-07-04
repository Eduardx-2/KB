<<<<<<< HEAD
# Backend — AI Meeting-to-Tickets PM (FastAPI)

## Levantar en 3 comandos
```bash
pip install -r requirements.txt
cp .env.example .env   # y llenar las keys
uvicorn main:app --reload
```
Docs interactivas: http://localhost:8000/docs

## Conectar Supabase
1. En Supabase, crea un proyecto y abre `SQL Editor`.
2. Ejecuta `seed/001_schema.sql`.
3. Ejecuta `seed/002_seed_demo.sql` para cargar datos de demo.
4. Copia `backend/.env.example` a `backend/.env` y llena:
   - `SUPABASE_URL`: Project URL.
   - `SUPABASE_SERVICE_ROLE_KEY`: service role key, solo para backend.
5. Levanta el backend desde `backend/` o desde la raíz:
   ```bash
   uvicorn backend.main:app --reload
   ```
6. Valida conexión en `GET /api/health/db`.

No expongas `SUPABASE_SERVICE_ROLE_KEY` en frontend. Para frontend usa la anon/publishable key con RLS.

## Archivos
- `main.py` — app + 6 endpoints + CORS + manejo global de errores
- `services.py` — OpenAI (Structured Outputs), Supabase, ElevenLabs Scribe, webhook n8n, agent_logs
- `schemas.py` — el CONTRATO (Pydantic v2)
- `config.py` — env vars con pydantic-settings

## Flujo de la demo (orden de llamadas)
1. `POST /api/transcribe` (audio) → `{text}`
2. Crear el requirement en Supabase desde el frontend (o insertarlo antes) y llamar
   `POST /api/agents/meeting` con `{transcript, requirement_id}` → guarda transcript en
   `meetings.raw_transcript`, summary en `requirements.summary` y tickets en DB
3. `POST /api/agents/assignment` con `{requirement_id}` → assignees + risk_pct en DB
4. Board: `PATCH /api/tickets/{id}` al mover cards
5. `POST /api/approve/{requirement_id}` → dispara webhook n8n (emails)

## Notas de diseño (para responder a jueces)
- Structured Outputs (`client.beta.chat.completions.parse`) garantiza el schema: cero parseo frágil de JSON.
- El transcript viaja SIEMPRE como mensaje `user`, nunca en el system → mitiga prompt injection.
- Endpoints síncronos (`def`) a propósito: FastAPI los corre en threadpool; simple y seguro para hackathon.
- `agent_logs` guarda latencia/modelo/ok de cada llamada; si el log falla, el request no se cae.
- Si n8n falla, la aprobación igual se persiste (`n8n_notified: false` en la respuesta).
=======
# backend/ — Python FastAPI (dueño: R1)

Acá va el código del backend descrito en `PROYECTO.md` (secciones 2, 3 y 4.2):

- `POST /api/transcribe`, `POST /api/agents/meeting`, `POST /api/agents/assignment`,
  `PATCH /api/tickets/{id}`, `POST /api/approve/{requirement_id}`, `GET /api/health`.
- Python 3.11+, FastAPI, Pydantic v2, OpenAI `gpt-4o-mini` (Structured Outputs), ElevenLabs Scribe.

Mientras este backend no esté corriendo, el frontend (`frontend/`) funciona igual gracias a una
simulación local fiel al contrato — ver `frontend/src/lib/api.ts` y `frontend/src/lib/mock-engine.ts`.

Para conectar el frontend a este backend real, seteá `NEXT_PUBLIC_API_URL` (ver `frontend/.env.example`).
>>>>>>> 3580bdfd67e23614878ced6c82ffe5bacef5c2b3
