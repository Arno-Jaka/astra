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


@app.post("/agent/chat")
async def agent_chat(req: ChatRequest) -> dict[str, object]:
    output = await build_agent().arun(req.message)
    tools = [
        {"name": t.tool_name, "args": t.tool_args, "result": t.result}
        for t in (output.tools or [])
    ]
    return {"content": output.content, "tools": tools}
