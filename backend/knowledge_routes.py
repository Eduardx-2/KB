"""Knowledge Ops API routes: duties, absences, modules, docs, graph, reorg."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

try:
    from . import capacity, knowledge, reorg_agent, services, tenancy
    from .auth import AuthContext, require_team
    from .schemas import (
        KnowledgeSummaryOut,
        MemberAbsenceIn,
        MemberAbsenceOut,
        MemberCapacityIn,
        MemberCapacityOut,
        MemberDocsIn,
        MemberDocsOut,
        MemberProjectAssignIn,
        MemberProjectNoteIn,
        MemberProjectNoteOut,
        MemberDutyIn,
        MemberDutyOut,
        ProjectDocIn,
        ProjectDocOut,
        ProjectDocUpdateIn,
        ProjectModuleIn,
        ProjectModuleOut,
        ProjectModulePatch,
        ProjectStakeholderIn,
        ProjectStakeholderOut,
        ReorgDecideRequest,
        ReorgProposalOut,
        ReorgTriggerRequest,
    )
except ImportError:  # Permite `uvicorn main:app` desde backend/.
    import capacity
    import knowledge
    import reorg_agent
    import services
    import tenancy
    from auth import AuthContext, require_team
    from schemas import (
        KnowledgeSummaryOut,
        MemberAbsenceIn,
        MemberAbsenceOut,
        MemberCapacityIn,
        MemberCapacityOut,
        MemberDocsIn,
        MemberDocsOut,
        MemberProjectAssignIn,
        MemberProjectNoteIn,
        MemberProjectNoteOut,
        MemberDutyIn,
        MemberDutyOut,
        ProjectDocIn,
        ProjectDocOut,
        ProjectDocUpdateIn,
        ProjectModuleIn,
        ProjectModuleOut,
        ProjectModulePatch,
        ProjectStakeholderIn,
        ProjectStakeholderOut,
        ReorgDecideRequest,
        ReorgProposalOut,
        ReorgTriggerRequest,
    )

logger = logging.getLogger("app.knowledge_routes")

router = APIRouter(tags=["knowledge-ops"])
TeamAuth = Annotated[AuthContext, Depends(require_team)]


def _sb():
    return services.get_supabase()


def _assert_member(team_id: str, member_id: str) -> dict:
    return tenancy.assert_team_owns_member(_sb(), team_id, member_id)  # type: ignore[arg-type]


def _assert_project(team_id: str, project_id: str) -> dict:
    return tenancy.assert_team_owns_project(_sb(), team_id, project_id)  # type: ignore[arg-type]


def _load_proposal(proposal_id: str, team_id: str) -> dict:
    sb = _sb()
    prop_res = (
        sb.table("reorg_proposals")
        .select("*")
        .eq("id", proposal_id)
        .eq("team_id", team_id)
        .limit(1)
        .execute()
    )
    if not prop_res.data:
        raise HTTPException(status_code=404, detail="Propuesta no encontrada")
    proposal = prop_res.data[0]
    items_res = (
        sb.table("reorg_proposal_items")
        .select("*")
        .eq("proposal_id", proposal_id)
        .execute()
    )
    proposal["items"] = items_res.data or []
    return proposal


def _notify_reorg(event: str, payload: dict) -> bool:
    return services.notify_n8n({"event": event, **payload})


def _run_reorg_for_member(
    team_id: str,
    member_id: str,
    *,
    trigger: str,
    reason_md: str,
) -> str | None:
    """Run reorg agent and persist proposal. Returns proposal_id."""
    sb = _sb()
    tickets = (
        sb.table("tickets")
        .select("id, title, status, priority, estimate_hours, deadline, assignee_id, scheduled_date")
        .eq("assignee_id", member_id)
        .in_("status", ["backlog", "todo", "in_progress"])
        .execute()
    ).data or []

    raw_members = tenancy.members_for_team(sb, team_id)
    members = capacity.enrich_member_load(raw_members)

    duties = (
        sb.table("member_duties")
        .select("title, duty_type, load_pct, is_active")
        .eq("member_id", member_id)
        .eq("is_active", True)
        .execute()
    ).data or []

    absences = (
        sb.table("member_absences")
        .select("start_date, end_date, reason, status")
        .eq("member_id", member_id)
        .in_("status", ["approved", "pending"])
        .execute()
    ).data or []

    output = reorg_agent.run_reorg_agent(
        member_id=member_id,
        team_id=team_id,
        trigger=trigger,
        reason_md=reason_md,
        tickets=tickets,
        members=members,
        duties=duties,
        absences=absences,
    )
    proposal_id = reorg_agent.persist_proposal(sb, team_id, member_id, trigger, output)
    if proposal_id:
        _notify_reorg(
            "reorg.pending_boss",
            {
                "proposal_id": proposal_id,
                "team_id": team_id,
                "member_id": member_id,
                "trigger": trigger,
                "summary_md": output.summary_md,
            },
        )
    return proposal_id


# ---------- Member duties ----------

@router.get("/api/members/{member_id}/duties", response_model=list[MemberDutyOut])
def list_member_duties(member_id: str, auth: TeamAuth):
    _assert_member(auth.team_id, member_id)  # type: ignore[arg-type]
    rows = (
        _sb()
        .table("member_duties")
        .select("*")
        .eq("member_id", member_id)
        .order("created_at", desc=True)
        .execute()
    ).data or []
    return rows


@router.post("/api/members/{member_id}/duties", response_model=MemberDutyOut, status_code=201)
def create_member_duty(member_id: str, body: MemberDutyIn, auth: TeamAuth):
    _assert_member(auth.team_id, member_id)  # type: ignore[arg-type]
    payload = {
        **body.model_dump(),
        "member_id": member_id,
        "team_id": auth.team_id,
    }
    res = _sb().table("member_duties").insert(payload).execute()
    return res.data[0]


@router.delete("/api/member-duties/{duty_id}", status_code=204)
def delete_member_duty(duty_id: str, auth: TeamAuth):
    sb = _sb()
    row = (
        sb.table("member_duties")
        .select("id, team_id")
        .eq("id", duty_id)
        .limit(1)
        .execute()
    ).data
    if not row or row[0].get("team_id") != auth.team_id:
        raise HTTPException(status_code=404, detail="Duty no encontrado")
    sb.table("member_duties").delete().eq("id", duty_id).execute()


# ---------- Member absences ----------

@router.get("/api/members/{member_id}/absences", response_model=list[MemberAbsenceOut])
def list_member_absences(member_id: str, auth: TeamAuth):
    _assert_member(auth.team_id, member_id)  # type: ignore[arg-type]
    rows = (
        _sb()
        .table("member_absences")
        .select("*")
        .eq("member_id", member_id)
        .order("start_date", desc=True)
        .execute()
    ).data or []
    return rows


@router.post("/api/members/{member_id}/absences", response_model=MemberAbsenceOut, status_code=201)
def create_member_absence(member_id: str, body: MemberAbsenceIn, auth: TeamAuth):
    member = _assert_member(auth.team_id, member_id)  # type: ignore[arg-type]
    payload = {
        **body.model_dump(),
        "member_id": member_id,
        "team_id": auth.team_id,
    }
    res = _sb().table("member_absences").insert(payload).execute()
    absence = res.data[0]

    if body.status in ("approved", "pending"):
        reason = body.reason or "Ausencia registrada"
        reason_md = (
            f"**Ausencia de {member['name']}** ({body.start_date} → {body.end_date})\n\n"
            f"Motivo: {reason}\n\nEstado: {body.status}"
        )
        try:
            _run_reorg_for_member(
                auth.team_id,  # type: ignore[arg-type]
                member_id,
                trigger="absence",
                reason_md=reason_md,
            )
        except Exception:  # noqa: BLE001
            logger.exception("Auto reorg on absence failed (best-effort)")

    return absence


# ---------- Member capacity ----------

@router.get("/api/members/{member_id}/capacity", response_model=MemberCapacityOut)
def get_member_capacity(member_id: str, auth: TeamAuth):
    _assert_member(auth.team_id, member_id)  # type: ignore[arg-type]
    rows = (
        _sb()
        .table("member_capacity")
        .select("*")
        .eq("member_id", member_id)
        .limit(1)
        .execute()
    ).data or []
    if rows:
        return rows[0]
    return MemberCapacityOut(
        member_id=member_id,
        team_id=auth.team_id,  # type: ignore[arg-type]
        weekly_hours=40,
    )


@router.patch("/api/members/{member_id}/capacity", response_model=MemberCapacityOut)
def update_member_capacity(member_id: str, body: MemberCapacityIn, auth: TeamAuth):
    _assert_member(auth.team_id, member_id)  # type: ignore[arg-type]
    payload = {
        **body.model_dump(exclude_none=True),
        "member_id": member_id,
        "team_id": auth.team_id,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    sb = _sb()
    existing = (
        sb.table("member_capacity")
        .select("member_id")
        .eq("member_id", member_id)
        .limit(1)
        .execute()
    ).data
    if existing:
        res = sb.table("member_capacity").update(payload).eq("member_id", member_id).execute()
    else:
        res = sb.table("member_capacity").insert(payload).execute()
    return res.data[0]


# ---------- Project modules ----------

@router.get("/api/projects/{project_id}/modules", response_model=list[ProjectModuleOut])
def list_project_modules(project_id: str, auth: TeamAuth):
    _assert_project(auth.team_id, project_id)  # type: ignore[arg-type]
    rows = (
        _sb()
        .table("project_modules")
        .select("*")
        .eq("project_id", project_id)
        .order("created_at")
        .execute()
    ).data or []
    return rows


@router.post("/api/projects/{project_id}/modules", response_model=ProjectModuleOut, status_code=201)
def create_project_module(project_id: str, body: ProjectModuleIn, auth: TeamAuth):
    _assert_project(auth.team_id, project_id)  # type: ignore[arg-type]
    payload = {
        **body.model_dump(),
        "project_id": project_id,
        "team_id": auth.team_id,
    }
    res = _sb().table("project_modules").insert(payload).execute()
    module = res.data[0]
    if body.md_body.strip():
        knowledge.ingest_markdown(
            auth.team_id,  # type: ignore[arg-type]
            project_id,
            title=body.name,
            md_body=body.md_body,
            source_type="module_spec",
            created_by_id=auth.user_id,
        )
    return module


@router.patch("/api/project-modules/{module_id}", response_model=ProjectModuleOut)
def update_project_module(module_id: str, body: ProjectModulePatch, auth: TeamAuth):
    sb = _sb()
    existing = (
        sb.table("project_modules")
        .select("id, project_id, team_id, name")
        .eq("id", module_id)
        .limit(1)
        .execute()
    ).data
    if not existing or existing[0].get("team_id") != auth.team_id:
        raise HTTPException(status_code=404, detail="Módulo no encontrado")
    row = existing[0]
    payload = body.model_dump(exclude_none=True)
    if not payload:
        raise HTTPException(status_code=400, detail="Nada que actualizar")
    payload["updated_at"] = datetime.now(timezone.utc).isoformat()
    res = sb.table("project_modules").update(payload).eq("id", module_id).execute()
    module = res.data[0]
    md_body = body.md_body
    if md_body and md_body.strip():
        knowledge.ingest_markdown(
            auth.team_id,  # type: ignore[arg-type]
            row["project_id"],
            title=body.name or row["name"],
            md_body=md_body,
            source_type="module_spec",
            created_by_id=auth.user_id,
        )
    return module


# ---------- Project stakeholders ----------

@router.get("/api/projects/{project_id}/stakeholders", response_model=list[ProjectStakeholderOut])
def list_project_stakeholders(project_id: str, auth: TeamAuth):
    _assert_project(auth.team_id, project_id)  # type: ignore[arg-type]
    rows = (
        _sb()
        .table("project_stakeholders")
        .select("*")
        .eq("project_id", project_id)
        .order("importance_pct", desc=True)
        .execute()
    ).data or []
    return rows


@router.post("/api/projects/{project_id}/stakeholders", response_model=ProjectStakeholderOut, status_code=201)
def create_project_stakeholder(project_id: str, body: ProjectStakeholderIn, auth: TeamAuth):
    _assert_project(auth.team_id, project_id)  # type: ignore[arg-type]
    _assert_member(auth.team_id, body.member_id)  # type: ignore[arg-type]
    payload = {**body.model_dump(), "project_id": project_id}
    res = _sb().table("project_stakeholders").insert(payload).execute()
    return res.data[0]


# ---------- Project docs ingest / update ----------

@router.post("/api/projects/{project_id}/docs", status_code=201)
def upload_project_doc(project_id: str, body: ProjectDocIn, auth: TeamAuth):
    _assert_project(auth.team_id, project_id)  # type: ignore[arg-type]
    source_id = knowledge.ingest_markdown(
        auth.team_id,  # type: ignore[arg-type]
        project_id,
        title=body.title,
        md_body=body.md_body,
        source_type=body.source_type,
        created_by_id=auth.user_id,
        source_id=body.source_id,
        mode=body.mode,
    )
    if not source_id:
        raise HTTPException(status_code=500, detail="No se pudo ingerir el documento")
    return {"source_id": source_id, "ok": True}


@router.get("/api/projects/{project_id}/docs/{source_id}", response_model=ProjectDocOut)
def get_project_doc(project_id: str, source_id: str, auth: TeamAuth):
    _assert_project(auth.team_id, project_id)  # type: ignore[arg-type]
    sb = _sb()
    rows = (
        sb.table("project_knowledge_sources")
        .select("id, project_id, title, source_type, raw_content, summary, updated_at, created_at")
        .eq("id", source_id)
        .eq("project_id", project_id)
        .limit(1)
        .execute()
    ).data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    return rows[0]


@router.put("/api/projects/{project_id}/docs/{source_id}", response_model=ProjectDocOut)
def update_project_doc(project_id: str, source_id: str, body: ProjectDocUpdateIn, auth: TeamAuth):
    """Replace or append MD content for an existing knowledge source; re-chunks + graph."""
    _assert_project(auth.team_id, project_id)  # type: ignore[arg-type]
    sb = _sb()
    rows = (
        sb.table("project_knowledge_sources")
        .select("id, project_id, title, source_type, raw_content, summary, updated_at, created_at")
        .eq("id", source_id)
        .eq("project_id", project_id)
        .limit(1)
        .execute()
    ).data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    current = rows[0]
    title = (body.title or current.get("title") or "Documento").strip()
    if body.mode == "append":
        addition = (body.md_body or "").strip()
        if not addition:
            raise HTTPException(status_code=400, detail="md_body vacío para append")
        md_body = addition
    else:
        if body.md_body is None:
            raise HTTPException(status_code=400, detail="md_body requerido para replace")
        md_body = body.md_body

    new_id = knowledge.ingest_markdown(
        auth.team_id,  # type: ignore[arg-type]
        project_id,
        title=title,
        md_body=md_body,
        source_type=current.get("source_type") or "document",
        created_by_id=auth.user_id,
        source_id=source_id,
        mode=body.mode,
    )
    if not new_id:
        raise HTTPException(status_code=500, detail="No se pudo actualizar el documento")
    refreshed = (
        sb.table("project_knowledge_sources")
        .select("id, project_id, title, source_type, raw_content, summary, updated_at, created_at")
        .eq("id", new_id)
        .limit(1)
        .execute()
    ).data or []
    return refreshed[0] if refreshed else {**current, "title": title, "raw_content": md_body}


# ---------- Knowledge summary ----------

@router.get("/api/projects/{project_id}/knowledge", response_model=KnowledgeSummaryOut)
def get_project_knowledge(project_id: str, auth: TeamAuth):
    _assert_project(auth.team_id, project_id)  # type: ignore[arg-type]
    sb = _sb()
    team_id = auth.team_id  # type: ignore[arg-type]

    overview_rows = (
        sb.table("project_knowledge_sources")
        .select("raw_content")
        .eq("project_id", project_id)
        .eq("source_type", "project_overview")
        .order("updated_at", desc=True)
        .limit(1)
        .execute()
    ).data or []
    overview_md = (overview_rows[0].get("raw_content") or "") if overview_rows else ""

    modules = (
        sb.table("project_modules")
        .select("*")
        .eq("project_id", project_id)
        .order("created_at")
        .execute()
    ).data or []

    stakeholders = (
        sb.table("project_stakeholders")
        .select("*")
        .eq("project_id", project_id)
        .order("importance_pct", desc=True)
        .execute()
    ).data or []

    sources = (
        sb.table("project_knowledge_sources")
        .select("id, title, source_type, summary, created_at")
        .eq("project_id", project_id)
        .order("created_at", desc=True)
        .limit(50)
        .execute()
    ).data or []

    chunks_count_res = (
        sb.table("project_knowledge_chunks")
        .select("id", count="exact")
        .eq("project_id", project_id)
        .execute()
    )
    chunks_count = chunks_count_res.count or 0

    nodes = (
        sb.table("knowledge_nodes")
        .select("id, team_id, project_id, node_type, label, canonical_key, source_ref_type, source_ref_id, metadata")
        .eq("team_id", team_id)
        .eq("project_id", project_id)
        .limit(100)
        .execute()
    ).data or []

    node_ids = [n["id"] for n in nodes]
    edges: list[dict] = []
    if node_ids:
        edges = (
            sb.table("knowledge_edges")
            .select("id, team_id, from_node_id, to_node_id, relation, weight, evidence_text, confidence_pct, created_by")
            .eq("team_id", team_id)
            .in_("from_node_id", node_ids)
            .limit(200)
            .execute()
        ).data or []

    return KnowledgeSummaryOut(
        project_id=project_id,
        overview_md=overview_md,
        modules=modules,
        stakeholders=stakeholders,
        sources=sources,
        chunks_count=chunks_count,
        nodes=nodes,
        edges=edges,
    )


# ---------- Member developer profile (MD) ----------

_MEMBER_PROFILE_TEMPLATE = """# Perfil global

