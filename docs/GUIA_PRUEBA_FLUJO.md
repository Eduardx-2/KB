# Guía de prueba del flujo de datos (UI → Backend → Supabase)

Esta guía te lleva de punta a punta: levantar backend + frontend, ejecutar el
flujo desde la UI y **corroborar en Supabase** que la data cae en cada tabla.

---

## 0. Cómo concuerdan frontend y backend

- El frontend llama al backend cuando `NEXT_PUBLIC_API_URL` está definida
  (`frontend/.env.local`). Si está vacía, corre en **modo mock** (sin tocar la DB).
- El eslabón clave: al procesar una reunión, el frontend primero crea el
  requirement real vía `POST /api/requirements` y usa ese **uuid** en todo el
  pipeline. Antes usaba un id local y el backend respondía 404.
- Endpoints que usa el frontend (todos existen en el backend):

| Acción UI | Endpoint backend |
|---|---|
| Crear reunión (obtener id real) | `POST /api/requirements` |
| Transcribir audio | `POST /api/transcribe` |
| Extraer tickets | `POST /api/agents/meeting` |
| Asignar equipo | `POST /api/agents/assignment` |
| Mover / editar ticket | `PATCH /api/tickets/{id}` |
| Aprobar plan | `POST /api/approve/{requirement_id}` |
| Reportar error de cliente | `POST /api/client-errors` |
| Ver errores en `/sistema` | `GET /api/errors` |

---

## 1. Requisitos previos

### Backend (`backend/.env`)
Debe tener al menos:
```
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...   # service_role, NO la anon
OPENAI_API_KEY=...              # para meeting/assignment reales
ELEVENLABS_API_KEY=...          # para transcribir audio real
```

### Frontend (`frontend/.env.local`)
Ya creado. Confirmá:
```
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
NEXT_PUBLIC_SUPABASE_URL=https://dghpfeupbhhqonzxlaij.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=   # opcional; pegá la publishable/anon key si querés lectura directa
```

### Base de datos
En Supabase → SQL Editor, corré en orden (si aún no lo hiciste):
`seed/001_schema.sql` → `002_seed_demo.sql` → `004_error_logs.sql` → `005_full_flow_demo.sql`.
El `005` ya se aplicó y deja **todas las tablas pobladas** con un caso real.

---

## 2. Levantar todo

En dos terminales (desde la raíz del repo):

```bash
# Terminal 1 — backend
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
```

```bash
# Terminal 2 — frontend
cd frontend
npm install      # solo la primera vez
npm run dev
```

Abrí la UI en `http://localhost:3000`.
Verificá el backend: `http://127.0.0.1:8000/docs` (Swagger) y `GET /api/health`.

> **Tip:** si dejás `NEXT_PUBLIC_API_URL` vacío, la UI funciona igual en modo mock
> (útil sin credenciales), pero **no** escribe en Supabase.

---

## 3. Flujo completo desde la UI

1. **Panel** (`/`): ves las reuniones existentes (incluida la del seed `005`).
2. **Nueva reunión** (`/reuniones/nueva`):
   - Pegá un transcript (botón *"Usar transcript dorado (ERP)"*) **o** grabá audio.
   - Clic en **Procesar con IA**. Detrás ocurre:
     1. `POST /api/requirements` → crea el requirement (uuid real). → tabla **requirements** (`status='draft'`)
     2. (si es audio) `POST /api/transcribe` → transcribe y guarda el crudo. → tabla **meetings**
     3. `POST /api/agents/meeting` → resumen + tickets. → **requirements** (`status='extracted'`, `summary`) + **tickets** + **agent_runs**
     4. `POST /api/agents/assignment` → asigna al equipo. → **tickets** (assignee/risk) + **ticket_assignments** + **ticket_status_events** + **agent_runs**
   - Aterrizás en el board de esa reunión.
3. **Board** (`/reuniones/{id}`):
   - Arrastrá un ticket de columna (p. ej. *To Do* → *In Progress*).
     → `PATCH /api/tickets/{id}` → **tickets** (status) + **ticket_status_events**
   - Abrí un ticket y cambiá assignee o deadline. → `PATCH /api/tickets/{id}`
   - Clic en **Aprobar plan** → confirmá.
     → `POST /api/approve/{id}` → **requirements** (`status='approved'`, `approved_at`) + **approvals** + **notifications** (una por assignee) + (si hay `N8N_WEBHOOK_URL`) webhook.
4. **Sistema** (`/sistema`): actividad de agentes + **tabla de errores** (lee `GET /api/errors`).

---

## 4. Corroborar en Supabase

Abrí Supabase → **Table Editor** y revisá en este orden (o usá SQL Editor):

```sql
-- Recorrido del flujo por el requirement recién creado (reemplazá el id)
select id, status, summary, approved_at from requirements order by created_at desc limit 5;

select id, title, status, assignee_id, risk_pct from tickets
 where requirement_id = '<TU_REQUIREMENT_ID>' order by created_at;

select ticket_id, from_status, to_status, source, created_at
 from ticket_status_events order by created_at desc limit 10;

select * from ticket_assignments order by created_at desc limit 10;
select * from approvals order by created_at desc limit 5;
select approval_id, member_id, channel, status from notifications order by created_at desc limit 10;
select agent, entity_type, latency_ms, ok from agent_runs order by created_at desc limit 10;
```

Vistas de conveniencia:
- `board_tickets` — tickets con nombre de proyecto, skill y assignee resueltos.
- `recent_errors` — últimos errores legibles.
- `project_context_map` — proyectos con aliases y conteo de conocimiento.

Conteo rápido de que TODO tiene data (del seed `005`):

```sql
select 'meetings' t, count(*) n from meetings
union all select 'requirements', count(*) from requirements
union all select 'tickets', count(*) from tickets
union all select 'ticket_assignments', count(*) from ticket_assignments
union all select 'ticket_status_events', count(*) from ticket_status_events
union all select 'approvals', count(*) from approvals
union all select 'notifications', count(*) from notifications
union all select 'agent_runs', count(*) from agent_runs
union all select 'error_logs', count(*) from error_logs
union all select 'meeting_project_mentions', count(*) from meeting_project_mentions
union all select 'requirement_project_references', count(*) from requirement_project_references
union all select 'ticket_context_references', count(*) from ticket_context_references
order by t;
```

---

## 5. Probar el tracking de errores

1. Con el backend arriba pero **sin** `OPENAI_API_KEY` válida, procesá una reunión:
   el Meeting Agent devuelve **500** con un `request_id`.
2. Andá a `/sistema` → la tabla de errores muestra ese 500 (source `backend`).
3. En Supabase: `select * from recent_errors order by created_at desc;`
   El `request_id` de la respuesta HTTP coincide con el de la fila → trazabilidad.
4. Errores de red del frontend se auto-reportan vía `POST /api/client-errors`
   (aparecen con source `frontend`).

---

## 6. Reiniciar la demo

Para dejar la DB en estado limpio de demo:
- Corré `seed/reset_demo.sql` (borra data transaccional) y luego
  `seed/002_seed_demo.sql` + `seed/005_full_flow_demo.sql` para repoblar.

---

## Notas de la auditoría front ↔ back

- El frontend hoy pinta el board desde su **store** local, alimentado por las
  **respuestas** del backend. La data igual queda persistida en Supabase (verificable
  como en la sección 4). Si querés que el board lea directo de Supabase, hay que
  cablear `getSupabaseClient()` (ya existe en `frontend/src/lib/supabase.ts`) contra
  la vista `board_tickets` usando la anon key.
- Nunca pongas la `service_role` key en el frontend: usá solo la publishable/anon.
