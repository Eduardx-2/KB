-- =============================================================================
-- Test data for backend endpoints
-- Run after:
--   1) seed/001_schema.sql
--   2) seed/002_seed_demo.sql
--
-- This script is idempotent and uses fixed UUIDs so API commands can be reused.
-- =============================================================================

-- Clean only this test fixture.
delete from ticket_status_events where ticket_id = '91000000-0000-0000-0000-000000000001';
delete from ticket_assignments where ticket_id = '91000000-0000-0000-0000-000000000001';
delete from ticket_context_references where ticket_id = '91000000-0000-0000-0000-000000000001';
delete from tickets where id = '91000000-0000-0000-0000-000000000001';
delete from approvals where requirement_id = '90000000-0000-0000-0000-000000000001';
delete from requirement_project_references where requirement_id = '90000000-0000-0000-0000-000000000001';
delete from requirements where id = '90000000-0000-0000-0000-000000000001';

-- Requirement used by:
--   POST /api/agents/meeting
--   POST /api/agents/assignment
--   POST /api/approve/{requirement_id}
insert into requirements (
  id,
  project_id,
  title,
  summary,
  status
) values (
  '90000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  'Fixture API endpoints',
  'Requirement de prueba para endpoints del backend.',
  'draft'
);

-- Ticket used by:
--   PATCH /api/tickets/{ticket_id}
--   POST /api/agents/assignment
--
-- The meeting agent may add more tickets to the same requirement if OpenAI is configured.
insert into tickets (
  id,
  requirement_id,
  project_id,
  title,
  description,
  priority,
  estimate_hours,
  required_skill_id,
  risk_pct,
  status
) values (
  '91000000-0000-0000-0000-000000000001',
  '90000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  'Configurar endpoint de prueba',
  'Ticket fixture para validar PATCH y assignment agent.',
  'medium',
  4,
  '10000000-0000-0000-0000-000000000002',
  0,
  'backlog'
);

-- Quick verification.
select
  r.id as requirement_id,
  r.status as requirement_status,
  t.id as ticket_id,
  t.status as ticket_status,
  s.code as required_skill
from requirements r
join tickets t on t.requirement_id = r.id
left join skills s on s.id = t.required_skill_id
where r.id = '90000000-0000-0000-0000-000000000001';
