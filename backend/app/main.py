import logging

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .agent import build_agent
from .channel import channel
from .commands import CommandError
from .config import settings
from .map_api import router as map_router

app = FastAPI(title="ASTRA", version="0.1.0")
app.include_router(map_router)

cors_origins = [origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "astra-backend"}


@app.get("/debug/status")
def debug_status() -> dict[str, bool]:
    return {"frontend_connected": channel.connected}


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket) -> None:
    await ws.accept()
    channel.attach(ws)
    try:
        while True:
            channel.resolve(await ws.receive_json())
    except WebSocketDisconnect:
        pass
    finally:
        channel.detach(ws)


class FlyRequest(BaseModel):
    lon: float
    lat: float
    height: float = 250_000.0
    duration: float = 1.6


@app.post("/debug/fly")
async def debug_fly(req: FlyRequest) -> dict[str, object]:
    try:
        ack = await channel.send("fly_to", req.model_dump())
    except CommandError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return {"ack": ack}


class ChatRequest(BaseModel):
    message: str


logger = logging.getLogger(__name__)

# Groq validates tool arguments against the generated schema. Smaller open
# models occasionally emit a result-shaped call (for example
# {"ok": true, "route": {}}) instead of the documented arguments. The request
# fails before the tool runs, so retry with a short corrective reminder.
TOOL_RETRY_HINT = (
    "\n\nWhen you call a tool, send only its documented arguments. "
    "For plan_route use start, end, and optional max_slope_deg. "
    "Never pass ok, route, result, content, or other output fields "
    "as tool arguments, and call each tool at most once."
)

MAX_AGENT_ATTEMPTS = 2


def _tool_call_error(exc: Exception) -> bool:
    text = str(exc).lower()
    return (
        "tool call validation failed" in text
        or "tool_use_failed" in text
        or "did not match schema" in text
    )


@app.post("/agent/chat")
async def agent_chat(req: ChatRequest) -> dict[str, object]:
    output = None
    last_tool_error = False
    for attempt in range(MAX_AGENT_ATTEMPTS):
        # A malformed tool call is retried with an explicit argument
        # reminder; other failures (timeouts, rate limits) retry unchanged.
        prompt = req.message + (TOOL_RETRY_HINT if last_tool_error else "")
        try:
            output = await build_agent().arun(prompt)
            break
        except Exception as exc:  # noqa: BLE001 - provider errors vary
            logger.warning("agent attempt %d failed: %s", attempt + 1, exc)
            if attempt + 1 >= MAX_AGENT_ATTEMPTS:
                return {
                    "content": (
                        "I couldn't complete that request just now. Please try "
                        "again, or ask for site conditions or a briefing instead."
                    ),
                    "tools": [],
                    "error": "agent_unavailable",
                }
            last_tool_error = _tool_call_error(exc)
    tools = [
        {"name": t.tool_name, "args": t.tool_args, "result": t.result}
        for t in (output.tools or [])
    ] if output else []
    return {"content": output.content if output else "", "tools": tools}
