-- =============================================================================
-- Seed: full demo dataset (PROYECTO.md §4.5 + project knowledge base)
-- Run AFTER 001_schema.sql
-- =============================================================================

-- Team
insert into teams (id, name, slug)
values ('00000000-0000-0000-0000-000000000001', 'IT Demo Team', 'demo');

-- Skills catalog
insert into skills (id, code, label) values
  ('10000000-0000-0000-0000-000000000001', 'frontend', 'Frontend'),
  ('10000000-0000-0000-0000-000000000002', 'backend',  'Backend'),
  ('10000000-0000-0000-0000-000000000003', 'data',     'Data / Analytics'),
  ('10000000-0000-0000-0000-000000000004', 'qa',       'Quality Assurance'),
  ('10000000-0000-0000-0000-000000000005', 'devops',   'DevOps / Infra');

-- Members (fixed UUIDs for stable demos)
insert into members (id, team_id, name, email, role, current_load, is_manager) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Ana',   'ana@demo.local',   'Frontend Dev',  40, false),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Beto',  'beto@demo.local',  'Backend Dev',   85, false),
  ('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Carla', 'carla@demo.local', 'Data Analyst',  30, false),
  ('20000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'David', 'david@demo.local', 'QA Engineer',   60, false),
  ('20000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'Elena', 'elena@demo.local', 'Redes',         20, false),
  ('20000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', 'Rosa',  'rosa@demo.local',  'IT Manager',     0, true);

insert into member_skills (member_id, skill_id, proficiency) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 4), -- Ana → frontend
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 4), -- Beto → backend
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003', 5), -- Carla → data
  ('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000004', 4), -- David → qa
  ('20000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000005', 3); -- Elena → devops

-- Default project for golden transcript demo
insert into projects (id, team_id, code, name, description, business_area, status, owner_id, started_at, target_date)
values
(
  '30000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'ERP-FIN',
  'ERP Finanzas — Módulo Costos e Inventario',
  'Migración de Excel históricos, módulo de costos y conciliación de inventario. Plazo 3–6 meses.',
  'finanzas',
  'active',
  '20000000-0000-0000-0000-000000000006',
  current_date,
  current_date + interval '6 months'
),
(
  '30000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'CRM-VENTAS',
  'CRM Ventas — Pipeline Comercial',
  'Gestión de clientes, pipeline comercial y sincronización con facturación.',
  'ventas',
  'active',
  '20000000-0000-0000-0000-000000000006',
  current_date - interval '1 month',
  current_date + interval '4 months'
);

insert into project_members (project_id, member_id, role) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000006', 'owner'),
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'contributor'),
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'contributor'),
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', 'contributor'),
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000004', 'contributor'),
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000005', 'contributor'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000006', 'owner'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'contributor'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'contributor'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000003', 'contributor');

insert into project_aliases (project_id, alias, normalized_alias) values
  ('30000000-0000-0000-0000-000000000001', 'ERP Finanzas', 'erp finanzas'),
  ('30000000-0000-0000-0000-000000000001', 'módulo de costos', 'modulo de costos'),
  ('30000000-0000-0000-0000-000000000001', 'inventario financiero', 'inventario financiero'),
  ('30000000-0000-0000-0000-000000000002', 'CRM Ventas', 'crm ventas'),
  ('30000000-0000-0000-0000-000000000002', 'pipeline comercial', 'pipeline comercial'),
  ('30000000-0000-0000-0000-000000000002', 'clientes y oportunidades', 'clientes y oportunidades');

insert into project_knowledge_sources (
  id,
  project_id,
  title,
  source_type,
  raw_content,
  summary,
  trust_level,
  created_by_id
) values
(
  '40000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  'Contexto validado ERP Finanzas',
  'manual_note',
  'El ERP de Finanzas cubre costos, rentabilidad por producto, conciliación de inventario y migración de históricos de Excel. Los tickets de migración de datos deben priorizar validaciones de calidad y trazabilidad.',
  'Base de conocimiento verificada para crear tickets del proyecto ERP Finanzas.',
  'verified',
  '20000000-0000-0000-0000-000000000006'
),
(
  '40000000-0000-0000-0000-000000000002',
  '30000000-0000-0000-0000-000000000002',
  'Contexto validado CRM Ventas',
  'manual_note',
  'El CRM de Ventas administra clientes, oportunidades y pipeline comercial. La integración con facturación solo debe exponer estados de factura y no debe duplicar la lógica contable del ERP.',
  'Base de conocimiento verificada para desambiguar menciones al CRM y su relación con facturación.',
  'verified',
  '20000000-0000-0000-0000-000000000006'
);

insert into project_knowledge_chunks (source_id, project_id, chunk_index, content) values
  (
    '40000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    0,
    'ERP Finanzas: costos, rentabilidad por producto, conciliación de inventario y migración de históricos de Excel. Priorizar calidad y trazabilidad de datos.'
  ),
  (
    '40000000-0000-0000-0000-000000000002',
    '30000000-0000-0000-0000-000000000002',
    0,
    'CRM Ventas: clientes, oportunidades y pipeline comercial. La integración con facturación expone estados; no duplica lógica contable del ERP.'
  );
