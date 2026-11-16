import pytest

from app.commands import CommandChannel, CommandError


class SilentSocket:
    async def send_json(self, message):
        self.message = message


@pytest.mark.asyncio
async def test_command_timeout_surfaces_as_command_error():
    channel = CommandChannel(timeout=0.01)
    channel.attach(SilentSocket())

    with pytest.raises(CommandError, match="timed out"):
        await channel.send("show_route", {})


@pytest.mark.asyncio
async def test_command_accepts_a_per_call_timeout():
    channel = CommandChannel(timeout=30.0)
    channel.attach(SilentSocket())

    with pytest.raises(CommandError, match="timed out"):
        await channel.send("show_route", {}, timeout=0.01)
