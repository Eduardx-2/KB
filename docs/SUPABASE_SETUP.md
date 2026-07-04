# Supabase Setup — AI Meeting-to-Tickets PM (Schema v3)

Full relational model for the buildathon app. Source: `PROYECTO.md` + project knowledge base and cross-project context requirements.

For the complete approved ER with every attribute, use `docs/DATABASE_DICTIONARY.md`.

---

## 1. ER Diagram

The approved v3 ER diagram and complete table attributes live in `docs/DATABASE_DICTIONARY.md`.

This setup file is only the operational checklist for creating the schema in Supabase.

---

## 2. Layer architecture

```
┌─────────────────────────────────────────────────────────────┐
│  L1 TENANCY     teams · members · skills · member_skills    │
├─────────────────────────────────────────────────────────────┤
│  L2 PROJECTS    projects · project_aliases · project_members│
├─────────────────────────────────────────────────────────────┤
│  L3 KNOWLEDGE   project_knowledge_sources · chunks          │
├─────────────────────────────────────────────────────────────┤
│  L4 PIPELINE    meetings · project_mentions → requirements  │
├─────────────────────────────────────────────────────────────┤
│  L5 EXECUTION   tickets · context_refs · assignments        │
├─────────────────────────────────────────────────────────────┤
│  L6 GOVERNANCE  approvals · notifications (n8n)             │
├─────────────────────────────────────────────────────────────┤
│  L7 OBSERVE     agent_runs (+ view agent_logs for contract) │
└─────────────────────────────────────────────────────────────┘
```

### Why each table exists

| Table | Purpose |
|-------|---------|
| `teams` | Multi-tenant root (demo = `slug: 'demo'`) |
| `skills` | Normalized skill catalog for assignment matching |
| `members` | IT team with load % and manager flag |
| `member_skills` | M:N — Elena has `devops`, not `backend` |
| `projects` | Work container — "ERP Finanzas" lives here |
| `project_aliases` | Names/phrases used in recaps to resolve vague project mentions |
| `project_members` | Who works on which project |
| `project_knowledge_sources` | Verified notes/docs/recaps that form each project knowledge base |
| `project_knowledge_chunks` | Searchable chunks, optionally with vector embeddings |
| `meetings` | Raw ingestion: audio path, transcript, source |
| `meeting_project_mentions` | Project mentions detected inside a recap |
| `requirements` | AI output: summary + approval lifecycle |
| `requirement_project_references` | Cross-project dependencies/context for requirements |
| `tickets` | Kanban cards with risk + assignee |
| `ticket_context_references` | Evidence used by the agent to justify generated tickets |
| `ticket_assignments` | Assignment history (agent vs manager overrides) |
| `ticket_status_events` | Audit trail when cards move columns |
| `approvals` | 1-click approve → n8n webhook record |
| `notifications` | Email dispatch log per assignee / risk alert |
| `agent_runs` | Latency, tokens, errors per AI call |

---

## 3. Demo data flow (end-to-end)

```
1. Manager (Rosa) opens project "ERP Finanzas"
2. New meeting → upload/record audio → meetings.status = transcribed
3. POST /api/agents/meeting
     → requirements (summary, status=extracted)
     → tickets (4 cards linked to project + requirement)
     → agent_runs (meeting)
4. POST /api/agents/assignment
     → tickets.assignee_id + risk_pct + assignment_reasoning
     → ticket_assignments (is_current=true)
     → agent_runs (assignment)
5. Frontend reads board_tickets view (anon key)
6. Drag card → PATCH /api/tickets/{id}
     → tickets.status + ticket_status_events
7. POST /api/approve/{requirement_id}
     → requirements.status=approved, approvals row
     → n8n → notifications rows
```

---

## 4. Mapping to frozen backend contract (PROYECTO §4)

The original contract used flat `team_id text` columns. v2 is richer but **backward-compatible at the API layer** — R1 maps like this:

