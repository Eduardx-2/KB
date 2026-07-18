-- 012 — Member knowledge profiles (developer MD → RAG for assignment)
-- Run after 009_knowledge_ops.sql and 011_empresa_equipo_real.sql

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists member_knowledge_sources (
  id             uuid primary key default gen_random_uuid(),
  team_id        uuid not null references teams(id) on delete cascade,
  member_id      uuid not null references members(id) on delete cascade,
  title          text not null,
  source_type    text not null default 'developer_profile'
                   check (source_type in ('developer_profile', 'runbook', 'manual_note')),
  raw_content    text,
  content_hash   text,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now(),
  unique (member_id, source_type)
);

create index if not exists idx_member_knowledge_sources_team on member_knowledge_sources (team_id);
create index if not exists idx_member_knowledge_sources_member on member_knowledge_sources (member_id);

create table if not exists member_knowledge_chunks (
  id           uuid primary key default gen_random_uuid(),
  source_id    uuid not null references member_knowledge_sources(id) on delete cascade,
  member_id    uuid not null references members(id) on delete cascade,
  chunk_index  int not null default 0,
  content      text not null,
  embedding    vector(1536),
  metadata     jsonb,
  created_at   timestamptz default now(),
  unique (source_id, chunk_index)
);

create index if not exists idx_member_knowledge_chunks_member on member_knowledge_chunks (member_id);

create trigger trg_member_knowledge_sources_updated_at
  before update on member_knowledge_sources
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS (demo / auth)
-- ---------------------------------------------------------------------------

alter table member_knowledge_sources enable row level security;
alter table member_knowledge_chunks enable row level security;

