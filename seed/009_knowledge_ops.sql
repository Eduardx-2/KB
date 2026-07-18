-- =============================================================================
-- 009 — Knowledge Ops Enterprise (ADDITIVE)
-- Run AFTER: 001_schema.sql, 004_error_logs.sql, 006_saas_multitenant.sql
-- =============================================================================

create extension if not exists "vector";

-- ---------------------------------------------------------------------------
-- 0.1 Developer profile: duties, capacity, absences
-- ---------------------------------------------------------------------------

create table if not exists member_duties (
  id            uuid primary key default gen_random_uuid(),
  member_id     uuid not null references members(id) on delete cascade,
  team_id       uuid not null references teams(id) on delete cascade,
  title         text not null,
  description   text,
  duty_type     text not null default 'recurring'
                  check (duty_type in ('recurring', 'monitoring', 'oncall', 'admin')),
  hours_per_week numeric(5,2) default 0,
  load_pct      int default 0 check (load_pct between 0 and 100),
  is_active     boolean default true,
  created_at    timestamptz default now()
);

create index if not exists idx_member_duties_member on member_duties (member_id);
create index if not exists idx_member_duties_team on member_duties (team_id);

create table if not exists member_capacity (
  member_id       uuid primary key references members(id) on delete cascade,
  team_id         uuid not null references teams(id) on delete cascade,
  weekly_hours    int default 40 check (weekly_hours > 0),
  available_from  date,
  available_to    date,
  absence_note    text,
  updated_at      timestamptz default now()
);

create table if not exists member_absences (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references members(id) on delete cascade,
  team_id     uuid not null references teams(id) on delete cascade,
  start_date  date not null,
  end_date    date not null,
  reason      text,
  status      text default 'pending'
                check (status in ('pending', 'approved', 'cancelled')),
  created_at  timestamptz default now(),
  check (end_date >= start_date)
);

create index if not exists idx_member_absences_member on member_absences (member_id, start_date, end_date);

-- ---------------------------------------------------------------------------
-- 0.2 Project modules + stakeholders (structured MD)
-- ---------------------------------------------------------------------------

create table if not exists project_modules (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references projects(id) on delete cascade,
  team_id             uuid not null references teams(id) on delete cascade,
  code                text,
  name                text not null,
  summary             text,
  md_body             text not null default '',
  expected_outcomes   text,
  status              text default 'active'
                        check (status in ('planned', 'active', 'deprecated')),
  owner_member_id     uuid references members(id) on delete set null,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now(),
  unique (project_id, code)
);

create table if not exists project_stakeholders (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references projects(id) on delete cascade,
  member_id         uuid not null references members(id) on delete cascade,
  role_in_project   text not null,
  importance_pct    int default 50 check (importance_pct between 0 and 100),
  md_notes          text,
  created_at        timestamptz default now(),
  unique (project_id, member_id)
);

-- Extend source_type on project_knowledge_sources (drop/recreate check)
do $$ begin
  alter table project_knowledge_sources drop constraint if exists project_knowledge_sources_source_type_check;
  alter table project_knowledge_sources add constraint project_knowledge_sources_source_type_check
    check (source_type in (
      'manual_note', 'meeting_recap', 'document', 'url', 'ticket_history', 'decision',
      'project_overview', 'module_spec', 'expected_outcomes', 'stakeholders', 'db_schema', 'architecture'
    ));
exception when others then null;
end $$;

-- ---------------------------------------------------------------------------
-- 0.3 Knowledge graph
-- ---------------------------------------------------------------------------

create table if not exists knowledge_nodes (
  id              uuid primary key default gen_random_uuid(),
  team_id         uuid not null references teams(id) on delete cascade,
  project_id      uuid references projects(id) on delete cascade,
  node_type       text not null
                    check (node_type in ('project','module','entity','table','meeting','ticket','person','concept')),
  label           text not null,
  canonical_key   text,
  source_ref_type text,
  source_ref_id   uuid,
  metadata        jsonb default '{}'::jsonb,
  embedding       vector(1536),
  created_at      timestamptz default now()
);

create index if not exists idx_knowledge_nodes_team on knowledge_nodes (team_id);
create index if not exists idx_knowledge_nodes_project on knowledge_nodes (project_id);
create index if not exists idx_knowledge_nodes_type on knowledge_nodes (node_type);
create unique index if not exists idx_knowledge_nodes_canonical
  on knowledge_nodes (team_id, canonical_key) where canonical_key is not null;

