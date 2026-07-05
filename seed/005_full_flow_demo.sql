-- =============================================================================
-- Seed integral del FLUJO COMPLETO — puebla TODAS las tablas del pipeline
-- Run AFTER 001_schema.sql + 002_seed_demo.sql (+ 004_error_logs.sql)
--
-- Escenario: reunión de "ERP Finanzas" ya procesada y aprobada, con tickets
-- asignados, historial de estados, aprobación, notificaciones, corridas de
-- agentes y ejemplos de error_logs. Sirve para corroborar el flujo de data
-- end-to-end en Supabase (Table Editor) y en la UI.
--
-- Idempotente: borra sus propias filas (por IDs fijos con prefijo 9x) y re-inserta.
-- Reutiliza teams/members/projects/skills/knowledge del seed 002.
-- =============================================================================

-- ---------- Limpieza (hijos → padres) ----------
delete from notifications              where id in ('99000000-0000-0000-0000-000000000001','99000000-0000-0000-0000-000000000002','99000000-0000-0000-0000-000000000003','99000000-0000-0000-0000-000000000004');
delete from approvals                  where id in ('98000000-0000-0000-0000-000000000001');
delete from ticket_status_events       where id in ('97000000-0000-0000-0000-000000000001','97000000-0000-0000-0000-000000000002','97000000-0000-0000-0000-000000000003','97000000-0000-0000-0000-000000000004','97000000-0000-0000-0000-000000000005','97000000-0000-0000-0000-000000000006');
delete from ticket_assignments         where id in ('96000000-0000-0000-0000-000000000001','96000000-0000-0000-0000-000000000002','96000000-0000-0000-0000-000000000003','96000000-0000-0000-0000-000000000004');
delete from ticket_context_references  where id in ('95000000-0000-0000-0000-000000000001','95000000-0000-0000-0000-000000000002');
delete from tickets                    where id in ('94000000-0000-0000-0000-000000000001','94000000-0000-0000-0000-000000000002','94000000-0000-0000-0000-000000000003','94000000-0000-0000-0000-000000000004');
delete from requirement_project_references where id in ('93000000-0000-0000-0000-000000000001');
delete from requirements               where id in ('92000000-0000-0000-0000-000000000001');
delete from meeting_project_mentions   where id in ('91000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000002');
delete from meetings                   where id in ('90000000-0000-0000-0000-000000000001');
delete from agent_runs                 where id in ('9a000000-0000-0000-0000-000000000001','9a000000-0000-0000-0000-000000000002','9a000000-0000-0000-0000-000000000003');
delete from error_logs                 where id in ('9b000000-0000-0000-0000-000000000001','9b000000-0000-0000-0000-000000000002');

-- ---------- 1. Meeting (transcript crudo, ya procesado) ----------
insert into meetings (id, primary_project_id, title, raw_transcript, source, status, facilitator_id, recorded_at, created_at)
values (
  '90000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  'Reunión de requerimientos — ERP Finanzas',
  'Vengo de Finanzas y necesitamos un ERP para controlar costos e inventario. Requerimos módulo de costos con rentabilidad por producto, módulo de inventario conciliable contra contabilidad, y migración de 4 años de históricos en Excel. Plazo de 3 a 6 meses. Necesitamos un plan de pruebas serio para los cálculos.',
  'paste',
  'processed',
  '20000000-0000-0000-0000-000000000006',
  now() - interval '6 hours',
  now() - interval '6 hours'
);

-- ---------- 2. Menciones de proyectos detectadas en la reunión ----------
insert into meeting_project_mentions (id, meeting_id, mentioned_project_id, mentioned_text, confidence_pct, resolution_status, resolution_reasoning)
values
  ('91000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','un ERP para controlar costos e inventario', 96, 'resolved',  'Coincide con alias "ERP Finanzas" y "módulo de costos".'),
  ('91000000-0000-0000-0000-000000000002','90000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002','conciliar contra registros contables', 55, 'ambiguous', 'Mención podría tocar facturación/CRM; requiere validación humana.');

