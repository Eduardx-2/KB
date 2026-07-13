-- =============================================================================
-- 006 — SaaS multi-tenant extensions (ADDITIVE)
-- Run AFTER: 001_schema.sql, 004_error_logs.sql
--
-- Purpose:
--   Promote existing `teams` into a SaaS tenant root with plans, memberships,
--   invitations, subscriptions, usage metering, and authenticated RLS helpers.
--
-- Safety:
--   * Does NOT drop existing tables or anon demo policies (backward compatible).
--   * Idempotent where possible (IF NOT EXISTS, DROP POLICY IF EXISTS, DO blocks).
--
-- Auth model:
--   * Anon + demo policies from 001 remain for local/demo access.
--   * Authenticated users are scoped via team_memberships + helper functions.
--   * service_role continues to bypass RLS (backend / billing / invites).
-- =============================================================================

create extension if not exists "pgcrypto";

-- =============================================================================
-- 1. TEAMS — billing / plan / limits columns
-- =============================================================================

alter table teams
  add column if not exists plan_tier text default 'free',
  add column if not exists billing_email text,
  add column if not exists settings jsonb default '{}'::jsonb,
  add column if not exists status text default 'active',
  add column if not exists max_members int default 5,
  add column if not exists max_meetings_per_month int default 10,
  add column if not exists max_tokens_per_month int default 100000;

do $$ begin
  alter table teams
    add constraint teams_plan_tier_check
    check (plan_tier in ('free', 'starter', 'pro', 'enterprise'));
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table teams
    add constraint teams_status_check
    check (status in ('active', 'suspended', 'cancelled'));
exception when duplicate_object then null;
end $$;

comment on column teams.plan_tier is 'Commercial plan code mirrored from subscription_plans.code';
comment on column teams.settings is 'Tenant-level JSON settings (feature flags, branding, etc.)';
comment on column teams.status is 'Tenant lifecycle: active | suspended | cancelled';

-- =============================================================================
-- 2. MEMBERS — optional link to Supabase Auth
-- =============================================================================

alter table members
  add column if not exists user_id uuid;

comment on column members.user_id is
  'Optional link to auth.users(id). Nullable so demo/seed members can exist without Auth.';

create index if not exists idx_members_user_id on members (user_id);

-- =============================================================================
-- 3. TEAM MEMBERSHIPS (Auth users ↔ teams)
-- =============================================================================

create table if not exists team_memberships (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references teams(id) on delete cascade,
  user_id     uuid not null,  -- auth.users(id)
  role        text not null
                check (role in ('owner', 'admin', 'member', 'viewer')),
  status      text not null default 'active'
                check (status in ('active', 'invited', 'suspended')),
  created_at  timestamptz not null default now(),
  unique (team_id, user_id)
);

comment on column team_memberships.user_id is 'References auth.users(id)';

create index if not exists idx_team_memberships_user_id on team_memberships (user_id);
create index if not exists idx_team_memberships_team_id on team_memberships (team_id);

-- Optional hard FK to auth.users (no-op if auth schema missing / already linked)
do $$ begin
  alter table team_memberships
    add constraint team_memberships_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete cascade;
exception
  when undefined_table then null;      -- auth.users not present
  when duplicate_object then null;
end $$;

-- =============================================================================
-- 4. TEAM INVITATIONS
-- =============================================================================

create table if not exists team_invitations (
  id           uuid primary key default gen_random_uuid(),
  team_id      uuid not null references teams(id) on delete cascade,
  email        text not null,
  role         text not null default 'member'
                 check (role in ('owner', 'admin', 'member', 'viewer')),
  token        text not null unique,
  invited_by   uuid,  -- auth.users(id) of inviter
  expires_at   timestamptz not null,
  accepted_at  timestamptz,
  created_at   timestamptz not null default now()
);

comment on column team_invitations.invited_by is 'References auth.users(id) of the inviter';
comment on column team_invitations.token is 'Opaque invite token (unique); never expose in logs';

create index if not exists idx_team_invitations_team_id on team_invitations (team_id);
create index if not exists idx_team_invitations_email on team_invitations (lower(email));

-- =============================================================================
-- 5. SUBSCRIPTION PLANS (+ seed)
-- =============================================================================

create table if not exists subscription_plans (
  id                      uuid primary key default gen_random_uuid(),
  code                    text not null unique,
  name                    text not null,
  price_cents_monthly     int not null default 0 check (price_cents_monthly >= 0),
  max_members             int not null default 5,
  max_meetings_per_month  int not null default 10,
  max_tokens_per_month    int not null default 100000,
  features                jsonb not null default '{}'::jsonb
);

