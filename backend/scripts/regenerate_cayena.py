"""Regenerate Cayena meeting tickets with improved agents."""
from __future__ import annotations

import sys
import time

import httpx

from services import get_supabase

BASE = "http://127.0.0.1:8002"
HEADERS = {
    "X-Team-Id": "00000000-0000-0000-0000-000000000001",
    "Content-Type": "application/json",
}
OLD_REQ = "6d6b28de-4865-4bf2-bb78-20e45cebae0d"
MEETING_ID = "2879f529-ee72-45dd-8cb2-7167810d91e9"
PROJECT_ID = "61000000-0000-0000-0000-000000000002"


def main() -> int:
    sb = get_supabase()
    transcript = (
        sb.table("meetings")
        .select("raw_transcript")
        .eq("id", MEETING_ID)
        .single()
        .execute()
        .data["raw_transcript"]
    )
    print("transcript_chars", len(transcript))

    # Wipe old poor tickets on the stuck requirement
    sb.table("tickets").delete().eq("requirement_id", OLD_REQ).execute()
    sb.table("requirements").update({"status": "draft", "summary": None}).eq("id", OLD_REQ).execute()

    with httpx.Client(base_url=BASE, headers=HEADERS, timeout=180.0) as client:
        # Wait for uvicorn reload
        for _ in range(20):
            try:
                if client.get("/api/health").status_code == 200:
                    break
            except Exception:
                pass
            time.sleep(0.5)

        t0 = time.time()
        r = client.post(
            "/api/agents/meeting",
            json={
                "transcript": transcript,
                "requirement_id": OLD_REQ,
                "project_id": PROJECT_ID,
            },
        )
        print("meeting", r.status_code, f"{time.time() - t0:.1f}s")
        if not r.is_success:
            print(r.text[:1500])
            return 1
        data = r.json()
        tickets = data.get("tickets") or []
        print(f"tickets={len(tickets)}")
        print("summary:", (data.get("summary") or "")[:200])
        for t in tickets:
            print(
                f"  - [{t.get('required_skill')}/{t.get('work_phase')}] "
                f"{t.get('title')} ({t.get('estimate_hours')}h)"
            )
            print(f"    desc: {(t.get('description') or '')[:140]}")
            print(f"    ac: {(t.get('acceptance_criteria') or '')[:120]}")
            print(f"    evid: {(t.get('knowledge_evidence') or '')[:100]}")

        t0 = time.time()
        r = client.post("/api/agents/assignment", json={"requirement_id": OLD_REQ})
        print("assignment", r.status_code, f"{time.time() - t0:.1f}s")
        if not r.is_success:
            print(r.text[:1500])
            return 1
        for rec in r.json().get("recommendations") or []:
            print(
                f"  -> {rec.get('assignee_name')} | risk {rec.get('risk_pct')}% | "
                f"{rec.get('ticket_title')[:60]} | {rec.get('reasoning')}"
            )

        # Validate org rules from DB
        rows = (
            sb.table("tickets")
            .select("title, assignee_id, required_skill_id")
            .eq("requirement_id", OLD_REQ)
            .execute()
            .data
            or []
        )
        juan = "60000000-0000-0000-0000-000000000001"
        chris = "60000000-0000-0000-0000-000000000005"
        juan_n = sum(1 for t in rows if t.get("assignee_id") == juan)
        chris_n = sum(1 for t in rows if t.get("assignee_id") == chris)
        print(f"assigned_to_juan={juan_n} assigned_to_christopher={chris_n} total={len(rows)}")
        if juan_n:
            print("WARN: Juan still has tickets (should be last resort only)")
        print("OK regenerate")
        return 0


if __name__ == "__main__":
    sys.exit(main())
