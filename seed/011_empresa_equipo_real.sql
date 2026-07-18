-- =============================================================================
-- 011 — Seed equipo real (Maxxi Group)
-- Run AFTER: 001_schema, 004_error_logs, 006_saas_multitenant, 008_audit_events,
--            009_knowledge_ops
-- NO requiere 002_seed_demo.sql ni 010_knowledge_ops_demo.sql
--
-- Team ID fijo (coincide con DEFAULT_TEAM_ID en backend/.env):
--   00000000-0000-0000-0000-000000000001
--
-- Miembros: Juan (jefe IT + único DevOps), Iván, Erick, Jaime, Christopher
-- ERP actual: Exactus (sin SAP por ahora). Carga inicial: 0, sin tickets.
-- =============================================================================

-- ─── Team ───────────────────────────────────────────────────────────────────

insert into teams (id, name, slug, plan_tier, status, max_members, max_meetings_per_month, max_tokens_per_month)
values (
  '00000000-0000-0000-0000-000000000001',
  'IT Maxxi Group',
  'maxxi-it',
  'pro',
  'active',
  10,
  50,
  500000
)
on conflict (id) do update set
  name = excluded.name,
  slug = excluded.slug,
  plan_tier = excluded.plan_tier,
  status = excluded.status;

-- ─── Skills: catálogo base (tickets / agentes) + stack extendido ─────────────

insert into skills (id, code, label) values
  ('10000000-0000-0000-0000-000000000001', 'frontend',      'Frontend'),
  ('10000000-0000-0000-0000-000000000002', 'backend',       'Backend / C#'),
  ('10000000-0000-0000-0000-000000000003', 'data',          'Data / BI / Analytics'),
  ('10000000-0000-0000-0000-000000000004', 'qa',            'Quality Assurance'),
  ('10000000-0000-0000-0000-000000000005', 'devops',        'DevOps / Infra'),
  ('11000000-0000-0000-0000-000000000001', 'csharp',        'C# / .NET'),
  ('11000000-0000-0000-0000-000000000002', 'sql',           'SQL Server / T-SQL'),
  ('11000000-0000-0000-0000-000000000003', 'sap',           'SAP'),
  ('11000000-0000-0000-0000-000000000004', 'apps',          'Apps internas'),
  ('11000000-0000-0000-0000-000000000005', 'erp_exactus',   'ERP Exactus'),
  ('11000000-0000-0000-0000-000000000006', 'erp_softland',  'ERP Softland'),
  ('11000000-0000-0000-0000-000000000007', 'docker',        'Docker / contenedores'),
  ('11000000-0000-0000-0000-000000000008', 'filament',      'Filament (PHP admin)'),
  ('11000000-0000-0000-0000-000000000009', 'metabase',      'Metabase / BI'),
  ('11000000-0000-0000-0000-000000000010', 'cursor_ai',     'Cursor IDE'),
  ('11000000-0000-0000-0000-000000000011', 'claude_code',   'Claude Code / IA dev'),
  ('11000000-0000-0000-0000-000000000012', 'networking',    'Redes / LAN'),
  ('11000000-0000-0000-0000-000000000013', 'dns',           'DNS / dominios'),
  ('11000000-0000-0000-0000-000000000014', 'cameras',       'CCTV / cámaras IP'),
  ('11000000-0000-0000-0000-000000000015', 'cabling',       'Cableado estructurado'),
  ('11000000-0000-0000-0000-000000000016', 'routing_maxxi', 'Routing Maxxi / enlaces'),
  ('11000000-0000-0000-0000-000000000017', 'power_bi',      'Power BI'),
  ('11000000-0000-0000-0000-000000000018', 'web_design',    'Web design / UI'),
  ('11000000-0000-0000-0000-000000000019', 'maxxi_web',     'Maxxi Web (sitio corporativo)'),
  ('11000000-0000-0000-0000-000000000020', 'display',       'Display / señalización digital')
on conflict (code) do nothing;

-- ─── Members (carga inicial 0) ──────────────────────────────────────────────