insert into subscription_plans (
  code, name, price_cents_monthly,
  max_members, max_meetings_per_month, max_tokens_per_month, features
) values
  (
    'free', 'Free', 0,
    5, 10, 100000,
    '{"support":"community","sso":false,"custom_branding":false,"priority_queue":false}'::jsonb
  ),
  (
    'starter', 'Starter', 1900,
    15, 50, 500000,
    '{"support":"email","sso":false,"custom_branding":false,"priority_queue":false}'::jsonb
  ),
  (
    'pro', 'Pro', 4900,
    50, 200, 2000000,
    '{"support":"priority","sso":true,"custom_branding":true,"priority_queue":true}'::jsonb
  ),
  (
    'enterprise', 'Enterprise', 0,
    500, 2000, 20000000,
    '{"support":"dedicated","sso":true,"custom_branding":true,"priority_queue":true,"sla":true,"custom_limits":true}'::jsonb
  )
on conflict (code) do update set
  name                   = excluded.name,
  price_cents_monthly    = excluded.price_cents_monthly,
  max_members            = excluded.max_members,
  max_meetings_per_month = excluded.max_meetings_per_month,
  max_tokens_per_month   = excluded.max_tokens_per_month,
  features               = excluded.features;

-- =============================================================================
-- 6. TEAM SUBSCRIPTIONS
-- =============================================================================

create table if not exists team_subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  team_id                uuid not null unique references teams(id) on delete cascade,
  plan_id                uuid not null references subscription_plans(id),
  stripe_customer_id     text,
  stripe_subscription_id text,
  status                 text not null default 'trialing'
                           check (status in ('active', 'past_due', 'cancelled', 'trialing')),
  current_period_start   timestamptz,
  current_period_end     timestamptz,
  created_at             timestamptz not null default now()
);

create index if not exists idx_team_subscriptions_plan_id on team_subscriptions (plan_id);
create index if not exists idx_team_subscriptions_status on team_subscriptions (status);

-- =============================================================================
-- 7. USAGE EVENTS (+ monthly aggregate view)
-- =============================================================================

