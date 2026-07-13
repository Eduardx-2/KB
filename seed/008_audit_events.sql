-- =============================================================================
-- 008_audit_events.sql — Additive SaaS audit log
-- Run after 006_saas_multitenant.sql
-- =============================================================================

create table if not exists audit_events (
  id            uuid primary key default gen_random_uuid(),
  team_id       uuid references teams(id) on delete set null,
  user_id       uuid,
  action        text not null,
  -- e.g. login, team.create, invite.send, invite.accept, approve,
  --      quota.exceeded, billing.checkout, billing.webhook
  resource_type text,
  resource_id   text,
  meta          jsonb default '{}'::jsonb,
  ip            text,
  created_at    timestamptz default now()
);

create index if not exists audit_events_team_created_idx
  on audit_events (team_id, created_at desc);

alter table audit_events enable row level security;

-- Authenticated users can read audit events for their own teams.
drop policy if exists "auth_select_audit_events" on audit_events;
create policy "auth_select_audit_events"
  on audit_events for select
  to authenticated
  using (team_id in (select current_user_team_ids()));

-- Writes go through backend service_role (no insert/update/delete for authenticated).
grant select on audit_events to authenticated;