insert into members (id, team_id, name, email, role, current_load, is_manager) values
  ('60000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
   'Juan',        'juan.melendez@maxxigroup.com',         'Jefe de IT / DevOps',                  0, true),
  ('60000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
   'Iván',        'ivan.ramirez@maxxigroup.com',          'Desarrollador ERP (C# / Exactus)',     0, false),
  ('60000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
   'Erick',       'erick.flores@maxxigroup.com',          'Desarrollador ERP (Exactus / Softland)', 0, false),
  ('60000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001',
   'Jaime',       'jaime@maxxigroup.com',                 'Especialista Redes e Infraestructura', 0, false),
  ('60000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001',
   'Christopher', 'christopher.alvarenga@maxxigroup.com', 'Desarrollador Web / BI / Filament',    0, false)
on conflict (id) do update set
  name = excluded.name,
  email = excluded.email,
  role = excluded.role,
  current_load = 0,
  is_manager = excluded.is_manager;

-- Limpiar skills previas al re-aplicar seed
delete from member_skills
where member_id in (
  '60000000-0000-0000-0000-000000000001',
  '60000000-0000-0000-0000-000000000002',
  '60000000-0000-0000-0000-000000000003',
  '60000000-0000-0000-0000-000000000004',
  '60000000-0000-0000-0000-000000000005'
);

-- Juan — único DevOps: Docker, Filament, Cursor, Claude Code, SQL, Metabase, Apps, Exactus
insert into member_skills (member_id, skill_id, proficiency) values
  ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 4),
  ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 5),
  ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000005', 5),
  ('60000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000002', 5),
  ('60000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000004', 4),
  ('60000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000005', 4),
  ('60000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000007', 5),
  ('60000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000008', 4),
  ('60000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000009', 5),
  ('60000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000010', 4),
  ('60000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000011', 4);