create table if not exists usage_events (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references teams(id) on delete cascade,
  metric      text not null
                check (metric in ('meetings', 'tokens_in', 'tokens_out', 'transcribe_seconds')),
  quantity    bigint not null default 0 check (quantity >= 0),
  meta        jsonb default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists idx_usage_events_team_created
  on usage_events (team_id, created_at);

-- =============================================================================
-- 8–9. OBSERVABILITY — tenant scope on agent_runs / error_logs
-- =============================================================================

alter table agent_runs
  add column if not exists team_id uuid references teams(id) on delete set null;

create index if not exists idx_agent_runs_team_id on agent_runs (team_id);

alter table error_logs
  add column if not exists team_id uuid references teams(id) on delete set null;

create index if not exists idx_error_logs_team_id on error_logs (team_id);

-- =============================================================================
-- 10. HELPER FUNCTIONS (Auth-scoped)
-- =============================================================================

create or replace function current_user_team_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select team_id
  from team_memberships
  where user_id = auth.uid()
    and status = 'active';
$$;

create or replace function user_has_team_role(p_team_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from team_memberships
    where user_id = auth.uid()
      and team_id = p_team_id
      and status = 'active'
      and role = any (p_roles)
  );
$$;

comment on function current_user_team_ids() is
  'Returns team_ids for the current auth.uid() with active membership';
comment on function user_has_team_role(uuid, text[]) is
  'True if current auth.uid() has one of p_roles on p_team_id (active)';

grant execute on function current_user_team_ids() to authenticated;
grant execute on function user_has_team_role(uuid, text[]) to authenticated;

-- =============================================================================
-- 11. SAME-TEAM INTEGRITY TRIGGERS
--     project_members: member.team_id must equal project.team_id
--     tickets.assignee_id: assignee.team_id must equal project.team_id
-- =============================================================================

create or replace function enforce_project_member_same_team()
returns trigger
language plpgsql
as $$
declare
  v_project_team uuid;
  v_member_team  uuid;
begin
  select team_id into v_project_team from projects where id = new.project_id;
  select team_id into v_member_team  from members  where id = new.member_id;

  if v_project_team is null then
    raise exception 'project_members: project % not found', new.project_id;
  end if;
  if v_member_team is null then
    raise exception 'project_members: member % not found', new.member_id;
  end if;
  if v_project_team <> v_member_team then
    raise exception
      'project_members: member % (team %) is not in project % team %',
      new.member_id, v_member_team, new.project_id, v_project_team;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_project_members_same_team on project_members;
create trigger trg_project_members_same_team
  before insert or update of project_id, member_id
  on project_members
  for each row
  execute function enforce_project_member_same_team();

create or replace function enforce_ticket_assignee_same_team()
returns trigger
language plpgsql
as $$
declare
  v_project_team uuid;
  v_assignee_team uuid;
begin
  if new.assignee_id is null then
    return new;
  end if;

  select team_id into v_project_team from projects where id = new.project_id;
  select team_id into v_assignee_team from members where id = new.assignee_id;

  if v_project_team is null then
    raise exception 'tickets: project % not found', new.project_id;
  end if;
  if v_assignee_team is null then
    raise exception 'tickets: assignee member % not found', new.assignee_id;
  end if;
  if v_project_team <> v_assignee_team then
    raise exception
      'tickets: assignee % (team %) is not in project % team %',
      new.assignee_id, v_assignee_team, new.project_id, v_project_team;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_tickets_assignee_same_team on tickets;
create trigger trg_tickets_assignee_same_team
  before insert or update of project_id, assignee_id
  on tickets
  for each row
  execute function enforce_ticket_assignee_same_team();

-- =============================================================================
-- 12. USAGE MONTHLY VIEW
-- =============================================================================

create or replace view usage_monthly
with (security_invoker = true)
as
select
  team_id,
  date_trunc('month', created_at) as month,
  metric,
  sum(quantity)::bigint as total_quantity,
  count(*)::bigint as event_count
from usage_events
group by team_id, date_trunc('month', created_at), metric;

comment on view usage_monthly is
  'Aggregates usage_events by team_id, calendar month, and metric';

-- =============================================================================
-- 13. RLS — enable on new tables; keep existing anon demo policies
-- =============================================================================

alter table team_memberships   enable row level security;
alter table team_invitations   enable row level security;
alter table subscription_plans enable row level security;
alter table team_subscriptions enable row level security;
alter table usage_events       enable row level security;

-- ---------- team_memberships ----------
drop policy if exists "auth_select_own_memberships" on team_memberships;
create policy "auth_select_own_memberships"
  on team_memberships for select
  to authenticated
  using (user_id = auth.uid());

-- No insert/update/delete for authenticated or anon:
-- memberships are written by backend (service_role) after invite acceptance.

-- ---------- teams ----------
drop policy if exists "auth_select_teams" on teams;
create policy "auth_select_teams"
  on teams for select
  to authenticated
  using (id in (select current_user_team_ids()));

drop policy if exists "auth_update_teams" on teams;
create policy "auth_update_teams"
  on teams for update
  to authenticated
  using (user_has_team_role(id, array['owner', 'admin']))
  with check (user_has_team_role(id, array['owner', 'admin']));

-- ---------- members ----------
drop policy if exists "auth_select_members" on members;
create policy "auth_select_members"
  on members for select
  to authenticated
  using (team_id in (select current_user_team_ids()));

drop policy if exists "auth_insert_members" on members;
create policy "auth_insert_members"
  on members for insert
  to authenticated
  with check (user_has_team_role(team_id, array['owner', 'admin']));

drop policy if exists "auth_update_members" on members;
create policy "auth_update_members"
  on members for update
  to authenticated
  using (user_has_team_role(team_id, array['owner', 'admin']))
  with check (user_has_team_role(team_id, array['owner', 'admin']));

-- ---------- projects ----------
drop policy if exists "auth_select_projects" on projects;
create policy "auth_select_projects"
  on projects for select
  to authenticated
  using (team_id in (select current_user_team_ids()));

drop policy if exists "auth_insert_projects" on projects;
create policy "auth_insert_projects"
  on projects for insert
  to authenticated
  with check (user_has_team_role(team_id, array['owner', 'admin']));

drop policy if exists "auth_update_projects" on projects;
create policy "auth_update_projects"
  on projects for update
  to authenticated
  using (user_has_team_role(team_id, array['owner', 'admin']))
  with check (user_has_team_role(team_id, array['owner', 'admin']));

-- ---------- tickets (via project.team_id) ----------
drop policy if exists "auth_select_tickets" on tickets;
create policy "auth_select_tickets"
  on tickets for select
  to authenticated
  using (
    project_id in (
      select p.id from projects p
      where p.team_id in (select current_user_team_ids())
    )
  );

drop policy if exists "auth_insert_tickets" on tickets;
create policy "auth_insert_tickets"
  on tickets for insert
  to authenticated
  with check (
    exists (
      select 1 from projects p
      where p.id = project_id
        and user_has_team_role(p.team_id, array['owner', 'admin'])
    )
  );

drop policy if exists "auth_update_tickets" on tickets;
create policy "auth_update_tickets"
  on tickets for update
  to authenticated
  using (
    exists (
      select 1 from projects p
      where p.id = project_id
        and user_has_team_role(p.team_id, array['owner', 'admin'])
    )
  )
  with check (
    exists (
      select 1 from projects p
      where p.id = project_id
        and user_has_team_role(p.team_id, array['owner', 'admin'])
    )
  );

-- ---------- requirements (via project.team_id) ----------
drop policy if exists "auth_select_requirements" on requirements;
create policy "auth_select_requirements"
  on requirements for select
  to authenticated
  using (
    project_id in (
      select p.id from projects p
      where p.team_id in (select current_user_team_ids())
    )
  );

drop policy if exists "auth_insert_requirements" on requirements;
create policy "auth_insert_requirements"
  on requirements for insert
  to authenticated
  with check (
    exists (
      select 1 from projects p
      where p.id = project_id
        and user_has_team_role(p.team_id, array['owner', 'admin'])
    )
  );

drop policy if exists "auth_update_requirements" on requirements;
create policy "auth_update_requirements"
  on requirements for update
  to authenticated
  using (
    exists (
      select 1 from projects p
      where p.id = project_id
        and user_has_team_role(p.team_id, array['owner', 'admin'])
    )
  )
  with check (
    exists (
      select 1 from projects p
      where p.id = project_id
        and user_has_team_role(p.team_id, array['owner', 'admin'])
    )
  );

-- ---------- meetings (via primary_project.team_id) ----------
drop policy if exists "auth_select_meetings" on meetings;
create policy "auth_select_meetings"
  on meetings for select
  to authenticated
  using (
    primary_project_id in (
      select p.id from projects p
      where p.team_id in (select current_user_team_ids())
    )
  );

drop policy if exists "auth_insert_meetings" on meetings;
create policy "auth_insert_meetings"
  on meetings for insert
  to authenticated
  with check (
    exists (
      select 1 from projects p
      where p.id = primary_project_id
        and user_has_team_role(p.team_id, array['owner', 'admin'])
    )
  );

drop policy if exists "auth_update_meetings" on meetings;
create policy "auth_update_meetings"
  on meetings for update
  to authenticated
  using (
    exists (
      select 1 from projects p
      where p.id = primary_project_id
        and user_has_team_role(p.team_id, array['owner', 'admin'])
    )
  )
  with check (
    exists (
      select 1 from projects p
      where p.id = primary_project_id
        and user_has_team_role(p.team_id, array['owner', 'admin'])
    )
  );

-- ---------- subscription_plans (catalog readable by authenticated) ----------
drop policy if exists "auth_select_subscription_plans" on subscription_plans;
create policy "auth_select_subscription_plans"
  on subscription_plans for select
  to authenticated
  using (true);

-- ---------- team_subscriptions ----------
drop policy if exists "auth_select_team_subscriptions" on team_subscriptions;
create policy "auth_select_team_subscriptions"
  on team_subscriptions for select
  to authenticated
  using (team_id in (select current_user_team_ids()));

-- ---------- team_invitations (owner/admin) ----------
drop policy if exists "auth_select_team_invitations" on team_invitations;
create policy "auth_select_team_invitations"
  on team_invitations for select
  to authenticated
  using (user_has_team_role(team_id, array['owner', 'admin']));

drop policy if exists "auth_insert_team_invitations" on team_invitations;
create policy "auth_insert_team_invitations"
  on team_invitations for insert
  to authenticated
  with check (user_has_team_role(team_id, array['owner', 'admin']));

drop policy if exists "auth_update_team_invitations" on team_invitations;
create policy "auth_update_team_invitations"
  on team_invitations for update
  to authenticated
  using (user_has_team_role(team_id, array['owner', 'admin']))
  with check (user_has_team_role(team_id, array['owner', 'admin']));

-- ---------- usage_events (read own team; writes via service_role) ----------
drop policy if exists "auth_select_usage_events" on usage_events;
create policy "auth_select_usage_events"
  on usage_events for select
  to authenticated
  using (team_id in (select current_user_team_ids()));

-- ---------- agent_runs / error_logs (optional authenticated read by team) ----------
drop policy if exists "auth_select_agent_runs" on agent_runs;
create policy "auth_select_agent_runs"
  on agent_runs for select
  to authenticated
  using (team_id in (select current_user_team_ids()));

drop policy if exists "auth_select_error_logs" on error_logs;
create policy "auth_select_error_logs"
  on error_logs for select
  to authenticated
  using (team_id in (select current_user_team_ids()));

-- =============================================================================
-- GRANTS (authenticated can read/write where policies allow)
-- =============================================================================

grant select on team_memberships to authenticated;
grant select, insert, update on team_invitations to authenticated;
grant select on subscription_plans to authenticated;
grant select on team_subscriptions to authenticated;
grant select on usage_events to authenticated;
grant select on usage_monthly to authenticated;

grant select, update on teams to authenticated;
grant select, insert, update on members to authenticated;
grant select, insert, update on projects to authenticated;
grant select, insert, update on tickets to authenticated;
grant select, insert, update on requirements to authenticated;
grant select, insert, update on meetings to authenticated;
grant select on agent_runs to authenticated;
grant select on error_logs to authenticated;

-- =============================================================================
-- DONE
-- =============================================================================
