"""Smoke E2E: create requirement → meeting agent → assignment → workspace."""
from __future__ import annotations

import sys
import time

import httpx

BASE = "http://127.0.0.1:8002"
HEADERS = {
    "X-Team-Id": "00000000-0000-0000-0000-000000000001",
    "Content-Type": "application/json",
}
PROJECT_ID = "61000000-0000-0000-0000-000000000001"
TRANSCRIPT = (
    "Buenas. Necesitamos integrar Exactus con el portal web de Maxxi. "
    "Primero mapear tablas de inventario en Exactus, luego crear endpoints C# de lectura, "
    "despues UI Filament para consulta, y pruebas de conciliacion. "
    "Plazo un mes. Ivan lidera Exactus, Christopher la web."
)


def main() -> int:
    with httpx.Client(base_url=BASE, headers=HEADERS, timeout=120.0) as client:
        r = client.get("/api/health")
        print("1 health", r.status_code, r.text)
        r.raise_for_status()

        r = client.post(
            "/api/requirements",
            json={"title": "Debug E2E Exactus", "project_id": PROJECT_ID},
        )
        print("2 requirements", r.status_code, r.text[:200])
        r.raise_for_status()
        req_id = r.json()["id"]
        print("req_id", req_id)

        t0 = time.time()
        r = client.post(
            "/api/agents/meeting",
            json={
                "transcript": TRANSCRIPT,
                "requirement_id": req_id,
                "project_id": PROJECT_ID,
            },
        )
        elapsed = time.time() - t0
        print("3 meeting", r.status_code, f"{elapsed:.1f}s")
        if not r.is_success:
            print(r.text[:1200])
            return 1
        payload = r.json()
        tickets = payload.get("tickets") or []
        print(f"   tickets={len(tickets)} summary={str(payload.get('summary', ''))[:140]}")

        t0 = time.time()
        r = client.post("/api/agents/assignment", json={"requirement_id": req_id})
        elapsed = time.time() - t0
        print("4 assignment", r.status_code, f"{elapsed:.1f}s")
        if not r.is_success:
            print(r.text[:1200])
            return 1
        recs = r.json().get("recommendations") or []
        print(f"   recommendations={len(recs)}")

        r = client.get("/api/workspace")
        r.raise_for_status()
        ws = r.json()
        req = next((x for x in ws.get("requirements", []) if x["id"] == req_id), None)
        tix = [x for x in ws.get("tickets", []) if x.get("requirement_id") == req_id]
        assigned = sum(1 for t in tix if t.get("assignee_id"))
        print(
            "5 workspace",
            f"status={req.get('status') if req else None}",
            f"tickets={len(tix)}",
            f"assigned={assigned}",
        )
        if not tix:
            print("FAIL: no tickets in workspace")
            return 1
        print("OK E2E")
        return 0


if __name__ == "__main__":
    sys.exit(main())