create table if not exists knowledge_edges (
  id              uuid primary key default gen_random_uuid(),
  team_id         uuid not null references teams(id) on delete cascade,
  from_node_id    uuid not null references knowledge_nodes(id) on delete cascade,
  to_node_id      uuid not null references knowledge_nodes(id) on delete cascade,
  relation        text not null
                    check (relation in (
                      'depends_on','implements','mentions','owns','blocks',
                      'related_to','derived_from_meeting','impacts_table'
                    )),
  weight          float default 1.0,
  evidence_text   text,
  confidence_pct  int check (confidence_pct is null or confidence_pct between 0 and 100),
  created_by      text default 'agent' check (created_by in ('agent', 'human')),
  created_at      timestamptz default now()
);

create index if not exists idx_knowledge_edges_from on knowledge_edges (from_node_id);
create index if not exists idx_knowledge_edges_to on knowledge_edges (to_node_id);

-- ---------------------------------------------------------------------------
-- 0.4 Granular tickets + reorg proposals
-- ---------------------------------------------------------------------------

alter table tickets add column if not exists parent_ticket_id uuid references tickets(id) on delete set null;
alter table tickets add column if not exists work_phase text
  check (work_phase is null or work_phase in ('discovery','ux','design','frontend','backend','db','qa','deploy'));
alter table tickets add column if not exists acceptance_criteria text;
alter table tickets add column if not exists scheduled_date date;
alter table tickets add column if not exists depends_on_ticket_ids uuid[];
alter table tickets add column if not exists is_greenfield boolean default false;
alter table tickets add column if not exists related_db_tables text[];

create table if not exists reorg_proposals (
  id                  uuid primary key default gen_random_uuid(),
  team_id             uuid not null references teams(id) on delete cascade,
  member_id           uuid not null references members(id) on delete cascade,
  triggered_by        text not null
                        check (triggered_by in ('absence','overload','deadline_risk')),
  reason_md           text not null,
  status              text default 'draft'
                        check (status in ('draft','pending_boss','approved','rejected','applied')),
  proposed_by_agent   boolean default true,
  boss_decision_note  text,
  decided_by_id       uuid references members(id) on delete set null,
  decided_at          timestamptz,
  created_at          timestamptz default now()
);

create table if not exists reorg_proposal_items (
  id                  uuid primary key default gen_random_uuid(),
  proposal_id         uuid not null references reorg_proposals(id) on delete cascade,
  ticket_id           uuid not null references tickets(id) on delete cascade,
  action              text not null
                        check (action in ('keep','reschedule','reassign','postpone','drop')),
  new_assignee_id     uuid references members(id) on delete set null,
  new_scheduled_date  date,
  new_deadline        date,
  rationale           text
);

create index if not exists idx_reorg_proposals_team_status on reorg_proposals (team_id, status);

-- ---------------------------------------------------------------------------
-- RLS (authenticated team scope — service_role bypasses)
-- ---------------------------------------------------------------------------

alter table member_duties enable row level security;
alter table member_capacity enable row level security;
alter table member_absences enable row level security;
alter table project_modules enable row level security;
alter table project_stakeholders enable row level security;
alter table knowledge_nodes enable row level security;
alter table knowledge_edges enable row level security;
alter table reorg_proposals enable row level security;
alter table reorg_proposal_items enable row level security;

-- Policies for authenticated (requires 006 current_user_team_ids)
do $$ begin
  create policy "auth_select_member_duties" on member_duties for select
    using (team_id in (select current_user_team_ids()));
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "auth_select_member_absences" on member_absences for select
    using (team_id in (select current_user_team_ids()));
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "auth_select_project_modules" on project_modules for select
    using (team_id in (select current_user_team_ids()));
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "auth_select_knowledge_nodes" on knowledge_nodes for select
    using (team_id in (select current_user_team_ids()));
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "auth_select_reorg_proposals" on reorg_proposals for select
    using (team_id in (select current_user_team_ids()));
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- RPC: semantic search on knowledge chunks
-- ---------------------------------------------------------------------------

create or replace function match_knowledge_chunks(
  query_embedding vector(1536),
  p_project_id uuid,
  match_count int default 8
)
returns table (
  id uuid,
  source_id uuid,
  project_id uuid,
  chunk_index int,
  content text,
  similarity float
)
language sql stable
as $$
  select
    pkc.id,
    pkc.source_id,
    pkc.project_id,
    pkc.chunk_index,
    pkc.content,
    1 - (pkc.embedding <=> query_embedding) as similarity
  from project_knowledge_chunks pkc
  where pkc.project_id = p_project_id
    and pkc.embedding is not null
  order by pkc.embedding <=> query_embedding
  limit match_count;
$$;
