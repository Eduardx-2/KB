# n8n Workflows — Meeting → Tickets PM

Automatizaciones post-aprobación para el proyecto **Meeting to Tickets PM** (Cursor Buildathon El Salvador 2026).

## Índice

- [Arquitectura](#arquitectura)
- [Requisitos](#requisitos)
- [Credenciales a configurar en n8n](#credenciales-a-configurar-en-n8n)
- [Variables de entorno en n8n](#variables-de-entorno-en-n8n)
- [Importar los workflows](#importar-los-workflows)
- [WF1 — Aprobación de plan](#wf1--aprobación-de-plan)
- [WF2 — Deadlines vencidas](#wf2--deadlines-vencidas)
- [WF3 — Tickets estancados](#wf3--tickets-estancados)
- [WF4 — Digest semanal del manager](#wf4--digest-semanal-del-manager)
- [Probar con curl](#probar-con-curl)
- [Tabla notifications](#tabla-notifications)
- [Troubleshooting](#troubleshooting)

---

## Arquitectura

```
Backend FastAPI  ──POST webhook──►  WF1 Aprobación
                                        │
                                        ├─► Email a cada asignado
                                        ├─► Email alerta riesgo alto al manager
                                        ├─► Email resumen al jefe
                                        └─► Log en notifications + PATCH approvals

Cron diario 8am  ──────────────────►  WF2 Deadlines vencidas
                                        ├─► Email agrupado por developer
                                        ├─► Email resumen global al manager
                                        └─► Log en notifications

Cron diario 9am  ──────────────────►  WF3 Tickets estancados
                                        ├─► Email al developer (>3 días sin movimiento)
                                        ├─► Email escalación al manager (>5 días)
                                        └─► Log en notifications

Cron lunes 7am   ──────────────────►  WF4 Digest semanal
                                        ├─► Email dashboard al manager
                                        └─► Log en notifications
```

Todos los workflows acceden a Supabase vía **HTTP Request** (PostgREST REST API) usando la `service_role` key. Ningún workflow conoce las claves de OpenAI ni de ElevenLabs — esa responsabilidad es del backend.

---

## Requisitos

- n8n v1.x (cloud o self-hosted)
- Cuenta Supabase con el esquema `final_ER` desplegado
- Servidor SMTP o credencial Gmail OAuth para envío de emails

---

## Credenciales a configurar en n8n

Ve a **Settings → Credentials → New credential** y crea:

### 1. SMTP (nombre: `SMTP`)

| Campo | Valor |
|---|---|
| Host | `smtp.gmail.com` (o tu servidor) |
| Port | `587` |
| User | tu email |
| Password | app password de Gmail (no tu contraseña normal) |
| SSL/TLS | STARTTLS |

> **Gmail**: activá 2FA y generá una "App Password" en [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords).

### 2. (Opcional) HTTP Header Auth para Supabase

No es estrictamente necesario si usás variables de entorno (ver abajo), pero podés crear una credencial de tipo **Header Auth** con:

- Name: `Supabase Service Key`
- Header Name: `apikey`
- Header Value: tu `service_role` key

---

## Variables de entorno en n8n

Ve a **Settings → Variables** y creá las siguientes:

| Variable | Descripción | Ejemplo |
|---|---|---|
| `SUPABASE_URL` | URL de tu proyecto Supabase | `https://abcdefgh.supabase.co` |
| `SUPABASE_SERVICE_KEY` | `service_role` JWT key (desde Supabase → Settings → API) | `eyJhbGciOiJIUzI1NiIs...` |
| `SMTP_FROM` | Dirección de remitente de los emails | `pm@tuempresa.com` |
| `MANAGER_EMAIL` | Email del manager principal (fallback para WF2/WF3) | `manager@tuempresa.com` |

> ⚠️ **Nunca** guardes estas claves directamente en los JSONs de los workflows. Usá siempre `$env.VARIABLE`.

---

## Importar los workflows

1. En n8n, ir a **Workflows → Import from file**
2. Subir cada archivo JSON de esta carpeta en orden:
   - `01-aprobacion.json`
   - `02-deadlines-vencidas.json`
   - `03-tickets-estancados.json`
   - `04-digest-semanal.json`
3. En cada workflow, abrir los nodos de tipo **Send Email** y seleccionar la credencial `SMTP` creada anteriormente
4. Activar los workflows con el toggle superior derecho (**solo activar cuando el entorno esté listo**)

---

## WF1 — Aprobación de plan

**Archivo:** `01-aprobacion.json`  
**Trigger:** Webhook POST en `/webhook/plan-aprobado`  
**Propósito:** Notificar a cada asignado cuando el manager aprueba un plan de tickets.

### Flujo

```
Webhook → Expandir Tickets (Code) → Filtrar Sin Email
       → Email a Asignado → Log Notifications → Riesgo Alto? (IF)
                IF true  → Email Alerta Riesgo Manager ──┐
                IF false → No Op ─────────────────────────┤
                                                     Unir Ramas → Aggregate
                                                     → Construir HTML → Email Resumen Jefe
                                                     → PATCH approvals (n8n_ok=true)
```

### URL del webhook

Una vez activado, n8n te dará una URL similar a:

```
https://tu-instancia.n8n.cloud/webhook/plan-aprobado
```

Configurá esta URL en tu backend FastAPI como destino del POST al aprobar un `requirement`.

### Payload esperado del backend

```json
{
  "approval_id": "uuid-de-la-aprobacion",
  "requirement_id": "uuid-del-requirement",
  "requirement_title": "Módulo de pagos con Stripe",
  "project_name": "E-Commerce v2",
  "approved_by": "Ana García",
  "manager_email": "manager@tuempresa.com",
  "tickets": [
    {
      "ticket_id": "uuid-ticket-1",
      "title": "Implementar webhook de Stripe",
      "priority": "high",
      "estimate_hours": 16,
      "risk_pct": 75,
      "reasoning": "El developer tiene poca experiencia con webhooks de pago y el deadline es ajustado.",
      "required_skill": "Backend",
      "skill_label": "Backend",
      "deadline": "2026-07-15",
      "assignee_id": "uuid-member-1",
      "assignee_name": "Carlos López",
      "assignee_email": "carlos@tuempresa.com"
    },
    {
      "ticket_id": "uuid-ticket-2",
      "title": "UI de checkout",
      "priority": "medium",
      "estimate_hours": 8,
      "risk_pct": 30,
      "reasoning": "Tarea estándar de frontend, bien definida.",
      "required_skill": "Frontend",
      "skill_label": "Frontend",
      "deadline": "2026-07-12",
      "assignee_id": "uuid-member-2",
      "assignee_name": "María Torres",
      "assignee_email": "maria@tuempresa.com"
    }
  ]
}
```

---

## WF2 — Deadlines vencidas

**Archivo:** `02-deadlines-vencidas.json`  
**Trigger:** Cron diario a las 8:00 am  
**Propósito:** Notificar a developers sus tickets vencidos, agrupados en un solo email (no spam).

### Queries a Supabase

```
GET /rest/v1/tickets
  ?deadline=lt.{hoy}
  &status=neq.done
  &select=id,title,...,members(id,name,email),projects(id,name)
```

### Resultado

- **Developers**: un email por developer con todos sus tickets vencidos
- **Manager**: un email resumen con todos los vencidos organizados por proyecto
- **Supabase**: una fila en `notifications` por cada developer notificado

---

## WF3 — Tickets estancados

**Archivo:** `03-tickets-estancados.json`  
**Trigger:** Cron diario a las 9:00 am  
**Propósito:** Detectar tickets `in_progress` sin cambios de estado en 3+ días via `ticket_status_events`.

### Query principal

```
GET /rest/v1/ticket_status_events
  ?to_status=eq.in_progress
  &created_at=lt.{hace-3-dias}
  &select=ticket_id,created_at,tickets(id,title,...,members(...),projects(...))
```

### Escalación

| Días sin movimiento | Acción |
|---|---|
| 3–5 días | Email solo al developer asignado |
| > 5 días | Email al developer + copia al manager (escalación) |

---

## WF4 — Digest semanal del manager

**Archivo:** `04-digest-semanal.json`  
**Trigger:** Cron lunes a las 7:00 am  
**Propósito:** Email dashboard semanal para todos los managers del equipo.

### Contenido del email

- Métricas globales: % completado, tickets done, en progreso, riesgo alto, vencidos
- Tabla por proyecto: avance, tickets en curso, porcentaje completado, conteo de riesgo alto
- Tabla por developer: carga (`current_load`), tickets en curso, completados esta semana, vencidos
- Sección de riesgo alto: lista de todos los tickets con `risk_pct > 60`
- Footer: horas comprometidas vs entregadas vs pendientes

> El workflow busca automáticamente todos los members con `is_manager = true` y les envía el digest.

---

## Probar con curl

### WF1 — Simular aprobación (reemplazar URL por la de tu instancia)

```bash
curl -X POST https://tu-instancia.n8n.cloud/webhook/plan-aprobado \
  -H "Content-Type: application/json" \
  -d '{
    "approval_id": "test-approval-001",
    "requirement_id": "test-req-001",
    "requirement_title": "Test de integración n8n",
    "project_name": "KB Buildathon",
    "approved_by": "Manager Test",
    "manager_email": "manager@test.com",
    "tickets": [
      {
        "ticket_id": "test-ticket-001",
        "title": "Ticket de prueba A",
        "priority": "high",
        "estimate_hours": 12,
        "risk_pct": 80,
        "reasoning": "Ticket de prueba con riesgo alto para verificar alerta.",
        "skill_label": "Backend",
        "deadline": "2026-07-10",
        "assignee_id": "test-member-001",
        "assignee_name": "Developer Test",
        "assignee_email": "dev@test.com"
      },
      {
        "ticket_id": "test-ticket-002",
        "title": "Ticket de prueba B",
        "priority": "low",
        "estimate_hours": 4,
        "risk_pct": 25,
        "reasoning": "Ticket sencillo para verificar flujo normal.",
        "skill_label": "Frontend",
        "deadline": "2026-07-14",
        "assignee_id": "test-member-002",
        "assignee_name": "Frontend Test",
        "assignee_email": "frontend@test.com"
      }
    ]
  }'
```

Respuesta esperada:
```json
{"received": true, "message": "Procesando notificaciones..."}
```

### WF2 y WF3 — Ejecutar manualmente desde n8n

1. Abrir el workflow en n8n
2. Click en **Execute workflow** (botón ▶ arriba a la izquierda)
3. El cron se salta y los nodos corren con datos reales de Supabase

### Verificar logs de notificaciones en Supabase

```bash
curl https://tu-proyecto.supabase.co/rest/v1/notifications \
  -H "apikey: TU_SERVICE_KEY" \
  -H "Authorization: Bearer TU_SERVICE_KEY" \
  -G \
  --data-urlencode "order=sent_at.desc" \
  --data-urlencode "limit=20"
```

---

## Tabla notifications

Los workflows insertan en esta tabla para auditoría completa:

```sql
-- Esquema esperado (parte del final_ER)
CREATE TABLE notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_id uuid REFERENCES approvals(id),
  ticket_id   uuid REFERENCES tickets(id),
  member_id   uuid REFERENCES members(id),
  channel     text NOT NULL DEFAULT 'email',
  template    text,               -- 'ticket_assigned' | 'deadline_overdue' | 'stalled_ticket' | 'weekly_digest'
  status      text NOT NULL,      -- 'sent' | 'failed'
  sent_at     timestamptz,
  error_message text,
  metadata    jsonb,              -- { "to": "email@...", "risk_pct": 80, ... }
  created_at  timestamptz DEFAULT now()
);
```

---

## Troubleshooting

### El webhook de WF1 no responde

- Verificar que el workflow esté **activo** (toggle en ON)
- La URL de producción es distinta a la de test: usar la URL que aparece en el nodo Webhook cuando el workflow está activo

### Los emails no llegan

- Revisar la credencial SMTP: host, puerto y app password
- Gmail bloquea passwords normales — necesitás una **App Password** con 2FA activado
- Revisar la tabla `notifications` en Supabase: si `status = 'failed'`, el campo `error_message` tiene el detalle

### Error `403` al llamar a Supabase

- La `service_role` key es correcta pero necesita el header `Authorization: Bearer {key}` además de `apikey: {key}`
- Ambos headers están configurados en todos los nodos HTTP Request

### WF2/WF3 no encuentra tickets

- Verificar que los tickets en Supabase tengan el campo `assignee_id` con un `member_id` válido que tenga `email` no nulo
- Para WF3, verificar que existan filas en `ticket_status_events` con `to_status = 'in_progress'`

### WF4 no encuentra managers

- Verificar que al menos un `member` en Supabase tenga `is_manager = true` y `email` no nulo
