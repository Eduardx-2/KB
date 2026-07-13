"""Helpers de aislamiento multi-tenant (team ownership)."""
from __future__ import annotations

from fastapi import HTTPException
from supabase import Client


def assert_team_owns_project(sb: Client, team_id: str, project_id: str) -> dict:
    res = (
        sb.table("projects")
        .select("id, team_id, code, name, description, business_area, status, owner_id, target_date, created_at")
        .eq("id", project_id)
        .eq("team_id", team_id)
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    return res.data[0]


def assert_team_owns_requirement(sb: Client, team_id: str, requirement_id: str) -> dict:
    """Requirement → project → team."""
    res = (
        sb.table("requirements")
        .select("id, project_id, meeting_id, title, summary, status, projects!inner(team_id)")
        .eq("id", requirement_id)
        .eq("projects.team_id", team_id)
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Requirement no encontrado")
    row = res.data[0]
    # Normaliza: quita el join embebido si no hace falta aguas abajo.
    return {
        "id": row["id"],
        "project_id": row["project_id"],
        "meeting_id": row.get("meeting_id"),
        "title": row.get("title"),
        "summary": row.get("summary"),
        "status": row.get("status"),
    }


def assert_team_owns_ticket(sb: Client, team_id: str, ticket_id: str) -> dict:
    """Ticket → project → team."""
    res = (
        sb.table("tickets")
        .select("id, requirement_id, project_id, title, status, assignee_id, projects!inner(team_id)")
        .eq("id", ticket_id)
        .eq("projects.team_id", team_id)
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")
    row = res.data[0]
    return {
        "id": row["id"],
        "requirement_id": row["requirement_id"],
        "project_id": row["project_id"],
        "title": row.get("title"),
        "status": row.get("status"),
        "assignee_id": row.get("assignee_id"),
    }


def members_for_team(sb: Client, team_id: str) -> list[dict]:
    return (
        sb.table("members")
        .select("id, team_id, name, role, email, current_load, is_manager")
        .eq("team_id", team_id)
        .order("is_manager")
        .order("name")
        .execute()
        .data
        or []
    )


def projects_for_team(sb: Client, team_id: str) -> list[dict]:
    return (
        sb.table("projects")
        .select("id, team_id, code, name, description, business_area, status, owner_id, target_date, created_at")
        .eq("team_id", team_id)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )


def project_ids_for_team(sb: Client, team_id: str) -> list[str]:
    rows = (
        sb.table("projects")
        .select("id")
        .eq("team_id", team_id)
        .execute()
        .data
        or []
    )
    return [r["id"] for r in rows]