-- Iván — C#, SQL, Apps, Exactus, Softland
insert into member_skills (member_id, skill_id, proficiency) values
  ('60000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 5),
  ('60000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000001', 5),
  ('60000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000002', 5),
  ('60000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000004', 4),
  ('60000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000005', 5),
  ('60000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000006', 4);

-- Erick — C#, SQL, Apps, Exactus, Softland
insert into member_skills (member_id, skill_id, proficiency) values
  ('60000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', 5),
  ('60000000-0000-0000-0000-000000000003', '11000000-0000-0000-0000-000000000001', 5),
  ('60000000-0000-0000-0000-000000000003', '11000000-0000-0000-0000-000000000002', 5),
  ('60000000-0000-0000-0000-000000000003', '11000000-0000-0000-0000-000000000004', 4),
  ('60000000-0000-0000-0000-000000000003', '11000000-0000-0000-0000-000000000005', 5),
  ('60000000-0000-0000-0000-000000000003', '11000000-0000-0000-0000-000000000006', 5);

-- Jaime — Redes (sin DevOps)
insert into member_skills (member_id, skill_id, proficiency) values
  ('60000000-0000-0000-0000-000000000004', '11000000-0000-0000-0000-000000000012', 5),
  ('60000000-0000-0000-0000-000000000004', '11000000-0000-0000-0000-000000000013', 5),
  ('60000000-0000-0000-0000-000000000004', '11000000-0000-0000-0000-000000000014', 5),
  ('60000000-0000-0000-0000-000000000004', '11000000-0000-0000-0000-000000000015', 4),
  ('60000000-0000-0000-0000-000000000004', '11000000-0000-0000-0000-000000000016', 5);

-- Christopher — Filament, SQL, Metabase, Power BI, Web, Maxxi Web, display
insert into member_skills (member_id, skill_id, proficiency) values
  ('60000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', 5),
  ('60000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000002', 4),
  ('60000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000003', 5),
  ('60000000-0000-0000-0000-000000000005', '11000000-0000-0000-0000-000000000002', 5),
  ('60000000-0000-0000-0000-000000000005', '11000000-0000-0000-0000-000000000008', 5),
  ('60000000-0000-0000-0000-000000000005', '11000000-0000-0000-0000-000000000009', 5),
  ('60000000-0000-0000-0000-000000000005', '11000000-0000-0000-0000-000000000017', 5),
  ('60000000-0000-0000-0000-000000000005', '11000000-0000-0000-0000-000000000018', 5),
  ('60000000-0000-0000-0000-000000000005', '11000000-0000-0000-0000-000000000019', 5),
  ('60000000-0000-0000-0000-000000000005', '11000000-0000-0000-0000-000000000020', 4);

-- ─── Knowledge Ops: capacidad y labores (load_pct 0 = sin carga fija en UI) ─

insert into member_capacity (member_id, team_id, weekly_hours) values
  ('60000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 40),
  ('60000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 40),
  ('60000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 40),
  ('60000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 40),
  ('60000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 40)
on conflict (member_id) do update set weekly_hours = excluded.weekly_hours;

insert into member_duties (id, member_id, team_id, title, description, duty_type, load_pct, is_active) values
  ('62000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000001',
   'Aprobación planes y prioridades', 'Revisión semanal backlog + aprobación reorg', 'admin', 0, true),
  ('62000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000001',
   'DevOps / Docker / infra', 'Único responsable DevOps del equipo', 'recurring', 0, true),
  ('62000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000001',
   'Soporte Exactus producción', 'Incidencias L2 en módulos contables Exactus', 'oncall', 0, true),
  ('62000000-0000-0000-0000-000000000004', '60000000-0000-0000-0000-000000000003',
   '00000000-0000-0000-0000-000000000001',
   'Conciliación Softland', 'Jobs SQL y validaciones entre Exactus y Softland', 'recurring', 0, true),
  ('62000000-0000-0000-0000-000000000005', '60000000-0000-0000-0000-000000000004',
   '00000000-0000-0000-0000-000000000001',
   'Monitoreo DNS y enlaces', 'Revisión DNS público + rutas Maxxi sucursales', 'monitoring', 0, true),
  ('62000000-0000-0000-0000-000000000006', '60000000-0000-0000-0000-000000000005',
   '00000000-0000-0000-0000-000000000001',
   'Maxxi Web + displays', 'Actualización contenido web y pantallas sucursales', 'recurring', 0, true),
  ('62000000-0000-0000-0000-000000000007', '60000000-0000-0000-0000-000000000005',
   '00000000-0000-0000-0000-000000000001',
   'Reportes Power BI / Metabase', 'Mantenimiento dashboards comerciales', 'recurring', 0, true)
on conflict (id) do update set
  title = excluded.title,
  description = excluded.description,
  load_pct = 0,
  is_active = excluded.is_active;

-- ─── Proyectos activos (Exactus, sin SAP) ───────────────────────────────────

insert into projects (id, team_id, code, name, description, business_area, status, owner_id, started_at, target_date)
values
(
  '61000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'EXACTUS-INT',
  'Integración Exactus ↔ Apps internas',
  'APIs y jobs entre Exactus, apps corporativas y tableros Metabase. Infra Docker a cargo de Juan (DevOps).',
  'tecnologia',
  'active',
  '60000000-0000-0000-0000-000000000001',
  current_date - interval '2 months',
  current_date + interval '4 months'
),
(
  '61000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'ERP-MIG',
  'Exactus / Softland — conciliación y migración',
  'Homologación de datos entre Exactus y Softland. Scripts C# + validaciones SQL.',
  'finanzas',
  'active',
  '60000000-0000-0000-0000-000000000001',
  current_date - interval '1 month',
  current_date + interval '6 months'
),
(
  '61000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000001',
  'NET-INFRA',
  'Redes sucursales — Maxxi, LAN y CCTV',
  'Ampliación LAN, cotización de switches/AP, DNS, cámaras IP y routing Maxxi en sucursales.',
  'operaciones',
  'active',
  '60000000-0000-0000-0000-000000000001',
  current_date,
  current_date + interval '3 months'
),
(
  '61000000-0000-0000-0000-000000000004',
  '00000000-0000-0000-0000-000000000001',
  'MAXXI-WEB',
  'Maxxi Web — sitio, Filament y displays',
  'Sitio corporativo Maxxi Web, paneles Filament, integración Metabase/Power BI y contenido en displays de sucursal.',
  'marketing',
  'active',
  '60000000-0000-0000-0000-000000000001',
  current_date - interval '3 weeks',
  current_date + interval '5 months'
)
on conflict (id) do update set
  code = excluded.code,
  name = excluded.name,
  description = excluded.description,
  status = excluded.status;

insert into project_members (project_id, member_id, role) values
  ('61000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 'owner'),
  ('61000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002', 'contributor'),
  ('61000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000003', 'contributor'),
  ('61000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000001', 'owner'),
  ('61000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000002', 'contributor'),
  ('61000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000003', 'contributor'),
  ('61000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-000000000001', 'owner'),
  ('61000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-000000000004', 'contributor'),
  ('61000000-0000-0000-0000-000000000004', '60000000-0000-0000-0000-000000000001', 'owner'),
  ('61000000-0000-0000-0000-000000000004', '60000000-0000-0000-0000-000000000005', 'owner')
on conflict do nothing;

-- Christopher NO está en Exactus/Cayena (solo Maxxi Web). Limpiar si un seed viejo lo metió.
delete from project_members
where member_id = '60000000-0000-0000-0000-000000000005'
  and project_id = '61000000-0000-0000-0000-000000000001';

insert into project_stakeholders (id, project_id, member_id, role_in_project, importance_pct, md_notes) values
  ('63000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000001',
   '60000000-0000-0000-0000-000000000001', 'Sponsor técnico / DevOps', 100,
   'Único DevOps; define prioridades Exactus y valida integraciones con Metabase.'),
  ('63000000-0000-0000-0000-000000000002', '61000000-0000-0000-0000-000000000002',
   '60000000-0000-0000-0000-000000000002', 'Referente Exactus', 90,
   'Conoce reglas contables y mapeos en Exactus.'),
  ('63000000-0000-0000-0000-000000000003', '61000000-0000-0000-0000-000000000002',
   '60000000-0000-0000-0000-000000000003', 'Referente Softland', 85,
   'Mantiene jobs de conciliación Exactus↔Softland.'),
  ('63000000-0000-0000-0000-000000000004', '61000000-0000-0000-0000-000000000003',
   '60000000-0000-0000-0000-000000000004', 'Owner infra sucursales', 95,
   'Cotiza equipos, define IPs/DNS y topología Maxxi.'),
  ('63000000-0000-0000-0000-000000000005', '61000000-0000-0000-0000-000000000004',
   '60000000-0000-0000-0000-000000000005', 'Owner Maxxi Web / BI', 100,
   'Filament, frontend, Power BI, Metabase y displays de sucursal.')
on conflict (id) do update set
  role_in_project = excluded.role_in_project,
  md_notes = excluded.md_notes;

-- ─── Módulos + knowledge base ───────────────────────────────────────────────

insert into project_modules (id, project_id, team_id, code, name, summary, md_body, expected_outcomes, status, owner_member_id) values
(
  '64000000-0000-0000-0000-000000000001',
  '61000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'EXACTUS-GL',
  'Exactus — Libro mayor y conciliación',
  'Módulo contable Exactus: asientos, conciliación bancaria, export a apps internas.',
  E'## Alcance\nHomologar cuentas contables Exactus con reportes consolidados.\n\n## Tablas clave\n- `exactus_gl_asientos`\n- `exactus_conciliacion`\n- `softland_movimientos`\n\n## Responsables\n- Iván: reglas C# de transformación\n- Erick: jobs SQL de conciliación\n- Juan: DevOps / despliegues\n\n## Criterios\n- 100% trazabilidad asiento origen\n- Cero diferencias > $0.01 en conciliación piloto',
  'Conciliación piloto sin diferencias; documentación de mapeo de cuentas.',
  'active',
  '60000000-0000-0000-0000-000000000002'
),
(
  '64000000-0000-0000-0000-000000000002',
  '61000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000001',
  'NET-SUC-01',
  'Sucursal piloto — LAN + Maxxi + CCTV',
  'Diseño de red para sucursal piloto: VLANs, DNS, routing Maxxi, 8 cámaras IP.',
  E'## Alcance\n- LAN cableada + WiFi administrativo\n- Enlace Maxxi principal + backup 4G\n- 8 cámaras IP NVR local\n\n## Owner\nJaime — redes, cableado, cotizaciones',
  'Sucursal piloto operativa con monitoreo DNS y CCTV accesible por VPN.',
  'active',
  '60000000-0000-0000-0000-000000000004'
),
(
  '64000000-0000-0000-0000-000000000003',
  '61000000-0000-0000-0000-000000000004',
  '00000000-0000-0000-0000-000000000001',
  'WEB-HOME',
  'Maxxi Web — landing y contenido',
  'Rediseño home, banners promocionales, SEO básico, embed dashboards.',
  E'## Stack\n- Frontend + Web design (Christopher)\n- Filament para CMS interno\n- SQL + Metabase/Power BI embebidos\n\n## Displays\n- Contenido sincronizado a pantallas sucursales',
  'Home publicada; 3 playlists display activas en sucursal piloto.',
  'active',
  '60000000-0000-0000-0000-000000000005'
)
on conflict (id) do update set
  md_body = excluded.md_body,
  summary = excluded.summary;

insert into project_knowledge_sources (
  id, project_id, title, source_type, raw_content, summary, trust_level, created_by_id
) values
(
  '65000000-0000-0000-0000-000000000001',
  '61000000-0000-0000-0000-000000000001',
  'Overview integración Exactus',
  'project_overview',
  E'# Integración Exactus ↔ Apps\n\n## Stack\n- Exactus como ERP contable principal\n- Apps internas vía APIs C#\n- Metabase para BI ejecutivo\n- Docker / DevOps: solo Juan\n\n## Equipo\n- Juan: DevOps, arquitectura, Metabase, aprobaciones\n- Iván/Erick: desarrollo C#, SQL, Exactus/Softland\n\n## Restricciones\n- No duplicar lógica contable fuera de Exactus\n- Jobs nocturnos máx. 02:00–05:00',
  'Contexto validado del proyecto EXACTUS-INT para reuniones y RAG.',
  'verified',
  '60000000-0000-0000-0000-000000000001'
),
(
  '65000000-0000-0000-0000-000000000002',
  '61000000-0000-0000-0000-000000000002',
  'Overview migración ERP',
  'project_overview',
  E'# Exactus / Softland\n\n## Objetivo\nUnificar reporting financiero entre Exactus y Softland.\n\n## Skills requeridos\n- C# para ETL y validadores\n- SQL Server para cuadraturas\n- Exactus (Iván) y Softland (Erick)\n\n## Nota\nSAP fuera de alcance por ahora.',
  'Base de conocimiento ERP-MIG para tickets granulares.',
  'verified',
  '60000000-0000-0000-0000-000000000001'
),
(
  '65000000-0000-0000-0000-000000000003',
  '61000000-0000-0000-0000-000000000004',
  'Overview Maxxi Web',
  'project_overview',
  E'# Maxxi Web\n\n## Owner\nChristopher Alvarenga\n\n## Alcance\n- Sitio corporativo Maxxi Web\n- Admin Filament\n- Dashboards Metabase + Power BI\n- Displays en sucursales\n\n## Equipo\n- Juan: priorización\n- Christopher: frontend, Filament, BI\n- Jaime: red/DNS',
  'Contexto Maxxi Web para reuniones de marketing y digital.',
  'verified',
  '60000000-0000-0000-0000-000000000005'
)
on conflict (id) do update set
  title = excluded.title,
  raw_content = excluded.raw_content,
  summary = excluded.summary;

delete from project_knowledge_chunks
where project_id in (
  '61000000-0000-0000-0000-000000000001',
  '61000000-0000-0000-0000-000000000002',
  '61000000-0000-0000-0000-000000000004'
);

insert into project_knowledge_chunks (source_id, project_id, chunk_index, content) values
(
  '65000000-0000-0000-0000-000000000001',
  '61000000-0000-0000-0000-000000000001',
  0,
  'EXACTUS-INT: integración Exactus con apps C#. Metabase para BI. DevOps solo Juan (Docker). Iván/Erick en Exactus/Softland. Sin SAP por ahora.'
),
(
  '65000000-0000-0000-0000-000000000002',
  '61000000-0000-0000-0000-000000000002',
  0,
  'ERP-MIG: homologar Exactus y Softland. Iván referente Exactus; Erick Softland. Validar cuadraturas SQL.'
),
(
  '65000000-0000-0000-0000-000000000003',
  '61000000-0000-0000-0000-000000000004',
  0,
  'MAXXI-WEB: Christopher owner. Filament + frontend + Power BI + Metabase. Jaime apoya DNS/LAN.'
);

insert into knowledge_nodes (id, team_id, project_id, node_type, label, canonical_key, source_ref_type, source_ref_id) values
  ('66000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
   '61000000-0000-0000-0000-000000000002', 'table', 'exactus_gl_asientos', 'table-exactus-gl-asientos', 'knowledge_source', '65000000-0000-0000-0000-000000000002'),
  ('66000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
   '61000000-0000-0000-0000-000000000002', 'table', 'softland_movimientos', 'table-softland-movimientos', 'knowledge_source', '65000000-0000-0000-0000-000000000002'),
  ('66000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
   '61000000-0000-0000-0000-000000000001', 'concept', 'Metabase BI', 'concept-metabase-bi', 'knowledge_source', '65000000-0000-0000-0000-000000000001'),
  ('66000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001',
   '61000000-0000-0000-0000-000000000003', 'concept', 'Routing Maxxi', 'concept-routing-maxxi', 'module', '64000000-0000-0000-0000-000000000002')
on conflict (id) do update set label = excluded.label;

insert into knowledge_edges (id, team_id, from_node_id, to_node_id, relation, evidence_text, confidence_pct, created_by) values
  ('67000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
   '66000000-0000-0000-0000-000000000001', '66000000-0000-0000-0000-000000000002',
   'depends_on', 'Asientos Exactus se concilian con movimientos Softland', 90, 'human'),
  ('67000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
   '66000000-0000-0000-0000-000000000003', '66000000-0000-0000-0000-000000000001',
   'related_to', 'Metabase consume vistas Exactus post-integración', 85, 'human')
on conflict (id) do update set evidence_text = excluded.evidence_text;

delete from project_aliases
where project_id in (
  '61000000-0000-0000-0000-000000000001',
  '61000000-0000-0000-0000-000000000002',
  '61000000-0000-0000-0000-000000000003',
  '61000000-0000-0000-0000-000000000004'
);

insert into project_aliases (project_id, alias, normalized_alias) values
  ('61000000-0000-0000-0000-000000000001', 'integración Exactus', 'integracion exactus'),
  ('61000000-0000-0000-0000-000000000001', 'Exactus apps', 'exactus apps'),
  ('61000000-0000-0000-0000-000000000002', 'Exactus', 'exactus'),
  ('61000000-0000-0000-0000-000000000002', 'Softland', 'softland'),
  ('61000000-0000-0000-0000-000000000003', 'Maxxi', 'maxxi'),
  ('61000000-0000-0000-0000-000000000003', 'cámaras sucursal', 'camaras sucursal'),
  ('61000000-0000-0000-0000-000000000004', 'Maxxi Web', 'maxxi web'),
  ('61000000-0000-0000-0000-000000000004', 'displays', 'displays'),
  ('61000000-0000-0000-0000-000000000004', 'Power BI', 'power bi')
on conflict (project_id, normalized_alias) do nothing;

-- ─── Estado limpio: sin tickets ni carga ────────────────────────────────────

update members
set current_load = 0
where team_id = '00000000-0000-0000-0000-000000000001';

update member_duties
set load_pct = 0
where team_id = '00000000-0000-0000-0000-000000000001';

delete from ticket_context_references
where ticket_id in (
  select t.id from tickets t
  join projects p on p.id = t.project_id
  where p.team_id = '00000000-0000-0000-0000-000000000001'
);

delete from ticket_assignments
where ticket_id in (
  select t.id from tickets t
  join projects p on p.id = t.project_id
  where p.team_id = '00000000-0000-0000-0000-000000000001'
);

delete from tickets
where project_id in (
  select id from projects where team_id = '00000000-0000-0000-0000-000000000001'
);

delete from requirements
where project_id in (
  select id from projects where team_id = '00000000-0000-0000-0000-000000000001'
);