do $$ begin
  create policy "anon_select_member_knowledge_sources_demo"
    on member_knowledge_sources for select using (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "anon_select_member_knowledge_chunks_demo"
    on member_knowledge_chunks for select using (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "auth_select_member_knowledge_sources"
    on member_knowledge_sources for select
    using (team_id in (select current_user_team_ids()));
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "auth_select_member_knowledge_chunks"
    on member_knowledge_chunks for select
    using (member_id in (
      select id from members where team_id in (select current_user_team_ids())
    ));
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- RPC: semantic search on member knowledge chunks
-- ---------------------------------------------------------------------------

create or replace function match_member_knowledge_chunks(
  query_embedding vector(1536),
  p_member_id uuid,
  match_count int default 6
)
returns table (
  id uuid,
  source_id uuid,
  member_id uuid,
  chunk_index int,
  content text,
  similarity float
)
language sql stable
as $$
  select
    mkc.id,
    mkc.source_id,
    mkc.member_id,
    mkc.chunk_index,
    mkc.content,
    1 - (mkc.embedding <=> query_embedding) as similarity
  from member_knowledge_chunks mkc
  where mkc.member_id = p_member_id
    and mkc.embedding is not null
  order by mkc.embedding <=> query_embedding
  limit match_count;
$$;

-- ---------------------------------------------------------------------------
-- Seed: perfiles Maxxi (canonical developer_profile per member)
-- ---------------------------------------------------------------------------

insert into member_knowledge_sources (team_id, member_id, title, source_type, raw_content, content_hash)
values
  (
    '00000000-0000-0000-0000-000000000001',
    '60000000-0000-0000-0000-000000000001',
    'Perfil — Juan',
    'developer_profile',
    E'# Juan Meléndez — Jefe IT / DevOps\n\n## Proyectos\n- Exactus ↔ Apps: arquitectura, priorización, aprobaciones\n- Maxxi Web: priorización (no implementación)\n- Infra Docker y Metabase para todo el grupo\n\n## Stack\n- DevOps, Docker, Filament admin, Metabase, SQL Server\n- Cursor / Claude Code para revisiones\n\n## Runbooks\n- Despliegues Exactus: ventana 02:00–05:00\n- Metabase: dashboards ejecutivos\n\n## Restricciones\n- NO ejecutar tickets de desarrollo ERP/web salvo último recurso\n- Solo asignar y aprobar planes; escalar a vendors externos',
    md5(E'# Juan Meléndez — Jefe IT / DevOps\n\n## Proyectos\n- Exactus ↔ Apps: arquitectura, priorización, aprobaciones\n- Maxxi Web: priorización (no implementación)\n- Infra Docker y Metabase para todo el grupo\n\n## Stack\n- DevOps, Docker, Filament admin, Metabase, SQL Server\n- Cursor / Claude Code para revisiones\n\n## Runbooks\n- Despliegues Exactus: ventana 02:00–05:00\n- Metabase: dashboards ejecutivos\n\n## Restricciones\n- NO ejecutar tickets de desarrollo ERP/web salvo último recurso\n- Solo asignar y aprobar planes; escalar a vendors externos')
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    '60000000-0000-0000-0000-000000000002',
    'Perfil — Iván',
    'developer_profile',
    E'# Iván Ramírez — ERP Exactus\n\n## Proyectos\n- Integración Exactus ↔ Apps (referente Exactus)\n- ERP Migration Exactus/Softland: reglas C# de transformación\n- Cayena: módulos contables Exactus\n\n## Stack\n- C#, SQL Server, Exactus, Softland, apps corporativas\n\n## Runbooks\n- Validar asientos en `exactus_gl_asientos` antes de cerrar sprint\n- Jobs nocturnos coordinados con Erick\n\n## Restricciones\n- No frontend Filament ni redes\n- SAP fuera de alcance',
    md5(E'# Iván Ramírez — ERP Exactus\n\n## Proyectos\n- Integración Exactus ↔ Apps (referente Exactus)\n- ERP Migration Exactus/Softland: reglas C# de transformación\n- Cayena: módulos contables Exactus\n\n## Stack\n- C#, SQL Server, Exactus, Softland, apps corporativas\n\n## Runbooks\n- Validar asientos en `exactus_gl_asientos` antes de cerrar sprint\n- Jobs nocturnos coordinados con Erick\n\n## Restricciones\n- No frontend Filament ni redes\n- SAP fuera de alcance')
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    '60000000-0000-0000-0000-000000000003',
    'Perfil — Erick',
    'developer_profile',
    E'# Erick Flores — ERP Exactus / Softland\n\n## Proyectos\n- ERP Migration: jobs SQL de conciliación Softland\n- Integración Exactus ↔ Apps: ETL y cuadraturas\n- Cayena: conciliaciones y reportes\n\n## Stack\n- C#, SQL Server, Exactus, Softland\n\n## Runbooks\n- Cuadraturas diarias vs Softland\n- Coordinar ventana batch con Iván\n\n## Restricciones\n- No DevOps ni Filament\n- No redes (Jaime)',
    md5(E'# Erick Flores — ERP Exactus / Softland\n\n## Proyectos\n- ERP Migration: jobs SQL de conciliación Softland\n- Integración Exactus ↔ Apps: ETL y cuadraturas\n- Cayena: conciliaciones y reportes\n\n## Stack\n- C#, SQL Server, Exactus, Softland\n\n## Runbooks\n- Cuadraturas diarias vs Softland\n- Coordinar ventana batch con Iván\n\n## Restricciones\n- No DevOps ni Filament\n- No redes (Jaime)')
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    '60000000-0000-0000-0000-000000000004',
    'Perfil — Jaime',
    'developer_profile',
    E'# Jaime — Redes e Infraestructura\n\n## Proyectos\n- Maxxi Web: DNS, LAN, enlaces\n- Sucursales: cableado, WiFi, cámaras IP NVR\n\n## Stack\n- Redes, firewalls, WiFi empresarial, cotizaciones hardware\n\n## Runbooks\n- Cambios DNS coordinados con Christopher\n- Backup 4G en sitio principal\n\n## Restricciones\n- No desarrollo ERP ni Filament\n- No Exactus/Cayena contable',
    md5(E'# Jaime — Redes e Infraestructura\n\n## Proyectos\n- Maxxi Web: DNS, LAN, enlaces\n- Sucursales: cableado, WiFi, cámaras IP NVR\n\n## Stack\n- Redes, firewalls, WiFi empresarial, cotizaciones hardware\n\n## Runbooks\n- Cambios DNS coordinados con Christopher\n- Backup 4G en sitio principal\n\n## Restricciones\n- No desarrollo ERP ni Filament\n- No Exactus/Cayena contable')
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    '60000000-0000-0000-0000-000000000005',
    'Perfil — Christopher',
    'developer_profile',
    E'# Christopher Alvarenga — Web / BI\n\n## Proyectos\n- Maxxi Web: owner frontend y Filament CMS\n- Dashboards Metabase + Power BI embebidos\n- Displays en sucursales\n\n## Stack\n- Filament, PHP/Laravel, frontend, SQL, Metabase, Power BI\n\n## Runbooks\n- Contenido displays sincronizado desde Maxxi Web\n- BI embebido vía Metabase\n\n## Restricciones\n- NO Exactus ni Cayena ERP contable\n- NO C# ni jobs Softland (Iván/Erick)',
    md5(E'# Christopher Alvarenga — Web / BI\n\n## Proyectos\n- Maxxi Web: owner frontend y Filament CMS\n- Dashboards Metabase + Power BI embebidos\n- Displays en sucursales\n\n## Stack\n- Filament, PHP/Laravel, frontend, SQL, Metabase, Power BI\n\n## Runbooks\n- Contenido displays sincronizado desde Maxxi Web\n- BI embebido vía Metabase\n\n## Restricciones\n- NO Exactus ni Cayena ERP contable\n- NO C# ni jobs Softland (Iván/Erick)')
  )
on conflict (member_id, source_type) do update set
  title = excluded.title,
  raw_content = excluded.raw_content,
  content_hash = excluded.content_hash,
  updated_at = now();
