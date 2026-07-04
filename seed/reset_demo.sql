-- =============================================================================
-- Reset transactional data between rehearsals (PROYECTO.md §10)
-- Preserves: teams, skills, members, member_skills, projects, project_members,
-- project_aliases, project_knowledge_sources, project_knowledge_chunks
-- =============================================================================

delete from notifications;
delete from approvals;
delete from ticket_status_events;
delete from ticket_assignments;
delete from ticket_context_references;
delete from tickets;
delete from requirement_project_references;
delete from requirements;
delete from meeting_project_mentions;
delete from meetings;
delete from agent_runs;

-- Optional: reset member load to seed values
update members set current_load = 40 where name = 'Ana';
update members set current_load = 85 where name = 'Beto';
update members set current_load = 30 where name = 'Carla';
update members set current_load = 60 where name = 'David';
update members set current_load = 20 where name = 'Elena';
update members set current_load = 0  where name = 'Rosa';
