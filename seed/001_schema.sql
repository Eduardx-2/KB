-- =============================================================================
-- AI Meeting-to-Tickets PM — Full Supabase schema (v3)
-- Run in: Supabase Dashboard → SQL Editor → New query
-- Extends PROYECTO.md §4.1 with projects, knowledge base, cross-project context
-- =============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "vector";

-- =============================================================================
-- LAYER 1 — TENANCY & PEOPLE
-- =============================================================================

create table teams (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,          -- e.g. 'demo' (used in RLS)
  created_at  timestamptz default now()
);

create table skills (
  id    uuid primary key default gen_random_uuid(),
  code  text not null unique,                -- frontend | backend | data | qa | devops
  label text not null
);

create table members (
  id            uuid primary key default gen_random_uuid(),
  team_id       uuid not null references teams(id) on delete cascade,
  name          text not null,
  email         text,
  role          text,                        -- job title: Frontend Dev, etc.
  current_load  int default 0 check (current_load between 0 and 100),
  is_manager    boolean default false,       -- can approve plans
  created_at    timestamptz default now(),
  unique (team_id, email)
);

create table member_skills (
  member_id   uuid not null references members(id) on delete cascade,
  skill_id    uuid not null references skills(id) on delete cascade,
  proficiency smallint default 3 check (proficiency between 1 and 5),
  primary key (member_id, skill_id)
);

-- =============================================================================
-- LAYER 2 — PROJECTS (work container)
-- =============================================================================

create table projects (
  id           uuid primary key default gen_random_uuid(),
  team_id      uuid not null references teams(id) on delete cascade,
  code         text,                         -- short ref: ERP-FIN
  name         text not null,
  description  text,
  business_area text,                        -- finance, operations, HR, etc.
  status       text default 'active'
                 check (status in ('active', 'on_hold', 'completed', 'archived')),
  owner_id     uuid references members(id) on delete set null,
  started_at   date,
  target_date  date,
  created_at   timestamptz default now(),
  unique (team_id, code)
);

create table project_aliases (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references projects(id) on delete cascade,
  alias            text not null,            -- how people mention it in meetings
  normalized_alias text not null,            -- lower/trimmed value for matching
  created_at       timestamptz default now(),
  unique (project_id, normalized_alias)
);

create table project_members (
  project_id  uuid not null references projects(id) on delete cascade,
  member_id   uuid not null references members(id) on delete cascade,
  role        text default 'contributor'
                check (role in ('owner', 'contributor', 'stakeholder')),
  joined_at   timestamptz default now(),
  primary key (project_id, member_id)
);

-- =============================================================================
-- LAYER 3 — PROJECT KNOWLEDGE BASE
-- =============================================================================

