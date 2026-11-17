"""The WhatsApp support bubble reports its clicks to the backend."""

import pytest

from src.core import analytics
from src.core.security import create_access_token, get_password_hash
from src.models.user import User, UserRole


class RecordingClient:
    def __init__(self):
        self.captured = []

    def capture(self, event, distinct_id=None, properties=None, disable_geoip=None):
        self.captured.append((event, distinct_id, properties or {}))

    def set(self, distinct_id=None, properties=None):
        pass

    def shutdown(self):
        pass


@pytest.fixture
def events(monkeypatch):
    recorder = RecordingClient()
    monkeypatch.setattr(analytics, "_client", recorder)
    monkeypatch.setattr(analytics, "_init_attempted", True)
    yield recorder
    analytics.bind_request(None, "api")


def _clicks(events):
    return [e for e in events.captured if e[0] == "support_whatsapp_clicked"]


UTM = {
    "utm_source": "youtube",
    "utm_medium": "video",
    "utm_campaign": "bye_bye_tally",
    "utm_term": "gst billing",
    "utm_content": "reel_3",
    "utm_id": "42",
}


def test_signed_in_click_is_keyed_by_email_and_carries_utm(client, db_session, events):
    user = User(
        email="operator@example.com",
        full_name="Operator",
        role=UserRole.admin,
        hashed_password=get_password_hash("GoodPass@123"),
    )
    db_session.add(user)
    db_session.commit()
    token = create_access_token(subject=user.email)

    response = client.post(
        "/api/support/whatsapp-click",
        json={"utm": UTM, "anonymous_id": "anon-123", "path": "/invoices"},
        headers={"Authorization": f"Bearer {token}", "X-PostHog-Session-Id": "session-abc"},
    )

    assert response.status_code == 204
    (_, distinct_id, props), = _clicks(events)
    assert distinct_id == "operator@example.com"
    for key, value in UTM.items():
        assert props[key] == value
    assert props["signed_in"] is True
    assert props["path"] == "/invoices"
    assert props["$session_id"] == "session-abc"
    assert props["client"] == "web"


def test_visitor_click_is_keyed_by_anonymous_id(client, events):
    response = client.post(
        "/api/support/whatsapp-click",
        json={"utm": {"utm_source": "google"}, "anonymous_id": "anon-123", "path": "/login"},
    )

    assert response.status_code == 204
    (_, distinct_id, props), = _clicks(events)
    assert distinct_id == "anon-123"
    assert props["utm_source"] == "google"
    assert props["signed_in"] is False


def test_bad_token_falls_back_to_anonymous_rather_than_401(client, events):
    response = client.post(
        "/api/support/whatsapp-click",
        json={"anonymous_id": "anon-123"},
        headers={"Authorization": "Bearer not-a-real-token"},
    )

    assert response.status_code == 204
    (_, distinct_id, _), = _clicks(events)
    assert distinct_id == "anon-123"


def test_only_utm_keys_are_kept(client, events):
    client.post(
        "/api/support/whatsapp-click",
        json={
            "utm": {"UTM_Source": "insta", "gclid": "abc", "$set": "x", "utm_medium": "  "},
            "anonymous_id": "anon-123",
        },
    )

    (_, _, props), = _clicks(events)
    assert props["utm_source"] == "insta"
    assert "gclid" not in props
    assert "$set" not in props
    assert "utm_medium" not in props


def test_one_address_cannot_flood_the_event(client, events):
    for _ in range(15):
        assert client.post("/api/support/whatsapp-click", json={"anonymous_id": "anon-123"}).status_code == 204

    assert len(_clicks(events)) == 10