-- ---------- 3. Requirement (aprobado) ----------
insert into requirements (id, project_id, meeting_id, origin_project_id, title, summary, context_confidence_pct, status, approved_at, approved_by_id, created_at)
values (
  '92000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '90000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  'ERP de Finanzas — costos, inventario y migración',
  'Finanzas necesita un ERP con módulo de costos (rentabilidad por producto), módulo de inventario conciliable contra contabilidad y migración de 4 años de históricos en Excel. Plazo 3–6 meses, con plan de pruebas para los cálculos.',
  88,
  'approved',
  now() - interval '5 hours',
  '20000000-0000-0000-0000-000000000006',
  now() - interval '6 hours'
);

-- ---------- 4. Referencia cruzada a otro proyecto (contexto) ----------
insert into requirement_project_references (id, requirement_id, referenced_project_id, relation_type, evidence_text, confidence_pct)
values (
  '93000000-0000-0000-0000-000000000001',
  '92000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000002',
  'related_context',
  'La conciliación contra registros contables puede tocar estados de factura del CRM Ventas.',
  60
);

-- ---------- 5. Tickets ----------
insert into tickets (id, requirement_id, project_id, title, description, priority, estimate_hours, required_skill_id, risk_pct, assignee_id, assignment_reasoning, status, created_at)
values
  ('94000000-0000-0000-0000-000000000001','92000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',
   'Diseñar esquema de datos del módulo de costos','Modelar tablas de costos y rentabilidad por producto.','high',16,
   '10000000-0000-0000-0000-000000000003',25,'20000000-0000-0000-0000-000000000003','Skill de data (Carla) y carga baja (30%).','in_progress', now() - interval '6 hours'),
  ('94000000-0000-0000-0000-000000000002','92000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',
   'API de carga de Excel históricos','Endpoint que recibe archivos Excel y los normaliza.','high',24,
   '10000000-0000-0000-0000-000000000002',80,'20000000-0000-0000-0000-000000000002','Único backend (Beto) pero al 85% de carga → riesgo alto.','todo', now() - interval '6 hours'),
  ('94000000-0000-0000-0000-000000000003','92000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',
   'Pantalla de conciliación de inventario','Vista para cuadrar inventario contra registros contables.','medium',20,
   '10000000-0000-0000-0000-000000000001',35,'20000000-0000-0000-0000-000000000001','Frontend (Ana) con carga media.','todo', now() - interval '6 hours'),
  ('94000000-0000-0000-0000-000000000004','92000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',
   'Plan de pruebas del módulo de costos','Casos de prueba de cálculos y cargas.','medium',8,
   '10000000-0000-0000-0000-000000000004',40,'20000000-0000-0000-0000-000000000004','QA (David) con carga moderada.','done', now() - interval '6 hours');

-- ---------- 6. Referencias de contexto usadas por el agente para cada ticket ----------
insert into ticket_context_references (id, ticket_id, knowledge_chunk_id, project_id, evidence_text, relevance_pct)
values
  ('95000000-0000-0000-0000-000000000001','94000000-0000-0000-0000-000000000001',
   (select id from project_knowledge_chunks where source_id = '40000000-0000-0000-0000-000000000001' and chunk_index = 0),
   '30000000-0000-0000-0000-000000000001','Priorizar calidad y trazabilidad de datos en costos.',92),
  ('95000000-0000-0000-0000-000000000002','94000000-0000-0000-0000-000000000002',
   (select id from project_knowledge_chunks where source_id = '40000000-0000-0000-0000-000000000001' and chunk_index = 0),
   '30000000-0000-0000-0000-000000000001','Migración de históricos de Excel con validaciones de calidad.',85);

-- ---------- 7. Historial de asignaciones (una current por ticket) ----------
insert into ticket_assignments (id, ticket_id, assignee_id, risk_pct, reasoning, source, is_current)
values
  ('96000000-0000-0000-0000-000000000001','94000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000003',25,'Skill de data y carga baja.','agent', true),
  ('96000000-0000-0000-0000-000000000002','94000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002',80,'Único backend disponible, carga alta.','agent', true),
  ('96000000-0000-0000-0000-000000000003','94000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001',35,'Frontend con carga media.','agent', true),
  ('96000000-0000-0000-0000-000000000004','94000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000004',40,'QA con carga moderada.','agent', true);

