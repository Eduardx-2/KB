# seed/ — Datos + n8n (dueño: R3)

Acá van, según `PROYECTO.md` (secciones 4.1, 4.5 y 5) y el go-live SaaS:

## Orden de migraciones (Supabase SQL Editor)

1. `001_schema.sql` — schema base (obligatorio)
2. `002_seed_demo.sql` — datos demo (opcional en prod limpia)
3. `004_error_logs.sql` — error tracking
4. `006_saas_multitenant.sql` — **obligatorio SaaS** (memberships, planes, cuotas, RLS auth)
5. `008_audit_events.sql` — auditoría de seguridad / compliance

También:
- `reset_demo.sql` — limpia y re-siembra para ensayos
- Transcripts de ejemplo (dorado / realista) — también en `frontend/src/lib/mock-data.ts`
- `cached/` — respuestas IA de respaldo para la demo
- Workflows n8n viven en `/n8n` (webhook en `backend/.env`)

Guía completa: [`docs/SAAS_GOLIVE.md`](../docs/SAAS_GOLIVE.md).

## Orden de migraciones (SQL Editor)

| Orden | Archivo | Notas |
|------:|---------|--------|
| 1 | `001_schema.sql` | Schema base |
| 2 | `002_seed_demo.sql` | Datos demo (opcional en prod) |
| 3 | `004_error_logs.sql` | Error tracking |
| 4 | `006_saas_multitenant.sql` | **SaaS** — teams, memberships, planes, cuotas, RLS auth |
| 5 | `008_audit_events.sql` | Auditoría |
| 6 | `009_knowledge_ops.sql` | **Knowledge Ops** — duties, graph, reorg, RPC embeddings |
| 7 | `010_knowledge_ops_demo.sql` | Demo Knowledge Ops (opcional) |
| 8 | `011_empresa_equipo_real.sql` | **Maxxi Group** — Juan, Iván, Erick, Jaime, Christopher |

Opcionales de prueba: `003_endpoint_test_data.sql`, `005_full_flow_demo.sql`.

**Prueba empresa (DB limpia, sin 002):** `001` → `004` → `006` → `008` → `009` → `011`

Knowledge Ops: [`docs/KNOWLEDGE_OPS.md`](../docs/KNOWLEDGE_OPS.md).

Go-live: [`docs/SAAS_GOLIVE.md`](../docs/SAAS_GOLIVE.md).
