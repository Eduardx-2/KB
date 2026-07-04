# ER Completo — AI Meeting-to-Tickets PM

Diagrama ER completo del esquema v3, incluyendo relaciones y atributos de cada tabla.

---

## ER Diagram Completo

```mermaid
erDiagram
    TEAMS ||--o{ MEMBERS : has
    TEAMS ||--o{ PROJECTS : owns

    SKILLS ||--o{ MEMBER_SKILLS : defines
    MEMBERS ||--o{ MEMBER_SKILLS : has

    MEMBERS ||--o{ PROJECTS : owns
    PROJECTS ||--o{ PROJECT_ALIASES : known_as
    PROJECTS ||--o{ PROJECT_MEMBERS : includes
    MEMBERS ||--o{ PROJECT_MEMBERS : participates

    PROJECTS ||--o{ PROJECT_KNOWLEDGE_SOURCES : has
    PROJECT_KNOWLEDGE_SOURCES ||--o{ PROJECT_KNOWLEDGE_CHUNKS : splits_into
    PROJECTS ||--o{ PROJECT_KNOWLEDGE_CHUNKS : indexes
    MEMBERS ||--o{ PROJECT_KNOWLEDGE_SOURCES : creates

    PROJECTS ||--o{ MEETINGS : primary_context
    MEMBERS ||--o{ MEETINGS : facilitates
    MEETINGS ||--o{ MEETING_PROJECT_MENTIONS : detects
    PROJECTS ||--o{ MEETING_PROJECT_MENTIONS : mentioned_as

    PROJECTS ||--o{ REQUIREMENTS : owns
    PROJECTS ||--o{ REQUIREMENTS : originated_from
    MEETINGS ||--o{ REQUIREMENTS : produces
    MEMBERS ||--o{ REQUIREMENTS : approves

    REQUIREMENTS ||--o{ REQUIREMENT_PROJECT_REFERENCES : references
    PROJECTS ||--o{ REQUIREMENT_PROJECT_REFERENCES : provides_context

    REQUIREMENTS ||--o{ TICKETS : generates
    PROJECTS ||--o{ TICKETS : contains
    SKILLS ||--o{ TICKETS : requires
    MEMBERS ||--o{ TICKETS : assigned_to

    TICKETS ||--o{ TICKET_CONTEXT_REFERENCES : justified_by
    PROJECT_KNOWLEDGE_CHUNKS ||--o{ TICKET_CONTEXT_REFERENCES : cited_by
    PROJECTS ||--o{ TICKET_CONTEXT_REFERENCES : context_project

    TICKETS ||--o{ TICKET_ASSIGNMENTS : assignment_history
    MEMBERS ||--o{ TICKET_ASSIGNMENTS : receives

    TICKETS ||--o{ TICKET_STATUS_EVENTS : status_history
    MEMBERS ||--o{ TICKET_STATUS_EVENTS : changed_by

    REQUIREMENTS ||--o{ APPROVALS : has
    MEMBERS ||--o{ APPROVALS : approves

    APPROVALS ||--o{ NOTIFICATIONS : triggers
    TICKETS ||--o{ NOTIFICATIONS : references
    MEMBERS ||--o{ NOTIFICATIONS : receives

    AGENT_RUNS }o--|| MEETINGS : can_log
    AGENT_RUNS }o--|| REQUIREMENTS : can_log

    TEAMS {
        uuid id PK
        text name
        text slug UK
        timestamptz created_at
    }

    SKILLS {
        uuid id PK
        text code UK
        text label
    }

    MEMBERS {
        uuid id PK
        uuid team_id FK
        text name
        text email
        text role
        int current_load
        boolean is_manager
        timestamptz created_at
    }

    MEMBER_SKILLS {
        uuid member_id PK_FK
        uuid skill_id PK_FK
        smallint proficiency
    }

    PROJECTS {
        uuid id PK
        uuid team_id FK
        text code UK
        text name
        text description
        text business_area
        text status
        uuid owner_id FK
        date started_at
        date target_date
        timestamptz created_at
    }

    PROJECT_ALIASES {
        uuid id PK
        uuid project_id FK
        text alias
        text normalized_alias UK
        timestamptz created_at
    }

    PROJECT_MEMBERS {
        uuid project_id PK_FK
        uuid member_id PK_FK
        text role
        timestamptz joined_at
    }

    PROJECT_KNOWLEDGE_SOURCES {
        uuid id PK
        uuid project_id FK
        text title
        text source_type
        text source_uri
        text raw_content
        text summary
        text trust_level
        jsonb metadata
        uuid created_by_id FK
        timestamptz created_at
        timestamptz updated_at
    }

    PROJECT_KNOWLEDGE_CHUNKS {
        uuid id PK
        uuid source_id FK
        uuid project_id FK
        int chunk_index
        text content
        vector embedding
        jsonb metadata
        timestamptz created_at
    }

    MEETINGS {
        uuid id PK
        uuid primary_project_id FK
        text title
        text raw_transcript
        text audio_storage_path
        int audio_duration_sec
        text source
        text status
        uuid facilitator_id FK
        timestamptz recorded_at
        timestamptz created_at
    }

    MEETING_PROJECT_MENTIONS {
        uuid id PK
        uuid meeting_id FK
        uuid mentioned_project_id FK
        text mentioned_text
        int confidence_pct
        text resolution_status
        text resolution_reasoning
        timestamptz created_at
    }

    REQUIREMENTS {
        uuid id PK
        uuid project_id FK
        uuid meeting_id FK
        uuid origin_project_id FK
        text title
        text summary
        int context_confidence_pct
        text status
        timestamptz approved_at
        uuid approved_by_id FK
        timestamptz created_at
    }

    REQUIREMENT_PROJECT_REFERENCES {
        uuid id PK
        uuid requirement_id FK
        uuid referenced_project_id FK
        text relation_type
        text evidence_text
        int confidence_pct
        timestamptz created_at
    }

    TICKETS {
        uuid id PK
        uuid requirement_id FK
        uuid project_id FK
        text title
        text description
        text priority
        int estimate_hours
        uuid required_skill_id FK
        int risk_pct
        uuid assignee_id FK
        text assignment_reasoning
        text status
        date deadline
        int kanban_order
        timestamptz created_at
        timestamptz updated_at
    }

    TICKET_CONTEXT_REFERENCES {
        uuid id PK
        uuid ticket_id FK
        uuid knowledge_chunk_id FK
        uuid project_id FK
        text evidence_text
        int relevance_pct
        timestamptz created_at
    }

    TICKET_ASSIGNMENTS {
        uuid id PK
        uuid ticket_id FK
        uuid assignee_id FK
        int risk_pct
        text reasoning
        text source
        boolean is_current
        timestamptz created_at
    }

    TICKET_STATUS_EVENTS {
        uuid id PK
        uuid ticket_id FK
        text from_status
        text to_status
        uuid changed_by_id FK
        text source
        timestamptz created_at
    }

    APPROVALS {
        uuid id PK
        uuid requirement_id FK
        uuid approved_by_id FK
        boolean n8n_notified
        boolean n8n_ok
        jsonb webhook_payload
        timestamptz created_at
    }

    NOTIFICATIONS {
        uuid id PK
        uuid approval_id FK
        uuid ticket_id FK
        uuid member_id FK
        text channel
        text template
        text status
        timestamptz sent_at
        text error_message
        jsonb metadata
        timestamptz created_at
    }

    AGENT_RUNS {
        uuid id PK
        text agent
        text entity_type
        uuid entity_id
        text model
        int latency_ms
        int tokens_in
        int tokens_out
        boolean ok
        text error_message
        timestamptz created_at
    }
```

---

## Notas De Lectura

- `meetings.primary_project_id` representa el proyecto principal de la reunión.
- `meeting_project_mentions` guarda otros proyectos mencionados en la reunión.
- `requirements.project_id` representa el proyecto correcto al que pertenece el requerimiento.
- `requirements.origin_project_id` conserva desde qué proyecto/reunión surgió la mención.
- `project_knowledge_sources` y `project_knowledge_chunks` son la base de conocimiento que el agente debe consultar.
- `ticket_context_references` guarda la evidencia usada por el agente para crear cada ticket.

