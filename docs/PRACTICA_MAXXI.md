# Guía práctica — Maxxi Group IT

Checklist para poner en marcha la plataforma con el equipo real.

## 1. Base de datos (Supabase SQL Editor)

Ejecutar **en orden** (solo una vez):

| # | Archivo |
|---|---------|
| 1 | `seed/001_schema.sql` |
| 2 | `seed/004_error_logs.sql` |
| 3 | `seed/006_saas_multitenant.sql` |
| 4 | `seed/008_audit_events.sql` |
| 5 | `seed/009_knowledge_ops.sql` |
| 6 | `seed/011_empresa_equipo_real.sql` |
| 7 | `seed/012_member_knowledge.sql` — perfiles MD Juan/Iván/Erick/Jaime/Christopher |
| 8 | `seed/013_board_tickets_hierarchy.sql` — view con `parent_ticket_id` / work_phase |

## 2. Backend (`backend/.env`)

Verificar:

- `SUPABASE_URL=https://wceyqrvgoclgootctsjk.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY=` (tu clave real)
- `OPENAI_API_KEY=` (para Meeting Agent y embeddings)
- `AUTH_DISABLED=true`
- `DEFAULT_TEAM_ID=00000000-0000-0000-0000-000000000001`

Levantar API:

```powershell
cd backend
.\.venv\Scripts\uvicorn main:app --reload --host 127.0.0.1 --port 8002
```

Probar:

```powershell
curl http://localhost:8000/api/health/db
curl -H "X-Team-Id: 00000000-0000-0000-0000-000000000001" http://localhost:8000/api/workspace
```

## 3. Frontend

```powershell
cd frontend
npm run dev
```

Abrir `http://localhost:3000` — usa `frontend/.env.local` apuntando al backend.

## 4. Equipo cargado (seed 011)

| Nombre | Email | Rol |
|--------|-------|-----|
| Juan | juan.melendez@maxxigroup.com | Jefe IT + **único DevOps** (manager) |
| Iván | ivan.ramirez@maxxigroup.com | ERP C# / **Exactus** |
| Erick | erick.flores@maxxigroup.com | ERP **Exactus** / Softland |
| Jaime | jaime@maxxigroup.com | Redes / infra |
| Christopher | christopher.alvarenga@maxxigroup.com | Web / Filament / BI |

## 5. Proyectos listos

| Código | Nombre |
|--------|--------|
| EXACTUS-INT | Integración Exactus ↔ Apps |
| ERP-MIG | Exactus / Softland |
| NET-INFRA | Redes sucursales |
| MAXXI-WEB | Sitio web, Filament, displays |

Estado inicial del seed: **carga 0** y **sin tickets** en el equipo.

## 6. Flujo de prueba recomendado

1. **Workspace** — ver equipo y proyectos en la app.
2. **Perfil** (`/equipo/{id}/perfil`) — editar MD “Mis proyectos y stack”; revisar duties.
3. **Docs** (`/proyectos/{id}/docs`) — overview MD (sin crash); guardar y recargar.
4. **Reunión** — abrir reunión existente → botón **Transcript** debe mostrar texto.
5. **Meeting Agent** — crear requirement, pegar transcript, correr extracción.
6. **Asignación** — Assignment Agent usa skills + carga + **perfil MD** (Iván en Exactus, no Christopher).
7. **Reorg** — registrar ausencia → `/reorg` → Juan aprueba.

## 7. IDs útiles (API / URLs)

```
Team:        00000000-0000-0000-0000-000000000001
Juan:        60000000-0000-0000-0000-000000000001
Iván:        60000000-0000-0000-0000-000000000002
Christopher: 60000000-0000-0000-0000-000000000005
MAXXI-WEB:   61000000-0000-0000-0000-000000000004
```

Header demo: `X-Team-Id: 00000000-0000-0000-0000-000000000001`
