-- =============================================================================
-- 010 — Knowledge Ops demo seed
-- Run AFTER 002_seed_demo.sql and 009_knowledge_ops.sql
-- =============================================================================

-- Member duties (recurring load)
insert into member_duties (id, member_id, team_id, title, description, duty_type, load_pct, is_active) values
  ('50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
   'Code review semanal', 'Revisión PRs del squad frontend', 'recurring', 10, true),
  ('50000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
   'Monitoreo APIs producción', 'Alertas y dashboards de salud backend', 'monitoring', 20, true),
  ('50000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
   'Validación datos ERP', 'Cuadratura semanal de cargas Excel', 'recurring', 15, true)
on conflict (id) do nothing;

insert into member_capacity (member_id, team_id, weekly_hours) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 40),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 40),
  ('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 40),
  ('20000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 40)
on conflict (member_id) do nothing;

-- Example absence for Beto (sick Mon-Wed next week)
insert into member_absences (id, member_id, team_id, start_date, end_date, reason, status) values
  ('50000000-0000-0000-0000-000000000010', '20000000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000001',
   current_date + 1, current_date + 3, 'Incapacidad médica', 'approved')
on conflict (id) do nothing;

-- Project modules with MD
insert into project_modules (id, project_id, team_id, code, name, summary, md_body, expected_outcomes, status, owner_member_id) values
(
  '51000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'MOD-COSTOS',
  'Módulo de costos',
  'Cálculo de rentabilidad por producto y centro de costo',
  E'## Objetivo\nCalcular costos reales por producto usando datos de inventario y producción.\n\n## Tablas DB\n- `cost_centers`\n- `product_costs`\n- `cost_allocations`\n\n## Flujo\n1. Carga de costos indirectos\n2. Asignación por reglas\n3. Reporte de rentabilidad\n\n## Involucrados\n- Carla (data): validación de reglas\n- Beto (backend): API de cálculo',
  'Reporte de rentabilidad por SKU con trazabilidad de asignaciones',
  'active',
  '20000000-0000-0000-0000-000000000003'
),
(
  '51000000-0000-0000-0000-000000000002',
  '30000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'MOD-LANDING',
  'Landing ERP interna',
  'Página de presentación del ERP para usuarios de finanzas',
  E'## Objetivo\nLanding interna con branding corporativo.\n\n## Diseño\n- Colores: azul #003366, acento #FF6600\n- Orden: hero → beneficios → módulos → CTA demo\n\n## Contenido\n- Headline: "Finanzas unificadas"\n- 3 bullets de valor\n\n## Entregables\n- Wireframe Figma\n- Componentes React\n- Copy validado con Finanzas',
  'Landing publicada en /erp con métricas de conversión a demo',
  'planned',
  '20000000-0000-0000-0000-000000000001'
)
on conflict (id) do nothing;

insert into project_stakeholders (id, project_id, member_id, role_in_project, importance_pct, md_notes) values
  ('52000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000006', 'Sponsor / IT Manager', 100,
   'Aprueba planes y prioriza entregables de finanzas'),
  ('52000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000003', 'Data lead', 85,
   'Valida esquemas y migración Excel; conoce tablas cost_centers')
on conflict (id) do nothing;

-- Knowledge graph nodes + edges
insert into knowledge_nodes (id, team_id, project_id, node_type, label, canonical_key, source_ref_type, source_ref_id) values
  ('53000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
   '30000000-0000-0000-0000-000000000001', 'module', 'Módulo de costos', 'mod-costos', 'project_module', '51000000-0000-0000-0000-000000000001'),
  ('53000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
   '30000000-0000-0000-0000-000000000001', 'table', 'cost_centers', 'table-cost_centers', null, null),
  ('53000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
   '30000000-0000-0000-0000-000000000001', 'person', 'Carla', 'person-carla', 'member', '20000000-0000-0000-0000-000000000003')
on conflict (id) do nothing;

insert into knowledge_edges (id, team_id, from_node_id, to_node_id, relation, evidence_text, confidence_pct, created_by) values
  ('54000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
   '53000000-0000-0000-0000-000000000001', '53000000-0000-0000-0000-000000000002', 'impacts_table',
   'Módulo costos usa tabla cost_centers', 90, 'human'),
  ('54000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
   '53000000-0000-0000-0000-000000000003', '53000000-0000-0000-0000-000000000001', 'owns',
   'Carla es owner del módulo de costos', 95, 'human'),
  ('54000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
   '53000000-0000-0000-0000-000000000001', '53000000-0000-0000-0000-000000000003', 'related_to',
   'Carla valida reglas de asignación', 80, 'human')
on conflict (id) do nothing;
