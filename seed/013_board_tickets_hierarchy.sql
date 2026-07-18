-- 013 — Hierarchy fields on board_tickets view (parent + work_phase)
-- Safe to re-run: drop + create view

create or replace view board_tickets with (security_invoker = true) as
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
  t.updated_at,
  t.parent_ticket_id,
  t.work_phase,
  t.acceptance_criteria,
  t.scheduled_date,
  t.is_greenfield,
  t.related_db_tables,
  t.depends_on_ticket_ids
from tickets t
join projects p on p.id = t.project_id
left join skills s on s.id = t.required_skill_id
left join members m on m.id = t.assignee_id;
