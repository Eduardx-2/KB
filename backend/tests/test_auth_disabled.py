"""Unit tests for AUTH_DISABLED demo mode — no network."""
from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

import auth
from auth import AuthContext, get_auth_context


def _request(headers: dict[str, str] | None = None) -> MagicMock:
    """Minimal Request stand-in (avoids importing FastAPI/Starlette)."""
    req = MagicMock()
    hdrs = {k.lower(): v for k, v in (headers or {}).items()}
    req.headers.get = lambda key, default=None: hdrs.get(key.lower(), default)
    return req


class AuthDisabledTests(unittest.TestCase):
    def test_demo_mode_auth_context(self) -> None:
        mock_settings = MagicMock()
        mock_settings.AUTH_DISABLED = True
        mock_settings.DEFAULT_TEAM_ID = "00000000-0000-0000-0000-000000000001"

        with patch.object(auth, "get_settings", return_value=mock_settings):
            ctx = get_auth_context(_request())

        self.assertIsInstance(ctx, AuthContext)
        self.assertEqual(ctx.user_id, "demo-user")
        self.assertEqual(ctx.email, "demo@local")
        self.assertEqual(ctx.team_id, "00000000-0000-0000-0000-000000000001")
        self.assertEqual(ctx.role, "owner")
        self.assertFalse(ctx.is_authenticated)

    def test_demo_mode_x_team_id_overrides_default(self) -> None:
        mock_settings = MagicMock()
        mock_settings.AUTH_DISABLED = True
        mock_settings.DEFAULT_TEAM_ID = "00000000-0000-0000-0000-000000000001"
        custom = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

        with patch.object(auth, "get_settings", return_value=mock_settings):
            ctx = get_auth_context(_request({"x-team-id": custom}))

        self.assertEqual(ctx.team_id, custom)
        self.assertFalse(ctx.is_authenticated)


if __name__ == "__main__":
    unittest.main()