-- ---------- 8. Bitácora de cambios de estado ----------
insert into ticket_status_events (id, ticket_id, from_status, to_status, changed_by_id, source, created_at)
values
  ('97000000-0000-0000-0000-000000000001','94000000-0000-0000-0000-000000000001','backlog','todo',       null,                                   'agent', now() - interval '6 hours'),
  ('97000000-0000-0000-0000-000000000002','94000000-0000-0000-0000-000000000001','todo','in_progress','20000000-0000-0000-0000-000000000003','web',   now() - interval '3 hours'),
  ('97000000-0000-0000-0000-000000000003','94000000-0000-0000-0000-000000000002','backlog','todo',       null,                                   'agent', now() - interval '6 hours'),
  ('97000000-0000-0000-0000-000000000004','94000000-0000-0000-0000-000000000003','backlog','todo',       null,                                   'agent', now() - interval '6 hours'),
  ('97000000-0000-0000-0000-000000000005','94000000-0000-0000-0000-000000000004','backlog','todo',       null,                                   'agent', now() - interval '6 hours'),
  ('97000000-0000-0000-0000-000000000006','94000000-0000-0000-0000-000000000004','todo','done',       '20000000-0000-0000-0000-000000000004','web',   now() - interval '1 hour');

-- ---------- 9. Aprobación ----------
insert into approvals (id, requirement_id, approved_by_id, n8n_notified, n8n_ok, webhook_payload, created_at)
values (
  '98000000-0000-0000-0000-000000000001',
  '92000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000006',
  true,
  true,
  '{"requirement_id":"92000000-0000-0000-0000-000000000001","tickets":4,"channel":"n8n"}'::jsonb,
  now() - interval '5 hours'
);

-- ---------- 10. Notificaciones (una por assignee) ----------
insert into notifications (id, approval_id, ticket_id, member_id, channel, template, status, sent_at, created_at)
values
  ('99000000-0000-0000-0000-000000000001','98000000-0000-0000-0000-000000000001','94000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000003','email','assignee_notice','sent', now() - interval '5 hours', now() - interval '5 hours'),
  ('99000000-0000-0000-0000-000000000002','98000000-0000-0000-0000-000000000001','94000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','email','assignee_notice','sent', now() - interval '5 hours', now() - interval '5 hours'),
  ('99000000-0000-0000-0000-000000000003','98000000-0000-0000-0000-000000000001','94000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001','email','assignee_notice','sent', now() - interval '5 hours', now() - interval '5 hours'),
  ('99000000-0000-0000-0000-000000000004','98000000-0000-0000-0000-000000000001','94000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000004','email','assignee_notice','sent', now() - interval '5 hours', now() - interval '5 hours');

-- ---------- 11. Corridas de agentes (observabilidad) ----------
insert into agent_runs (id, agent, entity_type, entity_id, model, latency_ms, tokens_in, tokens_out, ok, created_at)
values
  ('9a000000-0000-0000-0000-000000000001','transcribe','meeting',    '90000000-0000-0000-0000-000000000001','scribe_v1',  3210, null, null, true, now() - interval '6 hours'),
  ('9a000000-0000-0000-0000-000000000002','meeting',   'requirement','92000000-0000-0000-0000-000000000001','gpt-4o-mini',2140, 1850, 640,  true, now() - interval '6 hours'),
  ('9a000000-0000-0000-0000-000000000003','assignment','requirement','92000000-0000-0000-0000-000000000001','gpt-4o-mini',1380, 1120, 410,  true, now() - interval '6 hours');

-- ---------- 12. Ejemplos de error_logs (backend + frontend) ----------
insert into error_logs (id, source, severity, request_id, http_status, http_method, path, error_type, message, stack, context, user_agent, created_at)
values
  ('9b000000-0000-0000-0000-000000000001','backend','error','demo-req-500-0001',500,'POST','/api/agents/meeting','RuntimeError','Falta OPENAI_API_KEY para ejecutar el Meeting Agent','Traceback (most recent call last):\n  File "services.py", line 42, in get_openai\n    raise RuntimeError(...)', '{"requirement_id":"92000000-0000-0000-0000-000000000001"}'::jsonb, 'python-httpx/0.27', now() - interval '4 hours'),
  ('9b000000-0000-0000-0000-000000000002','frontend','warning','demo-req-net-0002',null,'POST','/api/agents/assignment','TypeError','Failed to fetch (network) al llamar al backend', null, '{"screen":"/reuniones/nueva"}'::jsonb, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', now() - interval '2 hours');
