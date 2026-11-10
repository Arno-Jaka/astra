import hashlib
import re
import tempfile
from pathlib import Path

import edge_tts
from edge_tts.exceptions import EdgeTTSException
from fastapi import HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from .config import settings

VOICE = "en-US-AriaNeural"
MAX_CHARS = 600
CACHE_DIR = Path(tempfile.gettempdir()) / "astra-tts"


class TTSRequest(BaseModel):
    text: str


def _clean(text: str) -> str:
    text = re.sub(r"https?://\S+", "", text)
    text = re.sub(r"\*\*|`|^#+\s*", "", text, flags=re.MULTILINE)
    text = " ".join(text.split())
    return text[:MAX_CHARS]


async def synthesize(request: TTSRequest) -> FileResponse:
    if settings.tts_provider != "edge":
        raise HTTPException(
            status_code=501,
            detail=f"TTS provider '{settings.tts_provider}' is not implemented",
        )
    text = _clean(request.text)
    if not text:
        raise HTTPException(status_code=400, detail="text is required")

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha1(text.encode("utf-8")).hexdigest()
    path = CACHE_DIR / f"{digest}.mp3"
    if not path.exists():
        temporary = path.with_suffix(".tmp")
        try:
            await edge_tts.Communicate(text, VOICE).save(str(temporary))
            temporary.replace(path)
        except (EdgeTTSException, OSError) as exc:
            temporary.unlink(missing_ok=True)
            raise HTTPException(
                status_code=502, detail="TTS synthesis failed"
            ) from exc

    return FileResponse(path, media_type="audio/mpeg", filename="astra.mp3")
