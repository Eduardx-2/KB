"""Regression: requirements has two FKs to projects — embed must be disambiguated."""
from tenancy import assert_team_owns_requirement


def test_requirement_select_uses_explicit_fk_hint():
    # Guard against silent regressions: PostgREST PGRST201 if hint is dropped.
    source = open("tenancy.py", encoding="utf-8").read()
    assert "projects!requirements_project_id_fkey!inner" in source
    assert "projects!inner(team_id)" not in source.split("def assert_team_owns_ticket")[0]
