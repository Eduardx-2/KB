# Checklist go-live SaaS

Guía operativa para pasar de demo/hackathon a producción multi-tenant.

---

## 1. Migraciones SQL (orden)

En **Supabase → SQL Editor**, ejecutar en este orden:

| Orden | Archivo | Notas |
|------:|---------|--------|
| 1 | `seed/001_schema.sql` | Schema base (obligatorio) |
| 2 | `seed/002_seed_demo.sql` | Datos demo (opcional en prod limpia) |
| 3 | `seed/004_error_logs.sql` | Tabla `error_logs` |
| 4 | `seed/006_saas_multitenant.sql` | **Obligatorio para SaaS** — teams, memberships, planes, cuotas, RLS auth |
| 5 | `seed/008_audit_events.sql` | Tabla `audit_events` + RLS select por team (auditoría) |

No saltar `006`: sin él no hay `team_memberships`, planes ni metering.  
Ejecutar `008` después de `006` para habilitar el log de auditoría (`team.create`, invites, approve, cuotas, billing).

---

## 2. Supabase Auth — email

1. Dashboard → **Authentication → Providers**.
2. Activar **Email**.
3. Configurar confirmación de email según política (recomendado en prod: confirmación ON).
4. En **URL Configuration**, añadir las URLs del frontend (Netlify / dominio).

---

## 3. Primer usuario + membership

1. Crear el primer usuario en **Authentication → Users** (o signup desde la app).
2. Anotar el `user_id` (UUID de `auth.users`).
3. Vincularlo al team demo (o al team real) como **owner**:

```sql
-- Reemplazar USER_UUID por el id de Auth.
-- Team demo seed: 00000000-0000-0000-0000-000000000001
insert into team_memberships (team_id, user_id, role, status)
values (
  '00000000-0000-0000-0000-000000000001',
  'USER_UUID',
  'owner',
  'active'
)
on conflict (team_id, user_id) do update
  set role = excluded.role,
      status = 'active';
```

Sin fila en `team_memberships`, el JWT autentica pero el usuario no tiene tenant activo (puede crear team vía onboarding).

---

## 4. Backend — variables de entorno

En `backend/.env` (local) o en Render (producción):

| Variable | Valor prod |
|----------|------------|
| `AUTH_DISABLED` | `false` |
| `SUPABASE_JWT_SECRET` | JWT Secret de Supabase (Settings → API) |
| `SUPABASE_URL` | URL del proyecto |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role (**solo backend**) |
| `CORS_ORIGINS` | Orígenes exactos, ej. `https://tu-app.netlify.app,https://tudominio.com` |
| `OPENAI_API_KEY` | Key de OpenAI |
| `ELEVENLABS_API_KEY` | Key de ElevenLabs |
| `N8N_WEBHOOK_URL` | Webhook de aprobación (opcional) |
| `ENVIRONMENT` | `production` |
| `RATE_LIMIT_PER_MINUTE` | Ej. `60` |
| `DEFAULT_TEAM_ID` | Vacío en prod (o el team por defecto si aplica) |
| `STRIPE_SECRET_KEY` | Vacío hasta cablear Stripe (endpoints responden **501**) |
| `STRIPE_WEBHOOK_SECRET` | Secret del webhook Stripe |
| `STRIPE_PRICE_STARTER` / `STRIPE_PRICE_PRO` | Price IDs de Stripe |

Plantilla: `backend/.env.example`.

---

## 5. Frontend — variables de entorno

En Netlify (Environment variables) o `frontend/.env.local`:

| Variable | Valor |
|----------|--------|
| `AUTH_DISABLED` / `NEXT_PUBLIC_AUTH_DISABLED` | `false` |
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Anon key** (nunca `service_role`) |
| `NEXT_PUBLIC_API_URL` | URL pública del backend (Render) |

El frontend **nunca** debe recibir `SUPABASE_SERVICE_ROLE_KEY`.

---

## 6. Rotar keys filtradas

Si alguna `service_role`, JWT secret o API key se filtró (chat, commit, screenshot):

1. Rotar en el proveedor (Supabase / OpenAI / ElevenLabs).
2. Actualizar env en Render y Netlify.
3. Redeploy.
4. Verificar que `.env` sigue en `.gitignore`.

---

## 7. Deploy

| Componente | Plataforma | Cómo |
|------------|------------|------|
| Frontend | **Netlify** | `frontend/netlify.toml`; setear env del paso 5 |
| Backend | **Render** | Usar `render.yaml` en la raíz, o Docker (`backend/Dockerfile`) |
| DB / Auth | **Supabase** | Ya en la nube |

Local con Docker Compose (solo backend):

```bash
docker compose up --build
```

Health: `GET /api/health`.

---

## 8. Prueba end-to-end

Flujo mínimo en producción:

1. **Signup** (email) → confirmar si aplica  
2. **Onboarding** → crear / unirse a team  
3. **Nueva reunión** (audio o texto) → Meeting Agent  
4. **Assign** → Assignment Agent  
5. **Aprobar** plan → webhook n8n (si está configurado)

Si algo falla, correlacionar con `X-Request-ID` y `GET /api/errors`.

---

## 9. Cuotas y planes

- Planes en `subscription_plans` / columnas `teams.plan_tier`, `max_meetings_per_month`, `max_tokens_per_month`.
- Uso mensual en `usage_events`; consulta vía `GET /api/usage` y catálogo en `GET /api/billing/plans`.
- Al agotar cuota, el backend responde **402**.
- Ajustar caps por team o subir de plan (`free` → `starter` → `pro` → `enterprise`).

---

## 10. Checklist de seguridad

- [ ] `CORS_ORIGINS` restringido a dominios reales (no `*` en prod)
- [ ] `AUTH_DISABLED=false` en backend y frontend
- [ ] Solo anon key en frontend; service_role solo en backend
- [ ] RLS + `team_memberships` activos tras migración `006`
- [ ] `008_audit_events.sql` aplicado (auditoría legible por team)
- [ ] Rate limit (`RATE_LIMIT_PER_MINUTE`) activo
- [ ] LLM Firewall activo en Meeting Agent
- [ ] Secrets no commiteados; rotados si hubo leak
- [ ] Health check y logs de errores revisables

---

## 11. Stripe (stubs listos)

El schema SaaS ya contempla suscripciones (`team_subscriptions` y planes).

**Endpoints stub** (sin `STRIPE_SECRET_KEY` → **501** / `{url: null, detail: "Configure STRIPE_SECRET_KEY"}`):

| Método | Ruta | Comportamiento |
|--------|------|----------------|
| `POST` | `/api/billing/checkout` | Body `{plan_code}`; crea Checkout Session si hay key + price IDs |
| `POST` | `/api/billing/webhook` | Verificación stub + `audit_events` (`billing.webhook`) |
| `GET` | `/api/billing/subscription` | Fila actual de `team_subscriptions` del team |

**Ahora:** planes/cuotas se gestionan en DB / API de lectura; checkout/webhook son stubs seguros.  
**Después:** completar verificación criptográfica del webhook y actualizar `team_subscriptions` + `teams.plan_tier` en `customer.subscription.*`.

Auditoría: tras `008_audit_events.sql`, el backend registra `team.create`, `invite.send`, `invite.accept`, `plan.approve`, `quota.exceeded` y eventos de billing.