create table project_knowledge_sources (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references projects(id) on delete cascade,
  title          text not null,
  source_type    text not null
                   check (source_type in ('manual_note', 'meeting_recap', 'document', 'url', 'ticket_history', 'decision')),
  source_uri     text,                       -- URL, storage path, or external reference
  raw_content    text,
  summary        text,
  trust_level    text default 'verified'
                   check (trust_level in ('draft', 'verified', 'deprecated')),
  metadata       jsonb,
  created_by_id  uuid references members(id) on delete set null,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

create table project_knowledge_chunks (
  id           uuid primary key default gen_random_uuid(),
  source_id    uuid not null references project_knowledge_sources(id) on delete cascade,
  project_id   uuid not null references projects(id) on delete cascade,
  chunk_index  int not null default 0,
  content      text not null,
  embedding    vector(1536),                 -- OpenAI text-embedding-3-small size
  metadata     jsonb,
  created_at   timestamptz default now(),
  unique (source_id, chunk_index)
);

-- =============================================================================
-- LAYER 4 — MEETINGS → REQUIREMENTS (ingestion pipeline)
-- =============================================================================

create table meetings (
  id                  uuid primary key default gen_random_uuid(),
  primary_project_id  uuid not null references projects(id) on delete cascade,
  title               text,
  raw_transcript      text,
  audio_storage_path  text,                  -- Supabase Storage path if uploaded
  audio_duration_sec  int,
  source              text default 'upload'
                        check (source in ('upload', 'browser_record', 'paste')),
  status              text default 'draft'
                        check (status in ('draft', 'transcribed', 'processed')),
  facilitator_id      uuid references members(id) on delete set null,
  recorded_at         timestamptz default now(),
  created_at          timestamptz default now()
);

create table meeting_project_mentions (
  id                      uuid primary key default gen_random_uuid(),
  meeting_id              uuid not null references meetings(id) on delete cascade,
  mentioned_project_id    uuid references projects(id) on delete set null,
  mentioned_text          text not null,     -- exact phrase from recap/transcript
  confidence_pct          int check (confidence_pct between 0 and 100),
  resolution_status       text default 'resolved'
                            check (resolution_status in ('resolved', 'ambiguous', 'unknown')),
  resolution_reasoning    text,
  created_at              timestamptz default now()
);

create table requirements (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references projects(id) on delete cascade,
  meeting_id          uuid references meetings(id) on delete set null,
  origin_project_id   uuid references projects(id) on delete set null,
  title               text,
  summary             text,
  context_confidence_pct int check (context_confidence_pct between 0 and 100),
  status              text default 'draft'
                        check (status in ('draft', 'extracted', 'approved')),
  approved_at         timestamptz,
  approved_by_id      uuid references members(id) on delete set null,
  created_at          timestamptz default now()
);

create table requirement_project_references (
  id                       uuid primary key default gen_random_uuid(),
  requirement_id           uuid not null references requirements(id) on delete cascade,
  referenced_project_id    uuid not null references projects(id) on delete cascade,
  relation_type            text default 'related_context'
                             check (relation_type in ('primary_scope', 'related_context', 'dependency', 'conflict', 'blocked_by')),
  evidence_text            text,             -- phrase from recap or model extraction
  confidence_pct           int check (confidence_pct between 0 and 100),
  created_at               timestamptz default now(),
  unique (requirement_id, referenced_project_id, relation_type)
);

-- =============================================================================
-- LAYER 5 — TICKETS & KANBAN
-- =============================================================================

create table tickets (
  id                   uuid primary key default gen_random_uuid(),
  requirement_id       uuid not null references requirements(id) on delete cascade,
  project_id           uuid not null references projects(id) on delete cascade,
  title                text not null,
  description          text,
  priority             text check (priority in ('low', 'medium', 'high')),
  estimate_hours       int check (estimate_hours is null or estimate_hours > 0),
  required_skill_id    uuid references skills(id) on delete set null,
  risk_pct             int default 0 check (risk_pct between 0 and 100),
  assignee_id          uuid references members(id) on delete set null,
  assignment_reasoning text,
  status               text default 'backlog'
                         check (status in ('backlog', 'todo', 'in_progress', 'done')),
  deadline             date,
  kanban_order         int default 0,
  created_at           timestamptz default now(),
  updated_at           timestamptz default now()
);

create table ticket_context_references (
  id                  uuid primary key default gen_random_uuid(),
  ticket_id           uuid not null references tickets(id) on delete cascade,
  knowledge_chunk_id  uuid references project_knowledge_chunks(id) on delete set null,
  project_id          uuid references projects(id) on delete set null,
  evidence_text       text,                  -- short quote/snippet used by the agent
  relevance_pct       int check (relevance_pct between 0 and 100),
  created_at          timestamptz default now()
);

create table ticket_assignments (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references tickets(id) on delete cascade,
  assignee_id uuid references members(id) on delete set null,
  risk_pct    int check (risk_pct between 0 and 100),
  reasoning   text,
  source      text default 'agent'
                check (source in ('agent', 'manager', 'system')),
  is_current  boolean default true,
  created_at  timestamptz default now()
);

create table ticket_status_events (
  id              uuid primary key default gen_random_uuid(),
  ticket_id       uuid not null references tickets(id) on delete cascade,
  from_status     text,
  to_status       text not null,
  changed_by_id   uuid references members(id) on delete set null,
  source          text default 'api'
                    check (source in ('web', 'api', 'agent')),
  created_at      timestamptz default now()
);

-- =============================================================================
-- LAYER 6 — APPROVAL & NOTIFICATIONS (n8n integration)
-- =============================================================================

create table approvals (
  id               uuid primary key default gen_random_uuid(),
  requirement_id   uuid not null references requirements(id) on delete cascade,
  approved_by_id   uuid references members(id) on delete set null,
  n8n_notified     boolean default false,
  n8n_ok           boolean,
  webhook_payload  jsonb,
  created_at       timestamptz default now()
);

create table notifications (
  id            uuid primary key default gen_random_uuid(),
  approval_id   uuid references approvals(id) on delete set null,
  ticket_id     uuid references tickets(id) on delete set null,
  member_id     uuid not null references members(id) on delete cascade,
  channel       text default 'email'
                  check (channel in ('email', 'slack', 'webhook')),
  template      text,                        -- assignee_notice | manager_summary | risk_alert
  status        text default 'pending'
                  check (status in ('pending', 'sent', 'failed')),
  sent_at       timestamptz,
  error_message text,
  metadata      jsonb,
  created_at    timestamptz default now()
);

-- =============================================================================
-- LAYER 7 — OBSERVABILITY (AI agent runs)
-- =============================================================================

create table agent_runs (
  id            uuid primary key default gen_random_uuid(),
  agent         text not null
                  check (agent in ('transcribe', 'meeting', 'assignment')),
  entity_type   text,                        -- meeting | requirement | ticket
  entity_id     uuid,
  model         text,
  latency_ms    int,
  tokens_in     int,
  tokens_out    int,
  ok            boolean default true,
  error_message text,
  created_at    timestamptz default now()
);

-- Legacy alias: backend contract mentions agent_logs — keep as view
create view agent_logs with (security_invoker = true) as
  select
    id,
    agent,
    latency_ms,
    model,
    ok,
    created_at
  from agent_runs;

-- =============================================================================
-- TRIGGERS
-- =============================================================================

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_tickets_updated_at
  before update on tickets
  for each row execute function set_updated_at();

create trigger trg_project_knowledge_sources_updated_at
  before update on project_knowledge_sources
  for each row execute function set_updated_at();

-- Only one current assignment per ticket
create or replace function enforce_single_current_assignment()
returns trigger language plpgsql as $$
begin
  if new.is_current then
    update ticket_assignments
      set is_current = false
      where ticket_id = new.ticket_id
        and id <> new.id
        and is_current = true;
  end if;
  return new;
end;
$$;

create trigger trg_ticket_assignments_single_current
  after insert or update on ticket_assignments
  for each row execute function enforce_single_current_assignment();

-- =============================================================================
-- INDEXES
-- =============================================================================

create index idx_members_team_id on members (team_id);
create index idx_projects_team_id on projects (team_id);
create index idx_projects_status on projects (status);
create index idx_project_aliases_project_id on project_aliases (project_id);
create index idx_project_aliases_normalized_alias on project_aliases (normalized_alias);
create index idx_project_members_member on project_members (member_id);
create index idx_project_knowledge_sources_project_id on project_knowledge_sources (project_id);
create index idx_project_knowledge_sources_type on project_knowledge_sources (source_type);
create index idx_project_knowledge_chunks_project_id on project_knowledge_chunks (project_id);
create index idx_project_knowledge_chunks_source_id on project_knowledge_chunks (source_id);
create index idx_project_knowledge_chunks_embedding on project_knowledge_chunks using ivfflat (embedding vector_cosine_ops);
create index idx_meetings_primary_project_id on meetings (primary_project_id);
create index idx_meetings_status on meetings (status);
create index idx_meeting_project_mentions_meeting_id on meeting_project_mentions (meeting_id);
create index idx_meeting_project_mentions_project_id on meeting_project_mentions (mentioned_project_id);
create index idx_requirements_project_id on requirements (project_id);
create index idx_requirements_meeting_id on requirements (meeting_id);
create index idx_requirements_origin_project_id on requirements (origin_project_id);
create index idx_requirements_status on requirements (status);
create index idx_requirement_project_refs_requirement_id on requirement_project_references (requirement_id);
create index idx_requirement_project_refs_project_id on requirement_project_references (referenced_project_id);
create index idx_tickets_requirement_id on tickets (requirement_id);
create index idx_tickets_project_id on tickets (project_id);
create index idx_tickets_assignee_id on tickets (assignee_id);
create index idx_tickets_status on tickets (status);
create index idx_ticket_context_refs_ticket_id on ticket_context_references (ticket_id);
create index idx_ticket_context_refs_chunk_id on ticket_context_references (knowledge_chunk_id);
create index idx_ticket_assignments_ticket_current on ticket_assignments (ticket_id) where is_current;
create index idx_approvals_requirement_id on approvals (requirement_id);
create index idx_notifications_member_id on notifications (member_id);
create index idx_agent_runs_created_at on agent_runs (created_at desc);
create index idx_agent_runs_entity on agent_runs (entity_type, entity_id);

-- =============================================================================
-- ROW LEVEL SECURITY
-- Frontend: anon key, SELECT only on demo team
-- Backend: service_role bypasses RLS
-- =============================================================================

alter table teams            enable row level security;
alter table skills           enable row level security;
alter table members          enable row level security;
alter table member_skills    enable row level security;
alter table projects         enable row level security;
alter table project_aliases  enable row level security;
alter table project_members  enable row level security;
alter table project_knowledge_sources enable row level security;
alter table project_knowledge_chunks enable row level security;
alter table meetings         enable row level security;
alter table meeting_project_mentions enable row level security;
alter table requirements     enable row level security;
alter table requirement_project_references enable row level security;
alter table tickets          enable row level security;
alter table ticket_context_references enable row level security;
alter table ticket_assignments enable row level security;
alter table ticket_status_events enable row level security;
alter table approvals        enable row level security;
alter table notifications    enable row level security;
alter table agent_runs       enable row level security;

-- Helper: demo team scope
create or replace function demo_team_id()
returns uuid language sql stable as $$
  select id from teams where slug = 'demo' limit 1;
$$;

-- Reference data readable by all
create policy "anon_select_skills"
  on skills for select using (true);

create policy "anon_select_teams_demo"
  on teams for select using (slug = 'demo');

create policy "anon_select_members_demo"
  on members for select using (team_id = demo_team_id());

create policy "anon_select_member_skills_demo"
  on member_skills for select
  using (member_id in (select id from members where team_id = demo_team_id()));

create policy "anon_select_projects_demo"
  on projects for select using (team_id = demo_team_id());

create policy "anon_select_project_aliases_demo"
  on project_aliases for select
  using (project_id in (select id from projects where team_id = demo_team_id()));

create policy "anon_select_project_members_demo"
  on project_members for select
  using (project_id in (select id from projects where team_id = demo_team_id()));

create policy "anon_select_project_knowledge_sources_demo"
  on project_knowledge_sources for select
  using (project_id in (select id from projects where team_id = demo_team_id()));

create policy "anon_select_project_knowledge_chunks_demo"
  on project_knowledge_chunks for select
  using (project_id in (select id from projects where team_id = demo_team_id()));

create policy "anon_select_meetings_demo"
  on meetings for select
  using (primary_project_id in (select id from projects where team_id = demo_team_id()));

create policy "anon_select_meeting_project_mentions_demo"
  on meeting_project_mentions for select
  using (meeting_id in (
    select m.id from meetings m
    join projects p on p.id = m.primary_project_id
    where p.team_id = demo_team_id()
  ));

create policy "anon_select_requirements_demo"
  on requirements for select
  using (project_id in (select id from projects where team_id = demo_team_id()));

create policy "anon_select_requirement_project_references_demo"
  on requirement_project_references for select
  using (requirement_id in (
    select r.id from requirements r
    join projects p on p.id = r.project_id
    where p.team_id = demo_team_id()
  ));

create policy "anon_select_tickets_demo"
  on tickets for select
  using (project_id in (select id from projects where team_id = demo_team_id()));

create policy "anon_select_ticket_context_references_demo"
  on ticket_context_references for select
  using (ticket_id in (
    select t.id from tickets t
    join projects p on p.id = t.project_id
    where p.team_id = demo_team_id()
  ));

create policy "anon_select_ticket_assignments_demo"
  on ticket_assignments for select
  using (ticket_id in (
    select t.id from tickets t
    join projects p on p.id = t.project_id
    where p.team_id = demo_team_id()
  ));

create policy "anon_select_ticket_status_events_demo"
  on ticket_status_events for select
  using (ticket_id in (
    select t.id from tickets t
    join projects p on p.id = t.project_id
    where p.team_id = demo_team_id()
  ));

create policy "anon_select_approvals_demo"
  on approvals for select
  using (requirement_id in (
    select r.id from requirements r
    join projects p on p.id = r.project_id
    where p.team_id = demo_team_id()
  ));

create policy "anon_select_notifications_demo"
  on notifications for select
  using (member_id in (select id from members where team_id = demo_team_id()));

-- agent_runs: internal only (no anon policy)

-- =============================================================================
-- CONVENIENCE VIEWS (frontend Kanban board)
-- =============================================================================

create view board_tickets with (security_invoker = true) as
select
  t.id,
  t.requirement_id,
  t.project_id,
  p.name as project_name,
  t.title,
  t.description,
  t.priority,
  t.estimate_hours,
  s.code as required_skill,
  t.risk_pct,
  t.assignee_id,
  m.name as assignee_name,
  t.assignment_reasoning,
  t.status,
  t.deadline,
  t.kanban_order,
  t.created_at,
  t.updated_at
from tickets t
join projects p on p.id = t.project_id
left join skills s on s.id = t.required_skill_id
left join members m on m.id = t.assignee_id;

create view project_context_map with (security_invoker = true) as
select
  p.id as project_id,
  p.name as project_name,
  p.code as project_code,
  p.business_area,
  array_remove(array_agg(distinct pa.alias), null) as aliases,
  count(distinct pks.id) as knowledge_sources_count,
  count(distinct pkc.id) as knowledge_chunks_count,
  max(pks.updated_at) as last_knowledge_update
from projects p
left join project_aliases pa on pa.project_id = p.id
left join project_knowledge_sources pks on pks.project_id = p.id
left join project_knowledge_chunks pkc on pkc.project_id = p.id
group by p.id, p.name, p.code, p.business_area;