## Stack
- 

## Restricciones globales
- (qué no toco en ningún proyecto)

## Índice de proyectos
- (detalle por proyecto en las cards de abajo)
"""

_PROJECT_NOTE_TEMPLATE = """## Mi rol
- 

## Cómo trabajo aquí
- 

## Restricciones en este proyecto
- 
"""


@router.get("/api/members/{member_id}/docs", response_model=MemberDocsOut)
def get_member_docs(member_id: str, auth: TeamAuth):
    _assert_member(auth.team_id, member_id)  # type: ignore[arg-type]
    md, updated_at = knowledge.get_member_profile_md(member_id)
    if not md.strip():
        md = _MEMBER_PROFILE_TEMPLATE
    return MemberDocsOut(member_id=member_id, overview_md=md, updated_at=updated_at)


@router.post("/api/members/{member_id}/docs", response_model=MemberDocsOut)
def save_member_docs(member_id: str, body: MemberDocsIn, auth: TeamAuth):
    member = _assert_member(auth.team_id, member_id)  # type: ignore[arg-type]
    md_body = body.md_body.strip()
    if not md_body:
        raise HTTPException(status_code=400, detail="md_body no puede estar vacío")
    source_id = knowledge.ingest_member_markdown(
        auth.team_id,  # type: ignore[arg-type]
        member_id,
        title=f"Perfil — {member.get('name', member_id)}",
        md_body=md_body,
    )
    if not source_id:
        raise HTTPException(status_code=500, detail="No se pudo guardar el perfil")
    md, updated_at = knowledge.get_member_profile_md(member_id)
    return MemberDocsOut(member_id=member_id, overview_md=md, updated_at=updated_at)


@router.get("/api/members/{member_id}/project-notes", response_model=list[MemberProjectNoteOut])
def list_member_project_notes(member_id: str, auth: TeamAuth):
    """Solo proyectos en project_members (fuente de verdad de asignación)."""
    _assert_member(auth.team_id, member_id)  # type: ignore[arg-type]
    sb = _sb()
    links = (
        sb.table("project_members")
        .select("project_id, role")
        .eq("member_id", member_id)
        .execute()
    ).data or []
    if not links:
        return []
    project_ids = [r["project_id"] for r in links]
    projects = (
        sb.table("projects")
        .select("id, name, code, team_id")
        .in_("id", project_ids)
        .eq("team_id", auth.team_id)
        .execute()
    ).data or []
    stk = (
        sb.table("project_stakeholders")
        .select("project_id, role_in_project, md_notes, importance_pct")
        .eq("member_id", member_id)
        .in_("project_id", project_ids)
        .execute()
    ).data or []
    stk_by_proj = {r["project_id"]: r for r in stk}
    role_by_proj = {r["project_id"]: r.get("role") or "contributor" for r in links}
    out: list[MemberProjectNoteOut] = []
    for p in projects:
        s = stk_by_proj.get(p["id"]) or {}
        notes = (s.get("md_notes") or "").strip() or _PROJECT_NOTE_TEMPLATE
        out.append(
            MemberProjectNoteOut(
                project_id=p["id"],
                project_name=p["name"],
                project_code=p.get("code"),
                role_in_project=s.get("role_in_project") or role_by_proj.get(p["id"], "contributor"),
                md_notes=notes,
                importance_pct=int(s.get("importance_pct") or 50),
            )
        )
    out.sort(key=lambda x: x.project_name.lower())
    return out


@router.post("/api/members/{member_id}/projects", response_model=MemberProjectNoteOut, status_code=201)
def assign_member_to_project(member_id: str, body: MemberProjectAssignIn, auth: TeamAuth):
    """Asigna integrante a un proyecto (project_members)."""
    _assert_member(auth.team_id, member_id)  # type: ignore[arg-type]
    project = _assert_project(auth.team_id, body.project_id)  # type: ignore[arg-type]
    sb = _sb()
    sb.table("project_members").upsert(
        {"project_id": body.project_id, "member_id": member_id, "role": body.role}
    ).execute()
    role_label = (body.role_in_project or body.role).strip()
    existing = (
        sb.table("project_stakeholders")
        .select("id, md_notes, importance_pct, role_in_project")
        .eq("project_id", body.project_id)
        .eq("member_id", member_id)
        .limit(1)
        .execute()
    ).data
    if existing:
        md_notes = existing[0].get("md_notes") or _PROJECT_NOTE_TEMPLATE
        importance = int(existing[0].get("importance_pct") or 50)
        if body.role_in_project:
            sb.table("project_stakeholders").update(
                {"role_in_project": role_label}
            ).eq("id", existing[0]["id"]).execute()
        else:
            role_label = existing[0].get("role_in_project") or role_label
    else:
        md_notes = _PROJECT_NOTE_TEMPLATE
        importance = 50
        sb.table("project_stakeholders").insert(
            {
                "project_id": body.project_id,
                "member_id": member_id,
                "role_in_project": role_label,
                "importance_pct": importance,
                "md_notes": md_notes,
            }
        ).execute()
    return MemberProjectNoteOut(
        project_id=body.project_id,
        project_name=project.get("name") or body.project_id,
        project_code=project.get("code"),
        role_in_project=role_label,
        md_notes=md_notes,
        importance_pct=importance,
    )


@router.delete("/api/members/{member_id}/projects/{project_id}", status_code=204)
def unassign_member_from_project(member_id: str, project_id: str, auth: TeamAuth):
    """Quita asignación (project_members + stakeholder notes del par)."""
    _assert_member(auth.team_id, member_id)  # type: ignore[arg-type]
    _assert_project(auth.team_id, project_id)  # type: ignore[arg-type]
    sb = _sb()
    sb.table("project_members").delete().eq("project_id", project_id).eq("member_id", member_id).execute()
    sb.table("project_stakeholders").delete().eq("project_id", project_id).eq("member_id", member_id).execute()
    return None


@router.put("/api/members/{member_id}/project-notes/{project_id}", response_model=MemberProjectNoteOut)
def upsert_member_project_note(member_id: str, project_id: str, body: MemberProjectNoteIn, auth: TeamAuth):
    """Guarda MD/rol del integrante en un proyecto ya asignado. No crea membership."""
    _assert_member(auth.team_id, member_id)  # type: ignore[arg-type]
    project = _assert_project(auth.team_id, project_id)  # type: ignore[arg-type]
    sb = _sb()
    membership = (
        sb.table("project_members")
        .select("project_id, role")
        .eq("project_id", project_id)
        .eq("member_id", member_id)
        .limit(1)
        .execute()
    ).data
    if not membership:
        raise HTTPException(
            status_code=400,
            detail="El integrante no está asignado a este proyecto. Usá POST /projects primero.",
        )
    existing = (
        sb.table("project_stakeholders")
        .select("id, role_in_project, importance_pct")
        .eq("project_id", project_id)
        .eq("member_id", member_id)
        .limit(1)
        .execute()
    ).data
    role = (body.role_in_project or "").strip() or membership[0].get("role") or "contributor"
    importance = body.importance_pct if body.importance_pct is not None else 50
    md_notes = body.md_notes or ""
    if existing:
        role = body.role_in_project.strip() if body.role_in_project else existing[0].get("role_in_project") or role
        if body.importance_pct is None:
            importance = int(existing[0].get("importance_pct") or 50)
        sb.table("project_stakeholders").update(
            {"md_notes": md_notes, "role_in_project": role, "importance_pct": importance}
        ).eq("id", existing[0]["id"]).execute()
    else:
        sb.table("project_stakeholders").insert(
            {
                "project_id": project_id,
                "member_id": member_id,
                "role_in_project": role,
                "importance_pct": importance,
                "md_notes": md_notes,
            }
        ).execute()
    return MemberProjectNoteOut(
        project_id=project_id,
        project_name=project.get("name") or project_id,
        project_code=project.get("code"),
        role_in_project=role,
        md_notes=md_notes,
        importance_pct=importance,
    )


# ---------- Reorg proposals ----------

@router.get("/api/reorg/proposals", response_model=list[ReorgProposalOut])
def list_reorg_proposals(auth: TeamAuth, status: str | None = None):
    sb = _sb()
    query = (
        sb.table("reorg_proposals")
        .select("*")
        .eq("team_id", auth.team_id)
        .order("created_at", desc=True)
    )
    if status:
        query = query.eq("status", status)
    proposals = query.limit(50).execute().data or []

    if not proposals:
        return []

    proposal_ids = [p["id"] for p in proposals]
    items = (
        sb.table("reorg_proposal_items")
        .select("*")
        .in_("proposal_id", proposal_ids)
        .execute()
    ).data or []
    items_by_proposal: dict[str, list] = {}
    for item in items:
        items_by_proposal.setdefault(item["proposal_id"], []).append(item)

    out: list[dict] = []
    for prop in proposals:
        out.append({**prop, "items": items_by_proposal.get(prop["id"], [])})
    return out


@router.post("/api/reorg/proposals/{proposal_id}/decide", response_model=ReorgProposalOut)
def decide_reorg_proposal(proposal_id: str, body: ReorgDecideRequest, auth: TeamAuth):
    sb = _sb()
    proposal = _load_proposal(proposal_id, auth.team_id)  # type: ignore[arg-type]
    if proposal.get("status") not in ("pending_boss", "draft"):
        raise HTTPException(status_code=400, detail="La propuesta ya fue decidida")

    now = datetime.now(timezone.utc).isoformat()
    new_status = "approved" if body.decision == "approved" else "rejected"

    sb.table("reorg_proposals").update(
        {
            "status": new_status,
            "boss_decision_note": body.note,
            "decided_by_id": auth.user_id,
            "decided_at": now,
        }
    ).eq("id", proposal_id).execute()

    if body.decision == "approved":
        reorg_agent.apply_proposal(sb, proposal_id, decided_by_id=auth.user_id)
        _notify_reorg(
            "reorg.approved",
            {
                "proposal_id": proposal_id,
                "team_id": auth.team_id,
                "member_id": proposal.get("member_id"),
                "decided_by": auth.user_id,
            },
        )
    else:
        _notify_reorg(
            "reorg.rejected",
            {
                "proposal_id": proposal_id,
                "team_id": auth.team_id,
                "note": body.note,
            },
        )

    return _load_proposal(proposal_id, auth.team_id)  # type: ignore[arg-type]


@router.post("/api/reorg/trigger", response_model=ReorgProposalOut)
def trigger_reorg(body: ReorgTriggerRequest, auth: TeamAuth):
    member = _assert_member(auth.team_id, body.member_id)  # type: ignore[arg-type]
    reason_md = f"Reorganización manual solicitada para **{member['name']}**."
    trigger = "absence"

    if body.absence_id:
        absence_rows = (
            _sb()
            .table("member_absences")
            .select("*")
            .eq("id", body.absence_id)
            .eq("member_id", body.member_id)
            .limit(1)
            .execute()
        ).data
        if absence_rows:
            ab = absence_rows[0]
            trigger = "absence"
            reason_md = (
                f"Ausencia de {member['name']}: {ab.get('start_date')} → {ab.get('end_date')}\n\n"
                f"Motivo: {ab.get('reason') or 'N/A'}"
            )

    proposal_id = _run_reorg_for_member(
        auth.team_id,  # type: ignore[arg-type]
        body.member_id,
        trigger=trigger,
        reason_md=reason_md,
    )
    if not proposal_id:
        raise HTTPException(status_code=500, detail="No se pudo generar la propuesta de reorganización")
    return _load_proposal(proposal_id, auth.team_id)  # type: ignore[arg-type]
