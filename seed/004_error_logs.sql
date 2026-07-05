-- =============================================================================
-- Error logging — captura errores HTTP y de aplicación (backend + frontend)
-- Run AFTER 001_schema.sql (usa pgcrypto de esa migración).
--
-- Diseño (alineado a la arquitectura del proyecto):
--   * Una sola tabla `error_logs` con discriminador `source` (backend|frontend|worker).
--   * Es observabilidad INTERNA, igual que `agent_runs`: RLS ON y SIN policy anon.
--     -> El backend escribe/lee con service_role (bypassa RLS).
--     -> El frontend NO escribe directo: reporta vía POST /api/client-errors
--        (respeta el CONTRATO "el frontend solo escribe a través del backend").
-- =============================================================================

create extension if not exists "pgcrypto";

create table if not exists error_logs (
  id            uuid primary key default gen_random_uuid(),
  source        text not null default 'backend'
                  check (source in ('backend', 'frontend', 'worker')),
  severity      text not null default 'error'
                  check (severity in ('info', 'warning', 'error', 'critical')),
  request_id    text,                       -- correlaciona respuesta HTTP <-> log
  http_status   int,                        -- 500, 503, 400, ...
  http_method   text,                       -- GET | POST | PATCH | ...
  path          text,                       -- ruta del endpoint o del cliente
  error_type    text,                       -- clase de excepción / nombre del error JS
  message       text not null,
  stack         text,                       -- traceback / stack trace (recortado)
  context       jsonb,                      -- metadata libre (requirement_id, ids, etc.)
  user_agent    text,
  created_at    timestamptz default now()
);

create index if not exists idx_error_logs_created_at  on error_logs (created_at desc);
create index if not exists idx_error_logs_source      on error_logs (source);
create index if not exists idx_error_logs_severity    on error_logs (severity);
create index if not exists idx_error_logs_http_status on error_logs (http_status);
create index if not exists idx_error_logs_request_id  on error_logs (request_id);

alter table error_logs enable row level security;
-- Interno: sin policy anon. Solo service_role (backend) puede leer/escribir.

-- Vista de conveniencia: últimos errores legibles de un vistazo.
create or replace view recent_errors with (security_invoker = true) as
select
  id,
  created_at,
  source,
  severity,
  http_status,
  http_method,
  path,
  error_type,
  message,
  request_id
from error_logs
order by created_at desc
limit 200;
