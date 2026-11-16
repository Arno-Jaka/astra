from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import TOOL_RETRY_HINT, app

client = TestClient(app)

BAD_CALL = (
    "Tool call validation failed: parameters for tool plan_route did not match "
    "schema: missing properties: 'start', 'end', additionalProperties 'ok', "
    "'route' not allowed"
)


class FakeAgent:
    def __init__(self, outcome):
        self.outcome = outcome
        self.messages: list[str] = []

    async def arun(self, message: str):
        self.messages.append(message)
        if isinstance(self.outcome, Exception):
            raise self.outcome
        return self.outcome


def test_chat_retries_malformed_tool_call_with_argument_hint():
    output = SimpleNamespace(
        content="Routed Gale Crater to Mount Sharp.",
        tools=[
            SimpleNamespace(
                tool_name="plan_route",
                tool_args={"start": "Gale Crater", "end": "Mount Sharp"},
                result={"ok": True},
            )
        ],
    )
    first = FakeAgent(Exception(BAD_CALL))
    second = FakeAgent(output)

    with patch("app.main.build_agent", side_effect=[first, second]):
        response = client.post("/agent/chat", json={"message": "Plan a route"})

    assert response.status_code == 200
    body = response.json()
    assert body["content"] == "Routed Gale Crater to Mount Sharp."
    assert body["tools"][0]["name"] == "plan_route"
    assert first.messages[0] == "Plan a route"
    assert second.messages[0] == "Plan a route" + TOOL_RETRY_HINT


def test_chat_returns_a_readable_message_when_the_agent_keeps_failing():
    with patch(
        "app.main.build_agent",
        side_effect=[FakeAgent(Exception(BAD_CALL)), FakeAgent(Exception(BAD_CALL))],
    ):
        response = client.post("/agent/chat", json={"message": "Plan a route"})

    assert response.status_code == 200
    body = response.json()
    assert body["error"] == "agent_unavailable"
    assert "couldn't complete" in body["content"]
    assert body["tools"] == []