| Contract concept | v2 location |
|------------------|-------------|
| `members.skills[]` | `member_skills` join `skills.code` |
| `requirements.raw_transcript` | `meetings.raw_transcript` |
| `requirements.summary` | `requirements.summary` |
| `tickets.required_skill` | `tickets.required_skill_id` → `skills.code` |
| `agent_logs` | `agent_runs` (view `agent_logs` kept) |
| `team_id = 'demo'` | `teams.slug = 'demo'` via FK chain |

**R1 backend changes needed:**
- On transcribe/meeting start: `INSERT meetings` then `INSERT requirements`
- On assignment: also `INSERT ticket_assignments`
- On PATCH status: also `INSERT ticket_status_events`
- On approve: `INSERT approvals` + update `requirements.approved_at`

**R2 frontend reads:**
- Kanban: `board_tickets` view (or join query)
- Members + skills: `members` + `member_skills` + `skills`
- Project context: `projects` header on board page

---

## 5. Setup steps

| Step | File | Result |
|------|------|--------|
| 1 | `seed/001_schema.sql` | 15 tables + 2 views + RLS |
| 2 | `seed/002_seed_demo.sql` | 1 team, 5 skills, 6 members, 1 ERP project |
| 3 | `seed/reset_demo.sql` | Clears meetings→notifications between demos |

### Verify after seed

```sql
select 'teams' t, count(*) from teams
union all select 'skills', count(*) from skills
union all select 'members', count(*) from members
union all select 'projects', count(*) from projects;
-- expect: 1, 5, 6, 1
```

### Env vars (unchanged)

```env
# Backend
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Frontend
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

---

## 6. Key queries

### Kanban board (use view)

```sql
select * from board_tickets
where requirement_id = '<uuid>'
order by kanban_order, created_at;
```

### Members with skills (replaces `skills[]`)

```sql
select m.name, m.current_load, array_agg(s.code order by s.code) as skills
from members m
join member_skills ms on ms.member_id = m.id
join skills s on s.id = ms.skill_id
group by m.id
order by m.current_load desc;
```

### Full requirement context

```sql
select
  p.name as project,
  m.title as meeting,
  r.summary,
  r.status,
  count(t.id) as tickets
from requirements r
join projects p on p.id = r.project_id
left join meetings m on m.id = r.meeting_id
left join tickets t on t.requirement_id = r.id
where r.id = '<uuid>'
group by p.name, m.title, r.summary, r.status;
```

### Assignment history (demo: "Beto was forced at 80% risk")

```sql
select t.title, m.name, ta.risk_pct, ta.reasoning, ta.source, ta.created_at
from ticket_assignments ta
join tickets t on t.id = ta.ticket_id
left join members m on m.id = ta.assignee_id
where ta.is_current = true
order by ta.risk_pct desc;
```

---

## 7. Enum reference

| Column | Values |
|--------|--------|
| `projects.status` | `active` · `on_hold` · `completed` · `archived` |
| `meetings.source` | `upload` · `browser_record` · `paste` |
| `meetings.status` | `draft` · `transcribed` · `processed` |
| `requirements.status` | `draft` · `extracted` · `approved` |
| `tickets.status` | `backlog` · `todo` · `in_progress` · `done` |
| `tickets.priority` | `low` · `medium` · `high` |
| `skills.code` | `frontend` · `backend` · `data` · `qa` · `devops` |
| `ticket_assignments.source` | `agent` · `manager` · `system` |
| `notifications.template` | `assignee_notice` · `manager_summary` · `risk_alert` |
| `agent_runs.agent` | `transcribe` · `meeting` · `assignment` |

### Risk semaphore (UI)

| `risk_pct` | Color |
|------------|-------|
| &lt; 40 | Green |
| 40–70 | Yellow |
| &gt; 70 | Red |

---

## 8. Files

| File | Purpose |
|------|---------|
| `seed/001_schema.sql` | Full DDL, indexes, RLS, views |
| `seed/002_seed_demo.sql` | Team, skills, members, ERP project |
| `seed/reset_demo.sql` | Wipe transactional data between rehearsals |
| `docs/SUPABASE_SETUP.md` | This guide |
