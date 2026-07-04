## Table `teams`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `name` | `text` |  |
| `slug` | `text` |  Unique |
| `created_at` | `timestamptz` |  Nullable |

## Table `skills`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `code` | `text` |  Unique |
| `label` | `text` |  |

## Table `members`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `team_id` | `uuid` |  |
| `name` | `text` |  |
| `email` | `text` |  Nullable |
| `role` | `text` |  Nullable |
| `current_load` | `int4` |  Nullable |
| `is_manager` | `bool` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |

## Table `member_skills`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `member_id` | `uuid` | Primary |
| `skill_id` | `uuid` | Primary |
| `proficiency` | `int2` |  Nullable |

## Table `projects`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `team_id` | `uuid` |  |
| `code` | `text` |  Nullable |
| `name` | `text` |  |
| `description` | `text` |  Nullable |
| `business_area` | `text` |  Nullable |
| `status` | `text` |  Nullable |
| `owner_id` | `uuid` |  Nullable |
| `started_at` | `date` |  Nullable |
| `target_date` | `date` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |

## Table `project_aliases`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `project_id` | `uuid` |  |
| `alias` | `text` |  |
| `normalized_alias` | `text` |  |
| `created_at` | `timestamptz` |  Nullable |

## Table `project_members`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `project_id` | `uuid` | Primary |
| `member_id` | `uuid` | Primary |
| `role` | `text` |  Nullable |
| `joined_at` | `timestamptz` |  Nullable |

## Table `project_knowledge_sources`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `project_id` | `uuid` |  |
| `title` | `text` |  |
| `source_type` | `text` |  |
| `source_uri` | `text` |  Nullable |
| `raw_content` | `text` |  Nullable |
| `summary` | `text` |  Nullable |
| `trust_level` | `text` |  Nullable |
| `metadata` | `jsonb` |  Nullable |
| `created_by_id` | `uuid` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |
| `updated_at` | `timestamptz` |  Nullable |

## Table `project_knowledge_chunks`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `source_id` | `uuid` |  |
| `project_id` | `uuid` |  |
| `chunk_index` | `int4` |  |
| `content` | `text` |  |
| `embedding` | `vector` |  Nullable |
| `metadata` | `jsonb` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |

## Table `meetings`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `primary_project_id` | `uuid` |  |
| `title` | `text` |  Nullable |
| `raw_transcript` | `text` |  Nullable |
| `audio_storage_path` | `text` |  Nullable |
| `audio_duration_sec` | `int4` |  Nullable |
| `source` | `text` |  Nullable |
| `status` | `text` |  Nullable |
| `facilitator_id` | `uuid` |  Nullable |
| `recorded_at` | `timestamptz` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |

## Table `meeting_project_mentions`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `meeting_id` | `uuid` |  |
| `mentioned_project_id` | `uuid` |  Nullable |
| `mentioned_text` | `text` |  |
| `confidence_pct` | `int4` |  Nullable |
| `resolution_status` | `text` |  Nullable |
| `resolution_reasoning` | `text` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |

## Table `requirements`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `project_id` | `uuid` |  |
| `meeting_id` | `uuid` |  Nullable |
| `origin_project_id` | `uuid` |  Nullable |
| `title` | `text` |  Nullable |
| `summary` | `text` |  Nullable |
| `context_confidence_pct` | `int4` |  Nullable |
| `status` | `text` |  Nullable |
| `approved_at` | `timestamptz` |  Nullable |
| `approved_by_id` | `uuid` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |

## Table `requirement_project_references`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `requirement_id` | `uuid` |  |
| `referenced_project_id` | `uuid` |  |
| `relation_type` | `text` |  Nullable |
| `evidence_text` | `text` |  Nullable |
| `confidence_pct` | `int4` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |

## Table `tickets`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `requirement_id` | `uuid` |  |
| `project_id` | `uuid` |  |
| `title` | `text` |  |
| `description` | `text` |  Nullable |
| `priority` | `text` |  Nullable |
| `estimate_hours` | `int4` |  Nullable |
| `required_skill_id` | `uuid` |  Nullable |
| `risk_pct` | `int4` |  Nullable |
| `assignee_id` | `uuid` |  Nullable |
| `assignment_reasoning` | `text` |  Nullable |
| `status` | `text` |  Nullable |
| `deadline` | `date` |  Nullable |
| `kanban_order` | `int4` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |
| `updated_at` | `timestamptz` |  Nullable |

## Table `ticket_context_references`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `ticket_id` | `uuid` |  |
| `knowledge_chunk_id` | `uuid` |  Nullable |
| `project_id` | `uuid` |  Nullable |
| `evidence_text` | `text` |  Nullable |
| `relevance_pct` | `int4` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |

## Table `ticket_assignments`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `ticket_id` | `uuid` |  |
| `assignee_id` | `uuid` |  Nullable |
| `risk_pct` | `int4` |  Nullable |
| `reasoning` | `text` |  Nullable |
| `source` | `text` |  Nullable |
| `is_current` | `bool` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |

## Table `ticket_status_events`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `ticket_id` | `uuid` |  |
| `from_status` | `text` |  Nullable |
| `to_status` | `text` |  |
| `changed_by_id` | `uuid` |  Nullable |
| `source` | `text` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |

## Table `approvals`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `requirement_id` | `uuid` |  |
| `approved_by_id` | `uuid` |  Nullable |
| `n8n_notified` | `bool` |  Nullable |
| `n8n_ok` | `bool` |  Nullable |
| `webhook_payload` | `jsonb` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |

## Table `notifications`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `approval_id` | `uuid` |  Nullable |
| `ticket_id` | `uuid` |  Nullable |
| `member_id` | `uuid` |  |
| `channel` | `text` |  Nullable |
| `template` | `text` |  Nullable |
| `status` | `text` |  Nullable |
| `sent_at` | `timestamptz` |  Nullable |
| `error_message` | `text` |  Nullable |
| `metadata` | `jsonb` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |

## Table `agent_runs`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `agent` | `text` |  |
| `entity_type` | `text` |  Nullable |
| `entity_id` | `uuid` |  Nullable |
| `model` | `text` |  Nullable |
| `latency_ms` | `int4` |  Nullable |
| `tokens_in` | `int4` |  Nullable |
| `tokens_out` | `int4` |  Nullable |
| `ok` | `bool` |  Nullable |
| `error_message` | `text` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |
