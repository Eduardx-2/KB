# Knowledge Ops Enterprise

Plataforma de conocimiento operacional: perfiles de developer, documentación MD, grafo + RAG, tickets granulares y reorganización con aprobación del jefe de IT.

## Migraciones SQL

Ejecutar en Supabase SQL Editor **después** de `001`–`008`:

| Orden | Archivo | Contenido |
|------:|---------|-----------|
| 9 | `seed/009_knowledge_ops.sql` | duties, absences, modules, graph, reorg, RPC `match_knowledge_chunks` |
| 10 | `seed/010_knowledge_ops_demo.sql` | Demo: proyecto con MD, módulos, duties Ana/Beto, grafo |
| 11 | `seed/011_empresa_equipo_real.sql` | Equipo Maxxi real + proyectos + overview MD |
| 12 | `seed/012_member_knowledge.sql` | Perfiles MD por integrante + RPC `match_member_knowledge_chunks` |

## Flujo end-to-end

1. **Perfil developer** — `/equipo/[id]/perfil`: MD “Mis proyectos y stack” (RAG), duties, capacidad, ausencias.
2. **Docs proyecto** — `/proyectos/[id]/docs`: overview MD → ingest automático (chunks + embeddings + nodos). Upsert evita duplicados al guardar.
3. **Módulos** — `/proyectos/[id]/modulos/[moduleId]`: spec MD por módulo.
4. **Reunión** — `POST /api/agents/meeting`: RAG + tickets por fase (`work_phase`, acceptance criteria, evidence).
5. **Asignación** — `POST /api/agents/assignment`: load efectivo + **MEMBER_KNOWLEDGE** (perfil MD vía RAG).
6. **Ausencia** — al crear ausencia → propuesta de reorg `pending_boss`.
7. **Jefe IT** — `/reorg`: aprobar/rechazar; al aprobar se aplican cambios a tickets.

## API (tenant-scoped)

| Método | Ruta |
|--------|------|
| CRUD | `/api/members/{id}/duties`, `/api/member-duties/{id}` |
| CRUD | `/api/members/{id}/absences` |
| GET/PATCH | `/api/members/{id}/capacity` |
| GET/POST | `/api/members/{id}/docs` — perfil MD del integrante |
| CRUD | `/api/projects/{id}/modules`, `/api/project-modules/{id}` |
| CRUD | `/api/projects/{id}/stakeholders` |
| POST | `/api/projects/{id}/docs` |
| GET | `/api/projects/{id}/knowledge` |
| GET | `/api/reorg/proposals?status=pending_boss` |
| POST | `/api/reorg/proposals/{id}/decide` |
| POST | `/api/reorg/trigger` |

## n8n

Webhook (`N8N_WEBHOOK_URL`) recibe eventos:

- `reorg.pending_boss` — nueva propuesta para el jefe
- `reorg.approved` — propuesta aplicada
- `reorg.rejected` — propuesta rechazada

Workflow de referencia: `n8n/05-reorg-proposals.json`.

## Demo sin Supabase

Con `AUTH_DISABLED=true` y sin `NEXT_PUBLIC_API_URL`, el frontend usa mocks en `mock-engine.ts` (tickets granulares + propuesta reorg).

## Checklist operacional

- [ ] Migraciones `009` + `011` + `012` aplicadas
- [ ] `OPENAI_API_KEY` configurada (embeddings + agentes)
- [ ] Overview MD cargado en al menos un proyecto
- [ ] Reunión de prueba genera tickets con `work_phase` y evidence
- [ ] Ausencia de prueba crea propuesta en `/reorg`
- [ ] Aprobación del jefe actualiza assignee/fechas en tickets

## Script E2E (manual)

1. Correr backend + frontend con Supabase.
2. Aplicar seeds hasta `010`.
3. Subir doc en `/proyectos/{id}/docs` (overview persiste al recargar).
4. Editar perfil MD en `/equipo/{id}/perfil` (Iván con Exactus/Cayena).
5. Crear requirement + meeting agent con transcript ERP.
6. Assignment agent (debe usar MEMBER_KNOWLEDGE).
7. Registrar ausencia en perfil developer.
8. Revisar `/reorg` y aprobar propuesta.
