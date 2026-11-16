from __future__ import annotations

import asyncio
import uuid
from typing import Any

from fastapi import WebSocket


class CommandError(RuntimeError):
    pass


class CommandChannel:
    """Sends UI commands to the connected frontend and awaits its ack.

    Protocol:
        backend -> {"type": "command", "id": str, "name": str, "payload": dict}
        frontend -> {"type": "ack", "id": str, "status": "ok" | "error", "ts": int}
    """

    def __init__(self, timeout: float = 8.0) -> None:
        self._ws: WebSocket | None = None
        self._pending: dict[str, asyncio.Future[dict[str, Any]]] = {}
        self._timeout = timeout

    @property
    def connected(self) -> bool:
        return self._ws is not None

    def attach(self, ws: WebSocket) -> None:
        self._ws = ws

    def detach(self, ws: WebSocket) -> None:
        if self._ws is ws:
            self._ws = None
        for fut in self._pending.values():
            if not fut.done():
                fut.set_exception(CommandError("frontend disconnected"))

    async def send(
        self,
        name: str,
        payload: dict[str, Any],
        timeout: float | None = None,
    ) -> dict[str, Any]:
        ws = self._ws
        if ws is None:
            raise CommandError("frontend not connected")

        command_id = uuid.uuid4().hex
        fut: asyncio.Future[dict[str, Any]] = asyncio.get_running_loop().create_future()
        self._pending[command_id] = fut
        try:
            await ws.send_json(
                {"type": "command", "id": command_id, "name": name, "payload": payload}
            )
            ack = await asyncio.wait_for(
                fut, timeout=timeout if timeout is not None else self._timeout
            )
        except TimeoutError as exc:
            # A stale or frozen tab must surface as a normal command failure,
            # not escape as an unhandled timeout inside the agent.
            raise CommandError(f"{name} timed out waiting for the frontend") from exc
        finally:
            self._pending.pop(command_id, None)

        if ack.get("status") != "ok":
            raise CommandError(f"{name} failed: {ack.get('detail', ack.get('status'))}")
        return ack

    def resolve(self, message: dict[str, Any]) -> None:
        if message.get("type") != "ack":
            return
        fut = self._pending.get(message.get("id", ""))
        if fut is not None and not fut.done():
            fut.set_result(message)